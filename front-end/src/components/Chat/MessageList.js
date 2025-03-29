import React, { useEffect, useRef } from 'react';
import Message from './Message';
import EmptyChat from './EmptyChat';
import './MessageList.css';

const MessageList = ({ messages, isPlayingAll, showChinese, ...props }) => {
  const messagesEndRef = useRef(null);
  
  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // 当消息更新时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // 如果没有消息，显示空聊天界面
  if (!messages || messages.length === 0) {
    return <EmptyChat />;
  }
  
  return (
    <div className="message-list">
      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
          isPlayingAll={isPlayingAll}
          showChinese={showChinese}
          {...props}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 