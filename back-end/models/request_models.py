"""Request data models for API endpoints."""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile

class UnifiedChatRequest:
    """统一聊天请求模型，支持多种消息类型"""
    def __init__(
        self,
        message_type: str,
        message: Optional[str] = None,
        files: Optional[List[UploadFile]] = None,
        session_id: Optional[str] = None,
        speaker: str = "default",
        stream_audio: bool = True
    ):
        self.message_type = message_type
        self.message = message
        self.files = files or []
        self.session_id = session_id
        self.speaker = speaker
        self.stream_audio = stream_audio
    
    def is_valid(self) -> bool:
        """验证请求是否有效"""
        if self.message_type == "text":
            # 文本消息必须有内容
            return bool(self.message and self.message.strip())
        
        elif self.message_type == "voice":
            # 语音消息必须有文件
            return bool(self.files) and len(self.files) > 0 and "audio" in self.files[0].content_type
        
        elif self.message_type == "image":
            # 图像消息必须有文件
            return bool(self.files) and len(self.files) > 0 and "image" in self.files[0].content_type
        
        elif self.message_type == "mixed":
            # 混合消息必须有文本或文件
            has_text = bool(self.message and self.message.strip())
            has_files = bool(self.files) and len(self.files) > 0
            return has_text or has_files
        
        return False 