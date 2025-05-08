"""Large Language Model service."""
import requests
import json
import re
from utils.logging_utils import debug, info, error
from core.config import settings
from resources.prompts import SYSTEM_PROMPT
from typing import Dict, List, Optional, Any, Union
import time

class LLMService:
    """Service for interacting with Large Language Models."""
    
    def __init__(self, api_url: str = None, model: str = None, api_type: str = "ollama"):
        """Initialize the LLM service.
        
        Args:
            api_url: Ollama API URL (optional, default from config)
            model: The model name to use (optional, default from config)
            api_type: API type to use, either "ollama" or "deepseek" (default: "ollama")
        """
        try:
            self.api_type = api_type.lower()
            
            if self.api_type == "ollama":
                self.api_url = api_url or settings.OLLAMA_API_URL
                self.model = model or settings.OLLAMA_MODEL
                info(f"使用Ollama API，模型: {self.model}, API地址: {self.api_url}")

            elif self.api_type == "deepseek":
                self.api_url = api_url or settings.DEEPSEEK_BASE_URL
                self.api_key = settings.DEEPSEEK_API_KEY
                self.model = model or settings.DEEPSEEK_MODEL
                info(f"使用DeepSeek API，模型: {self.model}, API地址: {self.api_url}")
            else:
                raise ValueError(f"不支持的API类型: {self.api_type}")
        except (ImportError, AttributeError) as e:
            error(f"初始化LLM服务失败: {e}")
            info("使用默认API配置")
            self.api_type = "ollama"
            self.api_url = api_url or "http://localhost:11434"
            self.model = model or "llama2"
            self.available_models = []
        
        self.llm = None
        self.messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            }
        ]
        self.max_history = 50  # 限制历史消息数量，避免超出上下文窗口
        
    def _get_available_models(self):
        """Get list of available models from Ollama."""
        # 只有Ollama支持获取可用模型列表
        if self.api_type != "ollama":
            return self.available_models
            
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

    def _clean_markdown(self, text):
        # 处理标题标识符，在处理后的标题末尾添加句号
        lines = text.split('\n')
        processed_lines = []
        
        for line in lines:
            # 判断是否是标题行
            title_match = re.match(r'^(#+)\s+(.*?)$', line)
            if title_match:
                # 获取标题文本
                title_text = title_match.group(2).strip()
                # 检查标题末尾是否已有标点符号
                if title_text and not re.search(r'[.!?。！？：:;；]$', title_text):
                    # 根据检测到的语言添加适当的标点
                    lang = self._detect_language(title_text)
                    if lang == 'chinese':
                        title_text += '。'  # 中文句号
                    else:
                        title_text += '.'   # 英文句号
                processed_lines.append(title_text)
            else:
                processed_lines.append(line)
                
        text = '\n'.join(processed_lines)
        
        # 继续处理其他Markdown格式
        # 去掉强调符号 (*, _)
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)  # 粗体
        text = re.sub(r'\*(.*?)\*', r'\1', text)  # 斜体
        text = re.sub(r'__(.*?)__', r'\1', text)  # 粗体
        text = re.sub(r'_(.*?)_', r'\1', text)  # 斜体
        
        # 去掉链接，只保留文字
        text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
        
        # 去掉代码块 (```)
        text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
        
        # 去掉行内代码 (`code`)
        text = re.sub(r'`.*?`', '', text)
        
        # 去掉其他 Markdown 特殊符号
        text = re.sub(r'[>]+\s?', '', text)  # 引用符号
        text = re.sub(r'[-*+]\s+', '', text)  # 列表符号
        
        return text.strip()
            
    def _sanitize_for_tts(self, text):
        """Remove emojis and other problematic characters for TTS"""
        if not text:
            return text
        
        try:
            # 直接删除特定表情符号，这些是最常见的
            specific_emojis = [
                '\U0001f60a',  # 😊 笑脸表情
                '\U0001f600',  # 😀
                '\U0001f603',  # 😃
                '\U0001f604',  # 😄
                '\U0001f601',  # 😁
                '\U0001f606',  # 😆
                '\U0001f605',  # 😅
                '\U0001f602',  # 😂
                '\U0001f642',  # 🙂
            ]
            
            result = text
            for emoji in specific_emojis:
                result = result.replace(emoji, '')
            
            # 删除ASCII表情符号
            result = re.sub(r':\)', '', result)
            result = re.sub(r':\(', '', result)
            result = re.sub(r':D', '', result)
            result = re.sub(r':P', '', result)
            result = re.sub(r':/', '', result)
            result = re.sub(r';\)', '', result)
            result = re.sub(r'\^_\^', '', result)
            result = re.sub(r'<3', '', result)
            
            # 输出调试信息
            debug(f"原始文本: '{text}'")
            debug(f"处理后文本: '{result}'")
            
            return result.strip()
            
        except Exception as e:
            error(f"Error sanitizing text: {e}")
            # 如果处理出错，返回原始文本
            return text.strip()


    def _detect_language(self, text):
        """检测文本的主要语言
        
        Args:
            text: 要检测语言的文本
            
        Returns:
            str: 'english', 'chinese', 'other', 或 'unknown'
        """
        # 简单的语言检测逻辑
        # 计算英文和中文字符的比例来确定主要语言
        if not text or text.strip() == "":
            debug("Empty text for language detection")
            return 'unknown'
            
        # 计算英文字符数量
        english_char_count = len(re.findall(r'[a-zA-Z]', text))
        
        # 计算中文字符数量
        chinese_char_count = sum(1 for char in text if '\u4e00' <= char <= '\u9fff')
        
        # 计算总有效字符数量（排除空格、标点等）
        total_chars = len(re.findall(r'[a-zA-Z\u4e00-\u9fff]', text))
        
        if total_chars == 0:
            debug("No valid characters found for language detection")
            # 如果没有有效字符，则根据是否包含中文标点来判断
            chinese_punctuation = re.findall(r'[，。！？：；""''【】（）]', text)
            if chinese_punctuation:
                return 'chinese'
            return 'unknown'
            
        english_ratio = english_char_count / total_chars
        chinese_ratio = chinese_char_count / total_chars
        
        # 根据字符比例判断语言
        if english_ratio > 0.5:
            return 'english'
        elif chinese_ratio > 0.3:  # 中文文本中可能包含英文单词，所以门槛低一些
            return 'chinese'
        else:
            return 'other'

    def get_response(self, user_input: str) -> Optional[Dict[str, str]]:
        """Get bilingual response from LLM using two requests."""
        if not user_input or not user_input.strip():
            return None
        
        # 添加用户消息到历史
        self.add_message("user", user_input)

        formatted_json = json.dumps(self.messages, indent=4, ensure_ascii=False, sort_keys=True)
        debug(f"Current conversation history: {formatted_json}")
        
        try:
            # 获取LLM响应
            llm_response = self._get_llm_response()
            debug(f"LLM response: {llm_response}")

            llm_response_remove_emoji = self._sanitize_for_tts(llm_response)
            original_response = self._clean_markdown(llm_response_remove_emoji)
            # original_response = self._clean_response(llm_response_remove_markdown)
            debug(f"Sanitized response: {original_response}")
            
            if not original_response:
                error("Empty LLM response")
                return self._get_fallback_response("empty_response")
            
            # 添加响应到历史 - 使用原始响应
            self.add_message("assistant", original_response)
            
            # 检测LLM响应的语言
            detected_language = self._detect_language(user_input)
            debug(f"Detected language of user_input: {detected_language}, user_input: {user_input}")
            
            # 根据检测到的语言获取翻译
            translation = self._get_translated_message(original_response, detected_language)

            # 构造返回结果
            return {
                "original_text": original_response,
                "translated_text": translation  
            }

        except Exception as e:
            error(f"Failed to get LLM orginal response: {e}")
            import traceback
            debug(f"Exception details: {traceback.format_exc()}")
            
            return self._get_fallback_response("exception", error=str(e))
        
    def _get_llm_response(self):
        """Get a regular response from LLM."""
        debug(f"Sending request to {self.api_type.upper()} API using model: {self.model}")
        
        # 增强系统提示，确保更好的回复质量
        chat_history = self.messages.copy()
        if len(chat_history) > 0 and chat_history[0]["role"] == "system":
            # 检查最后一条用户消息的语言
            user_messages = [m for m in chat_history if m["role"] == "user"]
            if user_messages:
                last_user_message = user_messages[-1]["content"]
                language = self._detect_language(last_user_message)
                if language == 'chinese':
                    add_prompt = {
                        "role": "system",
                        "content": "请用中文回复这个问题。"
                    }
                    chat_history.append(add_prompt)
        
        llm_response = self._make_api_request(chat_history)
        
        if not llm_response:
            return self._get_fallback_response("api_error")
        
        # 返回提取的提取文本内容
        return llm_response.get("content", "")
        
    def _get_translated_message(self, input_message: str, source_language: str = 'english') -> str:
        """获取翻译后的消息。
        
        Args:
            input_message: 需要翻译的消息
            source_language: 源语言，'english', 'chinese', 或 'other'
            
        Returns:
            翻译后的文本
        """
        # 检查输入是否为空
        if not input_message or input_message.strip() == "":
            error("Empty input message for translation")
            if source_language == 'english':
                return "抱歉，无法处理空的输入消息。"
            else:
                return "Sorry, cannot process empty input message."
        
        # 准备翻译提示
        translation_prompt = self._create_translation_prompt(input_message, source_language)
        
        translation_messages = [
            {
                "role": "system",
                "content": """
                        You are a professional translator with expertise in language translation.
                        Adhere strictly to the instructions and provide only the requested translation.
                        Ensure that the tone, style, and paragraph structure of the original text are preserved in the translation.
                        When translating, avoid literal word-for-word translations. Instead, focus on conveying the intended meaning 
                        naturally and fluently in the target language, ensuring clarity and readability for the audience.
                        """
            },
            {
                "role": "user",
                "content": translation_prompt
            }
        ]
        
        debug(f"Sending translation request for {source_language} text")
        
        translation_response = self._make_api_request(
            translation_messages, 
            temperature=0.3  # 降低温度以获得更准确的翻译
        )
        
        if not translation_response:
            # 翻译失败，使用备用方案
            if source_language == 'english':
                return "抱歉，翻译服务暂时不可用。以上为英文回复。"
            else:
                return "Sorry, translation service is temporarily unavailable. Above is the original response."
        
        translated_content = translation_response.get("content", "")
        debug(f"Raw translated content: {translated_content}")
        
        # 检查翻译结果是否为空
        if not translated_content or translated_content.strip() == "":
            error("Empty translation result")
            if source_language == 'english':
                return "抱歉，翻译结果为空。以上为英文回复。"
            else:
                return "Sorry, translation result is empty. Above is the original response."
                
        # 如果是英译中，使用_extract_chinese_translation进行清理
        if source_language == 'english':
            translated_content = self._extract_chinese_translation(translated_content, input_message)
        # 如果是中译英或其他语言译英，进行英文文本清理
        else:
            translated_content = self._clean_response(translated_content)
            
            # 移除可能的翻译前缀
            prefixes_to_remove = [
                "English translation:", 
                "Translation:", 
                "Here's the English translation:", 
                "English:"
            ]
            
            for prefix in prefixes_to_remove:
                if translated_content.startswith(prefix):
                    translated_content = translated_content[len(prefix):].strip()
        
        # 再次检查清理后的翻译结果是否为空
        if not translated_content or translated_content.strip() == "":
            error("Empty translation result after cleaning")
            if source_language == 'english':
                return "抱歉，翻译处理后结果为空。以上为英文回复。"
            else:
                return "Sorry, translation result is empty after processing. Above is the original response."
        
        return translated_content

    def _make_api_request(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7, 
        timeout: int = 60
    ) -> Optional[Dict[str, Any]]:
        """Make a request to the LLM API with error handling and retries.
        
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
                # Ollama API请求
                if self.api_type == "ollama":
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
                        
                # DeepSeek API请求
                elif self.api_type == "deepseek":
                    # 将消息格式转换为DeepSeek格式
                    deepseek_messages = self._convert_to_deepseek_format(messages)
                    
                    response = requests.post(
                        f"{self.api_url}/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": self.model,
                            "messages": deepseek_messages,
                            "temperature": temperature,
                            "top_p": 0.9,
                            "max_tokens": 2048,
                            "stream": False
                        },
                        timeout=timeout
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        # 转换DeepSeek返回格式为统一格式
                        return {
                            "role": "assistant",
                            "content": result.get("choices", [{}])[0].get("message", {}).get("content", "")
                        }
                    else:
                        error(f"DeepSeek API error (attempt {retry_count+1}/{max_retries+1}): {response.status_code}")
                        debug(f"Error response: {response.text}")
                
                # 如果请求失败但有重试次数，则进行重试
                retry_count += 1
                if retry_count <= max_retries:
                    debug(f"Retrying request... ({retry_count}/{max_retries})")
                    # 添加短暂的延迟避免过于频繁请求
                    time.sleep(1)
                    
            except requests.exceptions.RequestException as e:
                error(f"Request failed (attempt {retry_count+1}/{max_retries+1}): {e}")
                retry_count += 1
                
                if retry_count <= max_retries:
                    debug(f"Retrying request... ({retry_count}/{max_retries})")
                    time.sleep(1)
        
        return None

    def _convert_to_deepseek_format(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """将通用消息格式转换为DeepSeek API所需的格式。
        
        Args:
            messages: 通用格式的消息列表
            
        Returns:
            DeepSeek格式的消息列表
        """
        # DeepSeek API使用的role格式与我们的基本一致，但可能有细微差别
        # 此函数确保兼容性
        deepseek_messages = []
        
        for msg in messages:
            role = msg["role"]
            # DeepSeek使用user/assistant/system角色
            if role not in ["user", "assistant", "system"]:
                # 如果有其他角色，默认转为user
                role = "user"
                
            deepseek_messages.append({
                "role": role,
                "content": msg["content"]
            })
            
        return deepseek_messages

    def _create_translation_prompt(self, content: str, source_language: str = 'english') -> str:
        """创建清晰的翻译提示。
        
        Args:
            content: 要翻译的文本
            source_language: 源语言，'english', 'chinese', 或 'other'
            
        Returns:
            格式化的翻译提示
        """
        if source_language == 'english':
            return f"""
                    Translate the following English text to Chinese. 

                    IMPORTANT INSTRUCTIONS:
                    1. Provide ONLY the Chinese translation
                    2. DO NOT include any English text
                    3. DO NOT add additional explanations or notes
                    4. DO NOT include quotation marks around the translation
                    5. Maintain the exact same paragraph breaks as the original
                    6. Translate in a natural, fluent style that doesn't sound machine-translated

                    Text to translate:
                    {content}

                    Chinese translation:
                    """
        else:
            return f"""
                    Translate the following text to English. 

                    IMPORTANT INSTRUCTIONS:
                    1. Provide ONLY the English translation
                    2. DO NOT include any text in the original language
                    3. DO NOT add additional explanations or notes
                    4. DO NOT include quotation marks around the translation
                    5. Maintain the exact same paragraph breaks as the original
                    6. Translate in a natural, fluent style that doesn't sound machine-translated

                    Text to translate:
                    {content}

                    English translation:
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
        """Clean up the response for TTS and convert Markdown to plain text.
        
        Args:
            response: The raw response text with Markdown formatting
            
        Returns:
            Plain text response with Markdown formatting removed
        """
        if not response:
            return ""
            
        # 移除代码块标记，保留代码内容
        response = re.sub(r'```[\w]*\n(.*?)```', r'\1', response, flags=re.DOTALL)
        
        # 移除行内代码标记，保留代码内容
        response = re.sub(r'`([^`]+)`', r'\1', response)
        
        # 移除Markdown链接，保留文本
        response = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', response)
        
        # 处理标题，保留文本内容
        response = re.sub(r'^#{1,6}\s+(.*?)$', r'\1', response, flags=re.MULTILINE)
        
        # 处理引用块，移除 > 符号
        response = re.sub(r'^>\s*(.*?)$', r'\1', response, flags=re.MULTILINE)
        
        # 处理无序列表，保留文本（可以选择性地保留或替换列表标记）
        response = re.sub(r'^[\*\-\+]\s+(.*?)$', r'• \1', response, flags=re.MULTILINE)
        
        # 处理有序列表，保留数字和文本
        response = re.sub(r'^\d+\.\s+(.*?)$', r'\1', response, flags=re.MULTILINE)
        
        # 移除多余的空行，但保留段落结构
        response = re.sub(r'\n{3,}', '\n\n', response)
        
        # 处理粗体和斜体文本，保留文本内容
        response = re.sub(r'\*\*(.*?)\*\*', r'\1', response)  # 粗体 **text**
        response = re.sub(r'__(.*?)__', r'\1', response)      # 粗体 __text__
        response = re.sub(r'\*(.*?)\*', r'\1', response)      # 斜体 *text*
        response = re.sub(r'_(.*?)_', r'\1', response)        # 斜体 _text_
        
        # 处理表格 - 简化为文本，保留内容
        # 移除表格分隔行
        response = re.sub(r'\|[\-:|\s]+\|', '', response)
        # 将表格单元格内容保留，移除分隔符
        response = re.sub(r'\|(.*?)\|', r'\1', response)
        
        # 处理水平线，替换为空行
        response = re.sub(r'^-{3,}$|^_{3,}$|^\*{3,}$', '\n', response, flags=re.MULTILINE)
        
        # 处理HTML标签，移除标签保留文本
        response = re.sub(r'<(?!img|br)([a-z][a-z0-9]*)[^>]*>(.*?)</\1>', r'\2', response, flags=re.DOTALL|re.IGNORECASE)
        response = re.sub(r'<br\s*/?>|<hr\s*/?>|<img[^>]*>', ' ', response, flags=re.IGNORECASE)
        
        # 处理转义字符
        escape_chars = ['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!']
        for char in escape_chars:
            response = response.replace('\\' + char, char)
        
        return response.strip()
        
    def _get_fallback_response(self, error_type: str, **kwargs) -> Dict[str, str]:
        """Get a fallback response based on the error type.
        
        Args:
            error_type: Type of error that occurred
            **kwargs: Additional context for the error
            
        Returns:
            A dictionary with fallback responses
        """
        # 获取当前使用的API类型和模型
        api_info = f"{self.api_type.upper()}({self.model})"
        
        responses = {
            "empty_response": {
                "original_text": "I'm sorry, I couldn't generate a proper response. Could you try asking again?",
                "translated_text": "抱歉，我无法生成适当的回应。您能再试一次吗？"
            },
            "api_error": {
                "original_text": f"I'm sorry, there was an error connecting to my language model {api_info}. Please try again later.",
                "translated_text": f"抱歉，连接到我的语言模型 {api_info} 时出现错误。请稍后再试。"
            },
            "exception": {
                "original_text": "I'm sorry, I encountered an error while processing your request. Please try again.",
                "translated_text": "抱歉，处理您的请求时遇到错误。请再试一次。"
            },
            "translation_error": {
                "original_text": kwargs.get("original_text", "Sorry, there was an error with the translation."),
                "translated_text": "抱歉，翻译过程中出现错误。"
            }
        }
        
        response = responses.get(error_type, responses["exception"])
        
        return {
            "original_text": response["original_text"],
            "translated_text": response["translated_text"]
        }
        
    def _handle_translation_failure(self, input_message: str) -> Dict[str, str]:
        """处理翻译失败的情况。
        
        Args:
            input_message: 原始输入消息
            
        Returns:
            备用的翻译或错误消息
        """
        debug("Translation failed, using fallback response")
        
        language = self._detect_language(input_message)
        
        if language == 'english':
            return {
                "original_text": input_message,
                "translated_text": "抱歉，翻译服务暂时不可用。以上为英文回复。"
            }
        else:
            return {
                "original_text": input_message,
                "translated_text": "Sorry, translation service is temporarily unavailable. Above is the original response."
            }
        
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

    def set_api_type(self, api_type: str, model: str = None) -> None:
        """设置API类型和模型。
        
        Args:
            api_type: API类型，可以是"ollama"或"deepseek"
            model: 要使用的模型名称（可选）
        """
        if api_type.lower() not in ["ollama", "deepseek"]:
            error(f"不支持的API类型: {api_type}")
            return
            
        self.api_type = api_type.lower()
        
        if self.api_type == "ollama":
            self.api_url = settings.OLLAMA_API_URL
            self.model = model or settings.OLLAMA_MODEL
            # 更新可用模型列表
            self.available_models = self._get_available_models()
            if self.model not in self.available_models and self.available_models:
                info(f"Model '{self.model}' not found. Using '{self.available_models[0]}' instead.")
                self.model = self.available_models[0]
        elif self.api_type == "deepseek":
            self.api_url = settings.DEEPSEEK_BASE_URL
            self.api_key = settings.DEEPSEEK_API_KEY
            self.model = model or settings.DEEPSEEK_MODEL
            self.available_models = ["deepseek-chat", "deepseek-coder"]
            
        debug(f"API type set to {self.api_type} with model {self.model}")

    async def generate_response(self, user_input: str) -> Optional[Dict[str, str]]:
        """异步包装器，用于获取LLM响应。
        
        这个方法只是简单地调用同步的get_response方法，但提供异步接口以便于与其他异步代码集成。
        
        Args:
            user_input: 用户输入文本
            
        Returns:
            包含原始和翻译文本的字典，或在失败时返回None
        """
        # 在真正的异步实现中，我们可能会在这里使用线程池执行器来避免阻塞
        # 但目前我们只是简单地调用同步方法
        return self.get_response(user_input)

    def get_status(self) -> Dict[str, Any]:
        """获取LLM服务的当前状态和配置信息。
        
        Returns:
            包含LLM服务状态信息的字典
        """
        status = {
            "api_type": self.api_type,
            "model": self.model,
            "api_url": self.api_url,
            "available_models": self.available_models,
            "message_history_length": len(self.messages)
        }
        
        # 添加API特定的信息
        if self.api_type == "deepseek":
            # 保护API密钥，只显示前8位和后4位
            if hasattr(self, "api_key") and self.api_key:
                masked_key = f"{self.api_key[:8]}...{self.api_key[-4:]}" if len(self.api_key) > 12 else "***masked***"
                status["api_key_status"] = f"Configured ({masked_key})"
            else:
                status["api_key_status"] = "Not configured"
        
        # 测试API连接
        api_status = "Unknown"
        try:
            if self.api_type == "ollama":
                # 尝试获取模型列表作为连接测试
                response = requests.get(f"{self.api_url}/api/tags", timeout=3)
                api_status = "Connected" if response.status_code == 200 else f"Error ({response.status_code})"
            elif self.api_type == "deepseek":
                # 使用简单模型查询测试连接
                response = requests.get(
                    f"{self.api_url}/v1/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=3
                )
                api_status = "Connected" if response.status_code == 200 else f"Error ({response.status_code})"
        except Exception as e:
            api_status = f"Connection failed: {str(e)}"
            
        status["connection_status"] = api_status
        
        return status