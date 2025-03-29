import React from 'react';
import ChatContainer from './components/Chat/ChatContainer';
import LanguageToggle from './components/Controls/LanguageToggle';
import SettingsMenu from './components/Controls/SettingsMenu';
import useChat from './hooks/useChat';
import './App.css';

function App() {
  const {
    messages,
    isLoading,
    handleChatRequest,
    playAudio,
    clearHistory,
    showChinese,
    toggleLanguage,
    selectedSpeaker,
    setSelectedSpeaker,
  } = useChat();
  
  // 可用的发言人列表
  const availableSpeakers = ['default', 'female', 'male'];
  
  // 添加调试日志
  console.log("App is rendering with:", { 
    hasMessages: Array.isArray(messages), 
    messageCount: Array.isArray(messages) ? messages.length : 0,
    handleChatRequestType: typeof handleChatRequest
  });
  
  return (
    <div className="App">
      <header className="App-header">
        <div className="logo">
          <h1>Chat Assistant</h1>
        </div>
        
        <div className="header-controls">
          <LanguageToggle 
            showChinese={showChinese} 
            onToggle={toggleLanguage} 
          />
          <SettingsMenu
            selectedSpeaker={selectedSpeaker}
            speakers={availableSpeakers}
            onChangeSpeaker={setSelectedSpeaker}
            onClearHistory={clearHistory}
          />
        </div>
      </header>
      
      <main>
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleChatRequest}
          onPlayAudio={playAudio}
          showChinese={showChinese}
          selectedSpeaker={selectedSpeaker}
        />
      </main>
    </div>
  );
}

export default App; 