import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from zonos.model import Zonos
from zonos.conditioning import make_cond_dict
from datetime import datetime
import os
import io
import numpy as np
import re
from typing import List, Generator
import json

# 创建FastAPI应用
app = FastAPI()

# 定义请求模型
class TextToSpeechRequest(BaseModel):
    text: str
    speaker: str = "Scarlett"  # 默认使用Scarlett
    language: str = "en-us"
    seed: int = 421

# 新增流式处理请求模型
class StreamTTSRequest(BaseModel):
    text: str
    speaker: str = "Scarlett"
    language: str = "en-us"
    seed: int = 421
    max_segment_length: int = 100  # 最大分段长度

# 初始化模型（全局变量，避免重复加载）
model = Zonos.from_pretrained("Zyphra/Zonos-v0.1-transformer", device="cuda")

# 确保输出目录存在
os.makedirs("outputs", exist_ok=True)

# 文本分段函数
def split_text(text: str, max_length: int = 100) -> List[str]:
    # 如果文本长度小于max_length，直接返回
    if len(text) <= max_length:
        return [text]
    
    # 定义分隔符优先级（从高到低）
    separators = ['. ', '! ', '? ', '; ', ', ', ' ']
    
    segments = []
    while len(text) > max_length:
        # 尝试在max_length位置附近找到合适的分割点
        segment_end = -1
        
        # 按优先级尝试不同的分隔符
        for sep in separators:
            # 在允许范围内寻找最后一个分隔符
            pos = text[:max_length].rfind(sep)
            if pos > 0:  # 找到了分隔符
                segment_end = pos + len(sep)
                break
        
        # 如果没找到任何分隔符，就在词边界处分割
        if segment_end == -1:
            # 寻找最后一个空格
            pos = text[:max_length].rfind(' ')
            if pos > 0:
                segment_end = pos + 1
            else:
                # 实在没有合适位置，就在max_length处强制分割
                segment_end = max_length
        
        # 添加分段并更新剩余文本
        segments.append(text[:segment_end].strip())
        text = text[segment_end:].strip()
    
    # 添加最后一段
    if text:
        segments.append(text)
    
    return segments

# 生成单个音频段的函数
def generate_audio_segment(text: str, speaker: str, language: str, seed: int):
    try:
        # 加载说话人音频
        wav, sampling_rate = torchaudio.load(f"assets/{speaker}.mp3")
        speaker_embedding = model.make_speaker_embedding(wav, sampling_rate)
        
        # 设置随机种子
        torch.manual_seed(seed)
        
        # 生成语音
        cond_dict = make_cond_dict(
            text=text,
            speaker=speaker_embedding,
            language=language
        )
        conditioning = model.prepare_conditioning(cond_dict)
        codes = model.generate(conditioning)
        wavs = model.autoencoder.decode(codes).cpu()
        
        # 将张量转换为NumPy数组
        audio_array = wavs[0].numpy().tolist()
        
        # 创建包含音频数据和采样率的字典
        audio_data = {
            "text": text,
            "audio": audio_array,
            "sample_rate": model.autoencoder.sampling_rate
        }
        
        return audio_data
    
    except Exception as e:
        print(f"Error generating audio segment: {e}")
        return {"error": str(e), "text": text}

@app.post("/tts")
async def generate_speech(request: TextToSpeechRequest):
    try:
        # 加载说话人音频
        wav, sampling_rate = torchaudio.load(f"assets/{request.speaker}.mp3")
        speaker_embedding = model.make_speaker_embedding(wav, sampling_rate)
        
        # 设置随机种子
        torch.manual_seed(request.seed)
        
        # 生成语音
        cond_dict = make_cond_dict(
            text=request.text,
            speaker=speaker_embedding,
            language=request.language
        )
        conditioning = model.prepare_conditioning(cond_dict)
        codes = model.generate(conditioning)
        wavs = model.autoencoder.decode(codes).cpu()
        
        # 将音频数据写入内存缓冲区
        buffer = io.BytesIO()
        torchaudio.save(buffer, wavs[0], model.autoencoder.sampling_rate, format="wav")
        buffer.seek(0)
        
        # 返回音频数据
        return Response(
            content=buffer.read(),
            media_type="audio/wav"
        )
    
    except Exception as e:
        # 打印详细错误信息
        print(f"Error generating speech: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 新增流式TTS端点
@app.post("/tts_stream")
async def stream_tts(request: StreamTTSRequest):
    # 分割文本
    segments = split_text(request.text, request.max_segment_length)
    print(f"Text split into {len(segments)} segments")
    
    async def generate_stream():
        for i, segment in enumerate(segments):
            # 生成此段的音频
            audio_data = generate_audio_segment(
                segment, 
                request.speaker, 
                request.language, 
                request.seed + i  # 为每段使用不同的种子以增加变化
            )
            
            # 添加段落索引信息
            audio_data["segment_index"] = i
            audio_data["total_segments"] = len(segments)
            
            # 将字典转换为JSON并发送
            yield json.dumps(audio_data) + "\n"
    
    # 使用StreamingResponse返回流式响应
    return StreamingResponse(
        generate_stream(),
        media_type="application/x-ndjson"  # 使用换行分隔的JSON格式
    )

# 如果直接运行此文件
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# curl -X POST "http://localhost:8001/generate_speech" \
#      -H "Content-Type: application/json" \
#      -d '{"text": "Hello, world!", "speaker": "Scarlett"}'


# curl -X POST "http://localhost:8001/generate_speech" \
#      -H "Content-Type: application/json" \
#      -d '{"text": "Hello, world!", "speaker": "Scarlett"}' \
#      --output output.wav
