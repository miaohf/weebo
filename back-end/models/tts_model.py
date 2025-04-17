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
from core.config import settings
import re

class TextToSpeechModel:
    """Service for text-to-speech conversion."""
    
    def __init__(self, api_url=f"{settings.TTS_API_URL}/tts"):
        """Initialize TTS model."""
        self.api_url = api_url
        self.tts_mode = settings.TTS_SERVICE_MODE
        
        # For local TTS (legacy)
        self.tts_session = None
        self.voices = None
        self.vocab = None
        
        # For Kokoro TTS
        self.kokoro_pipeline = None
        self.kokoro_voice = getattr(settings, "KOKORO_VOICE", "af_heart")
        self.kokoro_lang_code = getattr(settings, "KOKORO_LANG_CODE", "a")
        self.kokoro_sample_rate = 24000  # Kokoro默认采样率
        self.kokoro_lazy_loading = settings.SKIP_KOKORO_LOADING  # 是否启用延迟加载
        
        # ElevenLabs API
        self.elevenlabs_api_key = settings.ELEVENLABS_API_KEY
        self.elevenlabs_api_url = "https://api.elevenlabs.io/v1/text-to-speech"
        self.elevenlabs_voice_id = settings.ELEVENLABS_VOICE_ID if hasattr(settings, 'ELEVENLABS_VOICE_ID') else "21m00Tcm4TlvDq8ikWAM"  # 默认使用Rachel
        
        # 设置当前话语人（针对不同的模式可能有不同含义）
        if self.tts_mode == "elevenlabs":
            info(f"初始化ElevenLabs TTS服务，使用声音ID: {self.elevenlabs_voice_id}")
        elif self.tts_mode == "kokoro":
            if self.kokoro_lazy_loading:
                info(f"延迟加载模式: Kokoro TTS模型将在首次使用时加载，使用声音: {self.kokoro_voice}")
            else:
                info(f"初始化Kokoro TTS服务，使用声音: {self.kokoro_voice}")
                self._init_kokoro_model()
        else:
            self.speaker = settings.TTS_SPEAKER
            if self.tts_mode == "local":
                self._init_legacy_local_model()
    
    def _init_legacy_local_model(self):
        """Initialize legacy local TTS model."""
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
            
            info("Legacy local TTS model initialized")
        except Exception as e:
            error(f"Failed to initialize legacy local TTS model: {e}")
            self.tts_mode = "api"  # Fallback to API
    
    def _init_kokoro_model(self):
        """Initialize Kokoro TTS model."""
        try:
            from kokoro import KPipeline
            
            self.kokoro_pipeline = KPipeline(lang_code=self.kokoro_lang_code)
            info(f"Kokoro TTS model initialized with language code: {self.kokoro_lang_code}")
        except Exception as e:
            error(f"Failed to initialize Kokoro TTS model: {e}")
            import traceback
            debug(f"Kokoro initialization error details: {traceback.format_exc()}")
            # 不更改tts_mode，而是让generate_audio_kokoro在失败时回退到API
    
    def set_kokoro_voice(self, voice):
        """Set the voice for Kokoro TTS."""
        self.kokoro_voice = voice
        info(f"Set Kokoro voice to: {voice}")
    
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
        if self.tts_mode == "elevenlabs":
            return await self._generate_audio_elevenlabs(text)
        elif self.tts_mode == "kokoro":
            return await self._generate_audio_kokoro(text)
        elif self.tts_mode == "local" and self.tts_session is not None:
            # 老的本地模式
            try:
                phonemes = self.phonemize_text(text)
                audio = self.generate_audio_local(phonemes, "default", 1.0)
                return (audio, 22050)  # 假设采样率是22050Hz
            except Exception as e:
                error(f"Local TTS generation failed: {e}")
                # 如果本地生成失败，尝试API
                self.tts_mode = "api"
                return await self._generate_audio_api(text)
        else:
            return await self._generate_audio_api(text)
    
    async def _generate_audio_api(self, text):
        """使用API生成音频"""
        # 原有API调用逻辑
        request_data = {
            "text": text,
            "model_type": "Transformer",
            "language": "en-us",
            "speaker": self.speaker,
            "cfg_scale": 2.0,
            "min_p": 0.1,
            "seed": 421
        }
        
        # API调用逻辑
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json=request_data,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status == 200:
                        audio_data = await response.read()
                        if len(audio_data) == 0:
                            error("Received empty response from TTS API")
                            return None
                            
                        # Ensure tmp directory exists
                        # os.makedirs('tmp', exist_ok=True)
                        
                        # Save audio file for debugging
                        # timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                        # audio_filename = f'tmp/audio_{timestamp}.wav'
                        
                        # with open(audio_filename, 'wb') as f:
                        #     f.write(audio_data)
                        
                        # debug(f"Saved audio to {audio_filename}")
                        
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
    
    # Kokoro TTS实现
    async def _generate_audio_kokoro(self, text):
        """使用Kokoro生成音频"""
        # 如果是延迟加载模式且尚未初始化，现在加载
        if self.kokoro_lazy_loading and self.kokoro_pipeline is None:
            info(f"首次TTS请求：开始加载Kokoro模型...")
            self._init_kokoro_model()
            
        # 如果模型仍然未初始化（可能初始化失败）
        if self.kokoro_pipeline is None:
            error("Kokoro TTS pipeline not initialized, falling back to API")
            return await self._generate_audio_api(text)
        
        debug(f"Generating audio with Kokoro for text: {text[:30]}...")
        
        try:
            # 使用asyncio.to_thread运行同步Kokoro代码
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._run_kokoro_pipeline, text)
            
            if result is None:
                error("Kokoro pipeline returned None, falling back to API")
                return await self._generate_audio_api(text)
                
            audio_array, sample_rate = result
            
            # 检查audio_array的类型，将Tensor转换为numpy数组
            if hasattr(audio_array, 'numpy'):
                # 如果是PyTorch Tensor，使用.numpy()方法
                audio_array = audio_array.numpy()
            elif hasattr(audio_array, 'detach'):
                # 某些PyTorch Tensor需要先detach
                audio_array = audio_array.detach().numpy()
            elif hasattr(audio_array, 'cpu'):
                # GPU上的PyTorch Tensor
                audio_array = audio_array.cpu().numpy()
            elif hasattr(audio_array, 'numpy_array'):
                # 某些框架使用numpy_array方法
                audio_array = audio_array.numpy_array()
            
            # 确保音频是float32类型
            if not isinstance(audio_array, np.ndarray):
                # 如果不是任何已知类型，尝试强制转换
                audio_array = np.array(audio_array, dtype=np.float32)
            elif audio_array.dtype != np.float32:
                audio_array = audio_array.astype(np.float32)
            
            # 归一化到 [-1.0, 1.0] 范围
            max_val = np.max(np.abs(audio_array))
            if max_val > 0:
                audio_array /= max_val
            
            # 保存音频文件用于调试
            os.makedirs('tmp', exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            audio_filename = f'tmp/kokoro_audio_{timestamp}.wav'
            sf.write(audio_filename, audio_array, sample_rate)
            
            debug(f"Saved Kokoro audio to {audio_filename}")
            debug(f"Kokoro audio processed successfully: shape={audio_array.shape}, sr={sample_rate}")
            
            return (audio_array, sample_rate)
            
        except Exception as e:
            error(f"Failed to generate audio via Kokoro: {e}")
            import traceback
            debug(f"Kokoro exception details: {traceback.format_exc()}")
            # 使用API作为备用方案
            info("Falling back to API for TTS generation")
            return await self._generate_audio_api(text)
    
    def _run_kokoro_pipeline(self, text):
        """在同步环境中运行Kokoro Pipeline"""
        try:
            generator = self.kokoro_pipeline(text, voice=self.kokoro_voice)
            
            # 我们取生成器的最后一个结果作为完整音频
            final_audio = None
            sample_rate = self.kokoro_sample_rate
            
            for _, (_, _, audio) in enumerate(generator):
                final_audio = audio
            
            if final_audio is None:
                error("Kokoro pipeline did not generate any audio")
                return None
                
            return (final_audio, sample_rate)
            
        except Exception as e:
            error(f"Error running Kokoro pipeline: {e}")
            import traceback
            debug(f"Kokoro pipeline error details: {traceback.format_exc()}")
            return None
    
    # ElevenLabs API实现
    async def _generate_audio_elevenlabs(self, text):
        """使用ElevenLabs API生成音频"""
        if not self.elevenlabs_api_key:
            error("ElevenLabs API key not configured")
            return None
            
        headers = {
            "xi-api-key": self.elevenlabs_api_key,
            "Content-Type": "application/json"
        }
        
        request_data = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5
            }
        }
        
        debug(f"Generating audio with ElevenLabs for text: {text[:30]}...")
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.elevenlabs_api_url}/{self.elevenlabs_voice_id}"
                async with session.post(
                    url,
                    json=request_data,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status == 200:
                        audio_data = await response.read()
                        if len(audio_data) == 0:
                            error("Received empty response from ElevenLabs API")
                            return None
                            
                        # 确保tmp目录存在
                        os.makedirs('tmp', exist_ok=True)
                        
                        # 保存音频文件用于调试
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                        audio_filename = f'tmp/elevenlabs_audio_{timestamp}.mp3'
                        
                        with open(audio_filename, 'wb') as f:
                            f.write(audio_data)
                        
                        debug(f"Saved ElevenLabs audio to {audio_filename}")
                        
                        # 处理音频数据
                        try:
                            with io.BytesIO(audio_data) as audio_io:
                                # 使用soundfile读取音频数据
                                audio_array, samplerate = sf.read(audio_io)
                                
                                # 确保音频是float32
                                if audio_array.dtype != np.float32:
                                    audio_array = audio_array.astype(np.float32)
                                
                                # 如果音频是立体声，转换为单声道
                                if len(audio_array.shape) > 1 and audio_array.shape[1] > 1:
                                    audio_array = np.mean(audio_array, axis=1)
                                
                                # 归一化到 [-1.0, 1.0] 范围
                                max_val = np.max(np.abs(audio_array))
                                if max_val > 0:
                                    audio_array /= max_val
                                
                                debug(f"ElevenLabs audio processed successfully: shape={audio_array.shape}, sr={samplerate}")
                                # 返回音频数组和采样率
                                return (audio_array, samplerate)
                        except Exception as e:
                            error(f"Failed to process ElevenLabs audio data: {e}")
                            import traceback
                            debug(f"ElevenLabs audio processing error details: {traceback.format_exc()}")
                            return None
                    else:
                        error_text = await response.text()
                        error(f"ElevenLabs API request failed: {response.status}")
                        debug(f"ElevenLabs error response: {error_text}")
                        return None
                        
        except Exception as e:
            error(f"Failed to generate audio via ElevenLabs API: {e}")
            import traceback
            debug(f"ElevenLabs exception details: {traceback.format_exc()}")
            return None
    
    def set_elevenlabs_voice(self, voice_id):
        """设置ElevenLabs声音ID"""
        self.elevenlabs_voice_id = voice_id
        info(f"Set ElevenLabs voice to: {voice_id}")
    
    def generate_audio_local(self, text, voice, speed):
        """Generate audio using legacy local model."""
        if self.tts_session is None:
            error("Legacy local TTS model not initialized")
            return None
            
        tokens = [self.vocab[p] for p in text if p in self.vocab]
        if not tokens:
            return np.array([], dtype=np.float32)

        tokens = tokens[:settings.MAX_PHONEME_LENGTH]
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