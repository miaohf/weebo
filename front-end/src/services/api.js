import axios from 'axios';
import { API_URL } from '../config';

// 本地音频缓存管理器
export const AudioCacheManager = {
  DB_NAME: 'audioCache',
  STORE_NAME: 'audioData',
  db: null,

  // 初始化数据库
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'messageId' });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('API层音频缓存数据库初始化成功');
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error('API层音频缓存数据库初始化失败:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  // 保存音频到缓存
  async saveAudio(messageId, audioData, format = 'wav') {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.put({
        messageId,
        audioData,
        format,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => {
        console.log(`API层音频缓存成功: ${messageId}`);
        resolve(true);
      };
      
      request.onerror = (event) => {
        console.error(`API层音频缓存失败: ${messageId}`, event.target.error);
        reject(event.target.error);
      };
    });
  },

  // 从缓存获取音频
  async getAudio(messageId) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.get(messageId);
      
      request.onsuccess = (event) => {
        const result = event.target.result;
        if (result) {
          console.log(`API层从缓存读取音频: ${messageId}`);
          resolve(result);
        } else {
          console.log(`API层缓存中无此音频: ${messageId}`);
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error(`API层读取缓存音频失败: ${messageId}`, event.target.error);
        reject(event.target.error);
      };
    });
  }
};

// 初始化缓存
AudioCacheManager.init().catch(err => console.error('初始化API层音频缓存失败:', err));

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
 * 以流式方式发送聊天消息
 * @param {string} message - 聊天消息文本
 * @param {Array} files - 附加文件数组
 * @param {string} messageType - 消息类型 (text, image, voice等)
 * @param {string} speaker - 合成语音的发言人
 * @param {Function} onChunk - 每接收到一个数据块时的回调函数
 * @param {boolean} streamAudio - 是否流式处理音频，默认为true
 * @returns {Promise<boolean>} 流处理完成后返回 true
 * @throws {Error} 请求失败时抛出错误
 */
export const sendChatMessageStreaming = async (message, files = [], messageType = 'text', speaker = 'default', onChunk, streamAudio = true) => {
  try {
    // 详细记录入参信息
    console.log('======= 发送聊天消息流 =======');
    console.log('消息类型:', messageType);
    console.log('消息内容:', message);
    console.log('files 参数:', files);
    console.log('files 类型:', typeof files);
    console.log('files 是否数组:', Array.isArray(files));
    console.log('files 长度:', files ? files.length : 0);
    
    // 准备JSON数据
    const requestData = {
      message_type: messageType,
      message: message,
      speaker: speaker,
      stream_audio: streamAudio
    };
    
    // 如果有文件，处理文件数据
    if (files && files.length > 0) {
      const file = files[0]; // 目前只处理一个文件
      
      console.log(`检查文件:`, {
        名称: file.name,
        大小: file.size,
        类型: file.type,
        是否File对象: file instanceof File,
        是否Blob对象: file instanceof Blob
      });
      
      if (file instanceof File || file instanceof Blob) {
        // 如果是语音消息，将文件转换为base64
        if (messageType === 'voice') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let base64String = btoa(String.fromCharCode.apply(null, uint8Array));
            
            requestData.audio_data = base64String;
            requestData.audio_mime_type = file.type;
            
            console.log(`✅ 成功转换音频文件为Base64, 长度: ${base64String.length} 字符, MIME类型: ${file.type}`);
          } catch (err) {
            console.error(`❌ 转换音频文件为Base64失败:`, err);
          }
        }
        // 这里可以添加其他类型文件的处理，例如图像
      } else {
        console.error(`❌ 文件不是有效的File或Blob对象:`, file);
      }
    }
    
    // 检查关键参数
    console.log('发送JSON请求:', {
      url: `${API_URL}/chat`,
      方法: 'POST',
      消息类型: messageType,
      有音频数据: Boolean(requestData.audio_data),
      音频数据长度: requestData.audio_data ? requestData.audio_data.length : 0,
      流式音频: streamAudio
    });
    
    // 使用fetch API发送JSON请求
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify(requestData)
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
      
      // console.log("收到流数据块，长度:", text.length);
      
      // 处理完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      // 处理每一行
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            console.log("解析的JSON数据类型:", data.type || "未指定类型", data);
            
            // 特别检查是否有音频数据
            if (data.type === 'audio' || data.audio_data || data.segment_index !== undefined) {
              console.log("检测到音频数据:", data.message_id, "分段:", data.segment_index || 0);
            }
            
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
    // 首先尝试从缓存获取
    const cachedAudio = await AudioCacheManager.getAudio(messageId);
    
    if (cachedAudio) {
      console.log(`API层使用缓存的音频数据播放消息 ${messageId}`);
      // 创建音频对象并播放
      const audio = new Audio();
      audio.src = `data:audio/${cachedAudio.format};base64,${cachedAudio.audioData}`;
      await audio.play();
      return true;
    }
    
    // 缓存中没有，则从API获取
    console.log(`API层缓存中无音频数据，请求服务器获取消息 ${messageId} 的音频`);
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
    
    // 转换为Base64并保存到缓存
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1]; // 去掉前缀
        await AudioCacheManager.saveAudio(messageId, base64data, 'wav');
      };
    } catch (err) {
      console.warn('保存音频到API层缓存失败:', err);
    }
    
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
    // 首先尝试从缓存获取
    const cachedAudio = await AudioCacheManager.getAudio(messageId);
    
    if (cachedAudio) {
      console.log(`API层从缓存获取音频数据: ${messageId}`);
      return {
        message_id: messageId,
        audio_data: cachedAudio.audioData,
        format: cachedAudio.format
      };
    }
    
    // 缓存中没有，从API获取
    console.log(`API层缓存中无音频数据，从服务器获取: ${messageId}`);
    const formData = new FormData();
    formData.append('message_id', messageId);
    
    const response = await axios.post(`${API_URL}/get_audio`, formData);
    
    // 保存到缓存
    if (response.data && response.data.audio_data) {
      try {
        await AudioCacheManager.saveAudio(
          messageId, 
          response.data.audio_data, 
          response.data.format || 'wav'
        );
      } catch (err) {
        console.warn('保存音频到API层缓存失败:', err);
      }
    }
    
    return response.data;
  } catch (error) {
    console.error('获取音频失败:', error);
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