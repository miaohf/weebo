import React, { useState } from 'react';
import useChat from '../../hooks/useChat';
import useAudio from '../../hooks/useAudio';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ErrorDisplay from '../Common/ErrorDisplay';
import DropdownMenu from '../Common/DropdownMenu';
import './ChatContainer.css';

import { AVAILABLE_SPEAKERS } from '../../config';

function ChatContainer() {
  // 从hooks获取数据和方法
  const {
    messages,
    isProcessing,
    error,
    showChinese,
    handleChatRequest,
    sendAudioMessage,
    clearHistory,
    exportChatHistory,
    toggleLanguage
  } = useChat();
  
  const {
    currentlyPlaying,
    replayAudio,
    playAllAudios
  } = useAudio();
  
  // 添加主题状态
  const [chatTheme, setChatTheme] = useState('default');
  // 添加当前选择的语音
  const [currentSpeaker, setCurrentSpeaker] = useState('default');
  
  // // 可用的语音选项
  // const AVAILABLE_SPEAKERS = [
  //   { id: 'default', label: '默认语音' },
  //   { id: 'male', label: '男声' },
  //   { id: 'female', label: '女声' },
  //   { id: 'child', label: '儿童声' },
  //   { id: 'robot', label: '机器人声' }
  // ];
  
  // 菜单项
  const menuItems = [
    {
      label: '播放所有音频',
      icon: '🔈',
      onClick: playAllAudios,
      disabled: messages.length === 0 || isProcessing || currentlyPlaying
    },
    {
      label: showChinese ? '显示英文' : '显示中文',
      icon: '🔤',
      onClick: toggleLanguage
    },
    {
      label: '导出聊天记录',
      icon: '📤',
      onClick: exportChatHistory,
      disabled: messages.length === 0
    },
    { divider: true },
    {
      label: '语音选择',
      icon: '🔊',
      keepOpen: true,
      onClick: () => {}, // 空函数，不做任何事
      submenu: AVAILABLE_SPEAKERS.map(speaker => ({
        label: speaker.label,
        active: currentSpeaker === speaker.id,
        onClick: () => setCurrentSpeaker(speaker.id)
      }))
    },
    {
      label: '主题颜色',
      icon: '🎨',
      keepOpen: true,
      onClick: () => {}, // 空函数，不做任何事
      submenu: [
        { id: 'default', label: '默认', color: '#4a6bff' },
        { id: 'soft', label: '柔和', color: '#8ca0e0' },
        { id: 'gray', label: '灰度', color: '#6b7280' },
        { id: 'green', label: '绿色', color: '#4ade80' }
      ].map(theme => ({
        label: theme.label,
        active: chatTheme === theme.id,
        onClick: () => setChatTheme(theme.id),
        color: theme.color
      }))
    },
    { divider: true },
    {
      label: '清除历史',
      icon: '🗑️',
      onClick: clearHistory,
      danger: true
    }
  ];
  
  // 处理发送消息
  const handleSendMessage = (message, speaker = currentSpeaker) => {
    return handleChatRequest(message, speaker);
  };
  
  // 包装音频发送函数
  const handleSendAudio = (audioBase64, speaker) => {
    return sendAudioMessage(audioBase64, speaker);
  };
  
  return (
    <div className="chat-container">
      <div className="chat-toolbar">
        {/* <div className="toolbar-title">AI 聊天助手</div> */}
        <DropdownMenu items={menuItems} />
      </div>
      
      <ErrorDisplay 
        error={error} 
        onDismiss={() => {}} 
      />
      
      <div className="chat-messages-container">
        <MessageList 
          messages={messages} 
          showChinese={showChinese}
          onReplayAudio={replayAudio}
          currentlyPlaying={currentlyPlaying}
        />
      </div>
      
      <div className="bottom-controls">
        <ChatInput 
          onSendMessage={handleSendMessage}
          onSendAudio={handleSendAudio}
          isProcessing={isProcessing}
          currentSpeaker={currentSpeaker}
        />
      </div>
    </div>
  );
}

export default ChatContainer; 