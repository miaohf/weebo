"""Speech-to-text model service."""
import os
import time
import tempfile
import numpy as np
import requests
import io
import wave
import json
import soundfile as sf
from utils.logging_utils import debug, info, error
from core.config import settings

class SpeechToTextModel:
    """Service for speech-to-text conversion."""
    
    def __init__(self, api_url=None):
        """Initialize the STT model."""
        self.stt_mode = settings.STT_SERVICE_MODE
        self.api_url = api_url or settings.WHISPER_API_URL
        self.sample_rate = settings.WHISPER_SAMPLE_RATE
        
        info(f"初始化STT服务，使用模式: {self.stt_mode}，API地址: {self.api_url}")
    
    def transcribe(self, audio_data):
        """Transcribe audio data to text."""
        if self.stt_mode == "api":
            return self._transcribe_with_api(audio_data)
        else:
            error(f"未支持的STT模式: {self.stt_mode}")
            return self._transcribe_with_api(audio_data)  # 默认回退到API模式
    
    def _transcribe_with_api(self, audio_data):
        """Transcribe audio using API."""
        try:
            # 确保音频为float32类型、单声道
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # 如果是多声道，转为单声道
            if len(audio_data.shape) > 1 and audio_data.shape[1] > 1:
                audio_data = np.mean(audio_data, axis=1)
            
            # 将音频保存为WAV文件
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_filename = temp_file.name
                sf.write(temp_filename, audio_data, self.sample_rate)
            
            debug(f"音频保存为临时文件: {temp_filename}")
            
            # 发送到API
            with open(temp_filename, 'rb') as audio_file:
                start_time = time.time()
                response = requests.post(
                    self.api_url,
                    files={'file': audio_file},
                    timeout=30
                )
                elapsed = time.time() - start_time
                debug(f"STT API响应时间: {elapsed:.2f}秒")
            
            # 删除临时文件
            try:
                os.unlink(temp_filename)
            except:
                pass
            
            if response.status_code == 200:
                result = response.json()
                text = result.get('text', '').strip()
                debug(f"STT结果: {text}")
                return text
            else:
                error(f"STT API请求失败: {response.status_code}")
                debug(f"错误响应: {response.text}")
                return ""
        except Exception as e:
            error(f"STT转录失败: {e}")
            import traceback
            debug(f"异常详情: {traceback.format_exc()}")
            return ""
    
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