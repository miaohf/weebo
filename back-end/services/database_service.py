"""Database service for chat history."""
# from models.database_models import init_db, Message, AudioSegment, MergedAudio
from models.base import Base, init_db
from models.message import Message
from models.audio import AudioSegment, MergedAudio
from sqlalchemy.orm import Session
import json
import os
from datetime import datetime
import logging
import uuid
import traceback
from models.message import Message

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
    
    def update_message_audio(self, message_id, audio_info):
        """更新消息的音频信息"""
        try:
            with self.get_db() as db:
                # 查找消息 - 先尝试与message_id匹配
                message = db.query(Message).filter(Message.message_id == message_id).first()
                
                # 如果找不到，尝试与id匹配
                if not message and message_id.isdigit():
                    message = db.query(Message).filter(Message.id == int(message_id)).first()
                
                if not message:
                    logging.error(f"未找到消息: {message_id}")
                    return False
                
                # 记录调试信息
                logging.info(f"更新消息音频: {message_id}, 音频信息: {str(audio_info)[:100]}...")
                
                # 更新音频信息
                if isinstance(audio_info, str):
                    # 如果只是路径字符串
                    message.audio_path = audio_info
                    # 记录路径
                    logging.info(f"更新音频路径: {audio_info}")
                elif isinstance(audio_info, dict):
                    # 如果是音频信息字典
                    if "path" in audio_info:
                        message.audio_path = audio_info["path"]
                        logging.info(f"更新音频路径: {audio_info['path']}")
                    
                    # 保存完整的音频信息
                    if hasattr(message, 'audio_data'):
                        message.audio_data = json.dumps(audio_info)
                        logging.info(f"更新音频数据: {str(audio_info)[:50]}...")
                    else:
                        logging.error(f"消息对象没有 audio_data 字段")
                    
                    # 处理音频段落
                    if "segments" in audio_info and hasattr(self, 'save_audio_segments'):
                        self.save_audio_segments(message_id, audio_info["segments"])
                
                # 提交更改
                db.commit()
                return True
        except Exception as e:
            logging.error(f"更新消息音频失败: {str(e)}")
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
            with self.get_db() as db:
                # 确保查询字段与模型定义一致
                messages = db.query(Message).order_by(Message.timestamp).all()
                
                # 将查询结果转换为字典列表
                result = []
                for msg in messages:
                    message_dict = {
                        "id": msg.id,
                        "role": msg.role,
                        "content": msg.content,
                        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
                    }
                    
                    # 添加音频路径（如果存在）
                    if hasattr(msg, 'audio_path') and msg.audio_path:
                        message_dict["audio_path"] = msg.audio_path
                    
                    result.append(message_dict)
                
                return result
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

    def add_message(self, message_data):
        """添加新消息到数据库"""
        try:
            with self.get_db() as db:
                # 创建新的消息对象
                message = Message(
                    message_id=message_data.get("message_id"),
                    message_type=message_data.get("message_type", "text"),
                    content=message_data.get("content"),
                    status=message_data.get("status", "success")
                )
                
                # 添加音频数据（如果存在）
                if "audio" in message_data:
                    message.audio_data = message_data["audio"]
                    if isinstance(message_data["audio"], dict) and "path" in message_data["audio"]:
                        message.audio_path = message_data["audio"]["path"]
                
                # 添加图像数据（如果存在）
                if "images" in message_data and message_data["images"]:
                    message.images = message_data["images"]
                
                # 保存到数据库
                db.add(message)
                db.commit()
                return message.id
        except Exception as e:
            logging.error(f"添加消息失败: {e}")
            return None

    def save_audio_segments(self, message_id, segments):
        """保存音频段落到 audio_segments 表"""
        try:
            # 使用导入的 AudioSegment 模型
            with self.get_db() as db:
                # 清除现有段落
                db.query(AudioSegment).filter(AudioSegment.message_id == message_id).delete()
                
                # 添加新段落
                for segment in segments:
                    seg = AudioSegment(
                        message_id=message_id,
                        path=segment.get("path"),
                        segment_index=segment.get("segment_index", 0),
                        sample_rate=segment.get("sample_rate"),
                        duration=segment.get("duration")
                    )
                    db.add(seg)
                
                db.commit()
                logging.info(f"为消息 {message_id} 保存了 {len(segments)} 个音频段落")
                return True
        except Exception as e:
            logging.error(f"保存音频段落失败: {str(e)}")
            return False

    def update_message_audio_path(self, message_id, audio_path):
        """更新消息的音频路径"""
        try:
            with self.get_db() as db:
                # 查找消息
                message = db.query(Message).filter(Message.message_id == message_id).first()
                
                # 如果找不到，尝试作为数字ID查找
                if not message and message_id.isdigit():
                    message = db.query(Message).filter(Message.id == int(message_id)).first()
                
                if not message:
                    logging.error(f"未找到消息 {message_id}")
                    return False
                
                # 检查 audio_path 属性是否存在
                if not hasattr(message, 'audio_path'):
                    logging.error(f"Message 对象没有 audio_path 属性，需要更新数据库模型")
                    # 尝试使用通用方法更新
                    try:
                        # 使用 __setattr__ 方法设置属性（即使模型中没有定义）
                        setattr(message, 'audio_path', audio_path)
                        db.commit()
                        logging.info(f"已通过动态属性设置音频路径: {audio_path}")
                        return True
                    except Exception as e:
                        logging.error(f"动态设置属性失败: {e}")
                        return False
                
                # 正常更新音频路径
                old_path = getattr(message, 'audio_path', None)
                message.audio_path = audio_path
                db.commit()
                
                logging.info(f"音频路径已更新: {old_path} -> {audio_path}")
                return True
        except Exception as e:
            logging.error(f"更新消息音频路径失败: {str(e)}")
            logging.error(traceback.format_exc())
            return False
        
    def save_merged_audio(self, merged_audio):
        """保存合并音频记录
        
        Args:
            merged_audio: 包含合并音频信息的字典
        """
        try:
            # 导入 MergedAudio 模型 - 确保已创建此模型
            from models.audio import MergedAudio
            
            with self.get_db() as db:
                # 创建新记录
                record = MergedAudio(
                    message_id=merged_audio["message_id"],
                    path=merged_audio["path"],
                    sample_rate=merged_audio.get("sample_rate", 24000),
                    duration=merged_audio.get("duration", 0),
                    segments_count=merged_audio.get("segments_count", 0)
                )
                
                # 保存到数据库
                db.add(record)
                db.commit()
                
                logging.info(f"已保存合并音频记录: 消息ID={merged_audio['message_id']}, 路径={merged_audio['path']}")
                return True
        except Exception as e:
            logging.error(f"保存合并音频记录失败: {str(e)}")
            logging.error(traceback.format_exc())
            return False