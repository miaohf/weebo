"""Audio utility functions."""
import numpy as np
import soundfile as sf
import io
import os
from datetime import datetime
from utils.logging_utils import debug, error

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