import React from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
// 删除未使用的导入
// import { sendChatMessage, getMessageAudio } from '../../services/api';
import './ChatContainer.css';

const ChatContainer = ({ 
  messages, 
  isLoading, 
  onSendMessage, 
  onPlayAudio,
  showChinese,
  selectedSpeaker
}) => {
  // 添加调试日志
  console.log("ChatContainer received props:", { 
    hasMessages: Array.isArray(messages), 
    messageCount: Array.isArray(messages) ? messages.length : 0,
    onSendMessageType: typeof onSendMessage,
    isLoading
  });
  
  // 加一个包装函数确保参数传递正确
  const handleSendMessage = (message, files, messageType, speaker) => {
    console.log("handleSendMessage called with:", { message, files, messageType, speaker });
    if (typeof onSendMessage === 'function') {
      onSendMessage(message, files, messageType, speaker);
    } else {
      console.error("onSendMessage is not a function in ChatContainer");
    }
  };

  return (
    <div className="chat-container">
      {/* 可以完全移除工具栏，或保留给其他功能 */}
      {/* <div className="toolbar">
        // 这里不再需要清空按钮
      </div> */}
      
      <MessageList 
        messages={messages} 
        showChinese={showChinese}
        onPlayAudio={onPlayAudio}
      />
      
      <div className="bottom-controls">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          selectedSpeaker={selectedSpeaker}
        />
      </div>
    </div>
  );
};

export default ChatContainer; 