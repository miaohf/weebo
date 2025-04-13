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
    isLoading,
    showChinese
  });
  
  // 加一个包装函数确保参数传递正确
  const handleSendMessage = (message, files, messageType, speaker, streamAudio = true) => {
    console.log("handleSendMessage called with:", { message, files, messageType, speaker, streamAudio });
    
    // 检查和记录文件信息
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        console.log(`文件 ${index}: ${file.name}, 大小: ${file.size} bytes, 类型: ${file.type}`);
      });
    } else if (messageType === 'voice') {
      console.error("警告: 语音消息但没有文件!");
    }
    
    if (typeof onSendMessage === 'function') {
      // 确保传递所有参数，包括 streamAudio
      onSendMessage(message, files, messageType, speaker, streamAudio);
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