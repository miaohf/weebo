import sqlite3
import json
import os
from models.database_models import init_db, Message, AudioSegment, MergedAudio
from sqlalchemy.orm import Session

def migrate_old_to_new(old_db_path, new_db_path):
    """将旧数据库迁移到新的ORM模型"""
    print(f"开始数据迁移: {old_db_path} -> {new_db_path}")
    
    # 初始化新数据库
    engine, SessionLocal = init_db(new_db_path)
    
    # 连接旧数据库
    conn = sqlite3.connect(old_db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 检查旧表结构
    try:
        cursor.execute("PRAGMA table_info(messages)")
        columns = cursor.fetchall()
        column_names = [col['name'] for col in columns]
        print(f"旧数据库表结构: {column_names}")
        
        # 获取所有消息记录
        if 'key' in column_names and 'value' in column_names:
            cursor.execute("SELECT key, value FROM messages")
        else:
            # 如果表结构不符合预期，尝试其他可能的查询
            print("表结构不符合预期，尝试其他查询...")
            cursor.execute("SELECT * FROM messages")
            
        old_messages = cursor.fetchall()
        print(f"找到 {len(old_messages)} 条记录")
        
        # 迁移数据
        with SessionLocal() as db:
            for old_msg in old_messages:
                if 'key' in column_names and 'value' in column_names:
                    key = old_msg['key']
                    try:
                        value = json.loads(old_msg['value'])
                    except:
                        value = old_msg['value']
                else:
                    # 处理其他可能的表结构
                    print(f"处理非标准记录: {dict(old_msg)}")
                    continue
                
                # 解析数据
                role = key.split('-')[0] if '-' in key else 'unknown'
                message_id = key.split('-', 1)[1] if '-' in key else key
                
                # 创建新消息对象
                new_message = Message(
                    key=key,
                    role=role,
                    message_id=message_id,
                    content=json.dumps(value.get('content', {})) if isinstance(value, dict) else value,
                    timestamp=value.get('timestamp') if isinstance(value, dict) else None
                )
                
                db.add(new_message)
                db.flush()  # 获取ID
                
                # 迁移音频段落
                if isinstance(value, dict) and 'audio_paths' in value and value['audio_paths']:
                    for segment in value['audio_paths']:
                        audio_segment = AudioSegment(
                            message_id=new_message.id,
                            segment_index=segment.get('segment_index', 0),
                            path=segment.get('path', ''),
                            text=segment.get('text', ''),
                            sample_rate=segment.get('sample_rate', 24000)
                        )
                        db.add(audio_segment)
                
                # 迁移合并音频
                if isinstance(value, dict) and 'merged_audio' in value and value['merged_audio']:
                    merged_audio = MergedAudio(
                        message_id=new_message.id,
                        path=value['merged_audio'].get('merged_path', ''),
                        sample_rate=value['merged_audio'].get('sample_rate', 24000)
                    )
                    db.add(merged_audio)
            
            db.commit()
            print("数据迁移完成")
    
    except Exception as e:
        print(f"迁移失败: {e}")
        import traceback
        print(traceback.format_exc())
    finally:
        conn.close()

if __name__ == "__main__":
    # 备份旧数据库
    old_db = "data/messages.db"
    backup_db = "data/messages_backup.db"
    
    if os.path.exists(old_db):
        import shutil
        shutil.copy2(old_db, backup_db)
        print(f"旧数据库已备份到: {backup_db}")
        
        # 迁移数据
        migrate_old_to_new(old_db, old_db + ".new")
        
        # 完成后重命名
        os.rename(old_db, old_db + ".old")
        os.rename(old_db + ".new", old_db)
        print("迁移完成，新数据库已就绪")
    else:
        print(f"旧数据库不存在: {old_db}") 