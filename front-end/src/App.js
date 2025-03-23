import React, { useEffect } from 'react';
import { Container } from '@mui/material';
import ChatHeader from './components/ChatHeader';
import ChatList from './components/ChatList';
import ChatInput from './components/ChatInput';
import ErrorMessage from './components/ErrorMessage';
import useChat from './hooks/useChat';
import useAudio from './hooks/useAudio';
import useStorage from './hooks/useStorage';
import useRecording from './hooks/useRecording';
import AudioDebug from './components/AudioDebug';
import { initAudioSystems } from './utils/audioInit';

// 确保协议一致性
export const BACKEND_HOST = '192.168.31.17';
export const BACKEND_PORT = '8080';
export const API_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

function App() {
  // 使用自定义钩子
  const { 
    messages, 
    addMessage, 
    handleChatRequest, 
    clearHistory,
    exportChatHistory,
    error, 
    setError,
    showChinese, 
    setShowChinese,
    isProcessing, 
    setIsProcessing
  } = useChat();
  
  const {
    playingIndex,
    isPlayingAll,
    playAllAudios,
    playSingleAudio,
    replayAudio,
    currentlyPlaying,
  } = useAudio({ messages, setError, isProcessing, setIsProcessing });
  
  const {
    speaker,
    setSpeaker
  } = useStorage();
  
  const {
    isRecording,
    startRecording,
    stopRecording,
  } = useRecording({ addMessage, setError, setIsProcessing, API_URL, speaker });

  // 处理聊天请求时传入speaker
  const handleChatWithSpeaker = async (message) => {
    await handleChatRequest(message, speaker);
  };

  // 初始化音频系统
  useEffect(() => {
    const initAudio = async () => {
      try {
        const result = await initAudioSystems();
        console.log("音频系统初始化结果:", result);
        
        if (!result.overallSuccess) {
          setError("音频系统初始化不完全，可能无法正常播放声音");
        }
    } catch (error) {
        console.error("音频系统初始化失败:", error);
        setError("音频系统初始化失败，声音可能无法播放");
      }
    };
    
    initAudio();
  }, [setError]);

  // 在useEffect中添加音频初始化代码
  useEffect(() => {
    // 解锁音频播放
    const unlockAudio = async () => {
      try {
        // 尝试创建和启动AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const audioContext = new AudioContext();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log("AudioContext已恢复");
          }
        }
        
        // 使用静默音频解锁自动播放
        const silentSound = new Audio();
        silentSound.src = "data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
        silentSound.volume = 0.01;
        try {
          await silentSound.play();
          console.log("自动播放已解锁");
        } catch (e) {
          console.warn("自动播放仍然被锁定:", e);
        }
        
        // 配置Howler
        if (window.Howler) {
          window.Howler.autoUnlock = true;
          window.Howler.usingWebAudio = true;
          window.Howler.volume(1.0);
          console.log("Howler已配置");
      }
    } catch (error) {
        console.error("解锁音频失败:", error);
      }
    };
    
    // 用户首次交互时调用
    const handleUserInteraction = () => {
      unlockAudio();
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  return (
    <Container 
      maxWidth="md" 
            sx={{
        mt: 2, 
        pb: 10,
        px: { xs: 1, sm: 2 }
      }}
    >
      <ErrorMessage error={error} />
      
      {process.env.NODE_ENV === 'development' && <AudioDebug />}
      
      <ChatHeader 
        clearHistory={clearHistory}
        playAllAudios={playAllAudios}
        isPlayingAll={isPlayingAll}
        showChinese={showChinese}
        setShowChinese={setShowChinese}
        speaker={speaker}
        setSpeaker={setSpeaker}
        messages={messages}
        exportChatHistory={exportChatHistory}
      />
      
      <ChatList 
        messages={messages}
        showChinese={showChinese}
        playingIndex={playingIndex}
        isPlayingAll={isPlayingAll}
        playSingleAudio={playSingleAudio}
        replayAudio={replayAudio}
        isProcessing={isProcessing}
        currentlyPlaying={currentlyPlaying}
      />
      
      <ChatInput 
        isRecording={isRecording}
        startRecording={startRecording}
        stopRecording={stopRecording}
        handleChatRequest={handleChatWithSpeaker}
        isProcessing={isProcessing}
      />
    </Container>
  );
}

export default App; 