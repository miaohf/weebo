from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime
import json
import os

Base = declarative_base()

class Message(Base):
    """消息模型"""
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(255), unique=True, index=True)  # 消息唯一标识符
    role = Column(String(50))  # 角色：user 或 assistant
    message_id = Column(String(100), index=True)  # UUID格式的消息ID
    content = Column(Text)  # 消息内容（JSON格式）
    timestamp = Column(DateTime, default=datetime.now)
    audio_segments = relationship("AudioSegment", back_populates="message", cascade="all, delete-orphan")
    merged_audio = relationship("MergedAudio", back_populates="message", uselist=False, cascade="all, delete-orphan")
    
    def to_dict(self):
        """将模型转换为字典"""
        result = {
            "id": self.id,
            "key": self.key,
            "role": self.role,
            "message_id": self.message_id,
            "content": json.loads(self.content) if isinstance(self.content, str) else self.content,
            "timestamp": self.timestamp.isoformat(),
            "audio_paths": [segment.to_dict() for segment in self.audio_segments] if self.audio_segments else []
        }
        
        if self.merged_audio:
            result["merged_audio"] = self.merged_audio.to_dict()
            
        return result


class AudioSegment(Base):
    """音频段落模型"""
    __tablename__ = "audio_segments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    segment_index = Column(Integer)  # 段落索引
    path = Column(String(255))  # 文件路径
    text = Column(Text)  # 段落文本
    sample_rate = Column(Integer, default=24000)  # 采样率
    
    message = relationship("Message", back_populates="audio_segments")
    
    def to_dict(self):
        return {
            "segment_index": self.segment_index,
            "path": self.path,
            "text": self.text,
            "sample_rate": self.sample_rate
        }


class MergedAudio(Base):
    """合并后的音频模型"""
    __tablename__ = "merged_audios"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("messages.id"), unique=True)
    path = Column(String(255))  # 合并后的文件路径
    sample_rate = Column(Integer, default=24000)  # 采样率
    
    message = relationship("Message", back_populates="merged_audio")
    
    def to_dict(self):
        return {
            "merged_path": self.path,
            "sample_rate": self.sample_rate
        }

# 数据库初始化函数
def init_db(db_path):
    """初始化数据库连接和表结构"""
    # 确保目录存在
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # 创建数据库引擎
    engine = create_engine(f"sqlite:///{db_path}")
    
    # 创建所有表
    Base.metadata.create_all(engine)
    
    # 创建会话工厂
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    return engine, SessionLocal 