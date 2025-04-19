"""聊天相关路由处理."""
import os
import time
import tempfile
import base64
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Depends, status
from fastapi.responses import JSONResponse

from models.request_models import UnifiedChatRequest, CustomUploadFile
from services.assistant import Assistant
from services.message_processor import MessageProcessorFactory
from api.dependencies import get_assistant
from utils.logging_utils import debug, info, error
from core.config import settings

# 创建路由器
router = APIRouter(tags=["聊天"])

@router.post(
    "/chat", 
    # response_model=ChatResponse,  # 需要定义响应模型
    summary="处理聊天请求",
    description="处理文本、语音或图像聊天请求，返回AI助手回复",
    responses={
        200: {"description": "成功处理聊天请求"},
        400: {"description": "无效的请求参数"},
        500: {"description": "服务器内部错误"}
    }
)
async def unified_chat(
    request: Request,
    background_tasks: BackgroundTasks,
    assistant: Assistant = Depends(get_assistant)
):
    """统一的消息处理端点，使用JSON格式接收请求."""
    info("="*50)
    info("接收到新的聊天请求")
    info("请求头信息:")
    
    # 记录请求头
    headers_info = []
    for header, value in request.headers.items():
        headers_info.append(f"  {header}: {value}")
    info("\n".join(headers_info))
    
    try:
        # 读取并解析JSON请求体
        json_data = await request.json()
        debug("JSON请求体:")
        
        # 记录请求体
        body_info = []
        for key, value in json_data.items():
            if key == 'audio_data' and value:
                body_info.append(f"  {key}: [BASE64数据，长度: {len(value)} 字符]")
            else:
                body_info.append(f"  {key}: {value}")
        debug("\n".join(body_info))
        
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
                audio_data_str = json_data['audio_data']
                # 可能包含data URL前缀，需要移除
                if ',' in audio_data_str:
                    audio_data_str = audio_data_str.split(',', 1)[1]
                
                audio_data = base64.b64decode(audio_data_str)
                debug(f"已解码音频数据: {len(audio_data)} 字节")
                
                # 显示前16个字节
                if audio_data:
                    hex_header = ' '.join([f"{b:02X}" for b in audio_data[:16]])
                    debug(f"音频数据头16字节(HEX): {hex_header}")
                
                # 保存到用户音频目录
                user_audio_dir = os.path.join(settings.AUDIO_STORAGE_DIR, "user")
                os.makedirs(user_audio_dir, exist_ok=True)
                timestamp = int(time.time())
                # 处理MIME类型
                mime_type = json_data.get('audio_mime_type', 'audio/webm')
                extension = mime_type.split('/')[-1]
                # 处理包含分号的情况（如 audio/webm;codecs=opus）
                if ';' in extension:
                    extension = extension.split(';')[0]
                
                temp_file_path = f"{user_audio_dir}/voice_input_{timestamp}.{extension}"
                with open(temp_file_path, "wb") as f:
                    f.write(audio_data)
                debug(f"已保存音频数据到: {temp_file_path}")
                
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
                debug(f"已创建CustomUploadFile对象: {audio_file.filename}, {audio_file.content_type}")
                
            except Exception as e:
                error(f"处理音频数据时出错: {e}")
                import traceback
                error(traceback.format_exc())
        
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
            error(f"请求验证失败: message_type={message_type}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "无效的请求参数", "message_type": message_type}
            )
        
        # 创建消息处理器
        info(f"创建消息处理器: message_type={message_type}")
        processor = MessageProcessorFactory.create(message_type, assistant)
        
        # 处理消息并返回响应
        info(f"开始处理消息: message_type={message_type}")
        return await processor.process(chat_request, background_tasks)
        
    except Exception as e:
        error(f"消息处理错误: {e}")
        import traceback
        error_trace = traceback.format_exc()
        error(error_trace)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": str(e),
                "status": "error"
            }
        ) 