import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { playMessageAudio, sendChatMessageStreaming } from '../services/api';
// import axios from 'axios';

// 简化的基于Promise的分片播放器
const PromisePlayer = {
  segmentsByMessage: {}, // 存储格式: { messageId: { 0: segment0, 1: segment1, ... } }
  currentPlayback: {
    messageId: null,
    isPlaying: false,
    maxSegmentSeen: -1  // 记录已经接收到的最大分片索引
  },
  // 添加已播放消息记录
  playedMessages: new Set(),

  // 添加初始化方法
  init() {
    console.log("初始化PromisePlayer");
    // 重置状态
    this.segmentsByMessage = {};
    this.currentPlayback = {
      messageId: null,
      isPlaying: false,
      maxSegmentSeen: -1
    };
    this.playedMessages = new Set();
    this.processedAudioIds = new Set();
  },

  // 添加分片
  addSegment(messageId, segmentIndex, segmentData) {
    console.log(`接收到消息 ${messageId} 的分片 ${segmentIndex}`);

    // 初始化消息分片存储
    if (!this.segmentsByMessage[messageId]) {
      this.segmentsByMessage[messageId] = {};
    }

    // 保存分片
    this.segmentsByMessage[messageId][segmentIndex] = segmentData;

    // 更新已接收的最大分片索引
    if (this.currentPlayback.messageId === messageId) {
      this.currentPlayback.maxSegmentSeen = Math.max(
        this.currentPlayback.maxSegmentSeen,
        segmentIndex
      );
    }

    // 如果是新消息的第一个分片，只有当消息未被播放过时才开始播放
    if (segmentIndex === 0 &&
        !this.playedMessages.has(messageId) &&
        (!this.currentPlayback.isPlaying || this.currentPlayback.messageId !== messageId)) {
      console.log(`收到分片0，开始播放消息 ${messageId}`);
      // 这里不直接调用startPlayback，而是通过外部控制播放
      // this.startPlayback(messageId);
      return true; // 返回标识表示这是首次收到第一个分片
    }
    
    return false;
  },

  // 开始播放
  startPlayback(messageId) {
    console.log(`准备播放消息 ${messageId} 的音频`);
    
    // 检查是否已经播放过这条消息
    if (this.playedMessages.has(messageId)) {
      console.log(`消息 ${messageId} 已经播放过，跳过重复播放`);
      return false;
    }
    
    // 如果正在播放，先停止
    if (this.currentPlayback.isPlaying) {
      console.log(`停止当前播放，开始新消息 ${messageId}`);
      this.stopPlayback();
    }

    // 设置新的播放上下文
    this.currentPlayback = {
      messageId,
      isPlaying: true,
      maxSegmentSeen: -1
    };
    
    // 标记此消息已开始播放
    this.playedMessages.add(messageId);

    // 查找当前已接收的最大分片索引
    const segments = this.segmentsByMessage[messageId] || {};
    const segmentIndices = Object.keys(segments).map(Number);
    this.currentPlayback.maxSegmentSeen = Math.max(
      ...segmentIndices.concat(-1)
    );

    console.log(`开始播放消息 ${messageId}，已接收到的最大分片索引: ${this.currentPlayback.maxSegmentSeen}`);

    // 确保有分片可播放，并立即开始播放
    if (this.currentPlayback.maxSegmentSeen >= 0) {
      // 启动播放链
      this.playSequence(messageId, 0);
    } else {
      console.log(`消息 ${messageId} 暂无可播放的音频分片，等待数据...`);
      // 等待分片数据 - 减少等待时间以加快响应
      setTimeout(() => {
        if (this.segmentsByMessage[messageId] && Object.keys(this.segmentsByMessage[messageId]).length > 0) {
          this.playSequence(messageId, 0);
        } else {
          console.log(`等待超时，暂无音频分片`);
          this.currentPlayback.isPlaying = false;
        }
      }, 500); // 缩短等待时间
    }
    
    return true;
  },

  // 播放序列
  async playSequence(messageId, startIndex) {
    // 如果消息ID不匹配，或者不再播放状态，停止
    if (this.currentPlayback.messageId !== messageId || !this.currentPlayback.isPlaying) {
      console.log(`播放已停止，跳过剩余分片`);
      return;
    }

    const segments = this.segmentsByMessage[messageId] || {};

    // 尝试播放从startIndex开始的所有分片
    let currentIndex = startIndex;

    // 使用while循环和await顺序播放
    while (segments[currentIndex]) {
      try {
        console.log(`准备播放分片 ${currentIndex}`);
        await this.playSingleSegment(segments[currentIndex]);
        console.log(`分片 ${currentIndex} 播放完成`);
        currentIndex++;
      } catch (error) {
        console.error(`播放分片 ${currentIndex} 失败:`, error);
        // 失败后继续尝试下一个分片
        currentIndex++;
      }
    }

    // 如果播放到了当前接收的最后一个分片，但还可能有更多分片未接收
    if (currentIndex > this.currentPlayback.maxSegmentSeen && segments[0]?.total_segments > currentIndex) {
      console.log(`已播放所有接收的分片 (0-${this.currentPlayback.maxSegmentSeen})，等待更多分片...`);

      // 设置一个检查器，每秒检查是否有新分片
      const waitForMoreSegments = () => {
        // 如果消息ID变化或不再播放，取消等待
        if (this.currentPlayback.messageId !== messageId || !this.currentPlayback.isPlaying) {
          return;
        }

        // 检查是否有新分片
        if (this.currentPlayback.maxSegmentSeen >= currentIndex) {
          console.log(`检测到新分片，继续播放`);
          this.playSequence(messageId, currentIndex);
        } else {
          // 继续等待
          setTimeout(waitForMoreSegments, 500);
        }
      };

      // 开始等待检查
      setTimeout(waitForMoreSegments, 500);
    } else {
      // 所有分片都已播放完成
      console.log(`消息 ${messageId} 的所有分片播放完成`);
      this.currentPlayback.isPlaying = false;
    }
  },

  // 播放单个分片，返回Promise
  playSingleSegment(segment) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`准备播放音频片段，数据长度: ${segment.audio_data.length}`);
        
        // 创建新的Audio元素
        const audio = new Audio();
        
        // 设置事件监听器
        audio.onended = () => {
          console.log(`音频播放完成`);
          // 延迟解析Promise，确保浏览器完全处理了播放结束事件
          setTimeout(() => {
            resolve();
          }, 50);
        };
        
        audio.onerror = (e) => {
          console.error(`音频播放错误:`, e, audio.error);
          reject(new Error(`播放错误: ${audio.error?.message || '未知错误'}`));
        };
        
        // 调试 - 添加可以音频加载事件
        audio.onloadeddata = () => {
          console.log(`音频数据已加载，准备播放`);
        };
        
        // 设置音频源
        const base64Audio = segment.audio_data;
        audio.src = `data:audio/wav;base64,${base64Audio}`;
        console.log(`音频源已设置，尝试播放`);
        
        // 添加到文档中以防止被GC回收
        document.body.appendChild(audio);
        
        // 播放音频
        const playPromise = audio.play();
        
        // 现代浏览器返回播放Promise
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error(`播放启动失败:`, error);
            // 播放失败时移除元素
            document.body.removeChild(audio);
            reject(error);
          });
        }
        
        // 当播放完成后移除元素
        audio.addEventListener('ended', () => {
          // 延迟移除元素以确保事件处理完毕
          setTimeout(() => {
            if (document.body.contains(audio)) {
              document.body.removeChild(audio);
            }
          }, 100);
        });
      } catch (error) {
        console.error(`设置音频播放失败:`, error);
        reject(error);
      }
    });
  },

  // 停止当前播放
  stopPlayback() {
    this.currentPlayback.isPlaying = false;
  }
};

