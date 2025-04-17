"""依赖注入模块，提供API路由所需的依赖项."""
from typing import Optional
from services.assistant import Assistant
from utils.logging_utils import debug

# 单例实例
_assistant: Optional[Assistant] = None

def get_assistant() -> Assistant:
    """获取或创建Assistant实例（单例模式）.
    
    Returns:
        Assistant: 助手实例
    """
    global _assistant
    if _assistant is None:
        debug("创建新的Assistant实例")
        _assistant = Assistant()
    return _assistant