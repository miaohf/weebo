# AI助手后端服务

基于FastAPI的智能对话助手后端服务，支持多种LLM服务和TTS引擎。

## 项目结构

```
back-end/
├── api/                  # API接口层
│   ├── dependencies/     # 依赖注入
│   └── routes/           # 路由模块
├── core/                 # 核心配置
│   ├── config.py         # 配置管理
│   └── exceptions.py     # 异常处理
├── models/               # 数据模型
│   ├── database/         # 数据库模型
│   ├── schemas/          # API模式
│   └── ai/               # AI模型
├── services/             # 业务服务层
├── utils/                # 工具函数
├── resources/            # 资源文件
├── app.py                # 应用入口点
└── requirements.txt      # 依赖包列表
```

## 配置说明

系统支持多种服务模式配置：

### LLM服务配置

- `LLM_SERVICE_MODE`: 可选 "ollama" 或 "deepseek"

### TTS服务配置

- `TTS_SERVICE_MODE`: 可选 "api", "elevenlabs", "kokoro" 或 "local"

### STT服务配置

- `STT_SERVICE_MODE`: 可选 "api" 或 "whisper"

## 环境变量

可以通过环境变量自定义配置：

```bash
# 基础配置
export PORT=8080
export HOST=0.0.0.0
export ENV=development

# 服务模式
export LLM_SERVICE_MODE=ollama
export TTS_SERVICE_MODE=api
export STT_SERVICE_MODE=api

# API配置
export OLLAMA_API_URL=http://localhost:11434
export OLLAMA_MODEL=gemma3:latest
export DEEPSEEK_API_KEY=your_key_here
export ELEVENLABS_API_KEY=your_key_here
```

## 启动服务

```bash
# 开发模式
python app.py

# 生产模式
export ENV=production
python app.py
```

## 可用端点

- `POST /chat`: 处理聊天请求
- `POST /get_audio`: 获取音频数据
- `GET /sessions`: 获取会话历史

## 开发指南

### 添加新路由

1. 在 `api/routes/` 中创建新的路由模块
2. 在 `api/routes/__init__.py` 中导入新模块
3. 在 `app.py` 中注册新路由

### 添加新服务

1. 在 `services/` 中创建新的服务类
2. 在 `services/__init__.py` 中导出新服务
3. 在依赖项中注册新服务

## 依赖库

主要依赖库：

- FastAPI: Web框架
- Uvicorn: ASGI服务器
- SQLAlchemy: ORM
- Kokoro: TTS引擎
- ElevenLabs: TTS API
- SoundFile: 音频处理

## 许可证

MIT
