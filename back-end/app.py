"""应用入口点."""
import os
import signal
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from core.config import settings
from core.exceptions import register_exception_handlers
from api.routes import chat, audio, sessions
from api.dependencies import get_assistant
from utils.logging_utils import info

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # 输出到控制台
        logging.FileHandler('app.log')  # 输出到文件
    ]
)

logger = logging.getLogger(__name__)

# 确保存储目录存在
os.makedirs(settings.AUDIO_STORAGE_DIR, exist_ok=True)
os.makedirs(settings.IMAGE_STORAGE_DIR, exist_ok=True)

# 定义生命周期管理器
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动前执行的代码
    # 预初始化Assistant
    _ = get_assistant()
    info("Assistant已初始化")
    
    yield  # 这里是应用运行的地方
    
    # 关闭时执行的代码
    info("正在关闭应用...")
    assistant = get_assistant()
    if assistant:
        assistant.shutdown_event.set()

# 创建FastAPI应用
app = FastAPI(
    title="AI助手API", 
    version="1.0.0",
    description="智能对话助手API服务",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境使用，生产环境应设置具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# 注册路由
app.include_router(chat.router)
app.include_router(audio.router)
app.include_router(sessions.router)

# 注册异常处理器
register_exception_handlers(app)

def main():
    """主入口函数."""
    # 检查环境变量决定是否启用重载
    is_dev = os.environ.get("ENV", "development") == "development"
    
    if is_dev:
        # 开发模式：启用重载
        uvicorn.run(
            "app:app",
            host=settings.HOST,
            port=settings.PORT, 
            reload=True,
            log_level="debug"
        )
    else:
        # 生产模式：配置信号处理和其他优化
        def signal_handler(sig, frame):
            logger.info("收到关闭信号，正在关闭...")
            # 这里不需要手动调用shutdown_event，因为FastAPI会触发shutdown事件
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        uvicorn_config = uvicorn.Config(
            app,
            host=settings.HOST,
            port=settings.PORT,
            log_level="info",
            access_log=True
        )
    
        server = uvicorn.Server(uvicorn_config)
        server.run()

if __name__ == "__main__":
    main() 