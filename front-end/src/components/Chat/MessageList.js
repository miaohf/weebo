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
  const [activeAudioId, setActiveAudioId] = useState(null);

  // 初始化AudioCacheManager
  useEffect(() => {
    if (AudioCacheManager && typeof AudioCacheManager.init === 'function') {
      // 检查是否已初始化
      if (!AudioCacheManager.isInitialized) {
        AudioCacheManager.init()
          .catch(err => console.error('音频缓存系统初始化失败:', err));
      }
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
      receivedAudioRef.current = true;
      
      if (isNewMessage) {
        setShowScrollButton(true);
      }
      
      return;
    }
    
    if (isNewMessage && !receivedAudioRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollButton(false);
    }
    
    receivedAudioRef.current = false;
  }, [props.messages]);

  const cleanupAudio = useCallback(() => {
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
    
    // 如果点击的是当前正在播放的消息，停止播放
    if (isPlaying && currentPlayingMessageId === messageId) {
      cleanupAudio();
      return;
    }

    // 如果有其他音频正在播放，先停止
    if (currentPlayingAudio) {
      cleanupAudio();
    }

    try {
      // 首先尝试从缓存获取合并后的完整音频
      let cachedAudio;
      if (AudioCacheManager && typeof AudioCacheManager.getAudio === 'function') {
        try {
          cachedAudio = await AudioCacheManager.getAudio(messageId);
        } catch (err) {
          console.warn('从缓存获取音频失败:', err);
        }
      }
      
      if (cachedAudio && cachedAudio.audioData) {
        // 创建音频对象并播放
        const audio = new Audio();
        const format = cachedAudio.format || 'wav';
        audio.src = `data:audio/${format};base64,${cachedAudio.audioData}`;
        
        // 设置播放状态标记
        setIsPlaying(true);
        setCurrentPlayingMessageId(messageId);
        
        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentPlayingAudio(audio);
          setCurrentPlayingMessageId(messageId);
        };
        
        audio.onended = () => {
          // 显式触发自定义事件，确保通知到所有组件
          window.dispatchEvent(new CustomEvent('audio-playback-ended', {
            detail: { messageId: messageId }
          }));
          cleanupAudio();
        };
        
        audio.onerror = (e) => {
          console.error('缓存音频播放失败:', messageId, e);
          cleanupAudio();
        };
        
        try {
          await audio.play();
        } catch (error) {
          console.error(`缓存音频播放调用失败: ${messageId}`, error);
          cleanupAudio();
        }
      }
      // 如果缓存中没有，但消息中有音频数据，则使用消息中的数据
      else if (message.has_audio && message.audio_data) {
        // 创建音频对象并播放
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
          // 显式触发自定义事件，确保通知到所有组件
          window.dispatchEvent(new CustomEvent('audio-playback-ended', {
            detail: { messageId: messageId }
          }));
          cleanupAudio();
        };
        
        audio.onerror = () => {
          console.error('音频播放失败:', messageId);
          cleanupAudio();
        };
        
        await audio.play();
      } 
      // 如果以上都没有，则从API获取
      else {
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
            // 显式触发自定义事件，确保通知到所有组件
            window.dispatchEvent(new CustomEvent('audio-playback-ended', {
              detail: { messageId: messageId }
            }));
            cleanupAudio();
          };
          
          audio.onerror = () => {
            console.error('音频播放失败:', messageId);
            cleanupAudio();
          };
          
          await audio.play();
        } else {
          console.warn('没有可用的音频数据:', messageId);
          cleanupAudio();
        }
      }
    } catch (error) {
      console.error('音频播放失败:', messageId, error);
      cleanupAudio();
    }
  }, [cleanupAudio, currentPlayingAudio, currentPlayingMessageId, isPlaying]);

  const handlePlayAudio = async (messageId) => {
    try {
      // 首先检查是否已有正在播放的音频
      if (activeAudioId && activeAudioId !== messageId) {
        // 停止之前的音频
        setActiveAudioId(null);
      }
      
      // 检查是否是在切换状态
      if (activeAudioId === messageId) {
        // 停止当前音频
        setActiveAudioId(null);
        return;
      }
      
      // 查找要播放的消息
      const messageToPlay = props.messages.find(msg => msg.message_id === messageId);
      if (!messageToPlay) {
        console.error(`未找到对应的消息: ${messageId}`);
        return;
      }
      
      // 设置当前正在播放的音频ID
      setActiveAudioId(messageId);
      
      // 获取或播放音频
      if (messageToPlay.audio) {
        await handleReplayAudio(messageToPlay);
      } else if (messageToPlay.message_type === 'text' && messageToPlay.role === 'assistant') {
        // 调用API获取音频
        const audioData = await getMessageAudio(messageId);
        if (audioData.audio_data) {
          // 更新消息的音频数据
          await handleReplayAudio(messageToPlay);
        }
      } else if (messageToPlay.message_type === 'voice' && messageToPlay.role === 'user') {
        // 这里假设用户的语音消息中有一个audio_url字段
        const audioUrl = messageToPlay.audio_url;
        if (audioUrl) {
          await handleReplayAudio(messageToPlay);
        } else {
          console.error('用户语音消息缺少音频URL');
        }
      }
    } catch (error) {
      console.error('音频播放失败:', error);
      setActiveAudioId(null);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [props.messages, props.loading, scrollToBottom]);

  return (
    <div className="message-list-container">
      {!props.messages || props.messages.length === 0 ? (
        <div className="empty-chat">Start a new conversation?</div>
      ) : (
        props.messages.map((message, index) => {
          // const hasAudioCapability = 
          //   message.has_audio || 
          //   message.audio_data || 
          //   message.message_type === 'audio' || 
          //   message.message_type === 'voice';
          
          return (
            <Message 
              key={message.id || message.message_id || index} 
              message={message}
              showChinese={props.showChinese}
              onReplayAudio={handleReplayAudio}
              onPlayAudio={handlePlayAudio}
              isPlaying={activeAudioId === (message.id || message.message_id)}
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