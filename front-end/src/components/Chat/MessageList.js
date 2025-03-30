import React, { useRef, useEffect } from 'react';
import Message from './Message';
import { getMessageAudio } from '../../services/api';
import './MessageList.css';

const MessageList = ({ onAudioData, ...props }) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [props.messages]);

  const handleReplayAudio = async (message) => {
    try {
      let messageAudio = await getMessageAudio(message.message_id);
      // 播放音频
      if (messageAudio.audio_data) {
        const audio = new Audio();
        // 使用正确的 MIME 类型
        audio.src = `data:audio/${messageAudio.format};base64,${messageAudio.audio_data}`;
        // console.log('设置的音频源:', audio.src);
        await audio.play();
      } else {
        console.warn('没有可用的音频数据');
      }
    } catch (error) {
      console.error('音频播放失败:', error);
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
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 