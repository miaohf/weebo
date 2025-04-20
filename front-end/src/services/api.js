import axios from 'axios';
import { API_URL } from '../config';

// 本地音频缓存管理器
export const AudioCacheManager = {
  DB_NAME: 'audioCache',
  STORE_NAME: 'audioData',
  db: null,
  isInitialized: false, // 添加初始化标志

  // 初始化数据库
  async init() {
    // 如果已经初始化过，直接返回已有的数据库连接
    if (this.isInitialized && this.db) {
      return this.db;
    }

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
        this.isInitialized = true; // 标记为已初始化
        //console.log('API层音频缓存数据库初始化成功');
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error('音频缓存数据库初始化失败:', event.target.error);
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
        resolve(true);
      };
      
      request.onerror = (event) => {
        console.error(`音频缓存失败: ${messageId}`, event.target.error);
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
          resolve(result);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error(`读取缓存音频失败: ${messageId}`, event.target.error);
        reject(event.target.error);
      };
    });
  },
  
  // 清理过期缓存
  async cleanExpiredCache(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天过期
    if (!this.db) await this.init();
    
    const now = Date.now();
    const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    
    return new Promise((resolve) => {
      const request = store.openCursor();
      let deletedCount = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          if (now - data.timestamp > maxAge) {
            store.delete(cursor.key);
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
    });
  }
};

// 初始化缓存 - 应用启动时执行一次初始化
AudioCacheManager.init().catch(err => console.error('初始化音频缓存失败:', err));

// 定期清理缓存 - 只有在数据库已初始化的情况下才执行清理
const cleanupInterval = setInterval(() => {
  if (AudioCacheManager.isInitialized) {
    AudioCacheManager.cleanExpiredCache()
      .then(count => {
        //if (count > 0) {
        //  console.log(`API层定期清理: 删除了 ${count} 条过期音频缓存`);
        //}
      })
      .catch(err => console.error('清理缓存失败:', err));
  }
}, 24 * 60 * 60 * 1000); // 24小时清理一次

// 确保在应用关闭时清理定时器
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    clearInterval(cleanupInterval);
  });
}

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
      
      if (file instanceof File || file instanceof Blob) {
        // 如果是语音消息，将文件转换为base64
        if (messageType === 'voice') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            
            // 使用更可靠的方式处理大型二进制数据
            let binary = '';
            const bytes = new Uint8Array(arrayBuffer);
            const len = bytes.byteLength;
            // 直接处理字节数据，避免使用String.fromCharCode
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64String = btoa(binary);
            
            requestData.audio_data = base64String;
            requestData.audio_mime_type = file.type;
          } catch (err) {
            console.error(`❌ 转换音频文件为Base64失败:`, err);
          }
        }
        // 这里可以添加其他类型文件的处理，例如图像
      } else {
        console.error(`❌ 文件不是有效的File或Blob对象:`, file);
      }
    }
    
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
      
      // 处理完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      // 处理每一行
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            
            // 特别检查是否有音频数据
            if (data.type === 'audio' || data.audio_data || data.segment_index !== undefined) {
              // 检测到音频数据
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