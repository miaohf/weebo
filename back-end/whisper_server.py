from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import uvicorn
from tempfile import NamedTemporaryFile

app = FastAPI()

# 加载 faster-whisper 模型
model = WhisperModel(
    "small",
    device="cuda",  # 使用 GPU，如果用 CPU 则设为 "cpu"
    compute_type="float16"  # 可选 "float32", "float16", "int8"
)

@app.post("/transcribe/")
async def transcribe_audio(file: UploadFile = File(...)):
    # 保存上传的音频文件
    with NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.close()
        
        # 使用 faster-whisper 进行转录
        segments, info = model.transcribe(
            tmp.name,
            beam_size=5,
            language="zh"  # 可以指定语言，如果不指定则自动检测
        )
        
        # 合并所有文本段
        text = " ".join([segment.text for segment in segments])
        return {"text": text}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)