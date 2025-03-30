"""Main entry point for the assistant API server."""
import os
import signal
import logging
from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn
from typing import Optional, List

import config
from models.request_models import UnifiedChatRequest
from services.assistant import Assistant
from services.message_processor import MessageProcessorFactory
from utils.logging_utils import debug, info, error

# 配置详细的日志记录
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # 输出到控制台
        logging.FileHandler('app.log')  # 输出到文件
    ]
)

# 设置日志
logger = logging.getLogger(__name__)

# 确保存储目录存在
os.makedirs(config.AUDIO_STORAGE_DIR, exist_ok=True)
os.makedirs(config.IMAGE_STORAGE_DIR, exist_ok=True)

# 初始化 FastAPI 应用
app = FastAPI(title="AI助手API", version="1.0.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境使用，生产环境应设置具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# 初始化助手实例
assistant = Assistant()

@app.post("/chat")
async def unified_chat(
    message_type: str = Form(...),  # "text", "voice", "image", "mixed"
    message: Optional[str] = Form(None),
    files: List[UploadFile] = File([]),
    session_id: Optional[str] = Form(None),
    speaker: str = Form("default"),
    stream_audio: bool = Form(True),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """统一的消息处理端点，支持多种消息类型"""
    try:
        # 创建请求对象
        request = UnifiedChatRequest(
            message_type=message_type,
            message=message,
            files=files,
            session_id=session_id,
            speaker=speaker,
            stream_audio=stream_audio
        )
        
        # 验证请求
        if not request.is_valid():
            return JSONResponse(
                status_code=400,
                content={"error": "无效的请求参数", "message_type": message_type}
            )
        
        # 创建消息处理器
        processor = MessageProcessorFactory.create(message_type, assistant)
        
        # 处理消息并返回响应
        return await processor.process(request, background_tasks)
        
    except Exception as e:
        error(f"消息处理错误: {e}")
        import traceback
        error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "status": "error"
            }
        )

@app.post("/get_audio")
async def get_audio(message_id: str = Form(...)):
    """获取指定消息ID的历史音频数据"""
    try:
        # # 处理可能的前缀
        # if message_id.startswith("assistant-"):
        #     message_id = message_id.split("assistant-", 1)[1]
        
        print(f"message_id: {message_id}")
        # 获取消息
        audio = assistant.db_service.get_audio_by_message_id(message_id)

        if not audio:
            raise HTTPException(status_code=404, detail="未找到消息")
        
        # 获取音频数据
        audio_response = await assistant.get_message_audio(message_id, audio)

        if audio_response:
            return JSONResponse(audio_response)
        else:
            raise HTTPException(status_code=404, detail="此消息没有关联音频")
            
    except HTTPException:
        raise
    except Exception as e:
        error(f"获取音频失败: {e}")
        import traceback
        error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions")
async def get_sessions():
    """获取所有对话会话历史"""
    return assistant.db_service.get_session_history()

def main():
    """Main entry point."""
    logger.info("Starting server...")
    
    # 检查环境变量决定是否启用重载
    is_dev = os.environ.get("ENV", "development") == "development"
    
    if is_dev:
        # 开发模式：启用重载
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=config.PORT if hasattr(config, 'PORT') else 8080, 
            reload=True,
            log_level="debug"
        )
    else:
        # 生产模式：配置信号处理和其他优化
        def signal_handler(sig, frame):
            logger.info("Shutting down...")
            assistant.shutdown_event.set()
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        uvicorn_config = uvicorn.Config(
        app,
        host="0.0.0.0",
            port=config.PORT if hasattr(config, 'PORT') else 8080,
        log_level="info",
            access_log=True
    )
    
        server = uvicorn.Server(uvicorn_config)
    server.run()

if __name__ == "__main__":
    main()