import React, { useEffect, useRef } from 'react';
import Message from './Message';
import './MessageList.css';

const MessageList = ({ messages, showChinese, onPlayAudio }) => {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  
  // 添加调试日志，检查接收到的消息数组
  console.log("MessageList接收到的消息:", messages);

  // 记录滚动位置而不是直接滚动到底部
  // 这样在切换语言时可以保持相对位置
  useEffect(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isScrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50;
      
      if (isScrolledToBottom) {
        // 只有当用户已经滚动到底部附近时，才自动滚动到底部
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [messages, showChinese]); // 同时监听消息和语言切换

  return (
    <div className="message-list" ref={containerRef}>
      {!messages || messages.length === 0 ? (
        <div className="empty-chat">Start a new conversation?</div>
      ) : (
        messages.map((message, index) => (
          <Message 
            key={message.message_id || `msg-${index}`}
            message={message}
            showChinese={showChinese}
            onPlayAudio={onPlayAudio}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 