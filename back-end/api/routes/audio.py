"""音频相关路由处理."""
from fastapi import APIRouter, Form, HTTPException, Depends, status
from fastapi.responses import JSONResponse

from services.assistant import Assistant
from api.dependencies import get_assistant
from utils.logging_utils import info, error

# 创建路由器
router = APIRouter(tags=["音频"])

@router.post("/get_audio")
async def get_audio(message_id: str = Form(...), assistant: Assistant = Depends(get_assistant)):
    """获取指定消息ID的历史音频数据."""
    try:
        info(f"获取音频，message_id: {message_id}")
        # 获取消息
        audio = assistant.db_service.get_audio_by_message_id(message_id)

        if not audio:
            error(f"未找到消息: {message_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="未找到消息"
            )
        
        # 获取音频数据
        audio_response = await assistant.get_message_audio(message_id, audio)

        if audio_response:
            info(f"成功获取音频数据: {message_id}")
            return JSONResponse(audio_response)
        else:
            error(f"消息没有关联音频: {message_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="此消息没有关联音频"
            )
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        error(f"获取音频失败: {e}")
        import traceback
        error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=str(e)
        ) 