"""Large Language Model service."""
import requests
import json
import re
from utils.logging_utils import debug, info, error
from config import OLLAMA_API_URL, OLLAMA_MODEL
from resources.prompts import SYSTEM_PROMPT
from typing import Dict, List, Optional, Any, Union

class LLMService:
    """Service for interacting with Large Language Models."""
    
    def __init__(self, api_url: str = None, model: str = None):
        """Initialize the LLM service.
        
        Args:
            api_url: Ollama API URL (optional, default from config)
            model: The model name to use (optional, default from config)
        """
        try:
            self.api_url = api_url or OLLAMA_API_URL
            self.model = model or OLLAMA_MODEL
        except (ImportError, AttributeError):
            self.api_url = api_url or "http://localhost:11434"
            self.model = model or "llama2"
        
        self.llm = None
        self.messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            }
        ]
        self.max_history = 50  # 限制历史消息数量，避免超出上下文窗口
        
        # Check available models
        self.available_models = self._get_available_models()
        if self.available_models:
            debug(f"Available models: {', '.join(self.available_models)}")
            
            # If configured model is not available, use the first available model
            if self.model not in self.available_models and self.available_models:
                info(f"Model '{self.model}' not found. Using '{self.available_models[0]}' instead.")
                self.model = self.available_models[0]
    
    def _get_available_models(self):
        """Get list of available models from Ollama."""
        try:
            response = requests.get(f"{self.api_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get("models", [])
                return [model["name"] for model in models]
            else:
                error(f"Failed to get available models: {response.status_code}")
                return []
        except Exception as e:
            error(f"Error getting available models: {e}")
            return []
    
    def add_message(self, role: str, content: str) -> None:
        """Add a message to the conversation history.
        
        Args:
            role: Either 'user' or 'assistant'
            content: The message content
        """
        if role not in ["user", "assistant", "system"]:
            error(f"Invalid role: {role}. Must be 'user', 'assistant', or 'system'")
            return
            
        self.messages.append({"role": role, "content": content})
        
        # 保持历史长度在限制范围内，但始终保留系统消息
        if len(self.messages) > self.max_history + 1:
            # 保留系统消息，然后保留最近的历史消息
            system_messages = [m for m in self.messages if m["role"] == "system"]
            non_system_messages = [m for m in self.messages if m["role"] != "system"]
            
            # 只保留最近的几条非系统消息
            recent_messages = non_system_messages[-(self.max_history):]
            
            # 重建消息历史
            self.messages = system_messages + recent_messages
            debug(f"Truncated conversation history to {len(self.messages)} messages")
            
    def _sanitize_for_tts(self, text):
        """Remove emojis and other problematic characters for TTS"""
        # Pattern to match emoji and other Unicode symbols
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F700-\U0001F77F"  # alchemical symbols
            "\U0001F780-\U0001F7FF"  # Geometric Shapes
            "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
            "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
            "\U0001FA00-\U0001FA6F"  # Chess Symbols
            "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
            "\U00002702-\U000027B0"  # Dingbats
            "\U000024C2-\U0001F251" 
            "]+", flags=re.UNICODE)
        
        # Remove emojis
        text = emoji_pattern.sub(r'', text)
        
        # Remove ASCII emoticons like :) :D etc.
        text = re.sub(r'(:\)|:\(|:D|:P|:\/|;\)|\^_\^|<3)', '', text)
        
        return text.strip()

    def get_response(self, user_input: str) -> Optional[Dict[str, str]]:
        """Get bilingual response from LLM using two requests."""
        if not user_input or not user_input.strip():
            return None
        
        # 添加用户消息到历史
        self.add_message("user", user_input)
        # debug(f"Current conversation history: {self.messages}")

        formatted_json = json.dumps(self.messages, indent=4, ensure_ascii=False, sort_keys=True)
        debug(f"Current conversation history: {formatted_json}")
        
        try:
            # 获取英文响应
            english_content = self._get_english_content()

            # Apply sanitization before further processing
            english_content = self._sanitize_for_tts(english_content)
            
            debug(f"English content: {english_content}")
            
            # # 递归解析嵌套的 JSON 字符串
            # english_content = self._recursively_parse_json(english_content)

            # debug(f"English content after parsing: {english_content}")
            
            # 如果英文内容是字典并包含 english 和 chinese 字段，直接使用
            if isinstance(english_content, dict) and 'english' in english_content and 'chinese' in english_content:
                return {
                    "english": english_content.get("english", ""),
                    "chinese": english_content.get("chinese", "")
                }
            
            # 获取中文翻译
            chinese_content = self._get_chinese_translation(english_content)
            
            # 确保返回的是纯文本，不是嵌套的 JSON
            if isinstance(english_content, dict) and isinstance(english_content.get('english'), str):
                english_content = english_content.get('english')
            
            if isinstance(chinese_content, dict) and isinstance(chinese_content.get('chinese'), str):
                chinese_content = chinese_content.get('chinese')
            
            return {
                "english": english_content,
                "chinese": chinese_content
            }
            
        except Exception as e:
            error(f"Failed to get LLM response: {e}")
            import traceback
            debug(f"Exception details: {traceback.format_exc()}")
            
            return self._get_fallback_response("exception", error=str(e))
        
    # def _recursively_parse_json(self, content):
    #     """递归解析可能嵌套的 JSON 字符串"""
    #     if not isinstance(content, str):
    #         return content
        
    #     # 尝试解析 JSON
    #     try:
    #         parsed = json.loads(content)
    #         # 如果成功解析，继续递归解析内部可能的 JSON 字符串
    #         if isinstance(parsed, dict):
    #             for key, value in parsed.items():
    #                 parsed[key] = self._recursively_parse_json(value)
    #         return parsed
    #     except (json.JSONDecodeError, TypeError):
    #         # 如果不是有效的 JSON，返回原始内容
    #         return content
        
    def _get_english_content(self):
        """Get a regular English response from LLM."""
        debug(f"Sending English request to Ollama API using model: {self.model}")
        
        # 增强系统提示，确保更好的回复质量
        english_messages = self.messages.copy()
        if len(english_messages) > 0 and english_messages[0]["role"] == "system":
            english_messages[0]["content"] += SYSTEM_PROMPT
        
        english_response = self._make_api_request(english_messages)
        
        if not english_response:
            return self._get_fallback_response("api_error")
        
        english_content = english_response.get("content", "")
        
        if not english_content:
            debug("Empty English response from LLM")
            return self._get_fallback_response("empty_response")
        
        # Clean up the English response for TTS (preserve punctuation)
        english_content = self._clean_response(english_content)
        
        return english_content
        
    def _get_chinese_translation(self, english_content: str) -> str:
        """Get a Chinese translation from LLM."""
        # 准备更强化的翻译提示
        translation_prompt = self._create_translation_prompt(english_content)
        
        translation_messages = [
            {
                "role": "system",
                "content": """You are a professional translator specialized in English to Chinese translation.
                Follow instructions precisely and only output the requested translation.
                Maintain the same tone, style, and paragraph structure as the original."""
            },
            {
                "role": "user",
                "content": translation_prompt
            }
        ]
        
        debug("Sending translation request to Ollama API")
        
        translation_response = self._make_api_request(
            translation_messages, 
            temperature=0.3  # 降低温度以获得更准确的翻译
        )
        
        if not translation_response:
            # 翻译失败，使用备用翻译或报错
            return self._handle_translation_failure(english_content)
        
        raw_chinese = translation_response.get("content", "")
        
        # 进行更强大的中文翻译提取和清理
        chinese_content = self._extract_chinese_translation(raw_chinese, english_content)
        
        if not chinese_content:
            debug("Empty Chinese translation from LLM")
            chinese_content = "抱歉，我无法生成适当的中文回应。您能再试一次吗？"
        
        return chinese_content
        
    def _make_api_request(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7, 
        timeout: int = 60
    ) -> Optional[Dict[str, Any]]:
        """Make a request to the Ollama API with error handling and retries.
        
        Args:
            messages: List of message dictionaries
            temperature: Temperature for generation
            timeout: Request timeout in seconds
            
        Returns:
            The message part of the response or None if failed
        """
        # 添加重试逻辑
        max_retries = 2
        retry_count = 0
        
        while retry_count <= max_retries:
            try:
                response = requests.post(
                    f"{self.api_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "top_p": 0.9,
                            "top_k": 40
                        }
                    },
                    timeout=timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("message", {})
                else:
                    error(f"LLM API error (attempt {retry_count+1}/{max_retries+1}): {response.status_code}")
                    debug(f"Error response: {response.text}")
                    retry_count += 1
                    
                    if retry_count <= max_retries:
                        debug(f"Retrying request... ({retry_count}/{max_retries})")
                    
            except requests.exceptions.RequestException as e:
                error(f"Request failed (attempt {retry_count+1}/{max_retries+1}): {e}")
                retry_count += 1
                
                if retry_count <= max_retries:
                    debug(f"Retrying request... ({retry_count}/{max_retries})")
        
        return None
            
    def _create_translation_prompt(self, english_content: str) -> str:
        """Create a clear translation prompt.
        
        Args:
            english_content: The English text to translate
            
        Returns:
            A formatted translation prompt
        """
        return f"""
                Translate the following English text to Chinese. 

                IMPORTANT INSTRUCTIONS:
                1. Provide ONLY the Chinese translation
                2. DO NOT include any English text
                3. DO NOT add additional explanations or notes
                4. DO NOT include quotation marks around the translation
                5. Maintain the exact same paragraph breaks as the original
                6. Translate in a natural, fluent style that doesn't sound machine-translated

                English text to translate:
                {english_content}

                Chinese translation:
                """

    def _extract_chinese_translation(self, raw_translation: str, english_content: str) -> str:
        """Extract and clean up the Chinese translation, handling various format issues.
        
        Args:
            raw_translation: The raw translation from the API
            english_content: The original English content (for reference)
            
        Returns:
            Cleaned Chinese translation
        """
        # 先进行基本清理
        cleaned = raw_translation.strip()
        
        # 移除常见的引言模式
        patterns_to_remove = [
            r'^"(.*)"$',                    # 双引号包裹
            r"^'(.*)'$",                    # 单引号包裹
            r"^以下是翻译：\s*",              # "以下是翻译："开头
            r"^Chinese translation:\s*",     # "Chinese translation:"开头
            r"^Translation:\s*",             # "Translation:"开头
            r"^翻译：\s*",                    # "翻译："开头
            r"^Here's the Chinese translation:\s*", # "Here's the Chinese translation:"开头
            r"^Chinese:\s*"                  # "Chinese:"开头
        ]
        
        for pattern in patterns_to_remove:
            match = re.match(pattern, cleaned, flags=re.DOTALL)
            if match and len(match.groups()) > 0:
                cleaned = match.group(1)
            elif match:
                cleaned = cleaned.replace(match.group(), "")
        
        # 如果仍然包含英文原文，尝试找到并移除
        english_sentences = re.split(r'[.!?]\s+', english_content)
        for sentence in english_sentences:
            if len(sentence) > 10:  # 只检查较长的句子，避免误匹配
                sentence = sentence.strip() + '.'
                cleaned = cleaned.replace(sentence, '')
        
        # 尝试使用规则识别中文部分
        # 使用统计方法：如果一行中超过30%是中文字符，认为是中文翻译
        lines = cleaned.split('\n')
        chinese_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                chinese_lines.append('')
                continue
            
            # 计算中文字符比例
            chinese_char_count = sum(1 for char in line if '\u4e00' <= char <= '\u9fff')
            chinese_ratio = chinese_char_count / len(line)
            
            if chinese_ratio > 0.3:  # 30%以上是中文
                chinese_lines.append(line)
        
        # 如果没有提取出中文行，返回原始清理后的文本
        if not any(line for line in chinese_lines):
            return cleaned
        
        return '\n'.join(chinese_lines)

    def _clean_response(self, response: str) -> str:
        """Clean up the response for TTS.
        
        Args:
            response: The raw response text
            
        Returns:
            Cleaned response text
        """
        # 移除代码块标记，保留代码内容
        response = re.sub(r'```[\w]*\n(.*?)```', r'\1', response, flags=re.DOTALL)
        
        # 移除Markdown链接，保留文本
        response = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', response)
        
        # 移除多余的空行
        response = re.sub(r'\n{3,}', '\n\n', response)
        
        # 移除特殊Markdown字符
        response = re.sub(r'[*_]{1,2}(.*?)[*_]{1,2}', r'\1', response)
        
        return response.strip()
        
    def _get_fallback_response(self, error_type: str, **kwargs) -> Dict[str, str]:
        """Get a fallback response based on the error type.
        
        Args:
            error_type: Type of error that occurred
            **kwargs: Additional context for the error
            
        Returns:
            A dictionary with fallback responses
        """
        responses = {
            "empty_response": {
                "english": "I'm sorry, I couldn't generate a proper response. Could you try asking again?",
                "chinese": "抱歉，我无法生成适当的回应。您能再试一次吗？"
            },
            "api_error": {
                "english": f"I'm sorry, there was an error connecting to my language model ({self.model}). Please try again later.",
                "chinese": f"抱歉，连接到我的语言模型 ({self.model}) 时出现错误。请稍后再试。"
            },
            "exception": {
                "english": "I'm sorry, I encountered an error while processing your request. Please try again.",
                "chinese": "抱歉，处理您的请求时遇到错误。请再试一次。"
            },
            "translation_error": {
                "english": kwargs.get("english_content", "Sorry, there was an error with the translation."),
                "chinese": "抱歉，翻译过程中出现错误。"
            }
        }
        
        response = responses.get(error_type, responses["exception"])
        
        return {
            "english": response["english"],
            "chinese": response["chinese"]
        }
        
    def _handle_translation_failure(self, english_content: str) -> Dict[str, str]:
        """Handle the case when translation fails."""
        debug("Translation failed, using fallback Chinese response")
        
        return {
            "english": english_content,
            "chinese": "抱歉，翻译服务暂时不可用。以上为英文回复。"
        }
        
    # def reset_conversation(self) -> None:
    #     """Reset the conversation history, keeping only the system message."""
    #     system_messages = [m for m in self.messages if m["role"] == "system"]
    #     self.messages = system_messages if system_messages else [
    #         {
    #             "role": "system",
    #             "content": "You are a helpful, concise assistant. Provide clear and accurate responses."
    #         }
    #     ]
        
    def set_messages(self, messages: List[Dict[str, str]]) -> None:
        """Set the conversation history directly.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content' keys
        """
        # 验证消息格式
        valid_messages = []
        for msg in messages:
            if not isinstance(msg, dict) or 'role' not in msg or 'content' not in msg:
                error(f"Invalid message format: {msg}")
                continue
                
            if msg['role'] not in ["user", "assistant", "system"]:
                error(f"Invalid role in message: {msg}")
                continue
                
            valid_messages.append({
                "role": msg['role'],
                "content": msg['content']
            })
        
        # 确保始终有一个系统消息
        has_system_message = any(msg['role'] == 'system' for msg in valid_messages)
        
        if not has_system_message:
            valid_messages.insert(0, {
                "role": "system",
                "content": SYSTEM_PROMPT
            })
        
        self.messages = valid_messages
        debug(f"Set conversation history with {len(self.messages)} messages")
        
    def get_messages(self) -> List[Dict[str, str]]:
        """Get the current conversation history.
        
        Returns:
            A list of message dictionaries
        """
        return self.messages.copy()