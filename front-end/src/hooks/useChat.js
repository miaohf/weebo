import { useState, useCallback, useRef } from 'react';
import { API_URL } from '../App';

const useChat = () => {
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chatMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showChinese, setShowChinese] = useState(false);
  
  const errorTimeoutRef = useRef(null);
  const recentMessageIds = useRef([]);

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
          english: content.english || '', 
          chinese: content.chinese || '',
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
           lastContent.english === newContent.english) ||
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

  // 处理聊天请求
  const handleChatRequest = useCallback(async (message, speaker = 'default') => {
    setIsProcessing(true);
    setError(null);

    try {
      // 添加用户消息
      addMessage('user', message);
      
      // 发送聊天请求
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          speaker: speaker,
          stream_audio: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }
      
      // 创建响应读取器
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessageId = null; // 用于存储后端返回的消息ID
      
      // 处理流数据
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            
            switch (data.type) {
              case 'text':
                console.log('收到文本响应，消息ID:', data.message_id, '内容:', data.content);
                // 保存后端提供的消息ID
                assistantMessageId = data.message_id;
                
                // 添加助手消息，使用后端提供的ID
                addMessage('assistant', data.content, assistantMessageId);
                break;
                
              case 'audio':
                console.log(`收到音频段落 ${data.segment_index+1}/${data.total_segments}`);
                
                // 确保使用一致的消息ID
                if (!data.message_id && assistantMessageId) {
                  data.message_id = assistantMessageId;
                }
                
                // 这里应该调用processAndPlayAudio，但我们将在App.js中处理
                break;
                
              case 'audio_complete':
                console.log(`音频处理完成，消息ID: ${data.message_id}，总段落数: ${data.total_segments}`);
                // 可以在这里添加完成后的处理逻辑，比如更新UI状态
                setIsProcessing(false);
                break;
                
              case 'error':
                console.error('处理错误:', data.message);
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
      console.error('聊天请求失败:', error);
      setError(`聊天请求失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage]);

  // 清除历史记录
  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem('chatMessages');
  }, []);

  // 导出聊天历史功能
  const exportChatHistory = useCallback(() => {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        messages: messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : {
            english: msg.content.english || '',
            chinese: msg.content.chinese || ''
          },
          timestamp: msg.timestamp
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-history-${new Date().toISOString().slice(0,10)}.json`;
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

  return {
    messages,
    setMessages,
    addMessage,
    handleChatRequest,
    clearHistory,
    exportChatHistory,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    showChinese,
    setShowChinese
  };
};

export default useChat; 