"""Main entry point for the assistant API server."""
import signal
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Request, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import Optional
from pydantic import BaseModel
import config
from utils.logging_utils import debug, info, error, user_message, assistant_message
from services.audio_service import AudioService
from services.llm_service import LLMService
from services.database_service import DatabaseService
from models.stt_model import SpeechToTextModel
from models.tts_model import TextToSpeechModel
import re
import logging
import json
import base64
import numpy as np
import soundfile as sf
import io
from pydub import AudioSegment
from fastapi.responses import StreamingResponse, JSONResponse
import aiohttp
import uuid
import os
import hashlib
from datetime import datetime
import sqlite3

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 在配置部分添加音频存储路径
AUDIO_STORAGE_DIR = "audio_cache"
os.makedirs(AUDIO_STORAGE_DIR, exist_ok=True)

class ConversationRequest(BaseModel):
    message: str
    mode: str  # 'text' or 'voice'
    session_id: Optional[str] = None
    speaker: Optional[str] = 'default'  # 添加 speaker 字段

class Assistant:
    """Main assistant class that coordinates all services."""
    
    def __init__(self):
        """Initialize the assistant."""
        # Create shutdown event for graceful termination
        self.shutdown_event = asyncio.Event()
        
        # Initialize services
        self.audio_service = AudioService(self.shutdown_event)
        self.llm_service = LLMService()
        self.db_service = DatabaseService("data/messages.db")
        self.stt_model = SpeechToTextModel()
        self.tts_model = TextToSpeechModel()
        
        # Load conversation history
        messages = self.db_service.load_session()
        if messages:
            self.llm_service.set_messages(messages)

    def split_into_chunks(self, text, max_length=150):
        """Split text into chunks at sentence boundaries."""
        if not text:
            return []
            
        # Split at sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) <= max_length:
                current_chunk += " " + sentence if current_chunk else sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks

    async def process_text_input(self, user_input: str, session_id: Optional[str] = None, speaker: str = 'default'):
        """Process text input and return response."""
        try:
            debug(f"Processing text input: {user_input}")
            debug(f"Session ID: {session_id}")
            debug(f"Speaker: {speaker}")
            
            if not user_input or not user_input.strip():
                debug("Empty input received")
                return {"error": "Empty input"}
            
            # Display user message
            user_message(user_input)
            
            # Save user message
            self.db_service.save_message("user", user_input)
            
            # Get response from LLM
            debug("Requesting response from LLM service")
            response_data = self.llm_service.get_response(user_input)
            debug(f"LLM response data: {response_data}")
            
            if not response_data:
                error("LLM service returned None response")
                return {"error": "Failed to get response from LLM"}
            
            # 确保 response_data 包含必要字段
            if not isinstance(response_data, dict):
                error(f"Invalid response format: {type(response_data)}")
                return {
                    "english": "I'm sorry, I encountered an error while processing your request.",
                    "chinese": "抱歉，处理您的请求时遇到错误。",
                    "display": "I'm sorry, I encountered an error while processing your request.\n\n抱歉，处理您的请求时遇到错误。"
                }
            
            if 'english' not in response_data or 'chinese' not in response_data:
                error(f"Missing required fields in response: {response_data.keys()}")
                return {
                    "english": "I'm sorry, I encountered an error while processing your request.",
                    "chinese": "抱歉，处理您的请求时遇到错误。",
                    "display": "I'm sorry, I encountered an error while processing your request.\n\n抱歉，处理您的请求时遇到错误。"
                }
            
            debug("Successfully processed LLM response")
            debug(f"English content: {response_data['english']}")
            debug(f"Chinese content: {response_data['chinese']}")
            
            # Display the response
            display_message = {
                "english": response_data["english"],
                "chinese": response_data["chinese"]
            }
            # response_data["display"]
            assistant_message(display_message)
            
            # Save assistant message
            self.db_service.save_message("assistant", display_message)
            
            # Generate audio with selected speaker
            self.tts_model.set_speaker(speaker)  # 设置 speaker
            audio_data = await self.tts_model.generate_audio_async(response_data["english"])
            
            # 确保音频数据是可序列化的格式
            if isinstance(audio_data, tuple):
                audio_array, sample_rate = audio_data
                audio_data = {
                    "audio": audio_array.tolist() if hasattr(audio_array, 'tolist') else audio_array,
                    "sample_rate": sample_rate
                }
            
            return {
                "text": display_message,
                "audio": audio_data,
                "status": "success"
            }
            
        except Exception as e:
            error(f"Error in text processing: {e}")
            import traceback
            debug(f"Exception details: {traceback.format_exc()}")
            return {
                "english": "I'm sorry, I encountered an error while processing your request.",
                "chinese": "抱歉，处理您的请求时遇到错误。",
                "display": "I'm sorry, I encountered an error while processing your request.\n\n抱歉，处理您的请求时遇到错误。"
            }

    async def process_voice_input(self, audio_data: bytes, sample_rate: int = 16000, speaker: str = 'default'):
        """Process voice input and return response."""
        try:
            # 尝试使用pydub处理音频
            import io
            
            # 将bytes转换为AudioSegment
            audio = AudioSegment.from_file(io.BytesIO(audio_data))
            
            # 转换为单声道，16kHz采样率
            audio = audio.set_frame_rate(sample_rate).set_channels(1)
            
            # 转换为numpy数组
            samples = np.array(audio.get_array_of_samples())
            samples = samples.astype(np.float32) / (2**15)  # 16bit PCM归一化
            
            # Process audio with sample rate
            processed_audio = self.audio_service.preprocess_audio(samples, sample_rate)
            
            # Transcribe
            transcript = self.stt_model.transcribe(processed_audio)
            if not transcript:
                return {"error": "No speech detected"}
            
            # Display user message
            user_message(transcript)
            
            # Get response using text processing
            return await self.process_text_input(transcript, speaker=speaker)
            
        except Exception as e:
            error(f"Error in voice processing: {e}")
            return {"error": str(e)}

    def detect_sample_rate(self, audio_data: bytes) -> Optional[int]:
        """Detect sample rate from audio data."""
        try:
            import wave
            import io
            
            # 尝试读取WAV文件头
            with io.BytesIO(audio_data) as f:
                with wave.open(f, 'rb') as wav:
                    return wav.getframerate()
        except Exception:
            try:
                # 如果不是WAV格式，尝试其他方法
                import librosa
                import numpy as np
                import soundfile as sf
                
                # 将字节数据转换为numpy数组
                audio_array, sample_rate = sf.read(io.BytesIO(audio_data))
                return sample_rate
            except Exception:
                return None

    def save_message_with_audio(self, role, content, message_id, audio_paths=None):
        """保存消息并关联音频路径"""
        try:
            return self.db_service.save_message_with_audio(role, content, message_id, audio_paths)
        except Exception as e:
            error(f"保存消息(带音频路径)失败: {e}")
            import traceback
            error(traceback.format_exc())
            return False

    def get_message_by_id(self, message_id):
        """根据消息ID查询消息"""
        return self.db_service.get_message_by_id(message_id)

    def get_message_by_key(self, key):
        """根据消息键查询消息"""
        return self.db_service.get_message_by_key(key)

    def update_message_audio(self, message_id, audio_paths, merged_info):
        """更新消息的音频信息"""
        return self.db_service.update_message_audio(message_id, audio_paths, merged_info)

    def ensure_consistent_message_ids(self):
        """确保所有消息都有一致格式的ID"""
        try:
            with self.db_service.SessionLocal() as db:
                # 查找所有消息
                messages = db.query(Message).all()
                updated = 0
                
                for msg in messages:
                    need_update = False
                    
                    # 确保message_id和key一致
                    if "assistant-" in msg.key and not msg.key.endswith(msg.message_id):
                        # 从key中提取ID
                        parts = msg.key.split("assistant-", 1)
                        if len(parts) > 1:
                            msg.message_id = parts[1]
                            need_update = True
                    
                    # 如果需要更新
                    if need_update:
                        updated += 1
                
                if updated > 0:
                    db.commit()
                    logging.info(f"已更新{updated}条消息的ID格式")
                
                return updated
        except Exception as e:
            logging.error(f"更新消息ID格式失败: {e}")
            logging.error(traceback.format_exc())
            return 0

