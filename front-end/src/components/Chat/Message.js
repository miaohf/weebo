import React, { useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa'; // 确保已安装 react-icons
import './Message.css';

const Message = ({ message, showChinese, onPlayAudio, onReplayAudio }) => {
  // 在组件内添加额外调试
  console.log("完整消息对象:", message);
  console.log("消息是否包含音频:", !!message.audio, !!message.audio_data, !!message.audio_path);
  
  // 添加调试日志，检查收到的消息对象
  console.log("Message组件接收到消息:", message);
  
  // 解构消息内容
  const { message_id, content, audio, role, status } = message;
  
  // 确定要显示的文本内容
  let displayContent = null;
  
  if (content) {
    if (typeof content === 'object') {
      if (showChinese && role === 'assistant') {
        // 助手消息 + 显示中文：显示中英文
        displayContent = (
          <>
            <p className="message-english">{content.english || ''}</p>
            {content.chinese && content.chinese !== content.english && (
              <p className="message-chinese">{content.chinese}</p>
            )}
          </>
        );
      } else {
        // 默认情况（用户消息或不显示中文）：只显示英文
        displayContent = <p>{content.english || ''}</p>;
      }
    } else {
      // 如果是字符串类型，直接显示
      displayContent = <p>{content}</p>;
    }
  }
  
  // 检查音频属性并显示更多信息
  const hasAudio = !!audio && (audio.path || audio.data);
  console.log("消息ID:", message.message_id, "是否有音频:", hasAudio);
  
  // 决定是否显示中文（仅对助手消息）
  const shouldShowChinese = role === 'assistant' && showChinese && content && content.chinese && content.chinese !== content.english;
  
  // 明确设置消息角色的CSS类
  const messageClass = `message ${role || message.role || 'unknown'} ${shouldShowChinese ? 'show-chinese' : ''}`;
    
  const isAssistant = role === 'assistant';
  
  const [isLoading, setIsLoading] = useState(false);
  
  const handleReplay = async () => {
    try {
      setIsLoading(true);  // 开始加载
      console.log('完整消息对象:', message);
      if (typeof onReplayAudio === 'function') {
        await onReplayAudio(message);
      }
    } catch (error) {
      console.error('音频重放失败:', error);
    } finally {
      setIsLoading(false);  // 结束加载
    }
  };

  return (
    <div className={messageClass} id={`msg-${message_id}`}>
      <div className="message-content">
        {status === 'loading' && (
          <div className="loading-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        {displayContent}
        
        {/* 音频播放按钮 */}
        {hasAudio && (
          <button 
            className="play-audio-btn"
            onClick={() => onPlayAudio(message_id)}
          >
            播放音频
          </button>
        )}
        
        {/* 如果有图像，显示图像 */}
        {message.images && message.images.length > 0 && (
          <div className="message-images">
            {message.images.map((img, index) => (
              <img 
                key={index} 
                src={img.path} 
                alt={img.description || '图像'} 
                className="message-image"
              />
            ))}
          </div>
        )}
        
        {/* 助手消息才显示语音按钮 */}
        {isAssistant && (
          <button 
            className={`replay-audio-btn ${isLoading ? 'loading' : ''}`}
            onClick={() => handleReplay()}
            disabled={isLoading}
            title={isLoading ? "获取语音中..." : "重新播放语音"}
          >
            {isLoading ? <span className="loading-spinner" /> : <FaVolumeUp />}
          </button>
        )}
      </div>
    </div>
  );
};

export default Message; 