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

# def assistant_message(message):
#     """Format assistant message with pink color."""
#     # Split message into English and Chinese parts
#     parts = message.split('\n\n', 1)
    
#     if len(parts) == 2:
#         # Bilingual message
#         english_part, chinese_part = parts
        
#         # Print English part with Assistant prefix
#         print(f"\n{NEON_GREEN}Assistant: {PINK}{english_part}{RESET_COLOR}")
        
#         # Print Chinese part without Assistant prefix, but with proper indentation
#         # Add spaces to align with the "Assistant: " prefix (11 characters)
#         indent = " " * 11
#         print(f"{PINK}{indent}{chinese_part}{RESET_COLOR}")
#     else:
#         # Single language message
#         print(f"\n{NEON_GREEN}Assistant: {PINK}{message}{RESET_COLOR}")

def assistant_message(message):
    """Format assistant message with pink color."""
    
    # Print English part with Assistant prefix
    print(f"\n{NEON_GREEN}Assistant: {PINK}{message["english"]}{RESET_COLOR}")
    
    # Print Chinese part without Assistant prefix, but with proper indentation
    # Add spaces to align with the "Assistant: " prefix (11 characters)
    indent = " " * 11
    print(f"{PINK}{indent}{message["chinese"]}{RESET_COLOR}")


def error(message, exception=None):
    """Log error message."""
    print(f"[ERROR] {message}")
    if exception:
        import traceback
        traceback.print_exc()