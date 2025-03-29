import { API_URL } from '../config';

// 发送聊天请求
export async function sendChatRequest(message, speaker, streamAudio = true) {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      speaker,
      stream_audio: streamAudio
    })
  });
  
  if (!response.ok) {
    throw new Error(`服务器错误: ${response.status}`);
  }
  
  return response.body.getReader();
}

// 获取单个消息的音频
export async function fetchMessageAudio(messageId) {
  const response = await fetch(`${API_URL}/get_audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_id: messageId })
  });
  
  if (!response.ok) {
    throw new Error(`获取音频失败: ${response.status}`);
  }
  
  return response.json();
} 