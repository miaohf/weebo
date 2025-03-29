"""Text-to-speech model service."""
import numpy as np
import requests
import io
import soundfile as sf
import aiohttp
from datetime import datetime
import os
import asyncio
from utils.logging_utils import debug, info, error
import config
import re

class TextToSpeechModel:
    """Service for text-to-speech conversion."""
    
    def __init__(self, api_url=f"{config.TTS_API_URL}/tts"):
        """Initialize TTS model."""
        self.api_url = api_url
        self.tts_mode = config.TTS_MODE
        
        # For local TTS (if needed)
        self.tts_session = None
        self.voices = None
        self.vocab = None
        
        # Initialize local model if needed
        if self.tts_mode == "local":
            self._init_local_model()
    
    def _init_local_model(self):
        """Initialize local TTS model."""
        try:
            import onnxruntime
            import json
            
            # Load voices
            with open('voices.json', 'r') as f:
                self.voices = json.load(f)
            
            # Load vocabulary
            self.vocab = {}
            with open('vocab.txt', 'r') as f:
                for i, line in enumerate(f):
                    self.vocab[line.strip()] = i
            
            # Initialize ONNX session
            self.tts_session = onnxruntime.InferenceSession('model.onnx')
            
            info("Local TTS model initialized")
        except Exception as e:
            error(f"Failed to initialize local TTS model: {e}")
            self.tts_mode = "api"  # Fallback to API
    
    def phonemize_text(self, text):
        """Convert text to phonemes."""
        try:
            import phonemizer
            
            phonemes = phonemizer.phonemize(
                text,
                language='en-us',
                backend='espeak',
                strip=True,
                preserve_punctuation=True,
                language_switch='remove-flags'
            )
            return phonemes
        except Exception as e:
            error(f"Phonemization error: {e}")
            raise
    
    def set_speaker(self, speaker):
        """Set the speaker for TTS."""
        self.speaker = speaker
    
    async def generate_audio_async(self, text):
        """Asynchronously generate audio from text using API."""
        if not text or not text.strip():
            return None
            
        text = ' '.join(text.split())
        
        # 检查文本长度，如果过长则分段处理
        if len(text) > 500:  # 如果超过500个字符
            debug(f"Text is long ({len(text)} chars), splitting into chunks")
            # 使用自然断句点分割文本
            sentences = re.split(r'(?<=[.!?])\s+', text)
            chunks = []
            current_chunk = ""
            
            # 组合成适当大小的块
            for sentence in sentences:
                if len(current_chunk) + len(sentence) < 500:
                    current_chunk += (" " if current_chunk else "") + sentence
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                    current_chunk = sentence
            
            if current_chunk:  # 添加最后一个块
                chunks.append(current_chunk)
            
            debug(f"Split into {len(chunks)} chunks")
            
            # 处理每个块并合并结果
            audio_segments = []
            for i, chunk in enumerate(chunks):
                debug(f"Processing chunk {i+1}/{len(chunks)}: {chunk[:30]}...")
                result = await self._generate_audio_for_text(chunk)
                if result:
                    audio_segments.append(result)
            
            # 合并音频段
            if audio_segments:
                # 提取第一个段的采样率
                combined_audio = np.concatenate([seg[0] for seg in audio_segments])
                sample_rate = audio_segments[0][1]
                return (combined_audio, sample_rate)
            return None
        else:
            # 原始处理逻辑
            return await self._generate_audio_for_text(text)
        
    # 提取实际的API调用到单独的方法
    async def _generate_audio_for_text(self, text):
        request_data = {
            "text": text,
            "model_type": "Transformer",
            "language": "en-us",
            "speaker": self.speaker,
            "cfg_scale": 2.0,
            "min_p": 0.1,
            "seed": 421
        }
        
        # API调用逻辑（与原来相同，但超时更长）
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json=request_data,
                    timeout=aiohttp.ClientTimeout(total=60)  # 对单段使用较短的超时
                ) as response:
                    if response.status == 200:
                        audio_data = await response.read()
                        if len(audio_data) == 0:
                            error("Received empty response from TTS API")
                            return None
                            
                        # Ensure tmp directory exists
                        os.makedirs('tmp', exist_ok=True)
                        
                        # Save audio file for debugging
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                        audio_filename = f'tmp/audio_{timestamp}.wav'
                        
                        with open(audio_filename, 'wb') as f:
                            f.write(audio_data)
                        
                        debug(f"Saved audio to {audio_filename}")
                        
                        # Process audio data
                        try:
                            with io.BytesIO(audio_data) as audio_io:
                                # Use soundfile to read the WAV data
                                audio_array, samplerate = sf.read(audio_io)
                                
                                # Ensure audio is float32
                                if audio_array.dtype != np.float32:
                                    audio_array = audio_array.astype(np.float32)
                                
                                # If audio is stereo, convert to mono
                                if len(audio_array.shape) > 1 and audio_array.shape[1] > 1:
                                    audio_array = np.mean(audio_array, axis=1)
                                
                                # 归一化到 [-1.0, 1.0] 范围
                                max_val = np.max(np.abs(audio_array))
                                if max_val > 0:
                                    audio_array /= max_val
                                
                                debug(f"Audio processed successfully: shape={audio_array.shape}, sr={samplerate}")
                                # Return both the audio array and the sample rate
                                return (audio_array, samplerate)
                        except Exception as e:
                            error(f"Failed to process audio data: {e}")
                            import traceback
                            debug(f"Audio processing error details: {traceback.format_exc()}")
                            return None
                    else:
                        error_text = await response.text()
                        error(f"generate_audio_async API request failed: {response.status}")
                        debug(f"Error response: {error_text}")
                        return None
                        
        except Exception as e:
            error(f"Failed to generate audio via API: {e}")
            import traceback
            debug(f"Exception details: {traceback.format_exc()}")
            return None
    
    # def generate_audio_sync(self, text):
    #     """Generate audio synchronously."""
    #     if not text or not text.strip():
    #         return None
            
    #     text = ' '.join(text.split())
        
    #     request_data = {
    #         "text": text,
    #         "model_type": "Transformer",
    #         "language": "en-us",
    #         "speaker": self.speaker,
    #         "cfg_scale": 2.0,
    #         "min_p": 0.1,
    #         "seed": 421
    #     }
        
    #     try:
    #         response = requests.post(
    #             self.api_url,
    #             json=request_data,
    #             timeout=30
    #         )
            
    #         if response.status_code == 200:
    #             audio_data = response.content
                
    #             # Save audio for debugging
    #             os.makedirs('tmp', exist_ok=True)
    #             timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    #             audio_filename = f'tmp/audio_{timestamp}.wav'
    #             with open(audio_filename, 'wb') as f:
    #                 f.write(audio_data)
                
    #             # Process audio data
    #             with io.BytesIO(audio_data) as audio_io:
    #                 audio_array, samplerate = sf.read(audio_io)
                    
    #                 # Ensure audio is float32
    #                 if audio_array.dtype != np.float32:
    #                     audio_array = audio_array.astype(np.float32)
                    
    #                 # If audio is stereo, convert to mono
    #                 if len(audio_array.shape) > 1 and audio_array.shape[1] > 1:
    #                     audio_array = np.mean(audio_array, axis=1)
                    
    #                 return audio_array
    #         else:
    #             error(f"generate_audio_sync API request failed: {response.status_code}")
    #             return None
    #     except Exception as e:
    #         error(f"Failed to generate audio via API: {e}")
    #         return None
    
    def generate_audio_local(self, text, voice, speed):
        """Generate audio using local model."""
        if self.tts_session is None:
            error("Local TTS model not initialized")
            return None
            
        tokens = [self.vocab[p] for p in text if p in self.vocab]
        if not tokens:
            return np.array([], dtype=np.float32)

        tokens = tokens[:config.MAX_PHONEME_LENGTH]
        style = np.array(self.voices[voice], dtype=np.float32)[len(tokens)]

        audio = self.tts_session.run(
            None,
            {
                'tokens': [[0, *tokens, 0]],
                'style': style,
                'speed': np.array([speed], dtype=np.float32)
            }
        )[0]

        return audio
    
    async def process_text_chunks(self, text_chunks):
        """Process text chunks and return audio segments."""
        audio_segments = []
        for chunk in text_chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
                
            audio_segment = await self.generate_audio_async(chunk)
            if audio_segment is not None:
                audio_segments.append(audio_segment)
        
        return audio_segments

    # 添加新方法，用于处理单个文本段
    async def generate_audio_segment(self, text):
        """生成单个文本段的音频，不拼接"""
        if not text or not text.strip():
            return None
        
        text = ' '.join(text.split())
        
        # 直接调用API生成单段音频
        return await self._generate_audio_for_text(text)