# Initialize FastAPI app
app = FastAPI()

# 更新 CORS 配置，明确指定允许的域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# 在FastAPI应用程序中添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://192.168.31.17:3000"],  # 前端URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 确保在创建app之后立即添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境可以用*，生产环境应具体设置
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize assistant
assistant = Assistant()

# 定义请求模型
class TextMessageRequest(BaseModel):
    message: str
    speaker: str = "default"

# 添加新的请求模型类
class StreamAudioRequest(BaseModel):
    message: str
    speaker: str = "default"

# 添加StreamChatRequest模型定义
class StreamChatRequest(BaseModel):
    message: str
    speaker: str = "default"

# 添加StreamTTSRequest模型（如果尚未定义）
class StreamTTSRequest(BaseModel):
    text: str
    speaker: str = "default"

# 确认ChatRequest模型
class ChatRequest(BaseModel):
    message: str
    speaker: str = "default"
    stream_audio: bool = True  # 是否需要流式音频

# 添加缺失的 /get_audio 端点
class GetAudioRequest(BaseModel):
    message_id: str

@app.post("/conversation")
async def conversation(
    file: UploadFile = File(...),
    sample_rate: Optional[int] = Form(16000),
    speaker: Optional[str] = Form('default')
):
    """Handle conversation requests."""
    try:
        # 读取音频文件
        audio_data = await file.read()
        
        # 处理音频数据
        response = await assistant.process_voice_input(audio_data, sample_rate, speaker)
        return response
        
    except Exception as e:
        error(f"Conversation error: {e}")
        return {"error": str(e)}

