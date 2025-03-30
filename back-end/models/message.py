from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from models.base import Base
import datetime
import json

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True)
    key = Column(String(255), nullable=True)  # 添加这个字段以匹配当前代码
    message_id = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False)  # user 或 assistant
    content = Column(Text, nullable=True)
    
    # 使用JSON类型存储内容的备选方案
    content_english = Column(Text, nullable=True)
    content_chinese = Column(Text, nullable=True)
    
    # 音频相关字段
    audio_path = Column(String(255), nullable=True)
    
    # 图像相关字段
    image_path = Column(Text, nullable=True)  # 可存储多个路径，用逗号分隔
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.datetime.now)
    
    def __repr__(self):
        return f"<Message(message_id='{self.message_id}', type='{self.role}')>"
    
    def to_dict(self):
        """将模型转换为字典"""
        result = {
            "id": self.id,
            "message_id": self.message_id,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
        
        # 处理内容字段
        if self.content:
            try:
                # 尝试解析JSON内容
                content_dict = json.loads(self.content)
                result["content"] = content_dict
            except:
                # 如果解析失败，直接使用文本内容
                result["content"] = {"text": self.content}
        elif self.content_english or self.content_chinese:
            # 使用分开存储的内容字段
            result["content"] = {
                "english": self.content_english,
                "chinese": self.content_chinese
            }
            
        # 添加音频路径（如果存在）
        if self.audio_path:
            result["audio_path"] = self.audio_path
            
        # 添加图像路径（如果存在）
        if self.image_path:
            paths = self.image_path.split(",")
            result["images"] = [{"image_path": path.strip()} for path in paths if path.strip()]
            
        return result 