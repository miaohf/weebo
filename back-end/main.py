"""Main entry point for the assistant API server."""
import os
import signal
import logging
from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn
from typing import Optional, List
import time
import tempfile

import config
from models.request_models import UnifiedChatRequest, CustomUploadFile
from services.assistant import Assistant
from services.message_processor import MessageProcessorFactory
from utils.logging_utils import debug, info, error

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
    request: Request,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """统一的消息处理端点，使用JSON格式接收请求"""
    print("="*50)
    print("接收到新的聊天请求")
    print("请求头信息:")
    for header, value in request.headers.items():
        print(f"  {header}: {value}")
    
    try:
        # 读取并解析JSON请求体
        json_data = await request.json()
        print("\nJSON请求体:")
        for key, value in json_data.items():
            if key == 'audio_data' and value:
                print(f"  {key}: [BASE64数据，长度: {len(value)} 字符]")
            else:
                print(f"  {key}: {value}")
        
        # 提取请求参数
        message_type = json_data.get('message_type', 'text')
        message = json_data.get('message', '')
        session_id = json_data.get('session_id')
        speaker = json_data.get('speaker', 'default')
        stream_audio = json_data.get('stream_audio', True)
        
        # 处理音频数据
        files = []
        if message_type == 'voice' and 'audio_data' in json_data and json_data['audio_data']:
            try:
                # 解码Base64音频数据
                import base64
                audio_data_str = json_data['audio_data']
                # 可能包含data URL前缀，需要移除
                if ',' in audio_data_str:
                    audio_data_str = audio_data_str.split(',', 1)[1]
                
                audio_data = base64.b64decode(audio_data_str)
                print(f"  已解码音频数据: {len(audio_data)} 字节")
                
                # 显示前16个字节
                if audio_data:
                    hex_header = ' '.join([f"{b:02X}" for b in audio_data[:16]])
                    print(f"  音频数据头16字节(HEX): {hex_header}")
                
                # 保存到临时文件
                temp_dir = "/tmp/weebo_debug"
                os.makedirs(temp_dir, exist_ok=True)
                timestamp = int(time.time())
                # 处理MIME类型
                mime_type = json_data.get('audio_mime_type', 'audio/webm')
                extension = mime_type.split('/')[-1]
                # 处理包含分号的情况（如 audio/webm;codecs=opus）
                if ';' in extension:
                    extension = extension.split(';')[0]
                
                temp_file_path = f"{temp_dir}/voice_input_{timestamp}.{extension}"
                with open(temp_file_path, "wb") as f:
                    f.write(audio_data)
                print(f"  已保存音频数据到: {temp_file_path}")
                
                # 创建一个内存文件对象
                from io import BytesIO
                from models.request_models import CustomUploadFile
                
                # 创建临时文件
                spooled_file = tempfile.SpooledTemporaryFile()
                spooled_file.write(audio_data)
                spooled_file.seek(0)
                
                # 使用自定义的CustomUploadFile类
                audio_file = CustomUploadFile(
                    filename=f"audio.{extension}",
                    file=spooled_file,
                    custom_content_type=mime_type
                )
                
                files.append(audio_file)
                print(f"  已创建CustomUploadFile对象: {audio_file.filename}, {audio_file.content_type}")
                
            except Exception as e:
                print(f"  处理音频数据时出错: {e}")
                import traceback
                print(traceback.format_exc())
        
        # 创建请求对象
        chat_request = UnifiedChatRequest(
            message_type=message_type,
            message=message,
            files=files,
            session_id=session_id,
            speaker=speaker,
            stream_audio=stream_audio
        )
        
        # 验证请求
        if not chat_request.is_valid():
            print(f"请求验证失败: message_type={message_type}")
            return JSONResponse(
                status_code=400,
                content={"error": "无效的请求参数", "message_type": message_type}
            )
        
        # 创建消息处理器
        print(f"创建消息处理器: message_type={message_type}")
        processor = MessageProcessorFactory.create(message_type, assistant)
        
        # 处理消息并返回响应
        print(f"开始处理消息: message_type={message_type}")
        return await processor.process(chat_request, background_tasks)
        
    except Exception as e:
        error(f"消息处理错误: {e}")
        import traceback
        error_trace = traceback.format_exc()
        print(error_trace)
        error(error_trace)
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