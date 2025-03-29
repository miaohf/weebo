from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 创建一个共享的 Base 类
Base = declarative_base()

def init_db(db_path):
    """初始化数据库
    
    Args:
        db_path: 数据库文件路径
        
    Returns:
        tuple: (engine, SessionLocal) - 引擎和会话工厂
    """
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    
    # 创建会话工厂
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # 返回引擎和会话工厂
    return engine, SessionLocal 