import React, { useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import ChatBubble from '../ChatBubble';
import './Message.css';

const Message = ({ message, showChinese, onPlayAudio, onReplayAudio, isPlaying }) => {
  const { message_id, content, role, status, segment_index, total_segments } = message;
  const isAssistant = role === 'assistant';
  const [isLoading, setIsLoading] = useState(false);
  
  // 检查是否收到所有音频分片
  const isAudioComplete = !total_segments || (segment_index !== undefined && total_segments && segment_index === total_segments - 1);
  
  // 添加调试日志
  // console.log("Message 渲染:", { 
  //   messageId: message_id, 
  //   role, 
  //   showChinese, 
  //   contentType: typeof content,
  //   hasChineseContent: content && typeof content === 'object' && 'chinese' in content,
  //   segment_index,
  //   total_segments,
  //   isAudioComplete
  // });
  
  const handleReplay = async () => {
    if (isPlaying) return; // 如果正在播放，不允许重复点击
    
    console.log("点击重放音频按钮:", {
      messageId: message_id,
      hasReplayCallback: typeof onReplayAudio === 'function',
      hasPlayCallback: typeof onPlayAudio === 'function'
    });
    
    try {
      setIsLoading(true);
      
      // 首先尝试使用 onReplayAudio
      if (typeof onReplayAudio === 'function') {
        await onReplayAudio(message);
      } 
      // 如果没有 onReplayAudio，则尝试使用 onPlayAudio
      else if (typeof onPlayAudio === 'function' && message_id) {
        await onPlayAudio(message_id);
      }
      else {
        console.warn("没有可用的音频播放方法");
      }
    } catch (error) {
      console.error('音频重放失败:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  let displayContent = null;
  
  if (content) {
    if (typeof content === 'object') {
      if (showChinese && role === 'assistant') {
        displayContent = (
          <>
            <p className="message-english">
              {content.english || ''}
              {isAssistant && status !== 'loading' && isAudioComplete && (
                <button 
                  className={`replay-audio-btn ${isLoading ? 'loading' : ''} ${isPlaying ? 'playing' : ''}`}
                  onClick={handleReplay}
                  disabled={isLoading || isPlaying}
                  title={isLoading ? "获取语音中..." : isPlaying ? "正在播放..." : "重新播放语音"}
                >
                  {isLoading ? <span className="loading-spinner" /> : <FaVolumeUp />}
                </button>
              )}
            </p>
            {content.chinese && content.chinese !== content.english && (
              <p className="message-chinese">{content.chinese}</p>
            )}
          </>
        );
      } else {
        displayContent = (
          <p>
            {content.english || ''}
            {isAssistant && status !== 'loading' && isAudioComplete && (
              <button 
                className={`replay-audio-btn ${isLoading ? 'loading' : ''} ${isPlaying ? 'playing' : ''}`}
                onClick={handleReplay}
                disabled={isLoading || isPlaying}
                title={isLoading ? "获取语音中..." : isPlaying ? "正在播放..." : "重新播放语音"}
              >
                {isLoading ? <span className="loading-spinner" /> : <FaVolumeUp />}
              </button>
            )}
          </p>
        );
      }
    } else {
      displayContent = <p>{content}</p>;
    }
  }
  
  return (
    <div className={`message-container ${role || 'unknown'}`}>
      <div className="message-content">
        <ChatBubble 
          message={
            <>
              {displayContent}
              {status === 'loading' && (
                <div className="loading-indicator">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              )}
            </>
          } 
          isUser={!isAssistant}
        />
        
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