@app.post("/api/send_message")
async def send_message(request: TextMessageRequest):
    """处理文本消息的HTTP API端点"""
    print(f"收到HTTP文本消息请求: {request.message[:50]}...")
    
    try:
        # 使用现有的处理逻辑
        response = await assistant.process_text_input(request.message, None, request.speaker)
        print("生成的响应:", response)  # 添加日志
        return response
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"处理消息错误: {e}\n{error_details}")
        return {"error": f"处理消息失败: {str(e)}"}

@app.get("/sessions")
async def get_sessions():
    """Get all conversation sessions."""
    return assistant.db_service.get_session_history()

# 添加流式TTS端点
@app.post("/stream_tts")
async def stream_tts(request: StreamAudioRequest):
    """处理流式TTS请求，逐段返回音频数据"""
    try:
        # 显示用户消息到日志
        user_message(request.message)
        
        # 保存用户消息
        assistant.db_service.save_message("user", request.message)
        
        # 获取LLM响应
        response_data = assistant.llm_service.get_response(request.message)
        
        if not response_data:
            return {"error": "Failed to get response from LLM"}
        
        # 显示助手消息
        display_message = {
            "english": response_data["english"],
            "chinese": response_data["chinese"]
        }
        assistant_message(display_message)
        
        # 保存助手消息
        assistant.db_service.save_message("assistant", display_message)
        
        # 设置TTS的speaker
        assistant.tts_model.set_speaker(request.speaker)
        
        # 分割文本为多个段落
        text_segments = assistant.split_into_chunks(response_data["english"])
        
        # 使用StreamingResponse返回逐段处理的音频
        async def generate_audio_stream():
            # 首先返回文本响应
            text_response = {
                "type": "text",
                "text": display_message
            }
            yield json.dumps(text_response) + "\n"
            
            # 逐段处理音频
            for i, segment in enumerate(text_segments):
                audio_data = await assistant.tts_model.generate_audio_segment(segment)
                
                # 如果生成成功，返回音频段
                if audio_data:
                    segment_response = {
                        "type": "audio_segment",
                        "segment_index": i,
                        "total_segments": len(text_segments),
                        "text": segment,
                        "audio": {
                            "audio": audio_data[0].tolist() if hasattr(audio_data[0], 'tolist') else audio_data[0],
                            "sample_rate": audio_data[1]
                        }
                    }
                    yield json.dumps(segment_response) + "\n"
        
        return StreamingResponse(
            generate_audio_stream(),
            media_type="application/x-ndjson"
        )
        
    except Exception as e:
        error(f"Stream TTS error: {e}")
        import traceback
        debug(f"Exception details: {traceback.format_exc()}")
        return {"error": str(e)}

