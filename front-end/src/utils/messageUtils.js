// 文本分段工具，将长文本分成句子
export function splitTextIntoSegments(text, maxLength = 500) {
  if (!text || text.length <= maxLength) {
    return [text];
  }
  
  // 使用句号、感叹号、问号作为分割点
  const sentences = text.split(/(?<=[.!?])\s+/);
  const segments = [];
  let currentSegment = '';
  
  for (const sentence of sentences) {
    if ((currentSegment + sentence).length <= maxLength) {
      currentSegment += (currentSegment ? ' ' : '') + sentence;
    } else {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      currentSegment = sentence;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment);
  }
  
  return segments;
}

// 处理流式响应数据
export async function processStreamData(reader, callbacks) {
  const { onTextMessage, onAudioMessage, onError, onComplete } = callbacks;
  const decoder = new TextDecoder();
  let buffer = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一个可能不完整的行
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const data = JSON.parse(line);
          
          switch (data.type) {
            case 'text':
              if (onTextMessage) onTextMessage(data);
              break;
              
            case 'audio':
              if (onAudioMessage) onAudioMessage(data);
              break;
              
            case 'audio_complete':
              if (onComplete) onComplete(data);
              break;
              
            case 'error':
              if (onError) onError(data.message);
              break;
              
            default:
              console.warn('收到未知类型的消息:', data);
          }
        } catch (error) {
          console.error('解析响应数据失败:', error, line);
          if (onError) onError('解析响应数据失败');
        }
      }
    }
    
    if (onComplete) onComplete();
  } catch (error) {
    console.error('处理流数据失败:', error);
    if (onError) onError(error.message);
  }
}

// 生成唯一ID
export function generateId(prefix = '') {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
} 