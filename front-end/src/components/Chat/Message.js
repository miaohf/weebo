import React, { useState, useEffect } from 'react';
import { FaVolumeUp, FaMicrophone, FaPlay, FaPause } from 'react-icons/fa';
import ChatBubble from '../ChatBubble';
import './Message.css';

const Message = ({ message, showChinese, onPlayAudio, onReplayAudio, isPlaying: propIsPlaying }) => {
  const { message_id, content, role, status, segment_index, total_segments, has_audio, message_type } = message;
  const isAssistant = role === 'assistant';
  const isUserAudio = role === 'user' && (message_type === 'voice' || has_audio);
  const [isLoading, setIsLoading] = useState(false);
  
  // 本地播放状态，用于测试图标切换
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  
  // 综合考虑props和本地状态
  const isPlaying = propIsPlaying || localIsPlaying;
  
  // 检查是否收到所有音频分片
  const isAudioComplete = !total_segments || (segment_index !== undefined && total_segments && segment_index === total_segments - 1);
  
  // 监听音频播放完成事件
  useEffect(() => {
    // 添加音频播放完成事件监听器
    const handleAudioEnded = (event) => {
      // 检查事件是否包含详细信息
      const detail = event.detail || {};
      const eventMessageId = detail.messageId;
      
      console.log(`[${message_id}] 收到音频播放完成事件:`, { 
        eventMessageId,
        currentMessageId: message_id,
        localIsPlaying,
        propIsPlaying
      });
      
      // 如果事件包含消息ID且与当前消息不匹配，则跳过
      if (eventMessageId && eventMessageId !== message_id) {
        console.log(`[${message_id}] 跳过其他消息的播放完成事件`);
        return;
      }
      
      // 不管当前状态如何，都尝试重置播放状态
      if (localIsPlaying) {
        console.log(`[${message_id}] 重置本地播放状态`);
        setLocalIsPlaying(false);
      }
    };
    
    // 监听全局的音频播放完成事件
    window.addEventListener('audio-playback-ended', handleAudioEnded);
    
    // 也可以监听全局播放状态变化
    const handlePlayingChange = () => {
      if (propIsPlaying === false && localIsPlaying === true) {
        console.log(`[${message_id}] 根据props更新播放状态`);
        setLocalIsPlaying(false);
      }
    };
    
    // 立即检查一次
    handlePlayingChange();
    
    return () => {
      // 清理事件监听器
      window.removeEventListener('audio-playback-ended', handleAudioEnded);
    };
  }, [propIsPlaying, localIsPlaying, message_id]);
  
  // 添加一个轮询检查播放状态的机制，确保图标能被正确更新
  useEffect(() => {
    // 只有在本地状态为播放中时才需要检查
    if (!localIsPlaying) return;
    
    console.log(`[${message_id}] 启动播放状态检查定时器`);
    
    // 每500毫秒检查一次播放状态
    const intervalId = setInterval(() => {
      // 如果父组件已经标记为非播放状态，则重置本地状态
      if (propIsPlaying === false && localIsPlaying === true) {
        console.log(`[${message_id}] 定时器检查: 父组件已停止播放，重置本地状态`);
        setLocalIsPlaying(false);
      }
    }, 500);
    
    return () => {
      console.log(`[${message_id}] 清理播放状态检查定时器`);
      clearInterval(intervalId);
    };
  }, [localIsPlaying, propIsPlaying, message_id]);
  
  // 添加详细调试日志
  console.log(`Message [${message_id}] 渲染详情:`, { 
    role, 
    hasAudio: has_audio,
    messageType: message_type,
    propIsPlaying,
    localIsPlaying,
    isPlaying
  });
  
  const handleReplay = async () => {
    console.log(`[${message_id}] 点击音频按钮:`, {
      isPlaying: isPlaying,
      propIsPlaying: propIsPlaying,
      localIsPlaying: localIsPlaying,
      hasReplayCallback: typeof onReplayAudio === 'function',
      hasPlayCallback: typeof onPlayAudio === 'function'
    });
    
    // 如果正在播放，点击应该停止播放
    if (isPlaying) {
      console.log(`[${message_id}] 停止播放音频`);
      // 如果是本地控制的播放状态，则直接停止
      if (localIsPlaying) {
        setLocalIsPlaying(false);
      }
      // 如果是父组件控制的，则通过调用原来的回调函数通知父组件
      if (typeof onReplayAudio === 'function' && propIsPlaying) {
        await onReplayAudio(message);
      }
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 首先尝试使用 onReplayAudio
      if (typeof onReplayAudio === 'function') {
        console.log(`[${message_id}] 使用onReplayAudio开始播放`);
        // 只有在父组件还没有设置播放状态时，才设置本地状态
        if (!propIsPlaying) {
          setLocalIsPlaying(true);
        }
        await onReplayAudio(message);
      } 
      // 如果没有 onReplayAudio，则尝试使用 onPlayAudio
      else if (typeof onPlayAudio === 'function' && message_id) {
        console.log(`[${message_id}] 使用onPlayAudio开始播放`);
        // 只有在父组件还没有设置播放状态时，才设置本地状态
        if (!propIsPlaying) {
          setLocalIsPlaying(true);
        }
        await onPlayAudio(message_id);
      }
      else {
        console.warn(`[${message_id}] 没有可用的音频播放方法`);
        // 仅用于测试图标切换
        setLocalIsPlaying(true);
      }
    } catch (error) {
      console.error(`[${message_id}] 音频播放失败:`, error);
      setLocalIsPlaying(false); // 出错时重置播放状态
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
  
  // 渲染音频控件
  const renderAudioButton = () => {
    const actuallyPlaying = isPlaying === true;
    
    // 调试图标显示
    console.log(`[${message_id}] 渲染音频按钮:`, {
      isPlaying: isPlaying,
      propIsPlaying,
      localIsPlaying,
      shouldShowPauseIcon: actuallyPlaying,
      shouldShowPlayIcon: !actuallyPlaying
    });
    
    if ((isAssistant && status !== 'loading' && isAudioComplete) || isUserAudio) {
      const buttonIcon = isLoading ? (
        <span className="loading-spinner" />
      ) : actuallyPlaying ? (
        <FaPause className="pause-icon" />
      ) : (
        <FaPlay className="play-icon" />
      );
      
      return (
        <button 
          className={`replay-audio-btn ${isLoading ? 'loading' : ''} ${actuallyPlaying ? 'playing' : ''}`}
          onClick={handleReplay}
          disabled={isLoading}
          title={isLoading ? "获取语音中..." : actuallyPlaying ? "正在播放..." : "播放语音"}
        >
          {buttonIcon}
        </button>
      );
    }
    return null;
  };
  
  // 确定显示内容  
  let displayContent = null;
  
  // 判断是否显示用户语音消息
  if (isUserAudio) {
    displayContent = (
      <div className="voice-message">
        <div className="voice-message-icon">
          <FaMicrophone />
        </div>
        <span className="voice-message-text">
          {original || '语音消息'}
        </span>
        <span className="audio-button-wrapper">{renderAudioButton()}</span>
      </div>
    );
  }
  // 显示正常文本消息
  else if (showChinese && role === 'assistant') {
    // 显示双语内容
    displayContent = (
      <>
        <div className="message-text-container">
          <span className="message-text">{original || ''}</span>
          <span className="audio-button-wrapper">{renderAudioButton()}</span>
        </div>
        {translated && translated !== original && (
          <div className="message-text-container">
            <span className="message-text message-translated">{translated}</span>
          </div>
        )}
      </>
    );
  } else {
    // 只显示原文内容
    displayContent = (
      <div className="message-text-container">
        <span className="message-text">{original || ''}</span>
        <span className="audio-button-wrapper">{renderAudioButton()}</span>
      </div>
    );
  }
  
  return (
    <div className={`message-container ${role || 'unknown'} ${isUserAudio ? 'voice-message-container' : ''}`}>
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