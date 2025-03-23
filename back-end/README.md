# Weebo

A real-time speech-to-speech chatbot powered by Whisper Small, Llama 3.2, and Kokoro-82M.

Works on Apple Silicon.

Learn more [here](https://amanvir.com/weebo).

## Features

- Continuous speech recognition using Whisper MLX
- Natural language responses via Llama
- Real-time text-to-speech synthesis with Kokoro-82M
- Support for different voices
- Streaming response generation

## Setup

Download required models:

- [`kokoro-v0_19.onnx`](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx) (TTS model):
  `wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx`
- Pull the llama3.2 model using Ollama: `ollama pull llama3.2`
- for Mac: `brew install espeak-ng` 
- for Mac: `export ESPEAK_DATA_PATH=/opt/homebrew/share/espeak-ng-data`

## Usage

Run the chatbot:

```bash
uv run --python 3.12 --with-requirements requirements.txt main.py
```

The program will start listening for voice input. Speak naturally and wait for a brief pause - the bot will respond with synthesized speech. Press Ctrl+C to stop.

Alternatively, create an environment and install the requirements:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```
