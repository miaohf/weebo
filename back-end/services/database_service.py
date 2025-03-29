"""Database service for chat history."""
from models.database_models import init_db, Message, AudioSegment, MergedAudio
from sqlalchemy.orm import Session
import json
import os
from datetime import datetime
import logging
import uuid
import traceback

logger = logging.getLogger(__name__)

class DatabaseService:
    """数据库服务，使用SQLAlchemy ORM处理数据库操作"""
    
    def __init__(self, db_path="data/messages.db"):
        """初始化数据库服务"""
        self.db_path = db_path
        self.engine, self.SessionLocal = init_db(db_path)
        logging.info(f"数据库服务初始化: {db_path}")
        
    def get_db(self):
        """获取数据库会话"""
        db = self.SessionLocal()
        try:
            return db
        finally:
            db.close()
    
    def save_message(self, role, content):
        """保存消息"""
        try:
            message_id = str(uuid.uuid4())
            key = f"{role}-{message_id}"
            
            # 创建消息对象
            message = Message(
                key=key,
                role=role,
                message_id=message_id,
                content=json.dumps(content) if not isinstance(content, str) else content,
                timestamp=datetime.now()
            )
            
            # 保存到数据库
            with self.SessionLocal() as db:
                db.add(message)
                db.commit()
                db.refresh(message)
            
            logging.debug(f"已保存消息: {key}")
            return message_id
        except Exception as e:
            logging.error(f"保存消息失败: {e}")
            logging.error(traceback.format_exc())
            return None
    
    def save_message_with_audio(self, role, content, message_id, audio_paths=None):
        """保存消息并关联音频路径"""
        try:
            key = f"{role}-{message_id}"
            
            with self.SessionLocal() as db:
                # 查找或创建消息
                message = db.query(Message).filter(Message.key == key).first()
                
                if not message:
                    message = Message(
                        key=key,
                        role=role,
                        message_id=message_id,
                        content=json.dumps(content) if not isinstance(content, str) else content,
                        timestamp=datetime.now()
                    )
                    db.add(message)
                    db.flush()  # 获取ID
                
                # 保存音频段落
                if audio_paths:
                    # 清除现有的音频段落
                    db.query(AudioSegment).filter(AudioSegment.message_id == message.id).delete()
                    
                    # 添加新的音频段落
                    for segment in audio_paths:
                        audio_segment = AudioSegment(
                            message_id=message.id,
                            segment_index=segment.get("segment_index", 0),
                            path=segment.get("path", ""),
                            text=segment.get("text", ""),
                            sample_rate=segment.get("sample_rate", 24000)
                        )
                        db.add(audio_segment)
                
                db.commit()
                
            logging.debug(f"已保存消息(带音频路径): {key}")
            return True
                
        except Exception as e:
            logging.error(f"保存消息(带音频路径)失败: {e}")
            logging.error(traceback.format_exc())
            return False
    
    def update_message_audio(self, message_id, audio_paths, merged_info):
        """更新消息的音频信息"""

        print(f"message_id, audio_paths, merged_info: {message_id}, {audio_paths}, {merged_info}")
        try:
            with self.SessionLocal() as db:
                # 尝试多种方式查找消息
                message = None
                
                # 1. 通过完整key查找
                key = f"assistant-{message_id}"
                message = db.query(Message).filter(Message.key == key).first()
                
                # 2. 如果没找到，尝试通过消息ID查找
                if not message:
                    message = db.query(Message).filter(Message.message_id == message_id).first()
                
                # 3. 如果仍然没找到，尝试通过部分key匹配
                if not message:
                    message = db.query(Message).filter(
                        Message.key.like(f"%{message_id}%")
                    ).first()
                
                if not message:
                    logging.error(f"未找到消息: {key}")
                    return False
                
                # 更新音频段落
                if audio_paths:
                    # 删除现有段落
                    db.query(AudioSegment).filter(AudioSegment.message_id == message.id).delete()
                    
                    # 添加新的段落
                    for segment in audio_paths:
                        audio_segment = AudioSegment(
                            message_id=message.id,
                            segment_index=segment.get("segment_index", 0),
                            path=segment.get("path", ""),
                            text=segment.get("text", ""),
                            sample_rate=segment.get("sample_rate", 24000)
                        )
                        db.add(audio_segment)
                
                # 更新合并音频信息
                if merged_info:
                    # 查找现有的合并音频
                    merged_audio = db.query(MergedAudio).filter(MergedAudio.message_id == message.id).first()
                    
                    if merged_audio:
                        merged_audio.path = merged_info.get("merged_path", "")
                        merged_audio.sample_rate = merged_info.get("sample_rate", 24000)
                    else:
                        # 创建新的合并音频记录
                        merged_audio = MergedAudio(
                            message_id=message.id,
                            path=merged_info.get("merged_path", ""),
                            sample_rate=merged_info.get("sample_rate", 24000)
                        )
                        db.add(merged_audio)
                
                db.commit()
            
            logging.debug(f"已更新消息音频信息: {key}")
            return True
            
        except Exception as e:
            logging.error(f"更新消息音频信息失败: {e}")
            logging.error(traceback.format_exc())
            return False
    
    def get_message_by_id(self, message_id):
        """根据消息ID查询消息"""
        try:
            with self.SessionLocal() as db:
                # 查找特定message_id的记录
                message = db.query(Message).filter(Message.message_id == message_id).first()
                
                # 如果没找到，尝试查找以assistant-{message_id}开头的记录
                if not message:
                    key_pattern = f"assistant-{message_id}"
                    message = db.query(Message).filter(Message.key.like(f"{key_pattern}%")).first()
                
                if message:
                    return message.to_dict()
                return None
                
        except Exception as e:
            logging.error(f"获取消息失败: {e}")
            logging.error(traceback.format_exc())
            return None
    
    def get_message_by_key(self, key):
        """根据消息键查询消息"""
        try:
            with self.SessionLocal() as db:
                message = db.query(Message).filter(Message.key == key).first()
                
                if message:
                    return message.to_dict()
                return None
                
        except Exception as e:
            logging.error(f"获取消息失败: {e}")
            logging.error(traceback.format_exc())
            return None
    
    def load_session(self):
        """加载会话历史记录"""
        try:
            with self.SessionLocal() as db:
                messages = db.query(Message).order_by(Message.timestamp).all()
                return [message.to_dict() for message in messages]
        except Exception as e:
            logging.error(f"加载会话失败: {e}")
            logging.error(traceback.format_exc())
            return []
    
    def get_session_history(self):
        """获取所有会话历史"""
        try:
            with self.SessionLocal() as db:
                # 按时间戳排序获取所有消息
                messages = db.query(Message).order_by(Message.timestamp).all()
                
                # 转换为字典格式
                result = []
                for message in messages:
                    msg_dict = message.to_dict()
                    result.append(msg_dict)
                
                return result
        except Exception as e:
            logging.error(f"获取会话历史失败: {e}")
            logging.error(traceback.format_exc())
            return []
    
    def clear_session(self):
        """清空当前会话"""
        try:
            with self.SessionLocal() as db:
                # 删除所有消息及关联数据
                db.query(AudioSegment).delete()
                db.query(MergedAudio).delete()
                db.query(Message).delete()
                db.commit()
            logging.info("会话已清空")
            return True
        except Exception as e:
            logging.error(f"清空会话失败: {e}")
            logging.error(traceback.format_exc())
            return False
    
    def get_message_by_flexible_id(self, message_id):
        """灵活查询消息，尝试多种ID格式"""
        try:
            with self.SessionLocal() as db:
                # 尝试不同的查询方式
                message = None
                
                # 1. 直接按message_id查询
                message = db.query(Message).filter(Message.message_id == message_id).first()
                if message:
                    return message.to_dict()
                    
                # 2. 尝试key格式查询
                key = f"assistant-{message_id}"
                message = db.query(Message).filter(Message.key == key).first()
                if message:
                    return message.to_dict()
                    
                # 3. 模糊查询包含ID的键
                message = db.query(Message).filter(Message.key.like(f"%{message_id}%")).first()
                if message:
                    return message.to_dict()
                    
                # 4. 如果ID包含连字符，尝试只使用第一部分
                if "-" in message_id:
                    first_part = message_id.split("-")[0]
                    message = db.query(Message).filter(
                        (Message.message_id.like(f"{first_part}%")) |
                        (Message.key.like(f"%{first_part}%"))
                    ).first()
                    if message:
                        return message.to_dict()
                
                return None
        except Exception as e:
            logging.error(f"灵活查询消息失败: {e}")
            logging.error(traceback.format_exc())
            return None
        
    def ensure_consistent_message_ids(self):
        """确保所有消息都有一致格式的ID"""
        try:
            with self.SessionLocal() as db:
                # 查找所有消息
                messages = db.query(Message).all()
                updated = 0
                
                for msg in messages:
                    need_update = False
                    
                    # 确保message_id和key一致
                    if "assistant-" in msg.key and not msg.key.endswith(msg.message_id):
                        # 从key中提取ID
                        parts = msg.key.split("assistant-", 1)
                        if len(parts) > 1:
                            msg.message_id = parts[1]
                            need_update = True
                    
                    # 如果需要更新
                    if need_update:
                        updated += 1
                
                if updated > 0:
                    db.commit()
                    logging.info(f"已更新{updated}条消息的ID格式")
                
                return updated
        except Exception as e:
            logging.error(f"更新消息ID格式失败: {e}")
            logging.error(traceback.format_exc())
            return 0