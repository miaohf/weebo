"""Speech-to-text model service."""
import requests
import io
import numpy as np
import soundfile as sf
from utils.logging_utils import debug, info, error
import config
import json

class SpeechToTextModel:
    """Service for speech-to-text conversion."""
    
    def __init__(self, api_url=config.WHISPER_API_URL):
        """Initialize STT model."""
        self.api_url = api_url
        self.language = "en"  # Default language
        self.previous_transcripts = []  # Store recent transcripts for context
    
    def transcribe(self, audio_data):
        """Transcribe audio data to text."""
        try:
            # 确保输入是numpy数组
            if not isinstance(audio_data, np.ndarray):
                raise ValueError("Input must be a numpy array")
                
            # 确保数据类型为float32
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # Normalize audio
            if np.max(np.abs(audio_data)) > 0:
                audio_data = audio_data / np.max(np.abs(audio_data))
            
            # Save to WAV file in memory
            buffer = io.BytesIO()
            sf.write(buffer, audio_data, config.WHISPER_SAMPLE_RATE, format='WAV')
            buffer.seek(0)
            
            # Prepare API request with additional parameters
            files = {'file': ('audio.wav', buffer, 'audio/wav')}
            
            # Add context from previous transcripts to improve accuracy
            context = " ".join(self.previous_transcripts[-3:]) if self.previous_transcripts else ""
            
            data = {
                'language': self.language,
                'task': 'transcribe',
                'initial_prompt': context,  # Use previous transcripts as context
                'word_timestamps': 'false',
                'temperature': '0.0',  # Lower temperature for more accurate transcription
                'best_of': '5',        # Consider multiple samples
                'beam_size': '5',      # Use beam search for better results
                'patience': '1.0',     # Beam search patience
                'suppress_tokens': '-1',
                'condition_on_previous_text': 'true',
                'temperature_increment_on_fallback': '0.2',
                'compression_ratio_threshold': '2.4',
                'logprob_threshold': '-1.0',
                'no_speech_threshold': '0.6'
            }
            
            debug(f"Sending audio to Whisper API with context length: {len(context)}")
            response = requests.post(self.api_url, files=files, data=data)
            
            debug(f"Whisper API response status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                transcript = result.get('text', '').strip()
                
                # Post-process transcript
                transcript = self._post_process_transcript(transcript)
                
                debug(f"Transcription received: {transcript}")
                
                # Store transcript for future context if it's not empty
                if transcript and len(transcript) > 5:
                    self.previous_transcripts.append(transcript)
                    # Keep only the last 5 transcripts
                    self.previous_transcripts = self.previous_transcripts[-5:]
                
                return transcript
            else:
                error(f"Whisper API error: {response.status_code}")
                debug(f"API error response: {response.text}")
                return None
        except Exception as e:
            error(f"Transcription error: {e}")
            return None
    
    def _post_process_transcript(self, transcript):
        """Post-process the transcript to improve quality."""
        if not transcript:
            return transcript
            
        # Fix common transcription errors
        corrections = {
            "i'm": "I'm",
            "i've": "I've",
            "i'll": "I'll",
            "i'd": "I'd",
            "can't": "can't",
            "don't": "don't",
            "didn't": "didn't",
            "isn't": "isn't",
            "it's": "it's",
            "that's": "that's",
            "there's": "there's",
            "they're": "they're",
            "wasn't": "wasn't",
            "weren't": "weren't",
            "won't": "won't",
            "wouldn't": "wouldn't",
            "you're": "you're",
            "you've": "you've",
            "you'll": "you'll",
            "you'd": "you'd"
        }
        
        # Apply corrections
        words = transcript.split()
        for i, word in enumerate(words):
            lower_word = word.lower()
            if lower_word in corrections:
                words[i] = corrections[lower_word]
        
        # Rejoin with proper spacing
        transcript = ' '.join(words)
        
        # Ensure proper capitalization at the beginning of sentences
        transcript = '. '.join(s.capitalize() for s in transcript.split('. '))
        
        # Ensure the first letter is capitalized
        if transcript and len(transcript) > 0:
            transcript = transcript[0].upper() + transcript[1:]
        
        return transcript
    
    def set_language(self, language_code):
        """Set the language for transcription."""
        self.language = language_code