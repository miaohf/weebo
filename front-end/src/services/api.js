import axios from 'axios';
import { API_URL } from '../config';

// 获取消息历史
export const fetchChatHistory = async () => {
  try {
    const response = await axios.get(`${API_URL}/chat/history`);
    return response.data;
  } catch (error) {
    console.error('获取聊天历史失败:', error);
    throw error;
  }
};

/**
 * 发送消息并处理完整的 NDJSON 响应
 * 
 * 注意：此方法不是真正的流式处理。它使用 Axios 的 responseType: 'text' 
 * 接收完整的 NDJSON 格式响应，等待整个响应完成后一次性返回所有数据。
 * 
 * 适用场景：
 * - 响应体积较小或处理时间较短的请求
 * - 不需要实时显示部分响应的场景
 * - 需要兼容不支持 Fetch API 的环境
 * 
 * 如需真正的流式处理（边接收边处理），请使用 sendChatMessageStreaming 方法。
 * 
 * @param {string} message - 要发送的消息文本
 * @param {File[]} files - 要上传的文件数组
 * @param {string} messageType - 消息类型，默认为 'text'
 * @param {string} speaker - 语音发言人，默认为 'default'
 * @returns {Promise<string>} 完整的响应文本，格式为换行符分隔的 JSON 对象
 * @throws {Error} 请求失败时抛出错误
 */
export const sendChatMessage = async (message, files = [], messageType = 'text', speaker = 'default') => {
  try {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('message_type', messageType);
    formData.append('speaker', speaker);
    
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });
    }
    
    // 使用 Axios 的 responseType: 'text' 接收完整的 NDJSON 响应
    // 这不是真正的流式处理，而是等待整个响应完成后一次性返回
    const response = await axios.post(`${API_URL}/chat`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Accept': 'application/x-ndjson'
      },
      responseType: 'text' // 使用text而不是stream
    });
    
    return response.data;
  } catch (error) {
    console.error('发送消息失败:', error);
    throw error;
  }
};

/**
 * 使用 Fetch API 进行真正的流式处理
 * 
 * 此方法实现了真正的流式数据处理，可以在接收到部分数据时就开始处理，
 * 无需等待整个响应完成。特别适合处理长时间运行的请求或大型响应。
 * 
 * 适用场景：
 * - 实时显示生成内容（如 AI 聊天的打字机效果）
 * - 长时间运行的请求需要立即反馈
 * - 大型响应需要分块处理以减少内存占用
 * 
 * @param {string} message - 要发送的消息文本
 * @param {File[]} files - 要上传的文件数组
 * @param {string} messageType - 消息类型，默认为 'text'
 * @param {string} speaker - 语音发言人，默认为 'default'
 * @param {Function} onChunk - 每接收到一个数据块时的回调函数
 * @returns {Promise<boolean>} 流处理完成后返回 true
 * @throws {Error} 请求失败时抛出错误
 */
export const sendChatMessageStreaming = async (message, files = [], messageType = 'text', speaker = 'default', onChunk) => {
  try {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('message_type', messageType);
    formData.append('speaker', speaker);
    
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });
    }
    
    // 使用fetch API代替axios
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/x-ndjson'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    // 获取响应的读取器
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    // 读取数据块
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // 解码二进制数据
      const text = decoder.decode(value, { stream: true });
      buffer += text;
      
      // 处理完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个不完整的行
      
      // 处理每一行
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (onChunk) onChunk(data);
          } catch (e) {
            console.warn('无法解析JSON行:', e, line);
          }
        }
      }
    }
    
    // 处理缓冲区中剩余的数据
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (onChunk) onChunk(data);
      } catch (e) {
        console.warn('无法解析最后的JSON数据:', e, buffer);
      }
    }
    
    return true;
  } catch (error) {
    console.error('流式请求失败:', error);
    throw error;
  }
};

// 播放音频
export const playMessageAudio = async (messageId) => {
  try {
    const response = await axios.get(`${API_URL}/audio/${messageId}`, {
      responseType: 'blob'
    });
    
    // 创建音频对象并播放
    const audioBlob = new Blob([response.data], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    // 播放完成后释放资源
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
    
    await audio.play();
    return true;
  } catch (error) {
    console.error('播放音频失败:', error);
    throw error;
  }
};

// 获取历史音频
export const getMessageAudio = async (messageId) => {
  try {
    const formData = new FormData();
    formData.append('message_id', messageId);
    
    const response = await axios.post(`${API_URL}/get_audio`, formData);
    return response.data;
  } catch (error) {
    console.error('Error fetching audio:', error);
    throw error;
  }
};

// 获取会话历史
export const getSessions = async () => {
  try {
    const response = await axios.get(`${API_URL}/sessions`);
    return response.data;
  } catch (error) {
    console.error('Error fetching sessions:', error);
    throw error;
  }
}; 