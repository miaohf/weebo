"""Audio utility functions."""
import numpy as np
import soundfile as sf
import io
import os
from datetime import datetime
from utils.logging_utils import debug, error

def convert_audio_format(audio_data, input_format, output_format, sample_rate=24000):
    """将音频数据从一种格式转换为另一种格式
    
    Args:
        audio_data: 音频数据（字节）
        input_format: 输入格式 (wav, mp3, webm等)
        output_format: 输出格式 (wav, mp3等)
        sample_rate: 采样率
        
    Returns:
        转换后的音频数据（字节）
    """
    try:
        # 如果格式相同，直接返回
        if input_format == output_format:
            return audio_data
            
        # 使用soundfile读取音频
        data, sr = sf.read(io.BytesIO(audio_data))
        
        # 输出到内存buffer
        output_buffer = io.BytesIO()
        sf.write(output_buffer, data, sample_rate, format=output_format)
        
        # 返回字节数据
        output_buffer.seek(0)
        return output_buffer.read()
    except Exception as e:
        error(f"音频格式转换错误: {e}")
        return audio_data

def save_audio_to_file(audio_data, sample_rate, directory="recordings"):
    """Save audio data to a file."""
    try:
        # Create directory if it doesn't exist
        os.makedirs(directory, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{directory}/recording_{timestamp}.wav"
        
        # Save audio file
        sf.write(filename, audio_data, sample_rate)
        debug(f"Audio saved to {filename}")
        return filename
    except Exception as e:
        error(f"Failed to save audio: {e}")
        return None

def resample_audio(audio_data, src_sample_rate, target_sample_rate):
    """Resample audio to target sample rate."""
    try:
        if src_sample_rate == target_sample_rate:
            return audio_data
            
        # Convert to float32 if not already
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32)
        
        # Simple resampling using scipy
        from scipy import signal
        
        duration = len(audio_data) / src_sample_rate
        time_old = np.linspace(0, duration, len(audio_data))
        time_new = np.linspace(0, duration, int(len(audio_data) * target_sample_rate / src_sample_rate))
        
        resampled = np.interp(time_new, time_old, audio_data)
        return resampled
    except Exception as e:
        error(f"Resampling error: {e}")
        return audio_data

def normalize_audio(audio_data, target_level=-23.0):
    """Normalize audio to target level."""
    try:
        if len(audio_data) == 0:
            return audio_data
            
        # Calculate current RMS
        rms = np.sqrt(np.mean(audio_data**2))
        
        # Convert target level from dB to linear
        target_rms = 10**(target_level/20)
        
        # Calculate gain
        if rms > 0:
            gain = target_rms / rms
        else:
            gain = 1.0
            
        # Apply gain
        normalized = audio_data * gain
        
        # Clip to prevent distortion
        normalized = np.clip(normalized, -1.0, 1.0)
        
        return normalized
    except Exception as e:
        error(f"Normalization error: {e}")
        return audio_data

def detect_silence(audio_data, threshold=0.01, min_silence_duration=0.3, sample_rate=24000):
    """Detect silence segments in audio."""
    try:
        # Calculate frame energy
        frame_length = int(0.02 * sample_rate)  # 20ms frames
        hop_length = int(0.01 * sample_rate)    # 10ms hop
        
        frames = []
        for i in range(0, len(audio_data) - frame_length, hop_length):
            frames.append(audio_data[i:i+frame_length])
        
        # Calculate energy for each frame
        energies = [np.mean(np.abs(frame)) for frame in frames]
        
        # Find silent frames
        silent_frames = [energy < threshold for energy in energies]
        
        # Group consecutive silent frames
        silent_regions = []
        start = None
        
        for i, is_silent in enumerate(silent_frames):
            if is_silent and start is None:
                start = i
            elif not is_silent and start is not None:
                duration = (i - start) * hop_length / sample_rate
                if duration >= min_silence_duration:
                    silent_regions.append((start * hop_length, i * hop_length))
                start = None
        
        # Check if the last region is silent
        if start is not None:
            duration = (len(silent_frames) - start) * hop_length / sample_rate
            if duration >= min_silence_duration:
                silent_regions.append((start * hop_length, len(audio_data)))
        
        return silent_regions
    except Exception as e:
        error(f"Silence detection error: {e}")
        return []

def trim_silence(audio_data, threshold=0.01, padding_ms=200, sample_rate=24000):
    """修剪音频开头和结尾的静音部分
    
    Args:
        audio_data: 音频数据
        threshold: 静音检测阈值
        padding_ms: 保留的静音填充（毫秒）
        sample_rate: 采样率
        
    Returns:
        修剪后的音频数据
    """
    try:
        if len(audio_data) == 0:
            return audio_data
            
        # 转换为单声道（如果是立体声）
        if len(audio_data.shape) > 1 and audio_data.shape[1] > 1:
            audio_data = np.mean(audio_data, axis=1)
            
        # 计算能量
        energy = np.abs(audio_data)
        
        # 寻找非静音样本
        mask = energy > threshold
        
        if not np.any(mask):
            # 如果全是静音，返回一小段
            return np.zeros(int(0.1 * sample_rate))
            
        # 找到第一个和最后一个非静音样本
        start = np.where(mask)[0][0]
        end = np.where(mask)[0][-1]
        
        # 添加填充
        padding = int(padding_ms * sample_rate / 1000)
        start = max(0, start - padding)
        end = min(len(audio_data), end + padding)
        
        return audio_data[start:end]
    except Exception as e:
        error(f"修剪静音错误: {e}")
        return audio_data

def split_audio_at_silence(audio_data, sample_rate=24000):
    """Split audio at silence points."""
    try:
        silent_regions = detect_silence(audio_data, sample_rate=sample_rate)
        
        if not silent_regions:
            return [audio_data]
            
        segments = []
        last_end = 0
        
        for start, end in silent_regions:
            if start > last_end:
                segments.append(audio_data[last_end:start])
            last_end = end
        
        # Add the last segment if needed
        if last_end < len(audio_data):
            segments.append(audio_data[last_end:])
        
        return [seg for seg in segments if len(seg) > 0.1 * sample_rate]  # Filter out very short segments
    except Exception as e:
        error(f"Audio splitting error: {e}")
        return [audio_data]