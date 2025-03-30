"""
数据库重建脚本
- 备份现有数据库
- 创建新的数据库结构
- 可选择是否导入旧数据
"""
import os
import shutil
import json
import sqlite3
import logging
from datetime import datetime
from models.base import init_db
from models.message import Message
from models.audio import AudioSegment, MergedAudio
from sqlalchemy import create_engine
from models.message import Base as MessageBase
from models.audio import Base as AudioBase
import config
from models.base import Base

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def backup_database(db_path):
    """备份现有数据库"""
    if not os.path.exists(db_path):
        logger.warning(f"数据库文件不存在: {db_path}")
        return False
    
    # 创建带时间戳的备份文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup_{timestamp}"
    
    # 复制数据库文件
    try:
        shutil.copy2(db_path, backup_path)
        logger.info(f"数据库已备份到: {backup_path}")
        return backup_path
    except Exception as e:
        logger.error(f"备份数据库失败: {e}")
        return False

def create_new_database(db_path):
    """创建新的数据库结构"""
    # 如果文件存在，先删除
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
            logger.info(f"已删除旧数据库文件: {db_path}")
        except Exception as e:
            logger.error(f"删除旧数据库文件失败: {e}")
            return False
    
    # 创建新数据库和表结构
    try:
        engine, SessionLocal = init_db(db_path)
        logger.info(f"已创建新数据库结构: {db_path}")
        return True
    except Exception as e:
        logger.error(f"创建新数据库失败: {e}")
        return False

def migrate_data(old_db_path, new_db_path):
    """迁移旧数据到新数据库"""
    if not os.path.exists(old_db_path):
        logger.warning(f"旧数据库不存在: {old_db_path}")
        return False
    
    try:
        # 初始化新数据库连接
        engine, SessionLocal = init_db(new_db_path)
        
        # 连接旧数据库
        conn = sqlite3.connect(old_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 检查旧表结构
        cursor.execute("PRAGMA table_info(messages)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        logger.info(f"旧数据库表结构: {column_names}")
        
        # 尝试提取并迁移数据
        try:
            # 尝试不同的查询方式，适应不同的旧表结构
            if 'key' in column_names and 'value' in column_names:
                cursor.execute("SELECT key, value FROM messages")
                rows = cursor.fetchall()
                logger.info(f"找到 {len(rows)} 条旧数据记录")
                
                # 迁移到新数据库
                with SessionLocal() as db:
                    for row in rows:
                        key = row['key']
                        try:
                            value = json.loads(row['value'])
                        except:
                            value = row['value']
                        
                        # 解析数据
                        key_parts = key.split('-', 1)
                        role = key_parts[0] if len(key_parts) > 1 else 'unknown'
                        message_id = key_parts[1] if len(key_parts) > 1 else key
                        
                        content = value.get('content', {}) if isinstance(value, dict) else value
                        timestamp_str = value.get('timestamp') if isinstance(value, dict) else None
                        
                        # 创建新消息记录
                        message = Message(
                            key=key,
                            role=role,
                            message_id=message_id,
                            content=json.dumps(content) if not isinstance(content, str) else content,
                            timestamp=datetime.fromisoformat(timestamp_str) if timestamp_str else datetime.now()
                        )
                        
                        db.add(message)
                        db.flush()  # 获取ID
                        
                        # 处理音频段落
                        if isinstance(value, dict) and 'audio_paths' in value and value['audio_paths']:
                            for segment in value['audio_paths']:
                                segment_obj = AudioSegment(
                                    message_id=message.id,
                                    segment_index=segment.get('segment_index', 0),
                                    path=segment.get('path', ''),
                                    text=segment.get('text', ''),
                                    sample_rate=segment.get('sample_rate', 24000)
                                )
                                db.add(segment_obj)
                        
                        # 处理合并音频
                        if isinstance(value, dict) and 'merged_audio' in value and value['merged_audio']:
                            merged_info = value['merged_audio']
                            merged_obj = MergedAudio(
                                message_id=message.id,
                                path=merged_info.get('merged_path', ''),
                                sample_rate=merged_info.get('sample_rate', 24000)
                            )
                            db.add(merged_obj)
                    
                    db.commit()
                    logger.info("数据迁移完成")
                    return True
            else:
                # 处理其他表结构
                logger.error("不支持的旧数据库表结构")
                return False
        except Exception as e:
            logger.error(f"迁移数据过程中出错: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
        finally:
            conn.close()
    except Exception as e:
        logger.error(f"数据迁移失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def rebuild_database():
    """重建数据库表"""
    # 确保数据目录存在
    os.makedirs(os.path.dirname(config.DATABASE_PATH), exist_ok=True)
    
    # 创建数据库引擎
    engine = create_engine(f"sqlite:///{config.DATABASE_PATH}")
    
    # 删除并重建表
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    
    print(f"数据库表已重建: {config.DATABASE_PATH}")

def main():
    """主函数"""
    # 数据库路径
    db_path = "data/messages.db"
    
    # 1. 备份数据库
    backup_path = backup_database(db_path)
    if not backup_path:
        logger.info("继续创建新数据库")
    
    # 2. 创建新数据库
    if not create_new_database(db_path):
        logger.error("创建新数据库失败，终止操作")
        return
    
    # 3. 迁移数据（如果有备份）
    if backup_path:
        try_migrate = input("是否迁移旧数据? (y/n): ").lower() == 'y'
        if try_migrate:
            if migrate_data(backup_path, db_path):
                logger.info("数据迁移成功")
            else:
                logger.warning("数据迁移失败，但新数据库结构已创建")
    
    logger.info("数据库重建完成")

if __name__ == "__main__":
    rebuild_database() 