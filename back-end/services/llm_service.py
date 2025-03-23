"""Large Language Model service."""
import requests
import json
import re
from utils.logging_utils import debug, info, error
import config
from resources.prompts import SYSTEM_PROMPT

class LLMService:
    """Service for interacting with Large Language Models."""
    
    def __init__(self, api_url=config.OLLAMA_API_URL, model=config.OLLAMA_MODEL):
        """Initialize LLM service."""
        self.api_url = api_url
        self.model = model
        self.llm = None
        self.messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            }
        ]
        
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
    
    def add_message(self, role, content):
        """Add a message to the conversation history."""
        if not content or not content.strip():
            return
            
        self.messages.append({
            "role": role,
            "content": content
        })
    
    def get_response(self, user_input):
        """Get response from LLM."""
        if not user_input or not user_input.strip():
            return None
            
        # Add user message to history
        self.add_message("user", user_input)
        
        # First, get a regular English response
        try:
            debug(f"Sending English request to Ollama API using model: {self.model}")
            
            english_response = requests.post(
                f"{self.api_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": self.messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "top_k": 40
                    }
                },
                timeout=60
            )
            
            if english_response.status_code == 200:
                result = english_response.json()
                english_content = result.get("message", {}).get("content", "")
                
                if not english_content:
                    debug("Empty English response from LLM")
                    english_content = "I'm sorry, I couldn't generate a proper response. Could you try asking again?"
                
                # Clean up the English response for TTS (preserve punctuation)
                english_content = self._clean_response(english_content)
                
                # Now, get a Chinese translation of the English response
                translation_prompt = f"""
Translate the following English text to Chinese. Provide only the Chinese translation without any additional text or explanations:

"{english_content}"
"""
                
                translation_messages = [
                    {
                        "role": "system",
                        "content": "You are a helpful translator that translates English to Chinese accurately."
                    },
                    {
                        "role": "user",
                        "content": translation_prompt
                    }
                ]
                
                debug("Sending translation request to Ollama API")
                
                translation_response = requests.post(
                    f"{self.api_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": translation_messages,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,  # Lower temperature for more accurate translation
                            "top_p": 0.9,
                            "top_k": 40
                        }
                    },
                    timeout=60
                )
                
                chinese_content = ""
                if translation_response.status_code == 200:
                    translation_result = translation_response.json()
                    chinese_content = translation_result.get("message", {}).get("content", "")
                    
                    # Clean up the translation
                    chinese_content = chinese_content.strip()
                    # Only remove surrounding quotes, not all punctuation
                    chinese_content = re.sub(r'^["\'"]|["\'"]$', '', chinese_content)
                    
                    if not chinese_content:
                        debug("Empty Chinese translation from LLM")
                        chinese_content = "抱歉，我无法生成适当的回应。您能再试一次吗？"
                else:
                    debug(f"Translation API error: {translation_response.status_code}")
                    chinese_content = "抱歉，我无法生成适当的回应。您能再试一次吗？"
                
                # Add to conversation history (only the English part)
                self.add_message("assistant", english_content)
                
                # Format the display message with both languages
                display_message = f"{english_content}\n\n{chinese_content}"
                
                # Return a dictionary with both parts
                return {
                    "english": english_content,
                    "chinese": chinese_content,
                    "display": display_message
                }
            else:
                error(f"LLM API error: {english_response.status_code}")
                debug(f"Error response: {english_response.text}")
                
                # Fallback response for API errors
                fallback_response = {
                    "english": f"I'm sorry, there was an error connecting to my language model ({self.model}). Please try again later.",
                    "chinese": f"抱歉，连接到我的语言模型 ({self.model}) 时出现错误。请稍后再试。",
                    "display": f"I'm sorry, there was an error connecting to my language model ({self.model}). Please try again later.\n\n抱歉，连接到我的语言模型 ({self.model}) 时出现错误。请稍后再试。"
                }
                
                return fallback_response
                
        except Exception as e:
            error(f"Failed to get LLM response: {e}")
            import traceback
            debug(f"Exception details: {traceback.format_exc()}")
            
            # Fallback response for exceptions
            fallback_response = {
                "english": "I'm sorry, I encountered an error while processing your request. Please try again.",
                "chinese": "抱歉，处理您的请求时遇到错误。请再试一次。",
                "display": "I'm sorry, I encountered an error while processing your request. Please try again.\n\n抱歉，处理您的请求时遇到错误。请再试一次。"
            }
            
            return fallback_response
    
    def _extract_bilingual_parts(self, text):
        """Extract English and Chinese parts from the response."""
        # Default values in case extraction fails
        english_part = text
        chinese_part = ""
        
        # Try to extract using regex patterns
        english_match = re.search(r'\[English\](.*?)(?:\[Chinese\]|\Z)', text, re.DOTALL)
        chinese_match = re.search(r'\[Chinese\](.*?)(?:\Z)', text, re.DOTALL)
        
        if english_match:
            english_part = english_match.group(1).strip()
        
        if chinese_match:
            chinese_part = chinese_match.group(1).strip()
        
        # If no matches found, try alternative format
        if not english_match and not chinese_match:
            parts = text.split("\n\n", 1)
            if len(parts) > 1:
                english_part = parts[0].strip()
                chinese_part = parts[1].strip()
        
        return english_part, chinese_part
    
    def _clean_response(self, text):
        """Clean up LLM response for TTS."""
        # Remove markdown formatting
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)  # Bold
        text = re.sub(r'\*(.*?)\*', r'\1', text)      # Italic
        
        # Remove action descriptions
        text = re.sub(r'\*([^*]+)\*', '', text)       # *actions*
        text = re.sub(r'\(([^)]+)\)', '', text)       # (actions)
        text = re.sub(r'\[([^]]+)\]', '', text)       # [actions]
        
        # Remove emojis but keep punctuation
        # This regex removes special characters but preserves alphanumeric, spaces, and common punctuation
        text = re.sub(r'[^\w\s.,?!:;\'"-]', '', text)
        
        # Fix spacing
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        return text
    
    def set_messages(self, messages):
        """Set conversation history."""
        if messages and isinstance(messages, list):
            # Ensure system prompt is present
            if not any(msg.get("role") == "system" for msg in messages):
                messages.insert(0, {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                })
            self.messages = messages
        else:
            # Reset to just system prompt
            self.messages = [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                }
            ]
    
    def get_messages(self):
        """Get conversation history."""
        return self.messages