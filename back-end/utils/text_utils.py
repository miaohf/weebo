"""Text processing utilities."""
import re
from typing import List

def split_text_into_segments(text: str, max_length: int = 250) -> List[str]:
    """将文本分割为合适长度的段落，用于TTS处理"""
    # 空文本或短文本直接返回
    if not text or len(text) <= max_length:
        return [text] if text else []
    
    # 按句子分割
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    segments = []
    current_segment = ""
    
    for sentence in sentences:
        # 如果加上当前句子不超过长度限制
        if len(current_segment) + len(sentence) + 1 <= max_length:
            if current_segment:
                current_segment += " " + sentence
            else:
                current_segment = sentence
        else:
            # 当前段落已满，保存并开始新段落
            if current_segment:
                segments.append(current_segment)
            
            # 如果单个句子超长，则需进一步分割
            if len(sentence) > max_length:
                # 简单按词分割
                words = sentence.split()
                sub_segment = ""
                
                for word in words:
                    if len(sub_segment) + len(word) + 1 <= max_length:
                        if sub_segment:
                            sub_segment += " " + word
                        else:
                            sub_segment = word
                    else:
                        segments.append(sub_segment)
                        sub_segment = word
                
                if sub_segment:
                    current_segment = sub_segment
                else:
                    current_segment = ""
            else:
                current_segment = sentence
    
    # 添加最后一个段落
    if current_segment:
        segments.append(current_segment)
    
    return segments 