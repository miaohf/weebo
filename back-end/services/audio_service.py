"""Audio processing service."""
import numpy as np
import sounddevice as sd
import soundfile as sf
import io
import queue
import threading
import requests
import aiohttp
from datetime import datetime
import os
import traceback
from utils.logging_utils import debug, info, error
import config
import time  # 添加time模块导入

class AudioService:
    """Service for audio recording and playback."""
    
    def __init__(self, shutdown_event):
        """Initialize audio service."""
        self.audio_queue = queue.Queue()
        self.audio_thread = None
        self.shutdown_event = shutdown_event
        self.audio_playing = threading.Event()
        self.interrupt_queue = queue.Queue()
        self.noise_profile = None  # 初始化噪声特征
        
        # Start audio player thread
        self.audio_thread = threading.Thread(target=self.audio_player_thread)
        self.audio_thread.daemon = True
        self.audio_thread.start()
    
    def audio_player_thread(self):
        """Thread for sequential audio playback."""
        while not self.shutdown_event.is_set():
            try:
                # audio_data is a tuple (audio_array, samplerate)
                audio_data = self.audio_queue.get(timeout=0.5)
                if audio_data is None:
                    continue
                    
                if isinstance(audio_data, tuple) and len(audio_data) == 2:
                    audio_array, samplerate = audio_data
                    try:
                        debug(f"Playing audio: shape={audio_array.shape}, sr={samplerate}")
                        
                        # Always use the actual sample rate from the audio file
                        # instead of assuming config.SAMPLE_RATE
                        with sd.OutputStream(
                            samplerate=samplerate,
                            channels=1,
                            dtype=np.float32,
                            callback=None,
                            finished_callback=None
                        ) as stream:
                            chunk_size = 4096
                            for i in range(0, len(audio_array), chunk_size):
                                if self.shutdown_event.is_set():
                                    break
                                chunk = audio_array[i:i + chunk_size]
                                # Ensure chunk is 2D for sounddevice
                                if len(chunk.shape) == 1:
                                    chunk = chunk.reshape(-1, 1)
                                stream.write(chunk)
                                # Reduced sleep time for smoother playback
                                sd.sleep(10)  # Small delay to prevent CPU overload
                    except Exception as e:
                        error(f"Stream error: {e}")
                        continue
                            
            except queue.Empty:
                continue
            except Exception as e:
                error(f"Audio player error: {e}")
                continue
    
    def record_audio(self):
        """Record audio from microphone."""
        try:
            # Initialize variables
            audio_buffer = []
            is_speaking = False
            silence_start = None
            speech_start = None
            
            # Create a queue for audio chunks
            audio_queue = queue.Queue()
            
            # Define callback function for audio stream
            def audio_callback(indata, frames, time, status):
                if status:
                    debug(f"Audio status: {status}")
                # Add audio data to queue
                audio_queue.put(indata.copy())
            
            # Start audio stream
            with sd.InputStream(
                samplerate=config.SAMPLE_RATE,
                channels=1,
                callback=audio_callback,
                blocksize=4096,
                dtype=np.float32
            ):
                debug("Audio stream started")
                
                # Process audio in real-time
                while not self.shutdown_event.is_set():
                    try:
                        # Get audio chunk from queue with timeout
                        audio_chunk = audio_queue.get(timeout=0.1)
                        
                        # Calculate audio level
                        audio_level = np.abs(audio_chunk).mean()
                        
                        # Detect speech
                        if audio_level > config.SILENCE_THRESHOLD:
                            if not is_speaking:
                                is_speaking = True
                                speech_start = time.time()
                                debug(f"Speech detected (level: {audio_level:.4f})")
                            silence_start = None
                            audio_buffer.append(audio_chunk)
                        else:
                            if is_speaking:
                                if silence_start is None:
                                    silence_start = time.time()
                                audio_buffer.append(audio_chunk)
                                
                                # Check if silence duration exceeds threshold
                                if time.time() - silence_start > config.SILENCE_DURATION:
                                    debug(f"Silence detected for {config.SILENCE_DURATION}s, stopping recording")
                                    break
                            else:
                                # Keep a small buffer of background noise
                                audio_buffer.append(audio_chunk)
                                if len(audio_buffer) > 5:  # Keep about 0.5s of background
                                    audio_buffer.pop(0)
                        
                        # Check if recording is too long
                        if is_speaking and time.time() - speech_start > 30:
                            debug("Maximum recording duration reached")
                            break
                            
                    except queue.Empty:
                        continue
                    except Exception as e:
                        error(f"Error in audio processing: {e}")
                        break
            
            # Process recorded audio
            if not audio_buffer:
                debug("No audio recorded")
                return None
            
            # Combine audio chunks
            audio_data = np.concatenate(audio_buffer, axis=0)
            audio_data = audio_data.flatten()  # Ensure 1D array
            
            # Check if audio is too short
            if len(audio_data) < config.MIN_VALID_AUDIO_LENGTH * config.SAMPLE_RATE:
                debug(f"Audio too short: {len(audio_data) / config.SAMPLE_RATE:.2f}s")
                return None
            
            debug(f"Buffer size: {len(audio_data)}, Duration: {len(audio_data) / config.SAMPLE_RATE:.2f}s")
            
            # Return audio data and sample rate as a tuple
            return (audio_data, config.SAMPLE_RATE)
            
        except Exception as e:
            error(f"Recording error: {e}")
            return None
    
    def play_audio(self, audio_data, samplerate=config.SAMPLE_RATE):
        """Add audio to the playback queue."""
        if audio_data is not None:
            # Ensure audio_data is a numpy array
            if isinstance(audio_data, tuple) and len(audio_data) == 2:
                # If it's a tuple (audio_array, samplerate)
                audio_array, sr = audio_data
                self.audio_queue.put((audio_array, sr))
            else:
                # If it's just the audio array
                self.audio_queue.put((audio_data, samplerate))
    
    def check_for_interrupt(self):
        """Listen for interrupting sounds."""
        try:
            def callback(indata, frames, time_info, status):
                if status:
                    error(f"Status: {status}")
                
                level = np.abs(indata).mean()
                if level > config.SILENCE_THRESHOLD:
                    self.interrupt_queue.put(True)
                    raise sd.CallbackStop()
            
            with sd.InputStream(
                channels=1,
                samplerate=config.SAMPLE_RATE,
                callback=callback,
                dtype=np.float32
            ):
                while self.audio_playing.is_set():
                    sd.sleep(100)
                    
        except Exception as e:
            error(f"Interrupt detection error: {e}")

    def play_audio_with_interrupt(self, audio_data):
        """Play audio with interrupt capability."""
        try:
            self.audio_playing.set()
            
            # Start interrupt detection thread
            interrupt_thread = threading.Thread(target=self.check_for_interrupt)
            interrupt_thread.start()
            
            with sd.OutputStream(
                samplerate=config.SAMPLE_RATE,
                channels=1,
                dtype=np.float32,
                callback=None
            ) as stream:
                chunk_size = 4096
                for i in range(0, len(audio_data), chunk_size):
                    if not self.audio_playing.is_set() or not self.interrupt_queue.empty():
                        info("Playback interrupted by user")
                        break
                    
                    chunk = audio_data[i:i + chunk_size]
                    stream.write(chunk.reshape(-1, 1))
                    
            self.audio_playing.clear()
            interrupt_thread.join()
            
            # Clear interrupt queue
            while not self.interrupt_queue.empty():
                self.interrupt_queue.get()
                
        except Exception as e:
            error(f"Audio playback error: {e}")
            self.audio_playing.clear()
    
    def cleanup(self):
        """Clean up resources."""
        self.shutdown_event.set()
        
        # Clear audio queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
                
        if self.audio_thread and self.audio_thread.is_alive():
            self.audio_queue.put(None)  # Send stop signal
            self.audio_thread.join(timeout=2)

    def preprocess_audio(self, audio_data: bytes, sample_rate: int = 16000):
        """Preprocess audio data for speech recognition."""
        try:
            # 添加音频预处理逻辑
            # 这里可以添加重采样、降噪等处理
            return audio_data  # 返回处理后的音频数据
        except Exception as e:
            raise Exception(f"Audio preprocessing failed: {str(e)}")

    def capture_noise_profile(self, duration=1.0):
        """Capture ambient noise profile for noise reduction."""
        try:
            info("Capturing ambient noise profile... Please be quiet.")
            
            # Record ambient noise
            noise_data = sd.rec(
                int(duration * config.SAMPLE_RATE),
                samplerate=config.SAMPLE_RATE,
                channels=1,
                dtype=np.float32
            )
            sd.wait()
            
            # Compute noise profile (power spectrum)
            from scipy.fft import rfft
            noise_spectrum = rfft(noise_data.flatten())
            self.noise_profile = np.abs(noise_spectrum) ** 2
            
            info("Noise profile captured.")
        except Exception as e:
            error(f"Failed to capture noise profile: {e}")