"""Configuration settings for the assistant."""

# Audio settings
SAMPLE_RATE = 24000
WHISPER_SAMPLE_RATE = 16000
SILENCE_THRESHOLD = 0.05  # Threshold for detecting speech
SILENCE_DURATION = 2.5    # Duration of silence to end recording (seconds)
MIN_SPEECH_DURATION = 1.0  # Minimum duration of speech to process
NOISE_REDUCTION_THRESHOLD = 0.02  # Threshold for noise reduction
MIN_VALID_AUDIO_LENGTH = 0.5  # Minimum valid audio length (seconds)

# TTS settings
TTS_MODE = "api"  # "local" or "api"
TTS_API_URL = "http://192.168.31.80:8000"
TTS_SPEAKER = "zonos_americanfemale"  # Voice model to use
TTS_TIMEOUT = 60  # 秒

# Local TTS settings
MAX_PHONEME_LENGTH = 510
CHUNK_SIZE = 300
SPEED = 1.0
VOICE = "af_bella"   # Scarlett af_bella

# API settings
WHISPER_API_URL = "http://192.168.31.80:8001/transcribe/"
OLLAMA_API_URL = "http://192.168.31.80:11434"
# OLLAMA_MODEL = "llama3.2:latest"  # Change this to a model that exists on your server
OLLAMA_MODEL = "phi4:latest" 

# Database settings
DB_PATH = "chat_history.db"

# Processing settings
MAX_THREADS = 1

# ANSI colors for terminal output
PINK = '\033[95m'
CYAN = '\033[96m'
YELLOW = '\033[93m'
NEON_GREEN = '\033[92m'
RESET_COLOR = '\033[0m'

# 服务器配置
PORT = 8080
HOST = "0.0.0.0"

# 音频配置
AUDIO_STORAGE_DIR = "audio_cache"
IMAGE_STORAGE_DIR = "image_cache"
DEFAULT_SAMPLE_RATE = 24000
DEFAULT_SPEAKER = "default"  

# 文本处理配置
MAX_SEGMENT_LENGTH = 250  # 文本分段最大长度

# 数据库配置
DATABASE_PATH = "data/messages.db"

# 支持的音频格式
SUPPORTED_AUDIO_FORMATS = ["wav", "mp3", "ogg"]