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
  
  // 添加详细调试日志
  console.log("Message 渲染详情:", { 
    messageId: message_id, 
    role, 
    showChinese, 
    contentType: typeof content,
    content: content,
    contentKeys: content && typeof content === 'object' ? Object.keys(content) : [],
    hasEnglish: content && typeof content === 'object' && 'english' in content,
    hasChinese: content && typeof content === 'object' && 'chinese' in content,
    hasOriginalText: content && typeof content === 'object' && 'original_text' in content,
    hasTranslatedText: content && typeof content === 'object' && 'translated_text' in content,
    segment_index,
    total_segments,
    isAudioComplete
  });
  
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
  
  // 统一获取消息内容的函数
  const getMessageContent = () => {
    if (!content) return { original: '', translated: '' };
    
    if (typeof content === 'string') {
      return { original: content, translated: content };
    }
    
    // 适配不同的消息格式
    let original = '';
    let translated = '';
    
    if ('original_text' in content) {
      original = content.original_text || '';
    } else if ('english' in content) {
      original = content.english || '';
    } else if ('text' in content) {
      original = content.text || '';
    }
    
    if ('translated_text' in content) {
      translated = content.translated_text || '';
    } else if ('chinese' in content) {
      translated = content.chinese || '';
    } else {
      translated = original; // 如果没有翻译，默认与原文相同
    }
    
    return { original, translated };
  };
  
  // 获取消息内容
  const { original, translated } = getMessageContent();
  
  let displayContent = null;
  
  if (showChinese && role === 'assistant') {
    // 显示双语内容
    displayContent = (
      <>
        <p className="message-orginal">
          {original || ''}
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
        {translated && translated !== original && (
          <p className="message-translated">{translated}</p>
        )}
      </>
    );
  } else {
    // 只显示原文内容
    displayContent = (
      <p>
        {original || ''}
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