@app.post("/chat")
async def chat(request: ChatRequest):
    """处理聊天请求，先返回文本，再流式返回TTS音频"""
    try:
        # 记录用户消息
        user_message(request.message)
        assistant.db_service.save_message("user", request.message)
        
        # 获取LLM响应
        response_data = assistant.llm_service.get_response(request.message)
        
        if not response_data:
            return {"error": "无法从LLM获取响应"}
        
        # 显示助手消息
        display_message = {
            "english": response_data["english"],
            "chinese": response_data["chinese"]
        }
        assistant_message(display_message)
        
        # 保存助手回复
        assistant_message_id = assistant.db_service.save_message("assistant", display_message)
        debug(f"已保存助手消息，ID: {assistant_message_id}")
        
        # 如果不需要音频，直接返回文本响应
        if not request.stream_audio:
            return {"message": display_message}
        
        # 分割文本为段落（仅对英文文本处理，因为TTS通常使用英文文本）
        text_segments = split_text_into_segments(response_data["english"])
        total_segments = len(text_segments)
        
        debug(f"文本分为{total_segments}个段落用于TTS处理")
        
        # 创建流式响应生成器
        async def generate_response_stream():
            # 生成消息ID
            message_id = str(uuid.uuid4())
            # 保存助手消息
            assistant.db_service.save_message_with_audio(
                "assistant", 
                display_message, 
                message_id,
                []  # 初始为空音频列表
            )
            
            # 首先发送文本响应
            text_response = {
                "type": "text",
                "message_id": message_id,
                "content": display_message
            }
            
            # 打印文本响应报文
            text_response_json = json.dumps(text_response)
            print("\n=== 文本响应报文 ===")
            print(text_response_json)
            print("=== 文本响应报文结束 ===\n")
            
            yield text_response_json + "\n"
            
            # 记录消息ID用于关联音频
            message_id = text_response["message_id"]
            debug(f"生成流式响应message_id: {message_id}")
            
            # 定义音频路径列表
            audio_paths = []
            
            # 逐段处理TTS
            for i, segment in enumerate(text_segments):
                try:
                    debug(f"处理第{i+1}/{total_segments}段音频")
                    
                    # 获取TTS音频数据
                    tts_response = await request_tts_for_segment(segment, request.speaker)
                    
                    # 保存音频文件到磁盘
                    file_hash = hashlib.md5(f"{message_id}_{i}_{segment}".encode()).hexdigest()
                    audio_filename = f"{file_hash}.wav"
                    audio_path = os.path.join(AUDIO_STORAGE_DIR, audio_filename)
                    
                    # 解码Base64为二进制
                    audio_binary = base64.b64decode(tts_response["audio_data"])
                    
                    # 保存到文件
                    with open(audio_path, "wb") as f:
                        f.write(audio_binary)
                    
                    # 添加到路径列表
                    audio_paths.append({
                        "path": audio_filename,
                        "segment_index": i,
                        "text": segment,
                        "sample_rate": tts_response["sample_rate"]
                    })
                    
                    # 音频响应保持不变...
                    audio_response = {
                        "type": "audio",
                        "message_id": message_id,
                        "segment_index": i,
                        "total_segments": total_segments,
                        "text": segment,
                        "audio_data": tts_response["audio_data"],
                        "sample_rate": tts_response["sample_rate"],
                        "format": "base64"
                    }
                    yield json.dumps(audio_response) + "\n"
                    
                except Exception as e:
                    error(f"音频处理错误: {e}")
                    error_response = {
                        "type": "error",
                        "message_id": message_id,
                        "segment_index": i,
                        "message": str(e)
                    }
                    
                    # 打印错误响应
                    print("\n=== 错误响应报文 ===")
                    print(json.dumps(error_response))
                    print("=== 错误响应报文结束 ===\n")
                    
                    yield json.dumps(error_response) + "\n"
            
            # 音频段处理完毕后，合并所有音频
            if audio_paths:
                try:
                    # 创建合并后的音频文件名
                    merged_filename = f"{message_id}_merged.wav"
                    merged_path = os.path.join(AUDIO_STORAGE_DIR, merged_filename)
                    
                    # 合并音频文件
                    combined = None
                    sample_rate = None
                    
                    # 按段落索引排序
                    sorted_paths = sorted(audio_paths, key=lambda x: x["segment_index"])
                    
                    for segment_info in sorted_paths:
                        segment_path = os.path.join(AUDIO_STORAGE_DIR, segment_info["path"])
                        if os.path.exists(segment_path):
                            segment_audio = AudioSegment.from_file(segment_path)
                            
                            if combined is None:
                                combined = segment_audio
                                sample_rate = segment_info.get("sample_rate", 24000)
                            else:
                                combined += segment_audio
                    
                    # 保存合并后的音频
                    if combined:
                        combined.export(merged_path, format="wav")
                        debug(f"已合并音频保存到: {merged_path}")
                        
                        # 添加合并音频信息到消息
                        merged_info = {
                            "merged_path": merged_filename,
                            "sample_rate": sample_rate
                        }
                        
                        # 使用ORM方法更新音频信息
                        result = assistant.db_service.update_message_audio(message_id, audio_paths, merged_info)
                        if result:
                            debug(f"已更新消息音频信息: assistant-{message_id}")
                except Exception as e:
                    error(f"合并音频失败: {e}")
                    import traceback
                    error(traceback.format_exc())
            
            # 发送完成信号
            completion_response = {
                "type": "audio_complete",
                "message_id": message_id,
                "total_segments": total_segments
            }
            
            # 打印完成响应
            print("\n=== 完成响应报文 ===")
            print(json.dumps(completion_response))
            print("=== 完成响应报文结束 ===\n")
            
            yield json.dumps(completion_response) + "\n"
        
        # 返回流式响应
        return StreamingResponse(
            generate_response_stream(),
            media_type="application/x-ndjson"
        )
        
    except Exception as e:
        error(f"聊天处理出错: {e}")
        import traceback
        debug(f"异常详情: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# 添加缺失的/tts_stream端点
@app.post("/tts_stream")
async def tts_stream(request: StreamTTSRequest):
    """流式处理TTS请求，逐段返回音频数据"""
    try:
        # 文本内容
        text = request.text
        
        # 分割文本为段落
        text_segments = split_text_into_segments(text)
        total_segments = len(text_segments)
        
        debug(f"文本被分为{total_segments}个段落进行处理")
        
        # 创建流式响应生成器
        async def generate_audio_stream():
            # 首先返回文本和分段信息
            info_response = {
                "type": "info",
                "total_segments": total_segments,
                "text": text
            }
            yield json.dumps(info_response) + "\n"
            
            # 逐段处理文本并返回音频
            for i, segment in enumerate(text_segments):
                try:
                    debug(f"处理第{i+1}段文本：{segment[:30]}...")
                    
                    # 调用TTS服务器处理此段
                    tts_response = await request_tts_for_segment(segment, request.speaker)
                    
                    # 构造段落响应
                    segment_response = {
                        "type": "audio_segment",
                        "segment_index": i,
                        "total_segments": total_segments,
                        "text": segment,
                        "audio_data": tts_response["audio_data"],
                        "sample_rate": tts_response["sample_rate"],
                        "format": "base64"
                    }
                    
                    yield json.dumps(segment_response) + "\n"
                    debug(f"第{i+1}段文本音频已生成")
                    
                except Exception as e:
                    error(f"处理第{i+1}段时出错: {e}")
                    error_response = {
                        "type": "error",
                        "segment_index": i,
                        "message": str(e)
                    }
                    yield json.dumps(error_response) + "\n"
        
        # 返回流式响应
        return StreamingResponse(
            generate_audio_stream(),
            media_type="application/x-ndjson"
        )
        
    except Exception as e:
        error(f"流式TTS处理出错: {e}")
        import traceback
        debug(f"异常详情: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# 辅助函数：将文本分割为合适的段落
def split_text_into_segments(text, max_length=250):
    """智能分割文本为较短的段落"""
    if len(text) <= max_length:
        return [text]
    
    segments = []
    # 优先按句子分割点分段
    sentence_breaks = re.split(r'(?<=[.!?])\s+', text)
    
    current_segment = ""
    for sentence in sentence_breaks:
        # 如果当前句子加上现有段落超过最大长度且现有段落不为空
        if len(current_segment + sentence) > max_length and current_segment:
            segments.append(current_segment.strip())
            current_segment = sentence
        # 如果单个句子超过最大长度
        elif len(sentence) > max_length:
            # 如果当前段不为空，先添加它
            if current_segment:
                segments.append(current_segment.strip())
                current_segment = ""
            
            # 按照逗号、分号等次级分隔符再次分割
            sub_parts = re.split(r'(?<=[,;:])\s+', sentence)
            sub_segment = ""
            
            for part in sub_parts:
                if len(sub_segment + part) > max_length and sub_segment:
                    segments.append(sub_segment.strip())
                    sub_segment = part
                else:
                    sub_segment += (" " if sub_segment else "") + part
            
            if sub_segment:
                segments.append(sub_segment.strip())
        else:
            current_segment += (" " if current_segment else "") + sentence
    
    # 添加最后一个段落
    if current_segment:
        segments.append(current_segment.strip())
    
    return segments

# 辅助函数：请求TTS服务器生成单个段落的音频
async def request_tts_for_segment(text, speaker="default"):
    """向TTS服务器请求生成单个文本段的音频"""
    try:
        # 获取TTS服务器基础URL
        tts_url = config.TTS_API_URL.rstrip('/')
        
        # 准备请求数据
        request_data = {
            "text": text,
            "speaker": speaker
        }
        
        print(f"\n--- TTS请求 ---")
        print(f"URL: {tts_url}/tts")
        print(f"文本: {text}")
        print(f"说话人: {speaker}")
        
        # 发送请求到TTS服务器
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{tts_url}/tts", json=request_data, timeout=60) as response:
                print(f"TTS响应状态码: {response.status}")
                print(f"TTS响应头: {dict(response.headers)}")
                
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"TTS服务器返回错误: {response.status}, {error_text}")
                
                # 读取响应数据（只读取一次）
                audio_data = await response.read()
                print(f"收到TTS音频数据，字节大小: {len(audio_data)}")
                print(f"数据前20字节: {audio_data[:20]}")
                
                # 判断响应类型
                content_type = response.headers.get('Content-Type', '')
                print(f"内容类型: {content_type}")
                
                # 根据内容类型处理
                if 'application/json' in content_type:
                    # 处理JSON响应
                    json_data = json.loads(audio_data)
                    
                    # 检查JSON响应中的字段
                    print(f"JSON响应字段: {list(json_data.keys())}")
                    
                    # 统一使用audio_data字段
                    if 'audio' in json_data:
                        audio_base64 = json_data['audio']
                        print("从'audio'字段获取音频数据")
                    elif 'audio_data' in json_data:
                        audio_base64 = json_data['audio_data']
                        print("从'audio_data'字段获取音频数据")
                    else:
                        raise Exception(f"TTS返回了无效的JSON格式: {list(json_data.keys())}")
                else:
                    # 处理二进制响应
                    audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                    print("将二进制响应编码为Base64")
                
                sample_rate = 24000
                
                print(f"--- TTS处理完成 ---\n")
                
                # 在return语句前添加
                print(f"TTS响应格式: audio_data长度={len(audio_base64)}, sample_rate={sample_rate}")
                debug(f"TTS响应字段: {{'audio_data': '(长度: {len(audio_base64)})', 'sample_rate': {sample_rate}}}")
                
                # 统一返回audio_data字段
                return {
                    "audio_data": audio_base64,
                    "sample_rate": sample_rate
                }
    except Exception as e:
        error(f"TTS请求失败: {e}")
        import traceback
        error(f"错误详情: {traceback.format_exc()}")
        raise

@app.post("/get_audio")
async def get_audio(request: GetAudioRequest):
    """获取指定消息ID的历史音频数据"""
    print(f"\n=== 收到获取音频请求 ===")
    print(f"消息ID: {request.message_id}")
    
    try:
        message_id = request.message_id
        # 尝试删除可能的前缀
        if message_id.startswith("assistant-"):
            message_id = message_id.split("assistant-", 1)[1]
        
        # 从数据库获取消息，使用增强的查询方法
        message = assistant.db_service.get_message_by_flexible_id(message_id)
        
        if not message:
            raise HTTPException(status_code=404, detail="未找到消息")
        
        # 检查是否有合并后的音频
        if "merged_audio" in message and message["merged_audio"]:
            merged_info = message["merged_audio"]
            merged_path = os.path.join(AUDIO_STORAGE_DIR, merged_info["merged_path"])
            
            if os.path.exists(merged_path):
                # 返回合并后的单个音频文件
                with open(merged_path, "rb") as f:
                    audio_binary = f.read()
                
                # 转换为Base64
                audio_base64 = base64.b64encode(audio_binary).decode('utf-8')
                
                # 使用一个段落返回完整音频
                return JSONResponse({
                    "type": "audio",
                    "message_id": message_id,
                    "audio_data": audio_base64,
                    "sample_rate": merged_info.get("sample_rate", 24000),
                    "format": "base64",
                    "is_merged": True
                })
        
        # 如果没有合并音频，检查是否有音频段落
        audio_paths = message.get("audio_paths", [])
        if not audio_paths:
            raise HTTPException(status_code=404, detail="此消息没有关联音频")
        
        # 实时合并音频段落
        try:
            # 按段落索引排序
            sorted_paths = sorted(audio_paths, key=lambda x: x["segment_index"])
            combined = None
            sample_rate = None
            
            for segment_info in sorted_paths:
                segment_path = os.path.join(AUDIO_STORAGE_DIR, segment_info["path"])
                if os.path.exists(segment_path):
                    segment_audio = AudioSegment.from_file(segment_path)
                    
                    if combined is None:
                        combined = segment_audio
                        sample_rate = segment_info.get("sample_rate", 24000)
                    else:
                        combined += segment_audio
            
            if combined is None:
                raise HTTPException(status_code=404, detail="无法合并音频段落")
            
            # 创建临时文件
            temp_path = os.path.join(AUDIO_STORAGE_DIR, f"temp_{message_id}.wav")
            combined.export(temp_path, format="wav")
            
            # 读取合并后的文件
            with open(temp_path, "rb") as f:
                audio_binary = f.read()
            
            # 删除临时文件
            try:
                os.remove(temp_path)
            except:
                pass
            
            # 转换为Base64
            audio_base64 = base64.b64encode(audio_binary).decode('utf-8')
            
            # 返回合并后的音频
            return JSONResponse({
                "type": "audio",
                "message_id": message_id,
                "audio_data": audio_base64,
                "sample_rate": sample_rate or 24000,
                "format": "base64",
                "is_merged": True
            })
            
        except Exception as e:
            error(f"实时合并音频失败: {e}")
            import traceback
            error(traceback.format_exc())
            
            # 回退到流式返回个别段落
            # ... 原有的流式返回代码 ...
            raise HTTPException(status_code=500, detail=f"合并音频失败: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        error(f"获取音频失败: {e}")
        import traceback
        error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/messages")
async def debug_messages():
    """列出数据库中的所有消息记录及其ID"""
    try:
        messages = []
        with assistant.db_service.SessionLocal() as db:
            records = db.query(Message).all()
            messages = [
                {
                    "id": record.id,
                    "key": record.key,
                    "message_id": record.message_id,
                    "role": record.role,
                    "timestamp": record.timestamp.isoformat(),
                    "has_audio": bool(record.audio_segments) or bool(record.merged_audio)
                }
                for record in records
            ]
        return JSONResponse({"messages": messages})
    except Exception as e:
        error(f"获取调试消息失败: {e}")
        import traceback
        error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# @app.event("startup")
async def startup_event():
    """服务启动时执行的操作"""
    print("\n=== 服务启动 ===")
    print("可用路由:")
    for route in app.routes:
        print(f"{route.methods} {route.path}")
    
    # 确保ID一致性
    assistant.db_service.ensure_consistent_message_ids()
    
    print("=== 服务启动完成 ===\n")

def main():
    """Main entry point."""
    logger.info("Starting server...")
    
    def signal_handler(sig, frame):
        """Handle shutdown signals."""
        logger.info("Shutting down...")
        assistant.shutdown_event.set()
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 使用以下配置确保WebSocket在HTTPS下工作
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info",
        access_log=True,
        # 临时注释掉SSL配置
        # ssl_keyfile="./key.pem",
        # ssl_certfile="./cert.pem"
    )
    
    server = uvicorn.Server(config)
    server.run()

if __name__ == "__main__":
    main()