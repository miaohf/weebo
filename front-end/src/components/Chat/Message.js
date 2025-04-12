import React, { useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import ChatBubble from '../ChatBubble';
import './Message.css';

const Message = ({ message, showChinese, onPlayAudio, onReplayAudio, isPlaying }) => {
  const { message_id, content, audio, role, status } = message;
  
  let displayContent = null;
  
  if (content) {
    if (typeof content === 'object') {
      if (showChinese && role === 'assistant') {
        displayContent = (
          <>
            <p className="message-english">{content.english || ''}</p>
            {content.chinese && content.chinese !== content.english && (
              <p className="message-chinese">{content.chinese}</p>
            )}
          </>
        );
      } else {
        displayContent = <p>{content.english || ''}</p>;
      }
    } else {
      displayContent = <p>{content}</p>;
    }
  }
  
  const isAssistant = role === 'assistant';
  const [isLoading, setIsLoading] = useState(false);
  
  const handleReplay = async () => {
    if (isPlaying) return; // 如果正在播放，不允许重复点击
    
    try {
      setIsLoading(true);
      if (typeof onReplayAudio === 'function') {
        await onReplayAudio(message);
      }
    } catch (error) {
      console.error('音频重放失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`message-container ${role || 'unknown'}`}>
      <div className="message-content">
        <ChatBubble 
          message={
            <>
              {displayContent}
              {audio && (
                <button 
                  className={`replay-audio-btn ${isLoading ? 'loading' : ''} ${isPlaying ? 'playing' : ''}`}
                  onClick={handleReplay}
                  disabled={isLoading || isPlaying}
                  title={isLoading ? "获取语音中..." : isPlaying ? "正在播放..." : "重新播放语音"}
                >
                  {isLoading ? <span className="loading-spinner" /> : <FaVolumeUp />}
                </button>
              )}
            </>
          } 
          isUser={!isAssistant}
        />
        
        {status === 'loading' && (
          <div className="loading-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
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
      </div>
    </div>
  );
};

export default Message;