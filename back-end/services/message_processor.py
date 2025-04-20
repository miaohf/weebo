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
import re
import time
import tempfile

from models.request_models import UnifiedChatRequest
from utils.logging_utils import debug, info, error, user_message, assistant_message
from core.config import settings

class BaseMessageProcessor:
    """消息处理器基类"""
    def __init__(self, assistant):
        """初始化处理器"""
        self.assistant = assistant
    
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理消息（由子类实现）"""
        raise NotImplementedError("子类必须实现process方法")
    
    def print_user_message(self, content, content_type="text"):
        """打印用户消息到控制台"""
        debug(f"{settings.YELLOW}用户 ({content_type}): {content}{settings.RESET_COLOR}")
        
    def split_text_to_segments(self, text, max_length=settings.MAX_SEGMENT_LENGTH):
        """将文本分割为较小的段落
        
        Args:
            text: 要分割的文本
            max_length: 每个段落的最大长度（默认为配置文件中的值）
            
        Returns:
            List[str]: 分割后的文本段落列表
        """
        if not text:
            return []
            
        # 如果文本长度小于最大长度，直接返回
        if len(text) <= max_length:
            return [text]
            
        # 按句子分割文本（使用 .!? 作为句子结束标志）
        sentences = re.split(r'(?<=[.!?])\s+', text)
        segments = []
        current_segment = ""
        
        for sentence in sentences:
            # 如果当前段落加上这个句子不超过最大长度，则添加到当前段落
            if len(current_segment) + len(sentence) + 1 <= max_length:
                current_segment += (" " if current_segment else "") + sentence
            else:
                # 如果当前段落不为空，先保存
                if current_segment:
                    segments.append(current_segment)
                
                # 处理特别长的句子
                if len(sentence) > max_length:
                    # 按词分割长句子
                    words = sentence.split()
                    current_segment = ""
                    for word in words:
                        if len(current_segment) + len(word) + 1 <= max_length:
                            current_segment += (" " if current_segment else "") + word
                        else:
                            if current_segment:
                                segments.append(current_segment)
                            current_segment = word
                else:
                    # 否则开始新的段落
                    current_segment = sentence
        
        # 添加最后一个段落
        if current_segment:
            segments.append(current_segment)
            
        return segments

class TextMessageProcessor(BaseMessageProcessor):
    """文本消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理文本消息"""
        try:
            # 提取消息内容
            message = request.message
            speaker = request.speaker
            # stream_audio = request.stream_audio
            
            # 记录用户消息
            self.print_user_message(message)
            
            # 保存用户消息
            self.assistant.db_service.save_message("user", message)
            
            # 生成助手回复
            content = await self.assistant.llm_service.generate_response(message)

            # 保存助手消息
            assistant_message_id = self.assistant.db_service.save_message("assistant", content["original_text"])
            
            # 将文本分成较小的段落用于TTS
            text_segments = self.split_text_to_segments(content["original_text"])
            total_segments = len(text_segments)

            # 如果使用ElevenLabs TTS模式，需要切换TTS模式并设置声音ID
            if settings.TTS_SERVICE_MODE == "elevenlabs":
                self.assistant.tts_model.tts_mode = "elevenlabs"
                # 如果特别指定了speaker（前端传递的），我们可以查找对应的ElevenLabs声音ID
                if speaker and speaker != "default":
                    # 这里可以添加一个映射表，将前端的speaker名称映射到ElevenLabs的声音ID
                    elevenlabs_voices = {
                        "male": "ErXwobaYiN019PkySvjV",      # Antoni
                        "female": "21m00Tcm4TlvDq8ikWAM",    # Rachel
                        "child": "XB0fDUnXU5powFXDhCwa",     # Bella
                        # 可以添加更多映射...
                    }
                    # 如果找到对应的声音ID，则设置
                    if speaker in elevenlabs_voices:
                        self.assistant.tts_model.set_elevenlabs_voice(elevenlabs_voices[speaker])
                        debug(f"使用ElevenLabs声音ID: {elevenlabs_voices[speaker]} 对应话语人: {speaker}")
                    else:
                        # 使用默认声音ID
                        self.assistant.tts_model.set_elevenlabs_voice(settings.ELEVENLABS_VOICE_ID)
                        debug(f"未找到匹配的ElevenLabs声音ID，使用默认ID: {settings.ELEVENLABS_VOICE_ID}")
                else:
                    # 使用默认声音ID
                    self.assistant.tts_model.set_elevenlabs_voice(settings.ELEVENLABS_VOICE_ID)
            else:
                # 使用原来的API或本地模式
                self.assistant.tts_model.set_speaker(speaker)
            
            # 准备存储音频段落路径的列表
            audio_paths = []
            
            # 创建流式响应生成器
            async def generate_response_stream():
                # 首先返回文本响应
                text_response = {
                    "type": "text",
                    "message_id": assistant_message_id,
                    "content": content
                }
                yield json.dumps(text_response) + "\n"
                
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
                                segment_path = os.path.join(settings.AUDIO_STORAGE_DIR, segment_filename)

                                debug(f"segment_path: {segment_path}")
                                
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
                                debug(f"{i}：{assistant_message_id}")
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
                    settings.AUDIO_STORAGE_DIR
                )
            
            # 返回流式响应
            return StreamingResponse(
                generate_response_stream(),
                media_type="application/x-ndjson"
            )
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            debug(f"处理文本消息时出错: {e}")
            debug(error_trace)
            
            return JSONResponse(
                status_code=500,
                content={"error": f"处理文本消息失败: {str(e)}", "status": "error"}
            )

class VoiceMessageProcessor(BaseMessageProcessor):
    """语音消息处理器"""
    async def process(self, request: UnifiedChatRequest, background_tasks: BackgroundTasks):
        """处理语音消息"""
        start_time = time.time()
        info(f"开始处理语音消息")
        
        # 获取第一个音频文件
        if not request.files or len(request.files) == 0:
            error("未提供音频文件")
            return JSONResponse(
                status_code=400,
                content={"error": "未提供音频文件", "status": "error"}
            )
        
        # 获取音频文件
        audio_file = request.files[0]
        speaker = request.speaker
        stream_audio = request.stream_audio
        info(f"接收到音频文件: {audio_file.filename}, 类型: {audio_file.content_type}")
        
        # 读取音频数据
        try:
            audio_data = await audio_file.read()
            file_size = len(audio_data)
            info(f"成功读取音频数据, 大小: {file_size} 字节")
            
            # WebM音频文件需要特殊处理
            if audio_file.content_type and 'webm' in audio_file.content_type.lower():
                # 转换为临时WAV文件
                temp_wav_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                temp_webm_file = tempfile.NamedTemporaryFile(delete=False, suffix='.webm')
                
                try:
                    # 保存WebM文件
                    with open(temp_webm_file.name, 'wb') as f:
                        f.write(audio_data)
                    
                    # 使用FFmpeg转换
                    info(f"使用FFmpeg转换WebM到WAV...")
                    import subprocess
                    cmd = [
                        'ffmpeg', '-y', '-i', temp_webm_file.name,
                        '-acodec', 'pcm_s16le',
                        '-ar', '16000',
                        '-ac', '1',
                        # 添加噪声滤波器
                        '-af', 'highpass=f=80,lowpass=f=8000,areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,areverse',
                        temp_wav_file.name
                    ]
                    
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    
                    if result.returncode != 0:
                        error(f"FFmpeg转换失败: {result.stderr}")
                        raise Exception("FFmpeg转换失败")
                    
                    # 读取转换后的WAV文件
                    with open(temp_wav_file.name, 'rb') as f:
                        audio_data = f.read()
                    
                    info(f"WebM到WAV转换成功, 新大小: {len(audio_data)} 字节")
                    
                except Exception as e:
                    error(f"WebM音频转换失败: {e}")
                    # 继续使用原始数据
                finally:
                    # 清理临时文件
                    try:
                        os.unlink(temp_webm_file.name)
                        os.unlink(temp_wav_file.name)
                    except:
                        pass
            
            # 如果数据太小，可能是无效音频
            if file_size < 100:
                error(f"音频数据太小: {file_size} 字节, 可能不是有效的音频文件")
                return JSONResponse(
                    status_code=400,
                    content={"error": "音频数据无效或太小", "status": "error"}
                )
                
        except Exception as e:
            error(f"读取音频数据失败: {e}")
            return JSONResponse(
                status_code=500,
                content={"error": "读取音频数据失败", "status": "error"}
            )
        
        # 这里可以添加更多的音频检查和处理逻辑
        
        # 如果是调试环境，处理样例请求
        if settings.DEV_MODE and audio_file.filename == 'test.wav':
            info("检测到测试音频文件，使用预设转录")
            transcript = "这是一个测试语音信息，请问您今天过得怎么样？"
            
        else:
            # 正常处理音频转录
            debug(f"开始转录音频，数据大小: {file_size} 字节")
            # 保存音频数据到临时文件，便于调试
            temp_file_path = f"/tmp/audio_input_{hash(audio_file.filename)}_{file_size}.bin"
            with open(temp_file_path, "wb") as f:
                f.write(audio_data)
            debug(f"已保存音频数据到临时文件: {temp_file_path}")
            
            try:
                transcript = await self.assistant.transcribe_audio(audio_data)
                
                if not transcript:
                    debug("语音转录失败: 未检测到语音内容")
                    return JSONResponse(
                        status_code=400,
                        content={"error": "未检测到语音内容或转录失败", "status": "error"}
                    )
                
                debug(f"语音转录成功: {transcript}")
            except Exception as e:
                debug(f"转录音频时出错: {e}")
                # 如果转录失败但我们确定有音频数据，使用后备响应
                transcript = "我收到了您的语音消息，但无法转录内容。请问您能以文本形式重新发送您的问题吗？"
                debug(f"使用后备响应: {transcript}")
        
        # 记录用户语音转文本的消息
        self.print_user_message(f"[voice] {transcript}")
        
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
        image_path = os.path.join(settings.IMAGE_STORAGE_DIR, f"{image_id}.jpg")
        
        with open(image_path, "wb") as f:
            f.write(image_data)
        
        # 记录用户图像消息
        user_msg = f"[图像消息]" + (f": {message}" if message else "")
        self.print_user_message(user_msg)
        
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
                image_path = os.path.join(settings.IMAGE_STORAGE_DIR, f"{image_id}.jpg")
                
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
        self.print_user_message(f"[混合消息] {composite_prompt}")
        
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