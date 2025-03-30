"""Logging utilities."""
import logging
from config import PINK, CYAN, YELLOW, NEON_GREEN, RESET_COLOR

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger("assistant")

def debug(message):
    """Log debug message with yellow color."""
    print(f"\n{YELLOW}[DEBUG] {message}{RESET_COLOR}")

def info(message):
    """Log info message."""
    print(f"[LOG] {message}")

def user_message(message):
    """Format user message with cyan color."""
    print(f"\n{CYAN}You: {message}{RESET_COLOR}")

def assistant_message(message):
    """打印助手消息"""
    # 如果 message 是字典
    if isinstance(message, dict):
        if "english" in message and isinstance(message["english"], str):
            print(f"\n{NEON_GREEN}Assistant: {PINK}{message['english']}{RESET_COLOR}")
        else:
            print(f"\n{NEON_GREEN}Assistant: {PINK}{str(message)}{RESET_COLOR}")
    # 如果 message 是字符串
    else:
        print(f"\n{NEON_GREEN}Assistant: {PINK}{message}{RESET_COLOR}")

def error(message, exception=None):
    """Log error message."""
    print(f"[ERROR] {message}")
    if exception:
        import traceback
        traceback.print_exc()