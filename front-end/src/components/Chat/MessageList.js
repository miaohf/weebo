import React, { useRef, useEffect, useState, useCallback } from 'react';
import Message from './Message';
import { getMessageAudio } from '../../services/api';
import './MessageList.css';

const MessageList = ({ onAudioData, ...props }) => {
  const messagesEndRef = useRef(null);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [, setIsPlaying] = useState(false);
  const [currentPlayingMessageId, setCurrentPlayingMessageId] = useState(null);
  const lastMessageIdRef = useRef(null);
  const receivedAudioRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

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
  }, [currentPlayingAudio]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const handleReplayAudio = useCallback(async (message) => {
    if (currentPlayingMessageId === message.message_id) {
      cleanupAudio();
      return;
    }

    if (currentPlayingAudio) {
      cleanupAudio();
    }

    try {
      if (message.has_audio && message.audio_data) {
        console.log('使用消息内嵌的音频数据播放', message.message_id);
        
        const audio = new Audio();
        const format = message.audio_format || 'wav';
        audio.src = `data:audio/${format};base64,${message.audio_data}`;
        
        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentPlayingAudio(audio);
          setCurrentPlayingMessageId(message.message_id);
        };
        
        audio.onended = () => {
          cleanupAudio();
        };
        
        audio.onerror = () => {
          console.error('音频播放失败');
          cleanupAudio();
        };
        
        await audio.play();
      } 
      else {
        let messageAudio = await getMessageAudio(message.message_id);
        if (messageAudio.audio_data) {
          const audio = new Audio();
          audio.src = `data:audio/${messageAudio.format};base64,${messageAudio.audio_data}`;
          
          audio.onplay = () => {
            setIsPlaying(true);
            setCurrentPlayingAudio(audio);
            setCurrentPlayingMessageId(message.message_id);
          };
          
          audio.onended = () => {
            cleanupAudio();
          };
          
          audio.onerror = () => {
            console.error('音频播放失败');
            cleanupAudio();
          };
          
          await audio.play();
        } else {
          console.warn('没有可用的音频数据');
        }
      }
    } catch (error) {
      console.error('音频播放失败:', error);
      cleanupAudio();
    }
  }, [cleanupAudio, currentPlayingAudio, currentPlayingMessageId, setIsPlaying, setCurrentPlayingAudio, setCurrentPlayingMessageId]);

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
              isPlaying={currentPlayingMessageId === message.message_id}
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