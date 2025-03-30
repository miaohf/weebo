import React, { useRef, useEffect } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import './Chat.css';

const Chat = () => {
  const { 
    messages, 
    handleAudioData,
    // ... 其他状态和函数
  } = useChat();

  return (
    <div className="chat-container">
      <MessageList 
        messages={messages} 
        onAudioData={handleAudioData} 
      />
      {/* ... 其他组件 ... */}
    </div>
  );
};

export default Chat; 