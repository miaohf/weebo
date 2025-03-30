"""消息处理器工厂和实现类"""
import os
import uuid
import json
import base64
import io
import numpy as np
from fastapi import BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
import wave
from pydub import AudioSegment
import soundfile as sf

from models.request_models import UnifiedChatRequest
from utils.logging_utils import debug, info, error, user_message, assistant_message
from utils.text_utils import split_text_into_segments
import config

class BaseMessageProcessor:
    """消息处理器基类"""
    def __init__(self, assistant):
        self.assistant = assistant
    
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理消息的抽象方法"""
        raise NotImplementedError
    
    def record_user_message(self, content, content_type="text"):
        """记录用户消息"""
        user_message(str(content))

class TextMessageProcessor(BaseMessageProcessor):
    """文本消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理文本消息"""
        message = request.message
        speaker = request.speaker
        stream_audio = request.stream_audio
        
        # 日志打印用户消息
        self.record_user_message(message)
        
        # 保存用户消息
        self.assistant.db_service.save_message("user", message)
        
        # 获取LLM响应
        response_data = self.assistant.llm_service.get_response(message)
        
        # 确保我们有正确的字符串格式，而不是嵌套的 JSON
        english_text = response_data.get("english", "")
        chinese_text = response_data.get("chinese", "")

        # 保存助手回复, 只保存英文消息
        assistant_message_id = self.assistant.db_service.save_message("assistant", english_text)
        
        # 如果内容仍然是字典，尝试提取字符串
        if isinstance(english_text, dict):
            english_text = english_text.get("english", str(english_text))
        if isinstance(chinese_text, dict):
            chinese_text = chinese_text.get("chinese", str(chinese_text))
        
        display_text = {
            "english": english_text,
            "chinese": chinese_text
        }
        
        # 日志打印和消息传递使用简单结构
        assistant_message(display_text)
        
        # 如果不需要音频，直接返回文本响应
        if not stream_audio:
            return JSONResponse({
                "message_id": assistant_message_id,
                "type": "text",
                "content": display_text,
                "status": "success"
            })
        
        # 分割文本为段落（用于TTS处理）
        text_segments = split_text_into_segments(response_data["english"])
        total_segments = len(text_segments)
        
        # 创建流式响应生成器
        async def generate_response_stream():
            # 首先返回文本响应
            text_response = {
                "type": "text",
                "message_id": assistant_message_id,
                "content": display_text
            }
            yield json.dumps(text_response) + "\n"
            
            # 设置TTS的speaker
            self.assistant.tts_model.set_speaker(speaker)
            
            # 准备存储音频段落路径的列表
            audio_paths = []
            
            # 逐段处理音频
            for i, segment in enumerate(text_segments):
                try:
                    # 生成音频
                    audio_response = await self.assistant.tts_model.generate_audio_segment(segment)
                    
                    if audio_response:
                        audio_data, sample_rate = audio_response
                        
                        # 保存音频段落
                        try:
                            # 确保音频数据格式正确
                            if audio_data.dtype == np.float32:
                                audio_data = np.clip(audio_data, -1.0, 1.0)
                                audio_data = (audio_data * 32767).astype(np.int16)
                            
                            # 创建WAV文件
                            segment_filename = f"{assistant_message_id}_{i}.wav"
                            segment_path = os.path.join(config.AUDIO_STORAGE_DIR, segment_filename)
                            
                            # 创建WAV格式的音频数据
                            wav_buffer = io.BytesIO()
                            with wave.open(wav_buffer, 'wb') as wave_file:
                                wave_file.setnchannels(1)
                                wave_file.setframerate(sample_rate)
                                wave_file.setsampwidth(2)
                                wave_file.writeframes(audio_data.tobytes())
                            
                            # 获取WAV二进制数据并保存文件
                            wav_bytes = wav_buffer.getvalue()
                            with open(segment_path, "wb") as f:
                                f.write(wav_bytes)
                            
                            # 记录音频段落信息
                            audio_paths.append({
                                "segment_index": i,
                                "path": segment_filename,
                                "sample_rate": sample_rate
                            })
                            
                            # 转换为Base64
                            base64_audio_data = base64.b64encode(wav_bytes).decode('utf-8')
                        
                            # 返回音频段落
                            segment_response = {
                                "type": "audio",
                                "message_id": assistant_message_id,
                                "segment_index": i,
                                "total_segments": total_segments,
                                "audio_data": base64_audio_data,
                                "format": "wav",
                                "sample_rate": sample_rate
                            }
                            print(f"{i}：{assistant_message_id}")
                            yield json.dumps(segment_response) + "\n"
                            
                        except Exception as e:
                            error(f"保存音频段落{i}失败: {e}")
                            continue
                        
                except Exception as e:
                    error(f"处理音频段落{i}时出错: {e}")
                    # 继续处理下一个段落，不中断
            
            # 在后台任务中合并音频段落
            background_tasks.add_task(
                self.assistant.merge_audio_segments,
                assistant_message_id,
                audio_paths,
                config.AUDIO_STORAGE_DIR
            )
        
        # 返回流式响应
        return StreamingResponse(
            generate_response_stream(),
            media_type="application/x-ndjson"
        )

class VoiceMessageProcessor(BaseMessageProcessor):
    """语音消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理语音消息"""
        # 获取上传的语音文件
        audio_file = request.files[0]
        speaker = request.speaker
        stream_audio = request.stream_audio
        
        # 读取音频数据
        audio_data = await audio_file.read()
        
        # 使用assistant处理语音输入
        transcript = await self.assistant.transcribe_audio(audio_data)
        
        if not transcript:
            return JSONResponse(
                status_code=400,
                content={"error": "未检测到语音内容", "status": "error"}
            )
        
        # 记录用户语音转文本的消息
        self.record_user_message(f"[voice] {transcript}")
        
        # 保存用户消息
        self.assistant.db_service.save_message("user", {
            "type": "voice",
            "text": transcript
        })
        
        # 现在使用文本处理器处理转录后的文本
        text_request = UnifiedChatRequest(
            message_type="text",
            message=transcript,
            session_id=request.session_id,
            speaker=speaker,
            stream_audio=stream_audio
        )
        
        # 使用文本处理器处理后续流程
        text_processor = TextMessageProcessor(self.assistant)
        return await text_processor.process(text_request, background_tasks)

class ImageMessageProcessor(BaseMessageProcessor):
    """图像消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理图像消息"""
        # 获取上传的图像文件
        image_file = request.files[0]
        message = request.message  # 可选的图像描述
        speaker = request.speaker
        stream_audio = request.stream_audio
        
        # 读取图像数据
        image_data = await image_file.read()
        
        # 保存图像到临时目录
        image_id = str(uuid.uuid4())
        image_path = os.path.join(config.IMAGE_STORAGE_DIR, f"{image_id}.jpg")
        
        with open(image_path, "wb") as f:
            f.write(image_data)
        
        # 记录用户图像消息
        user_msg = f"[图像消息]" + (f": {message}" if message else "")
        self.record_user_message(user_msg)
        
        # 保存用户消息和图像引用
        message_content = {
            "type": "image",
            "text": message or "",
            "image_path": image_path
        }
        self.assistant.db_service.save_message("user", message_content)
        
        # 使用图像分析模型处理图像
        image_description = await self.assistant.analyze_image(image_path)
        
        # 构建提示
        prompt = f"用户发送了一张图片。图片内容: {image_description}"
        if message:
            prompt += f"。用户还附带了消息: {message}"
        
        # 创建一个文本请求来处理分析结果
        text_request = UnifiedChatRequest(
            message_type="text",
            message=prompt,
            session_id=request.session_id,
            speaker=speaker,
            stream_audio=stream_audio
        )
        
        # 使用文本处理器处理后续流程
        text_processor = TextMessageProcessor(self.assistant)
        return await text_processor.process(text_request, background_tasks)

class MixedMessageProcessor(BaseMessageProcessor):
    """混合消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理混合消息（文本+文件）"""
        message = request.message
        files = request.files
        speaker = request.speaker
        stream_audio = request.stream_audio
        
        # 构建复合消息
        composite_prompt = ""
        file_descriptions = []
        
        # 处理文件
        for file in files:
            file_data = await file.read()
            content_type = file.content_type
            
            if "image" in content_type:
                # 处理图像文件
                image_id = str(uuid.uuid4())
                image_path = os.path.join(config.IMAGE_STORAGE_DIR, f"{image_id}.jpg")
                
                with open(image_path, "wb") as f:
                    f.write(file_data)
                
                # 分析图像
                image_description = await self.assistant.analyze_image(image_path)
                file_descriptions.append(f"图像: {image_description}")
                
            elif "audio" in content_type:
                # 处理音频文件
                transcript = await self.assistant.transcribe_audio(file_data)
                if transcript:
                    file_descriptions.append(f"语音内容: {transcript}")
        
        # 构建完整提示
        if file_descriptions:
            composite_prompt += "用户发送了以下内容: " + "; ".join(file_descriptions) + ". "
        
        if message:
            composite_prompt += f"用户消息: {message}"
        
        # 记录用户混合消息
        self.record_user_message(f"[混合消息] {composite_prompt}")
        
        # 保存用户消息
        message_content = {
            "type": "mixed",
            "text": message or "",
            "composite_prompt": composite_prompt,
            "file_descriptions": file_descriptions
        }
        self.assistant.db_service.save_message("user", message_content)
        
        # 创建一个文本请求来处理合成提示
        text_request = UnifiedChatRequest(
            message_type="text",
            message=composite_prompt,
            session_id=request.session_id,
            speaker=speaker,
            stream_audio=stream_audio
        )
        
        # 使用文本处理器处理后续流程
        text_processor = TextMessageProcessor(self.assistant)
        return await text_processor.process(text_request, background_tasks)

class MessageProcessorFactory:
    """消息处理器工厂"""
    @staticmethod
    def create(message_type, assistant):
        """创建相应类型的消息处理器"""
        if message_type == "text":
            return TextMessageProcessor(assistant)
        elif message_type == "voice":
            return VoiceMessageProcessor(assistant)
        elif message_type == "image":
            return ImageMessageProcessor(assistant)
        elif message_type == "mixed":
            return MixedMessageProcessor(assistant)
        else:
            raise ValueError(f"不支持的消息类型: {message_type}") 