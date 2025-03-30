from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from models.base import Base
import datetime

class AudioSegment(Base):
    __tablename__ = "audio_segments"
    
    id = Column(Integer, primary_key=True)
    message_id = Column(String(255), nullable=False)
    path = Column(String(255), nullable=False)
    segment_index = Column(Integer, default=0)
    sample_rate = Column(Integer, default=16000)
    duration = Column(Float, nullable=True)

class MergedAudio(Base):
    __tablename__ = "merged_audios"
    
    id = Column(Integer, primary_key=True)
    message_id = Column(String(255), nullable=False, unique=True)
    path = Column(String(255), nullable=False)
    sample_rate = Column(Integer, default=24000)
    duration = Column(Float, nullable=True)
    segments_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.now) 

    def __repr__(self):
        return f"<MergedAudio(message_id='{self.path}')>"
    
    def to_dict(self):
        """将模型转换为字典"""
        result = {
            "id": self.id,
            "message_id": self.message_id,
            "path": self.path,
            "sample_rate": self.sample_rate,
            "duration": self.duration,
            "segments_count": self.segments_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
                    
        return result 