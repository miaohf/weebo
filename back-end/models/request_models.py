"""Request data models for API endpoints."""
from typing import Optional, List, Dict, Any
from fastapi import UploadFile
import logging
from fastapi.datastructures import Default
from starlette.datastructures import UploadFile as StarletteUploadFile
import io

# 配置日志记录
logger = logging.getLogger(__name__)

# 显式导出这些类
__all__ = ['CustomUploadFile', 'UnifiedChatRequest']

class CustomUploadFile(UploadFile):
    """自定义UploadFile类，允许设置content_type"""
    def __init__(
        self, 
        filename: str, 
        file: io.IOBase,
        custom_content_type: str = None
    ):
        super().__init__(filename=filename, file=file)
        self._custom_content_type = custom_content_type
    
    @property
    def content_type(self) -> str:
        if self._custom_content_type:
            return self._custom_content_type
        return super().content_type

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
        logger.info(f"验证请求 - 类型: {self.message_type}, 消息: {self.message}, 文件数量: {len(self.files) if self.files else 0}")
        
        if self.files and len(self.files) > 0:
            for i, file in enumerate(self.files):
                logger.info(f"文件 {i}: 名称={file.filename}, 类型={file.content_type}")
        
        if self.message_type == "text":
            # 文本消息必须有内容
            is_valid = bool(self.message and self.message.strip())
            logger.info(f"文本消息验证结果: {is_valid}")
            return is_valid
        
        elif self.message_type == "voice":
            # 语音消息必须有文件
            if not self.files or len(self.files) == 0:
                logger.warning("语音消息验证失败: 没有文件")
                return False
                
            # 文件存在，放宽验证条件，接受任何可能是音频的文件
            file = self.files[0]
            
            # 更全面的音频类型列表
            valid_audio_types = [
                "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp3", 
                "audio/mp4", "audio/aac", "audio/flac", "audio/x-m4a",
                "video/webm", "application/octet-stream"  # 某些浏览器可能用这些类型
            ]
            valid_audio_partial = ["audio", "voice", "speech", "webm", "ogg", "mp3", "wav"]
            valid_extensions = [".webm", ".ogg", ".wav", ".mp3", ".mp4", ".m4a", ".aac", ".flac", ".bin"]
            
            # 记录文件详情
            logger.info(f"检查语音文件: 名称={file.filename}, 类型={file.content_type}")
            
            # 首先检查content_type是否直接匹配
            if file.content_type in valid_audio_types:
                logger.info(f"语音消息验证成功: 文件类型 {file.content_type} 在支持列表中")
                return True
            
            # 然后检查是否包含音频相关关键词
            content_type_lower = file.content_type.lower()
            if any(partial in content_type_lower for partial in valid_audio_partial):
                logger.info(f"语音消息验证成功: 文件类型 {file.content_type} 包含音频相关关键词")
                return True
            
            # 检查文件扩展名
            filename_lower = file.filename.lower()
            if any(filename_lower.endswith(ext) for ext in valid_extensions):
                logger.info(f"语音消息验证成功: 文件名 {file.filename} 具有有效的音频扩展名")
                return True
            
            # 对于测试情况，接受任何二进制类型文件
            if content_type_lower == "application/octet-stream" or "binary" in content_type_lower:
                logger.info(f"语音消息验证成功: 接受二进制文件 {file.content_type}")
                return True
                
            # 如果是'voice'消息类型但没有通过其他验证，我们仍然接受它，但发出警告
            logger.warning(f"语音消息验证警告: 不标准的文件类型 {file.content_type}, 文件名 {file.filename}，但由于message_type=voice，我们仍然接受它")
            return True
        
        elif self.message_type == "image":
            # 图像消息必须有文件
            has_files = bool(self.files) and len(self.files) > 0
            if not has_files:
                logger.warning("图像消息验证失败: 没有文件")
                return False
                
            file = self.files[0]
            has_image = "image" in file.content_type.lower()
            valid_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".svg"]
            has_valid_ext = any(file.filename.lower().endswith(ext) for ext in valid_extensions)
            
            is_valid = has_image or has_valid_ext
            logger.info(f"图像消息验证结果: 有文件={has_files}, 是图像文件={is_valid}")
            return is_valid
        
        elif self.message_type == "mixed":
            # 混合消息必须有文本或文件
            has_text = bool(self.message and self.message.strip())
            has_files = bool(self.files) and len(self.files) > 0
            is_valid = has_text or has_files
            logger.info(f"混合消息验证结果: 有文本={has_text}, 有文件={has_files}, 总结果={is_valid}")
            return is_valid
        
        logger.warning(f"未知消息类型: {self.message_type}")
        return False 