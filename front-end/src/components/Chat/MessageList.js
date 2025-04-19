import React, { useRef, useEffect, useState, useCallback } from 'react';
import Message from './Message';
import { getMessageAudio, AudioCacheManager } from '../../services/api';
import './MessageList.css';

const MessageList = ({ onAudioData, ...props }) => {
  const messagesEndRef = useRef(null);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingMessageId, setCurrentPlayingMessageId] = useState(null);
  const lastMessageIdRef = useRef(null);
  const receivedAudioRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // 初始化AudioCacheManager
  useEffect(() => {
    if (AudioCacheManager && typeof AudioCacheManager.init === 'function') {
      AudioCacheManager.init()
        .then(() => console.log('[MessageList] 音频缓存系统初始化成功'))
        .catch(err => console.error('[MessageList] 音频缓存系统初始化失败:', err));
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const container = document.querySelector('.message-list-container');
      if (!container) return;
      
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isAtBottom) {
        setShowScrollButton(false);
      }
    };
    
    const container = document.querySelector('.message-list-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    if (!props.messages || props.messages.length === 0) return;
    
    const lastMessage = props.messages[props.messages.length - 1];
    const lastMessageId = lastMessage.id || lastMessage.message_id;
    
    const isNewMessage = lastMessageId !== lastMessageIdRef.current;
    
    lastMessageIdRef.current = lastMessageId;
    
    const isAudioMessage = 
      lastMessage.message_type === 'audio' || 
      lastMessage.message_type === 'voice' ||
      lastMessage.is_audio_segment === true ||
      lastMessage.has_audio ||
      lastMessage.audio_data || 
      lastMessage.segment_index !== undefined;
    
    if (isAudioMessage) {
      console.log('收到音频消息，不滚动到底部:', lastMessageId);
      receivedAudioRef.current = true;
      
      if (isNewMessage) {
        setShowScrollButton(true);
      }
      
      return;
    }
    
    if (isNewMessage && !receivedAudioRef.current) {
      console.log('滚动到底部 - 新文本消息:', lastMessageId);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollButton(false);
    }
    
    receivedAudioRef.current = false;
  }, [props.messages]);

  const cleanupAudio = useCallback(() => {
    console.log('[MessageList] 清理音频播放状态:', {
      hasCurrentAudio: !!currentPlayingAudio,
      currentPlayingMessageId
    });
    
    if (currentPlayingAudio) {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
      currentPlayingAudio.onplay = null;
      currentPlayingAudio.onended = null;
      currentPlayingAudio.onerror = null;
    }
    setCurrentPlayingAudio(null);
    setIsPlaying(false);
    setCurrentPlayingMessageId(null);
    
    // 触发自定义事件，通知音频播放结束
    console.log('[MessageList] 触发音频结束事件');
    window.dispatchEvent(new CustomEvent('audio-playback-ended', {
      detail: { messageId: currentPlayingMessageId }
    }));
  }, [currentPlayingAudio, currentPlayingMessageId]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const handleReplayAudio = useCallback(async (message) => {
    const messageId = message.id || message.message_id;
    console.log(`[MessageList] 处理音频播放请求:`, {
      requestedMessageId: messageId, 
      currentPlaying: currentPlayingMessageId,
      isCurrentlyPlaying: isPlaying
    });
    
    // 如果点击的是当前正在播放的消息，停止播放
    if (isPlaying && currentPlayingMessageId === messageId) {
      console.log(`[MessageList] 停止当前播放的音频:`, messageId);
      cleanupAudio();
      return;
    }

    // 如果有其他音频正在播放，先停止
    if (currentPlayingAudio) {
      console.log(`[MessageList] 停止之前播放的音频:`, currentPlayingMessageId);
      cleanupAudio();
    }

    try {
      // 首先尝试从缓存获取合并后的完整音频
      let cachedAudio;
      if (AudioCacheManager && typeof AudioCacheManager.getAudio === 'function') {
        try {
          console.log('[MessageList] 尝试从AudioCacheManager获取合并后的音频', messageId);
          cachedAudio = await AudioCacheManager.getAudio(messageId);
          console.log('[MessageList] 缓存查询结果:', {
            找到缓存: !!cachedAudio,
            音频数据长度: cachedAudio ? cachedAudio.audioData.length : 0,
            格式: cachedAudio ? cachedAudio.format : 'unknown'
          });
        } catch (err) {
          console.warn('[MessageList] 从缓存获取音频失败:', err);
        }
      }
      
      if (cachedAudio && cachedAudio.audioData) {
        console.log('[MessageList] 使用缓存的合并音频数据播放', messageId);
        
        const audio = new Audio();
        const format = cachedAudio.format || 'wav';
        audio.src = `data:audio/${format};base64,${cachedAudio.audioData}`;
        
        // 设置播放状态标记
        setIsPlaying(true);
        setCurrentPlayingMessageId(messageId);
        
        audio.onplay = () => {
          console.log(`[MessageList] 缓存音频开始播放: ${messageId}`);
          setIsPlaying(true);
          setCurrentPlayingAudio(audio);
          setCurrentPlayingMessageId(messageId);
        };
        
        audio.onended = () => {
          console.log(`[MessageList] 缓存音频播放完成:`, messageId);
          // 显式触发自定义事件，确保通知到所有组件
          window.dispatchEvent(new CustomEvent('audio-playback-ended', {
            detail: { messageId: messageId }
          }));
          cleanupAudio();
        };
        
        audio.onerror = (e) => {
          console.error('[MessageList] 缓存音频播放失败:', messageId, e);
          cleanupAudio();
        };
        
        try {
          await audio.play();
          console.log(`[MessageList] 缓存音频播放调用成功: ${messageId}`);
        } catch (error) {
          console.error(`[MessageList] 缓存音频播放调用失败: ${messageId}`, error);
          cleanupAudio();
        }
      }
      // 如果缓存中没有，但消息中有音频数据，则使用消息中的数据
      else if (message.has_audio && message.audio_data) {
        console.log('[MessageList] 使用消息内嵌的音频数据播放', messageId);
        
        const audio = new Audio();
        const format = message.audio_format || 'wav';
        audio.src = `data:audio/${format};base64,${message.audio_data}`;
        
        // 设置播放状态标记
        setIsPlaying(true);
        setCurrentPlayingMessageId(messageId);
        
        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentPlayingAudio(audio);
          setCurrentPlayingMessageId(messageId);
        };
        
        audio.onended = () => {
          console.log(`[MessageList] 音频播放完成:`, messageId);
          // 显式触发自定义事件，确保通知到所有组件
          window.dispatchEvent(new CustomEvent('audio-playback-ended', {
            detail: { messageId: messageId }
          }));
          cleanupAudio();
        };
        
        audio.onerror = () => {
          console.error('[MessageList] 音频播放失败:', messageId);
          cleanupAudio();
        };
        
        await audio.play();
      } 
      // 如果以上都没有，则从API获取
      else {
        console.log('[MessageList] 获取消息音频数据:', messageId);
        let messageAudio = await getMessageAudio(messageId);
        if (messageAudio.audio_data) {
          const audio = new Audio();
          audio.src = `data:audio/${messageAudio.format};base64,${messageAudio.audio_data}`;
          
          // 设置播放状态标记
          setIsPlaying(true);
          setCurrentPlayingMessageId(messageId);
          
          audio.onplay = () => {
            setIsPlaying(true);
            setCurrentPlayingAudio(audio);
            setCurrentPlayingMessageId(messageId);
          };
          
          audio.onended = () => {
            console.log(`[MessageList] 音频播放完成:`, messageId);
            // 显式触发自定义事件，确保通知到所有组件
            window.dispatchEvent(new CustomEvent('audio-playback-ended', {
              detail: { messageId: messageId }
            }));
            cleanupAudio();
          };
          
          audio.onerror = () => {
            console.error('[MessageList] 音频播放失败:', messageId);
            cleanupAudio();
          };
          
          await audio.play();
        } else {
          console.warn('[MessageList] 没有可用的音频数据:', messageId);
          cleanupAudio();
        }
      }
    } catch (error) {
      console.error('[MessageList] 音频播放失败:', messageId, error);
      cleanupAudio();
    }
  }, [cleanupAudio, currentPlayingAudio, currentPlayingMessageId, isPlaying, setIsPlaying, setCurrentPlayingAudio, setCurrentPlayingMessageId]);

  return (
    <div className="message-list-container">
      {!props.messages || props.messages.length === 0 ? (
        <div className="empty-chat">Start a new conversation?</div>
      ) : (
        props.messages.map((message, index) => {
          const hasAudioCapability = 
            message.has_audio || 
            message.audio_data || 
            message.message_type === 'audio' || 
            message.message_type === 'voice';
          
          console.log(`渲染消息 ${index}:`, {
            id: message.id || message.message_id,
            role: message.role,
            hasAudio: hasAudioCapability
          });
          
          return (
            <Message 
              key={message.id || message.message_id || index} 
              message={message}
              showChinese={props.showChinese}
              onReplayAudio={handleReplayAudio}
              onPlayAudio={props.onPlayAudio}
              isPlaying={isPlaying && currentPlayingMessageId === (message.id || message.message_id)}
            />
          );
        })
      )}
      <div ref={messagesEndRef} />
      
      {showScrollButton && (
        <button 
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          title="滚动到底部"
        >
          ↓
        </button>
      )}
    </div>
  );
};

export default MessageList; 