"""会话相关路由处理."""
from fastapi import APIRouter, Depends

from services.assistant import Assistant
from api.dependencies import get_assistant
from utils.logging_utils import info

# 创建路由器
router = APIRouter(tags=["会话"])

@router.get("/sessions")
async def get_sessions(assistant: Assistant = Depends(get_assistant)):
    """获取所有对话会话历史."""
    info("获取会话历史")
    return assistant.db_service.get_session_history() 