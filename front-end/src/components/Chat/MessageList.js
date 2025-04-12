import React, { useRef, useEffect, useState } from 'react';
import Message from './Message';
import { getMessageAudio } from '../../services/api';
import './MessageList.css';

const MessageList = ({ onAudioData, ...props }) => {
  const messagesEndRef = useRef(null);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingMessageId, setCurrentPlayingMessageId] = useState(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [props.messages]);

  // 清理函数，用于停止当前播放的音频
  const cleanupAudio = () => {
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
  };

  // 组件卸载时清理音频
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const handleReplayAudio = async (message) => {
    // 如果正在播放的是同一条消息，则停止播放
    if (currentPlayingMessageId === message.message_id) {
      cleanupAudio();
      return;
    }

    // 如果正在播放其他消息，先停止它
    if (currentPlayingAudio) {
      cleanupAudio();
    }

    try {
      let messageAudio = await getMessageAudio(message.message_id);
      if (messageAudio.audio_data) {
        const audio = new Audio();
        audio.src = `data:audio/${messageAudio.format};base64,${messageAudio.audio_data}`;
        
        // 设置音频事件监听
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
        
        // 播放音频
        await audio.play();
      } else {
        console.warn('没有可用的音频数据');
      }
    } catch (error) {
      console.error('音频播放失败:', error);
      cleanupAudio();
    }
  };

  return (
    <div className="message-list-container">
      {!props.messages || props.messages.length === 0 ? (
        <div className="empty-chat">Start a new conversation?</div>
      ) : (
        props.messages.map((message, index) => (
          <Message 
            key={message.id || message.message_id || index} 
            message={message}
            onReplayAudio={handleReplayAudio}
            isPlaying={currentPlayingMessageId === message.message_id}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 