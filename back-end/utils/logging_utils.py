"""Logging utilities."""
import logging
import inspect
import os
import datetime
from core.config import PINK, CYAN, YELLOW, NEON_GREEN, RESET_COLOR

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger("assistant")

def _get_caller_info():
    """获取调用者的文件名、函数名和行号"""
    frame = inspect.currentframe().f_back.f_back
    filename = os.path.basename(frame.f_code.co_filename)
    function_name = frame.f_code.co_name
    line_number = frame.f_lineno
    return f"{filename}:{function_name}:{line_number}"

def _get_timestamp():
    """获取当前时间戳，格式与Python日志一致"""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S,%f")[:-3]

def debug(message):
    """Log debug message with yellow color."""
    caller_info = _get_caller_info()
    timestamp = _get_timestamp()
    print(f"{timestamp} - DEBUG - [{caller_info}] {message}")
    # 同时写入Python标准日志
    logger.debug(f"[{caller_info}] {message}")

def info(message):
    """Log info message."""
    caller_info = _get_caller_info()
    timestamp = _get_timestamp()
    print(f"{timestamp} - INFO - [{caller_info}] {message}")
    # 同时写入Python标准日志
    logger.info(f"[{caller_info}] {message}")

def user_message(message):
    """Format user message with cyan color."""
    timestamp = _get_timestamp()
    print(f"\n{timestamp} - USER - {CYAN}{message}{RESET_COLOR}")

def assistant_message(message):
    """打印助手消息"""
    timestamp = _get_timestamp()
    # 如果 message 是字典
    if isinstance(message, dict):
        if "english" in message and isinstance(message["english"], str):
            print(f"\n{timestamp} - ASSISTANT - {NEON_GREEN}{message['english']}{RESET_COLOR}")
        else:
            print(f"\n{timestamp} - ASSISTANT - {NEON_GREEN}{str(message)}{RESET_COLOR}")
    # 如果 message 是字符串
    else:
        print(f"\n{timestamp} - ASSISTANT - {NEON_GREEN}{message}{RESET_COLOR}")

def error(message, exception=None):
    """Log error message."""
    caller_info = _get_caller_info()
    timestamp = _get_timestamp()
    print(f"{timestamp} - ERROR - [{caller_info}] {message}")
    # 同时写入Python标准日志
    logger.error(f"[{caller_info}] {message}")
    if exception:
        import traceback
        traceback.print_exc()