const useChat = () => {
  // 尝试从 localStorage 加载消息历史
  const loadInitialMessages = () => {
    try {
      const savedMessages = localStorage.getItem('chatMessages');
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (error) {
      console.error('加载聊天历史失败:', error);
      return [];
    }
  };
  
  // 尝试从 localStorage 加载设置
  const loadSettings = (key, defaultValue) => {
    try {
      const savedSetting = localStorage.getItem(key);
      return savedSetting !== null ? JSON.parse(savedSetting) : defaultValue;
    } catch (error) {
      console.error(`加载设置 ${key} 失败:`, error);
      return defaultValue;
    }
  };
  
  // 保存设置到 localStorage
  const saveSettings = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`保存设置 ${key} 失败:`, error);
    }
  };

  const [messages, setMessages] = useState(loadInitialMessages());
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showChinese, setShowChinese] = useState(loadSettings('showChinese', false));
  
  const recentMessageIds = useRef([]);

  // 在 useChat.js 顶部添加一个缓存对象用于存储音频分片
  const [audioSegmentsCache, setAudioSegmentsCache] = useState({});
  const [currentPlayback, setCurrentPlayback] = useState({
    messageId: null,
    currentSegment: -1,
    isPlaying: false,
    waitingForSegment: null
  });

  // 使用多个 Ref 来维护状态，避免 React 状态更新的异步性
  const segmentCacheRef = useRef({});  // 存储所有分片
  const playbackStateRef = useRef({    // 存储播放状态
    messageId: null,
    isPlaying: false,
    currentSegment: -1,
    pendingSegments: []  // 待播放的分片队列
  });

  // 在 useChat 钩子开始处添加自动播放配置
  const [autoPlayAudio, setAutoPlayAudio] = useState(loadSettings('autoPlayAudio', true));

  // 添加一个包装函数来保存 showChinese 状态
  const setShowChineseWithSave = useCallback((value) => {
    const newValue = typeof value === 'function' ? value(showChinese) : value;
    setShowChinese(newValue);
    saveSettings('showChinese', newValue);
  }, [showChinese]);
  
  // 添加一个包装函数来保存 autoPlayAudio 状态
  const setAutoPlayAudioWithSave = useCallback((value) => {
    const newValue = typeof value === 'function' ? value(autoPlayAudio) : value;
    setAutoPlayAudio(newValue);
    saveSettings('autoPlayAudio', newValue);
  }, [autoPlayAudio]);

  // 添加切换函数
  const toggleAutoPlay = useCallback(() => {
    setAutoPlayAudioWithSave(prev => !prev);
  }, [setAutoPlayAudioWithSave]);

  // 将 playAudio 函数移到这里 - 在组件顶层定义
  const playAudio = useCallback(async (messageId) => {
    console.log(`请求播放消息 ${messageId} 的音频`);
    try {
      console.log(`调用 playMessageAudio API 播放消息 ${messageId}`);
      await playMessageAudio(messageId);
      console.log(`消息 ${messageId} 的音频播放请求已发送`);
    } catch (err) {
      console.error(`播放消息 ${messageId} 的音频失败:`, err);
    }
  }, []);

  // 使用函数引用解决循环依赖问题
  const functionRefs = useRef({
    startMessagePlayback: null,
    checkAndQueueNextSegments: null,
    playNextInQueue: null
  });

  // 在 useChat 函数内添加一个新的 ref
  const processedAudioIdsRef = useRef(new Set());

  // 添加消息函数
  const addMessage = useCallback((role, content, messageId = null) => {
    // 生成消息ID（如果没提供）
    const id = messageId || `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // 检查是否是重复消息
    if (recentMessageIds.current.includes(id)) {
      console.warn('检测到重复消息ID，跳过添加:', id);
      return;
    }
    
    console.log(`添加${role}消息，ID:${id}`, content);
    
    // 记录此消息ID
    recentMessageIds.current.push(id);
    // 保持数组长度限制
    if (recentMessageIds.current.length > 20) {
      recentMessageIds.current.shift();
    }
    
    setMessages(prev => {
      const newMessage = {
        id,
        role,
        content: typeof content === 'string' ? content : { 
          original_text: content.original_text || '', 
          translated_text: content.translated_text || '',
          audio: content.audio || null
        },
        timestamp: new Date()
      };
      
      // 检查是否有相同内容的最近消息
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === role) {
        const lastContent = lastMsg.content;
        const newContent = newMessage.content;
        
        // 比较内容是否基本相同
        if (
          (typeof lastContent === 'object' && typeof newContent === 'object' &&
           lastContent.original_text === newContent.original_text) ||
          (typeof lastContent === 'string' && lastContent === newContent)
        ) {
          console.warn('检测到内容相同的消息，跳过添加');
          return prev; // 不添加此消息
        }
      }
      
      // 只保留最新的消息
      const updatedMessages = [...prev, newMessage].slice(-20);
      
      try {
        localStorage.setItem('chatMessages', JSON.stringify(updatedMessages));
      } catch (error) {
        console.error('存储消息失败:', error);
      }
      
      return updatedMessages;
    });
  }, []);

  // 修改 handleAudioData 函数
  const handleAudioData = useCallback(async (messageData) => {
    try {
      const { message_id, segment_index, total_segments, audio_data, sample_rate, original_text, translated_text } = messageData;
      console.log(`处理音频段落 ${segment_index}/${total_segments} for ${message_id}`);
      
      // 更新UI状态
      setMessages(prevMessages => {
        return prevMessages.map(msg => {
          if (msg.id === message_id || msg.message_id === message_id) {
            return {
              ...msg,
              audio_data: audio_data,
              segment_index,
              total_segments,
              message_type: 'audio', // 添加类型标记以识别这是音频消息
              is_audio_segment: true // 添加额外标记以便于检测
            };
          }
          return msg;
        });
      });
      
      // 添加到Promise播放器
      PromisePlayer.addSegment(message_id, segment_index, {
        audio_data,
        sample_rate,
        total_segments,
        original_text,
        translated_text
      });

      // 仅在接收第一个分段且message_id不在正在播放的队列中时触发播放
      if (segment_index === 0 && !PromisePlayer.playedMessages.has(message_id)) {
        console.log(`收到消息 ${message_id} 的第一个音频段落，触发自动播放`);
        
        // 短暂延迟确保UI和音频数据已准备好
        setTimeout(() => {
          if (!PromisePlayer.playedMessages.has(message_id)) {
            console.log('开始自动播放');
            PromisePlayer.startPlayback(message_id);
          }
        }, 100);
      }

    } catch (error) {
      console.error('处理音频数据失败:', error);
      setError('处理音频数据失败');
    }
  }, [setMessages, setError]);

  // 开始播放一条消息的所有分片
  const startMessagePlayback = useCallback((messageId) => {
    console.log(`开始播放消息 ${messageId} 的所有分片`);

    // 重置播放状态
    playbackStateRef.current = {
      messageId,
      isPlaying: true,
      currentSegment: -1,
      pendingSegments: []
    };

    // 检查并添加所有可用分片到队列
    functionRefs.current.checkAndQueueNextSegments(messageId);

    // 开始播放队列
    functionRefs.current.playNextInQueue();
  }, []);

  // 检查并将下一个可用分片添加到队列
  const checkAndQueueNextSegments = useCallback((messageId) => {
    const cache = segmentCacheRef.current[messageId];
    if (!cache) return;

    const playback = playbackStateRef.current;
    const currentSegment = playback.currentSegment;
    const pendingSegments = playback.pendingSegments;

    // 从当前分片开始，检查后续分片是否已接收
    for (let i = currentSegment + 1; i < cache.total; i++) {
      // 如果分片已接收但尚未在队列中
      if (cache.segments[i] && !pendingSegments.includes(i)) {
        console.log(`将分片 ${i} 添加到播放队列`);
        pendingSegments.push(i);
      }
    }

    // 如果播放器空闲且队列不为空，开始播放下一个
    if (!playback.isPlaying && pendingSegments.length > 0) {
      functionRefs.current.playNextInQueue();
    }
  }, []);

  // 播放队列中的下一个分片
  const playNextInQueue = useCallback(() => {
    const playback = playbackStateRef.current;

    // 如果没有待播放的分片，退出
    if (playback.pendingSegments.length === 0) {
      console.log('播放队列为空，播放完成');
      playback.isPlaying = false;
      return;
    }

    // 获取下一个要播放的分片
    const nextSegmentIndex = playback.pendingSegments.shift();
    const messageId = playback.messageId;
    const cache = segmentCacheRef.current[messageId];

    // 检查分片是否存在
    if (!cache || !cache.segments[nextSegmentIndex]) {
      console.error(`分片 ${nextSegmentIndex} 不存在，跳过`);
      functionRefs.current.playNextInQueue(); // 尝试下一个
      return;
    }

    // 更新当前播放分片
    playback.currentSegment = nextSegmentIndex;
    playback.isPlaying = true;

    console.log(`播放分片 ${nextSegmentIndex}/${cache.total}`);

    // 更新UI状态（可选）
    setCurrentPlayback({
      messageId,
      currentSegment: nextSegmentIndex,
      isPlaying: true,
      waitingForSegment: null
    });

    // 播放音频 - 使用外部定义的 playAudio 函数
    if (typeof playAudio === 'function') {
      // 使用 Promise，确保等待播放完成
      playAudio(messageId)
        .then(() => {
          console.log(`分片 ${nextSegmentIndex} 播放完成`);

          // 检查是否是最后一个分片
          if (nextSegmentIndex === cache.total - 1) {
            console.log(`消息 ${messageId} 的所有分片播放完成`);
            playbackStateRef.current.isPlaying = false;

            // 更新UI状态
            setCurrentPlayback({
              messageId: null,
              currentSegment: -1,
              isPlaying: false,
              waitingForSegment: null
            });

            return;
          }

          // 检查是否有新分片到达
          functionRefs.current.checkAndQueueNextSegments(messageId);

          // 继续播放队列中的下一个
          functionRefs.current.playNextInQueue();
        })
        .catch(error => {
          console.error(`播放分片 ${nextSegmentIndex} 失败:`, error);
          // 出错时继续下一个
          functionRefs.current.playNextInQueue();
        });
    } else {
      console.warn("playAudio 不是一个函数，无法播放");
      playbackStateRef.current.isPlaying = false;
    }
  }, [playAudio, setCurrentPlayback]); // 添加 playAudio 作为依赖项

  // 处理聊天请求
  const handleChatRequest = useCallback(async (
    message, 
    files = [], 
    messageType = 'text', 
    speaker = 'default',
    streamAudio = true
  ) => {
    // 在函数作用域顶部声明变量，这样在 try 和 catch 块中都可以访问
    const assistantMessageId = `assistant-${Date.now()}`;
    
    // 详细记录传入的参数
    console.log('=== 处理聊天请求开始 ===');
    console.log('消息类型:', messageType);
    console.log('消息内容:', message);
    console.log('speaker:', speaker);
    console.log('streamAudio:', streamAudio);
    console.log('files 参数类型:', typeof files);
    console.log('files 是否数组:', Array.isArray(files));
    console.log('files 长度:', files ? files.length : 0);
    
    if (messageType === 'voice' && (!files || files.length === 0)) {
      console.error('❌ 错误: 语音消息缺少音频文件!');
    }
    
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        if (file instanceof File || file instanceof Blob) {
          console.log(`文件 ${index}: 大小=${file.size}字节, 类型=${file.type}, 名称=${file.name}`);
        } else {
          console.error(`❌ 错误: 文件 ${index} 不是有效的File或Blob对象:`, file);
        }
      });
    } else if (messageType === 'voice' || messageType === 'image') {
      console.error(`❌ 错误: ${messageType}类型消息但files为空!`);
    }
    
    try {
      setIsLoading(true);
      
      // 添加用户消息 - 统一格式为 english/chinese，确保与服务器返回的格式兼容
      const userMessage = {
        message_id: `user-${Date.now()}`,
        role: 'user',
        message_type: messageType,
        content: {
          original_text: message,
          translated_text: message,
          english: message,
          chinese: message
        },
        status: 'success'
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // 创建初始的助手消息占位符
      // 不再需要在这里声明 assistantMessageId，因为它已经在函数顶部声明
      const initialAssistantMessage = {
        message_id: assistantMessageId,
        role: 'assistant',
        message_type: 'text',
        content: {
          original_text: '',
          translated_text: '',
          english: '',
          chinese: ''
        },
        status: 'loading'
      };
      
      // 添加初始助手消息
      setMessages(prev => [...prev, initialAssistantMessage]);
      
      // 累积的消息对象
      let currentMessage = { ...initialAssistantMessage };
      
      // 记录发送到API的参数
      console.log('准备发送到sendChatMessageStreaming的参数:', {
        message,
        files: files ? `${files.length}个文件` : '无',
        messageType,
        speaker,
        streamAudio
      });
      
      // 使用流式API，提供回调函数处理每个数据块
      await sendChatMessageStreaming(
        message, 
        files, 
        messageType, 
        speaker,
        (chunk) => {
          // 使用 ref 而不是 this
          const processedAudioIds = processedAudioIdsRef.current;
          
          // 检查是否是音频数据
          if ((chunk.type === 'audio' || chunk.audio_data) && chunk.message_id && chunk.segment_index !== undefined) {
            const audioId = `${chunk.message_id}-${chunk.segment_index}`;
            
            // 检查是否已处理过此音频分片
            if (processedAudioIds.has(audioId)) {
              console.log("跳过已处理的音频分片:", audioId);
              return;
            }
            
            // 标记为已处理
            processedAudioIds.add(audioId);
            
            console.log("处理音频数据:", chunk.message_id, chunk.segment_index);
            handleAudioData(chunk);
            return; // 处理完音频数据后直接返回
          }
          
          // 检查并确保chunk包含必要的字段
          if (chunk.content) {
            // 确保content有标准格式
            if (typeof chunk.content === 'string') {
              chunk.content = {
                original_text: chunk.content,
                translated_text: chunk.content
              };
            } else if (typeof chunk.content === 'object') {
              // 确保有original_text和translated_text字段
              if (!chunk.content.original_text && chunk.content.english) {
                chunk.content.original_text = chunk.content.english;
              }
              if (!chunk.content.translated_text && chunk.content.chinese) {
                chunk.content.translated_text = chunk.content.chinese;
              }
            }
          }
          
          // 合并chunk到当前消息
          currentMessage = {
            ...currentMessage,
            ...chunk,
            role: 'assistant',
            status: 'success'
          };
          
          console.log("更新消息内容:", {
            messageId: currentMessage.message_id, 
            contentType: typeof currentMessage.content,
            content: currentMessage.content
          });
          
          // 实时更新UI
          setMessages(prev => 
            prev.map(msg => 
              msg.message_id === assistantMessageId ? currentMessage : msg
            )
          );
        },
        streamAudio
      );
      
      console.log('=== 处理聊天请求完成 ===');
      setIsLoading(false);
    } catch (err) {
      console.error('❌ 发送消息失败:', err);
      setError('发送消息失败');
      setIsLoading(false);
      
      // 现在 assistantMessageId 在这里可以访问
      setMessages(prev => 
        prev.map(msg => 
          msg.message_id === assistantMessageId
            ? { 
                ...msg, 
                content: { 
                  original_text: 'send message error', 
                  translated_text: '发送消息失败',
                  english: 'send message error', 
                  chinese: '发送消息失败' 
                }, 
                status: 'error' 
              }
            : msg
        )
      );
    }
  }, [handleAudioData]);

  // 清除历史记录
  const clearHistory = useCallback(async () => {
    try {
      await fetch(`${API_URL}/chat/clear`, { method: 'POST' });
      setMessages([]);
      
      // 清除本地存储的消息
      localStorage.removeItem('chatMessages');
      console.log('已清除本地存储的聊天记录');
    } catch (err) {
      setError('清空历史失败');
      console.error(err);
    }
  }, []);

  // 导出聊天历史功能
  const exportChatHistory = useCallback(() => {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : {
            english: msg.content.original_text || '',
            chinese: msg.content.translated_text || ''
          },
          timestamp: msg.timestamp
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-history-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setError('聊天记录已导出');
      setTimeout(() => setError(null), 3000);
    } catch (error) {
      console.error('导出失败:', error);
      setError('导出聊天记录失败');
    }
  }, [messages, setError]);

  // 发送音频消息
  const sendAudioMessage = useCallback(async (audioBase64, speaker = 'default') => {
    setIsProcessing(true);
    setError(null);

    try {
      // 添加用户消息
      addMessage('user', '🎤 [语音消息]');
      
      // 发送录音到服务器
      const response = await fetch(`${API_URL}/chat_audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_data: audioBase64,
          speaker: speaker,
          stream_audio: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }
      
      // 处理响应流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessageId = null;
      
      // 处理流数据 - 与文本聊天使用相同逻辑
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        // 处理每一行数据
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            
            // 处理不同类型的消息
            switch (data.type) {
              case 'text':
                assistantMessageId = data.message_id;
                addMessage('assistant', data.content, assistantMessageId);
                break;
                
              case 'audio':                
                if (!data.message_id && assistantMessageId) {
                  data.message_id = assistantMessageId;
                }
                console.log('收到音频数据:', data.segment_index, '/', data.total_segments);
                handleAudioData(data);
                break;
                
              case 'audio_complete':
                setIsProcessing(false);
                break;
                
              case 'error':
                setError(`音频处理错误: ${data.message}`);
                break;
                
              default:
                console.warn('收到未知类型的消息:', data);
            }
          } catch (error) {
            console.error('解析响应数据失败:', error, line);
          }
        }
      }
    } catch (error) {
      console.error('发送音频消息失败:', error);
      setError(`发送音频消息失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage, handleAudioData, setIsProcessing]);

  useEffect(() => {
    // 当消息列表清空时，清理音频缓存
    if (messages.length === 0) {
      setAudioSegmentsCache({});
    }
  }, [messages.length]);

  useEffect(() => {
    return () => {
      // 组件卸载时重置播放状态
      setCurrentPlayback({
        messageId: null,
        currentSegment: -1,
        isPlaying: false,
        waitingForSegment: null
      });
    };
  }, []);

  // 在组件挂载时初始化
  useEffect(() => {
    segmentCacheRef.current = {};
    playbackStateRef.current = {
      messageId: null,
      isPlaying: false,
      currentSegment: -1,
      pendingSegments: []
    };

    // 设置函数引用
    functionRefs.current = {
      startMessagePlayback,
      checkAndQueueNextSegments,
      playNextInQueue
    };

    // 清理函数
    return () => {
      segmentCacheRef.current = {};
      playbackStateRef.current = {
        messageId: null,
        isPlaying: false,
        currentSegment: -1,
        pendingSegments: []
      };
    };
  }, [startMessagePlayback, checkAndQueueNextSegments, playNextInQueue]);

  // 在 useChat 中添加初始化
  useEffect(() => {
    // 初始化播放器
    PromisePlayer.init();

    return () => {
      // 停止播放
      PromisePlayer.stopPlayback();
    };
  }, []);

  // 在 useChat 中确保正确实现了 toggleLanguage 函数
  const toggleLanguage = useCallback(() => {
    console.log("切换语言 - 当前状态:", showChinese);
    setShowChineseWithSave(prev => {
      const newValue = !prev;
      console.log("切换语言 - 新状态:", newValue);
      return newValue;
    });
  }, [showChinese, setShowChineseWithSave]);

  useEffect(() => {
    // 尝试解锁音频自动播放
    const unlockAudio = () => {
      try {
        // 创建一个更可靠的空白音频
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // 设置音量非常低
        gainNode.gain.value = 0.001;
        
        // 连接节点
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 播放非常短的时间
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioContext.close();
          console.log("音频自动播放已解锁");
        }, 100);
        
        // 成功后移除事件监听
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
      } catch (err) {
        console.warn("无法解锁音频自动播放:", err);
        // 即使失败也移除事件监听，避免重复尝试
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
      }
    };
    
    // 添加事件监听器等待用户交互
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    
    // 清理函数
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // 添加调试函数
  const debugAudioPlayback = useCallback((messageId) => {
    console.log("== 音频播放调试信息 ==");
    console.log("当前消息ID:", messageId);
    console.log("PromisePlayer状态:", PromisePlayer.currentPlayback);
    console.log("该消息的音频分片:", PromisePlayer.segmentsByMessage[messageId]);
    console.log("======================");
  }, []);

  // 在 useChat.js 中添加 selectedSpeaker 状态
  const [selectedSpeaker, setSelectedSpeaker] = useState(loadSettings('selectedSpeaker', 'default'));
  
  // 添加一个包装函数来保存 selectedSpeaker 状态
  const setSelectedSpeakerWithSave = useCallback((speaker) => {
    setSelectedSpeaker(speaker);
    saveSettings('selectedSpeaker', speaker);
  }, []);

  // 确保导出包装过的setter函数
  return {
    messages,
    setMessages,
    addMessage,
    handleChatRequest,
    handleAudioData,
    clearHistory,
    exportChatHistory,
    isLoading,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    showChinese,
    setShowChinese: setShowChineseWithSave,
    playAudio,
    audioSegmentsCache,
    currentPlayback,
    toggleLanguage,
    sendAudioMessage,
    autoPlayAudio,
    toggleAutoPlay,
    debugAudioPlayback,
    selectedSpeaker,
    setSelectedSpeaker: setSelectedSpeakerWithSave
  };
};

export default useChat; 