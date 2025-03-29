"""Response data models for API endpoints."""
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel

class TextContent(BaseModel):
    """文本内容模型"""
    english: str
    chinese: str

class AudioData(BaseModel):
    """音频数据模型"""
    audio_data: str  # base64编码的音频
    sample_rate: int
    format: str = "wav"

class ImageData(BaseModel):
    """图像数据模型"""
    image_data: str  # base64编码的图像
    width: int
    height: int
    format: str = "png"

class UnifiedResponse(BaseModel):
    """统一响应模型"""
    message_id: str
    message_type: str  # "text", "voice", "image", "mixed"
    content: TextContent
    audio: Optional[AudioData] = None
    images: Optional[List[ImageData]] = None
    status: str = "success"

class StreamTextResponse(BaseModel):
    """流式文本响应"""
    type: str = "text"
    message_id: str
    content: TextContent

class StreamAudioResponse(BaseModel):
    """流式音频响应"""
    type: str = "audio"
    message_id: str
    segment_index: int
    total_segments: int
    audio_data: str  # base64
    format: str = "wav"
    sample_rate: int

class ErrorResponse(BaseModel):
    """错误响应"""
    error: str
    status: str = "error" 