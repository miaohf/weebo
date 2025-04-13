import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import ChatContainer from './components/Chat/ChatContainer';
import LanguageToggle from './components/Controls/LanguageToggle';
import SettingsMenu from './components/Controls/SettingsMenu';
import ThemeToggle from './components/Controls/ThemeToggle';
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
  
  // 控制 header 显示/隐藏的状态
  const [hideHeader, setHideHeader] = useState(false);
  // 记录上一次滚动位置
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  
  // 监听页面滚动事件
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPos = window.pageYOffset;
      
      // 向下滚动且已经滚动超过一定距离时隐藏 header
      // 向上滚动时显示 header
      const isScrollingDown = prevScrollPos < currentScrollPos;
      const scrollThreshold = 10; // 设置一个阈值，避免轻微滚动触发

      if (isScrollingDown && currentScrollPos > scrollThreshold) {
        setHideHeader(true);
      } else {
        setHideHeader(false);
      }
      
      setPrevScrollPos(currentScrollPos);
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // 组件卸载时移除事件监听
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [prevScrollPos]);
  
  // 可用的发言人列表
  const availableSpeakers = ['default', 'female', 'male'];
  
  // 添加调试日志
  console.log("App is rendering with:", { 
    hasMessages: Array.isArray(messages), 
    messageCount: Array.isArray(messages) ? messages.length : 0,
    handleChatRequestType: typeof handleChatRequest,
    showChinese: showChinese,
    toggleLanguageType: typeof toggleLanguage
  });
  
  return (
    <ThemeProvider>
      <div className="App">
        <header className={`App-header ${hideHeader ? 'hidden' : ''}`}>
          <div className="logo">
            <div className="logo-icon">
              <img src="/chatbot.png" alt="Chat Bot Logo" />
            </div>
            <h1>Chat Bot</h1>
          </div>
          
          <div className="header-controls">
            <ThemeToggle />
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
    </ThemeProvider>
  );
}

export default App; 