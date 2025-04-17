"""配置管理模块."""
from typing import Optional, List, Dict, Any
import os
from pathlib import Path
from dotenv import load_dotenv

# 寻找并加载.env文件
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    print(f"加载环境变量配置文件: {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    print("未找到.env文件，将使用默认配置或系统环境变量")

class Settings:
    """应用配置类."""
    
    def __init__(self):
        """初始化配置."""
        # 开发模式配置
        self.DEV_MODE = os.environ.get("DEV_MODE", "false").lower() in ("true", "1", "yes")
        self.SKIP_KOKORO_LOADING = os.environ.get("SKIP_KOKORO_LOADING", "false").lower() in ("true", "1", "yes")
        
        # 服务模式配置 - 顶级配置，决定使用哪种服务
        self.LLM_SERVICE_MODE = os.environ.get("LLM_SERVICE_MODE", "ollama")  # 可选: "ollama", "deepseek"
        self.TTS_SERVICE_MODE = os.environ.get("TTS_SERVICE_MODE", "api")     # 可选: "api", "elevenlabs", "kokoro", "local"
        self.STT_SERVICE_MODE = os.environ.get("STT_SERVICE_MODE", "api")     # 可选: "api", "whisper"

        # Audio settings
        self.SAMPLE_RATE = int(os.environ.get("SAMPLE_RATE", "24000"))
        self.WHISPER_SAMPLE_RATE = int(os.environ.get("WHISPER_SAMPLE_RATE", "16000"))
        self.SILENCE_THRESHOLD = float(os.environ.get("SILENCE_THRESHOLD", "0.05"))  # Threshold for detecting speech
        self.SILENCE_DURATION = float(os.environ.get("SILENCE_DURATION", "2.5"))    # Duration of silence to end recording (seconds)
        self.MIN_SPEECH_DURATION = float(os.environ.get("MIN_SPEECH_DURATION", "1.0"))  # Minimum duration of speech to process
        self.NOISE_REDUCTION_THRESHOLD = float(os.environ.get("NOISE_REDUCTION_THRESHOLD", "0.02"))  # Threshold for noise reduction
        self.MIN_VALID_AUDIO_LENGTH = float(os.environ.get("MIN_VALID_AUDIO_LENGTH", "0.5"))  # Minimum valid audio length (seconds)

        # TTS配置
        # API模式配置
        self.TTS_API_URL = os.environ.get("TTS_API_URL", "http://192.168.31.80:8000")
        self.TTS_SPEAKER = os.environ.get("TTS_SPEAKER", "zonos_americanfemale")
        self.TTS_TIMEOUT = int(os.environ.get("TTS_TIMEOUT", "60"))
        
        # ElevenLabs配置
        self.ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
        self.ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        
        # Kokoro配置
        self.KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "af_bella")
        self.KOKORO_LANG_CODE = os.environ.get("KOKORO_LANG_CODE", "a")
        
        # 旧的本地TTS配置
        self.MAX_PHONEME_LENGTH = int(os.environ.get("MAX_PHONEME_LENGTH", "510"))
        self.CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "300"))
        self.SPEED = float(os.environ.get("SPEED", "1.0"))
        self.VOICE = os.environ.get("VOICE", "af_bella")
        
        # STT配置
        self.WHISPER_API_URL = os.environ.get("WHISPER_API_URL", "http://192.168.31.80:8001/transcribe/")
        
        # LLM配置
        # Ollama配置
        self.OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "http://192.168.31.80:11434")
        self.OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:latest")
        
        # DeepSeek配置
        self.DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
        self.DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
        
        # 处理配置
        self.MAX_THREADS = int(os.environ.get("MAX_THREADS", "1"))
        
        # ANSI颜色
        self.PINK = '\033[95m'
        self.CYAN = '\033[96m'
        self.YELLOW = '\033[93m'
        self.NEON_GREEN = '\033[92m'
        self.RESET_COLOR = '\033[0m'
        
        # 服务器配置
        self.PORT = int(os.environ.get("PORT", "8080"))
        self.HOST = os.environ.get("HOST", "0.0.0.0")
        
        # 存储配置
        self.AUDIO_STORAGE_DIR = os.environ.get("AUDIO_STORAGE_DIR", "audio_cache")
        self.IMAGE_STORAGE_DIR = os.environ.get("IMAGE_STORAGE_DIR", "image_cache")
        self.DEFAULT_SAMPLE_RATE = int(os.environ.get("DEFAULT_SAMPLE_RATE", "24000"))
        self.DEFAULT_SPEAKER = os.environ.get("DEFAULT_SPEAKER", "default")
        
        # 文本处理
        self.MAX_SEGMENT_LENGTH = int(os.environ.get("MAX_SEGMENT_LENGTH", "250"))
        
        # 数据库配置
        self.DATABASE_PATH = os.environ.get("DATABASE_PATH", "data/chat_history.db")
        
        # 支持的音频格式
        self.SUPPORTED_AUDIO_FORMATS = os.environ.get("SUPPORTED_AUDIO_FORMATS", "wav,mp3,ogg").split(",")

# 创建全局设置实例
settings = Settings()

# 兼容性导出，使现有代码不需要大幅修改
# 将settings对象的所有属性导出到当前模块的全局命名空间
for key, value in settings.__dict__.items():
    globals()[key] = value 