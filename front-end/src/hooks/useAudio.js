import { useState, useCallback, useEffect } from 'react';
// import { Howl } from 'howler';
import { API_URL } from '../App';
import { parseWavHeader } from '../utils/audioUtils';

const useAudio = ({ messages, setError, isProcessing, setIsProcessing }) => {
  const [audioData, setAudioData] = useState({});
  const [playingIndex, setPlayingIndex] = useState(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [userInteracted, setUserInteracted] = useState(false);

  // 监听用户交互
  useEffect(() => {
    const handleInteraction = () => {
      setUserInteracted(true);
      // 只需要记录一次交互
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
    
    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // 从Float32Array播放音频
  const playArrayAudio = useCallback(async (audioData) => {
    try {
      if (!audioData.audio || !Array.isArray(audioData.audio)) {
        throw new Error("无效的音频数组数据");
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioArray = new Float32Array(audioData.audio);
      
      // 创建音频缓冲区
      const audioBuffer = audioContext.createBuffer(
        1, // 单声道
        audioArray.length,
        audioData.sample_rate || 24000
      );
      
      // 将数据写入缓冲区
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < audioArray.length; i++) {
        channelData[i] = audioArray[i];
      }
      
      // 创建音源并连接
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      // 播放音频
      source.start();
      console.log("Web Audio API开始播放");
      
      return new Promise((resolve) => {
        source.onended = () => {
          console.log("Web Audio API播放完成");
          setCurrentlyPlaying(null);
          resolve();
        };
      });
    } catch (error) {
      console.error("播放数组音频失败:", error);
      setCurrentlyPlaying(null);
      throw error;
    }
  }, [setCurrentlyPlaying]);

  // 从音频数据播放
  const playAudioFromData = useCallback(async (audioData, messageId = null) => {
    try {
      console.log("准备播放音频，消息ID:", messageId);
      
      if (!audioData) {
        throw new Error("无音频数据");
      }
      
      // 设置正在播放的消息ID
      if (messageId) {
        setCurrentlyPlaying(messageId);
      }
      
      // 1. 获取Base64编码的音频数据
      let audioBase64 = null;
      let audioFormat = 'wav'; // 默认格式
      
      // 检查所有可能的音频数据格式
      if (audioData.audio_data) {
        console.log("使用audio_data字段");
        audioBase64 = audioData.audio_data;
        if (audioData.format) {
          audioFormat = audioData.format;
        }
      } else if (audioData.audio) {
        // 处理audio字段 - 可能是数组或Base64字符串
        if (typeof audioData.audio === 'string') {
          console.log("使用audio字段 (字符串)");
          audioBase64 = audioData.audio;
        } else if (Array.isArray(audioData.audio)) {
          console.log("使用audio字段 (数组)");
          // 转换数组为音频数据...
          return playArrayAudio(audioData);
        }
      } else if (typeof audioData === 'string') {
        console.log("直接使用字符串Base64");
        audioBase64 = audioData;
      }
      
      // 如果没有有效的Base64数据，抛出错误
      if (!audioBase64) {
        console.error("无法提取音频数据");
        throw new Error("无法提取音频数据");
      }
      
      // 2. 转换为Blob
      const byteCharacters = atob(audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      
      // 打印WAV头信息进行调试
      if (byteArray.length > 44) {
        const headerView = new DataView(byteArray.buffer.slice(0, 44));
        const headerInfo = parseWavHeader(headerView);
        console.log("WAV头信息:", headerInfo);
      }
      
      const blob = new Blob([byteArray], { type: `audio/${audioFormat}` });
      const audioUrl = URL.createObjectURL(blob);
      
      // 3. 使用多种方法播放音频
      console.log("开始播放音频URL:", audioUrl);
      
      // 方法1: 使用HTML5 Audio API
      const audioElement = new Audio(audioUrl);
      audioElement.volume = 1.0;
      
      return new Promise((resolve, reject) => {
        audioElement.oncanplaythrough = () => {
          console.log("Audio可以播放");
          audioElement.play()
            .then(() => {
              console.log("开始播放Audio元素");
            })
            .catch(error => {
              console.error("Audio元素播放失败:", error);
              reject(error);
            });
        };
        
        audioElement.onended = () => {
          console.log("Audio元素播放完成");
          URL.revokeObjectURL(audioUrl);
          setCurrentlyPlaying(null);
          resolve();
        };
        
        audioElement.onerror = (event) => {
          console.error("Audio元素错误:", event);
          URL.revokeObjectURL(audioUrl);
          setCurrentlyPlaying(null);
          reject(new Error("音频播放失败"));
        };
      });
    } catch (error) {
      console.error("播放音频失败:", error);
      setCurrentlyPlaying(null);
      throw error;
    }
  }, [playArrayAudio, setCurrentlyPlaying]);

  // 播放音频响应
  const playAudioResponse = useCallback(async (audioData) => {
    try {
      console.log('开始处理音频数据:', audioData);
      
      // 详细验证
      if (!audioData) {
        throw new Error('音频数据为空');
      }
      
      if (!audioData.audio) {
        throw new Error('音频数据缺少audio字段');
      }
      
      if (!Array.isArray(audioData.audio)) {
        throw new Error('音频数据不是数组格式');
      }
      
      if (audioData.audio.length === 0) {
        throw new Error('音频数据数组为空');
      }
      
      if (!audioData.sample_rate) {
        throw new Error('音频数据缺少sample_rate字段');
      }
      
      // 如果所有检查通过，打印音频信息
      console.log('音频数据有效，长度:', audioData.audio.length, '采样率:', audioData.sample_rate);
      
      return await playAudioFromData(audioData);
    } catch (error) {
      console.error('播放音频错误:', error);
      setError('播放响应失败: ' + error.message);
      throw error;
    }
  }, [playAudioFromData, setError]);

  // 获取消息音频
  const fetchMessageAudio = useCallback(async (messageId) => {
    try {
      setIsProcessing(true);
      console.log("正在获取音频，消息ID:", messageId);
      
      const response = await fetch(`${API_URL}/get_audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message_id: messageId
        })
      });
      
      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }
      
      // 解析响应
      const audioData = await response.json();
      console.log("获取到音频数据，类型:", audioData.type);
      
      // 检查数据有效性 - 同时支持audio_data和audio字段
      if ((!audioData.audio_data || audioData.audio_data.length < 100) && 
          (!audioData.audio || (typeof audioData.audio === 'string' && audioData.audio.length < 100))) {
        console.error("音频数据不完整:", audioData);
        throw new Error("接收到的音频数据不完整");
      }
      
      // 缓存音频数据
      setAudioData(prev => ({
        ...prev,
        [messageId]: audioData
      }));
      
      // 播放音频
      await playAudioFromData(audioData, messageId);
      
      return audioData;
    } catch (error) {
      console.error('获取音频失败:', error);
      setError(`获取音频失败: ${error.message}`);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [playAudioFromData, setError, setIsProcessing]);

  // 播放单条音频
  const playSingleAudio = useCallback(async (audioData, index) => {
    if (playingIndex !== null) return;
    
    setPlayingIndex(index);
    console.log('点击播放单条音频:', index, audioData);
    
    try {
      // 直接调用主播放函数
      await playAudioResponse(audioData);
    } catch (error) {
      console.error('播放单条音频失败:', error);
      setError('播放失败');
    } finally {
      setPlayingIndex(null);
    }
  }, [playingIndex, playAudioResponse, setError]);

  // 播放所有音频
  const playAllAudios = useCallback(async () => {
    if (isPlayingAll) return;
    setIsPlayingAll(true);
    try {
      // 筛选出所有助手消息
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      console.log(`找到${assistantMessages.length}条助手消息`);
      
      // 按顺序播放每条消息的音频
      for (let i = 0; i < assistantMessages.length; i++) {
        const msg = assistantMessages[i];
        const msgIndex = messages.findIndex(m => m.id === msg.id);
        
        // 设置当前播放的消息索引
        setPlayingIndex(msgIndex);
        
        try {
          console.log(`播放第${i+1}/${assistantMessages.length}条消息的音频，ID: ${msg.id}`);
          
          // 1. 首先检查消息是否已有音频数据
          if (msg.content && msg.content.audio) {
            console.log("使用消息中的音频数据");
            await playAudioResponse(msg.content.audio);
            continue;
          }
          
          // 2. 检查缓存中是否有此消息的音频
          const cachedAudio = audioData[msg.id];
          if (cachedAudio) {
            console.log("使用缓存的音频数据");
            await playAudioFromData(cachedAudio);
            continue;
          }
          
          // 3. 如果没有音频数据，尝试从服务器获取
          console.log("从服务器获取音频数据");
          await fetchMessageAudio(msg.id);
          
        } catch (error) {
          console.error(`播放消息 ${msg.id} 的音频失败:`, error);
          // 继续播放下一条，不中断整个播放流程
          continue;
        }
        
        // 每条消息之间暂停一小段时间
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('连续播放失败:', error);
      setError('连续播放失败');
    } finally {
      setPlayingIndex(null);
      setIsPlayingAll(false);
      setIsProcessing(false);
    }
  }, [isPlayingAll, messages, audioData, playAudioResponse, playAudioFromData, fetchMessageAudio, setError, setIsProcessing]);

  // 重播音频
  const replayAudio = useCallback(async (messageId) => {
    console.log("尝试重播消息音频:", messageId);
    
    // 如果正在处理中，不执行
    if (isProcessing) {
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // 优先使用缓存中的音频
      const cachedAudio = audioData[messageId];
      if (cachedAudio) {
        console.log("使用缓存的音频数据");
        await playAudioFromData(cachedAudio);
        return;
      }
      
      // 从服务器获取音频
      console.log("从服务器获取音频");
      await fetchMessageAudio(messageId);
    } catch (error) {
      console.error("播放音频失败:", error);
      setError("播放音频失败");
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, audioData, playAudioFromData, fetchMessageAudio, setError, setIsProcessing]);

  // // 添加到App.js中，在useEffect内部
  // useEffect(() => {
  //   // 测试系统音频
  //   const testSystemAudio = () => {
  //     console.log("测试系统音频");
  //     const audioElement = new Audio();
  //     audioElement.src = "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAABhTEFNRTMuMTAwA8MAAAAAAAAAABQgJAUHQQAB9AAAAnGMHkkIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAf4AAAAgAAA/wAAABAAAB/gAAACAAAD/AAAAEAmkFgJJGIEgGBYJx8fH///xgYJw+Pj/JBg+DgMf//y/g+8eDgPg4D4Pg+D5//5QEP/KAgEDg//g+8eCAgEDg//g+8eCAgILg";
  //     audioElement.volume = 1.0;
      
  //     audioElement.oncanplaythrough = () => {
  //       console.log("测试音频可以播放");
  //       audioElement.play()
  //         .then(() => console.log("测试音频开始播放"))
  //         .catch(e => console.error("测试音频播放失败:", e));
  //     };
      
  //     audioElement.onended = () => console.log("测试音频播放完成");
  //     audioElement.onerror = () => console.error("测试音频错误");
      
  //     // 尝试解锁AudioContext
  //     try {
  //       const AudioContext = window.AudioContext || window.webkitAudioContext;
  //       const audioContext = new AudioContext();
  //       console.log("AudioContext状态:", audioContext.state);
        
  //       if (audioContext.state === 'suspended') {
  //         audioContext.resume()
  //           .then(() => console.log("AudioContext已恢复"))
  //           .catch(e => console.error("恢复AudioContext失败:", e));
  //       }
  //     } catch (error) {
  //       console.error("AudioContext初始化失败:", error);
  //     }
  //   };
    

  // }, []);

  return {
    audioData,
    setAudioData,
    playingIndex,
    setPlayingIndex,
    isPlayingAll,
    setIsPlayingAll,
    currentlyPlaying,
    setCurrentlyPlaying,
    userInteracted,
    setUserInteracted,
    playSingleAudio,
    playAllAudios,
    replayAudio,
    playAudioResponse,
    playAudioFromData,
    fetchMessageAudio
  };
};

export default useAudio; 