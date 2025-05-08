"""Assistant class for coordinating various services."""
import os
import io
import asyncio
import base64
from typing import Optional, List, Dict, Any, Union
import numpy as np
import soundfile as sf
from pydub import AudioSegment
import time

from services.audio_service import AudioService
from services.llm_service import LLMService
from services.database_service import DatabaseService
from models.stt_model import SpeechToTextModel
from models.tts_model import TextToSpeechModel
from utils.logging_utils import debug, info, error
from core.config import settings
import json

class Assistant:
    """Main assistant class that coordinates all services."""
    
    def __init__(self):
        """Initialize the assistant."""
        # Create shutdown event for graceful termination
        self.shutdown_event = asyncio.Event()
        
        # Initialize services
        self.audio_service = AudioService(self.shutdown_event)
        
        # 根据配置初始化LLM服务
        llm_mode = settings.LLM_SERVICE_MODE.lower()
        info(f"初始化LLM服务，使用模式: {llm_mode}")
        self.llm_service = LLMService(api_type=llm_mode)
        
        # 使用配置的数据库路径
        self.db_service = DatabaseService(settings.DATABASE_PATH)
        self.stt_model = SpeechToTextModel()
        self.tts_model = TextToSpeechModel()
        
        # Load conversation history
        messages = self.db_service.load_session()
        # formatted_json = json.dumps(messages, indent=4, ensure_ascii=False, sort_keys=True)
        # debug(f"formatted_json: {formatted_json}")

        if messages:
            self.llm_service.set_messages(messages)
    
    async def transcribe_audio(self, audio_data: bytes) -> Optional[str]:
        """将音频转录为文本"""
        try:
            # 将bytes转换为AudioSegment
            audio = AudioSegment.from_file(io.BytesIO(audio_data))
            
            # 转换为单声道，16kHz采样率
            audio = audio.set_frame_rate(16000).set_channels(1)
            
            # 转换为numpy数组
            samples = np.array(audio.get_array_of_samples())
            samples = samples.astype(np.float32) / (2**15)  # 16bit PCM归一化
            
            # 预处理音频
            processed_audio = self.audio_service.preprocess_audio(samples, 16000)
            
            # 转录
            transcript = self.stt_model.transcribe(processed_audio)
            return transcript
            
        except Exception as e:
            error(f"音频转录失败: {e}")
            return None
    
    async def analyze_image(self, image_path: str) -> str:
        """分析图像内容"""
        try:
            # 这里应该集成图像分析模型
            # 目前简单返回一个占位符
            return "这是一张图片"
        except Exception as e:
            error(f"图像分析失败: {e}")
            return "无法分析图像内容"
    
    async def get_message_audio(self, message_id: str, audio: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """获取消息的音频数据"""
        debug(f"audio: {audio}")    
        try:
            # 检查是否有合并后的音频
            if "path" in audio and audio["path"]:
                audio_path = audio["path"]
                
                if os.path.exists(audio_path):
                    # 读取音频文件
                    with open(audio_path, "rb") as f:
                        audio_binary = f.read()
                    
                    # 转换为Base64
                    base64_audio_data = base64.b64encode(audio_binary).decode('utf-8')
                    
                    # 返回音频数据
                    return {
                        "type": "audio",
                        "message_id": message_id,
                        "audio_data": base64_audio_data,
                        "sample_rate": audio.get("sample_rate", 24000),
                        "encoding": "base64",  # 表示数据编码方式
                        "format": "wav",       # 表示音频格式
                        "is_merged": True,
                        "segment_index": 0,
                        "total_segments": 1,
                    }
                           
        except Exception as e:
            error(f"获取音频数据失败: {e}")
            return None
    
    async def merge_audio_segments(self, message_id: str, audio_paths: List[Dict[str, Any]], storage_dir: str):
        """合并音频段落并更新数据库"""

        debug(f"storage_dir: {storage_dir}")
        debug(f"audio_paths: {audio_paths}")
        try:
            if not audio_paths:
                return

            # 按顺序读取所有分段音频
            audio_segments = []
            segment_file_paths = []
            for seg in sorted(audio_paths, key=lambda x: x["segment_index"]):
                file_path = os.path.join(storage_dir, seg["path"])
                if os.path.exists(file_path):
                    data, sr = sf.read(file_path)
                    audio_segments.append(data)
                    segment_file_paths.append(file_path)
            
            debug(f"segment_file_paths: {segment_file_paths}")
            assistant_audio_dir = os.path.join(settings.AUDIO_STORAGE_DIR, "assistant")
            os.makedirs(assistant_audio_dir, exist_ok=True)
            
            # 创建日期子目录（年月日格式）
            today = time.strftime("%Y%m%d")
            date_dir = os.path.join(assistant_audio_dir, today)
            os.makedirs(date_dir, exist_ok=True)

            # 合并并保存
            if audio_segments:
                # 生成合并后的文件名和路径
                combined_filename = f"merged_{message_id}.wav"
                combined_path = os.path.join(date_dir, combined_filename)

                debug(f"combined_path: {combined_path}")
                
                # 合并成一个numpy数组
                full_audio = np.concatenate(audio_segments)
                
                # 保存合并后的文件
                sample_rate = audio_paths[0].get("sample_rate", 24000)
                sf.write(
                    combined_path,
                    full_audio,
                    sample_rate,
                    subtype='PCM_16'
                )
                
                # 记录详细的调试信息
                info(f"合并音频保存到: {combined_path}, 样本率: {sample_rate}")
                
                # 直接使用数据库服务更新消息表的 audio_path 字段
                success = self.db_service.update_message_audio_path(message_id, combined_path)
                if success:
                    info(f"消息 {message_id} 的音频路径已更新: {combined_path}")
                else:
                    error(f"更新消息 {message_id} 的音频路径失败")
                
                # 保存合并音频记录
                merged_audio = {
                    "message_id": message_id,
                    "path": combined_path,
                    "sample_rate": sample_rate,
                    "duration": len(full_audio) / sample_rate,  # 计算音频时长（秒）
                    "segments_count": len(audio_paths)
                }
                success = self.db_service.save_merged_audio(merged_audio)
                if success:
                    info(f"已保存合并音频记录: {merged_audio}")
                else:
                    error(f"保存合并音频记录失败")
                
                # 合并完成后删除原始分段音频文件
                try:
                    for file_path in segment_file_paths:
                        if os.path.exists(file_path):
                            os.remove(file_path)
                            info(f"已删除分段音频文件: {file_path}")
                except Exception as e:
                    error(f"删除分段音频文件失败: {str(e)}")
                
        except Exception as e:
            error(f"合并音频失败: {str(e)}")
            import traceback
            error(traceback.format_exc())

    def update_message_audio(self, message_id, audio_paths, merged_path=None, sample_rate=None):
        """更新消息的音频路径和元数据
        
        Args:
            message_id: 消息ID
            audio_paths: 音频路径列表或单个路径
            merged_path: 合并后的音频文件路径（可选）
            sample_rate: 音频采样率（可选）
        """
        try:
            # 处理音频信息
            audio_info = {}
            
            # 如果提供了合并路径，添加到音频信息中
            if merged_path:
                audio_info["path"] = merged_path
            
            # 如果提供了采样率，添加到音频信息中
            if sample_rate:
                audio_info["sample_rate"] = sample_rate
            
            # 如果audio_paths是列表，添加为段落
            if isinstance(audio_paths, list):
                audio_info["segments"] = audio_paths
            elif isinstance(audio_paths, str):
                # 如果是字符串，直接设置为路径
                audio_info["path"] = audio_paths
            
            # 调用数据库服务更新消息
            return self.db_service.update_message_audio(message_id, audio_info)
        except Exception as e:
            error(f"更新消息音频失败: {e}")
            return False