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
from scipy import signal

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
    
    def _apply_noise_reduction(self, audio_data, sr=16000):
        """应用降噪处理"""
        try:
            # 应用高通滤波器去除低频噪音（如呼吸声、风声）
            # 100Hz的截止频率，适合人声
            b, a = signal.butter(4, 100/(sr/2), 'highpass')
            audio_filtered = signal.filtfilt(b, a, audio_data)
            
            # 标准化音频幅度
            if np.max(np.abs(audio_filtered)) > 0:
                audio_filtered = audio_filtered / np.max(np.abs(audio_filtered))
                
            # 应用低通滤波去除高频噪音
            b, a = signal.butter(4, 8000/(sr/2), 'lowpass')
            audio_filtered = signal.filtfilt(b, a, audio_filtered)
            
            debug(f"应用了降噪处理")
            return audio_filtered
        except Exception as e:
            error(f"降噪处理失败: {e}")
            return audio_data
    
    def _normalize_audio(self, audio_data, target_db=-23.0):
        """对音频进行归一化处理"""
        try:
            # 如果音频为空，直接返回
            if len(audio_data) == 0:
                return audio_data
            
            # 计算当前RMS值
            rms = np.sqrt(np.mean(audio_data**2))
            
            # 将目标电平从dB转换为线性值
            target_rms = 10**(target_db/20)
            
            # 计算增益
            if rms > 0:
                gain = target_rms / rms
            else:
                gain = 1.0
            
            # 应用增益
            normalized = audio_data * gain
            
            # 剪裁以防失真
            normalized = np.clip(normalized, -0.95, 0.95)
            
            debug(f"应用了音频归一化处理")
            return normalized
        except Exception as e:
            error(f"音频归一化失败: {e}")
            return audio_data
    
    def _transcribe_with_api(self, audio_data):
        """Transcribe audio using API."""
        try:
            # 确保音频为float32类型、单声道
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # 如果是多声道，转为单声道
            if len(audio_data.shape) > 1 and audio_data.shape[1] > 1:
                audio_data = np.mean(audio_data, axis=1)
            
            # 应用降噪处理
            audio_data = self._apply_noise_reduction(audio_data, self.sample_rate)
            
            # 应用音频归一化
            audio_data = self._normalize_audio(audio_data)
            
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