import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { ActionTypes } from '../context/AppContext';
import { fetchMessageAudio } from '../api/chatApi';
import { createAudioPlayer } from '../utils/audioUtils';

export default function useAudio() {
  const { state, dispatch } = useAppContext();
  const audioPlayerRef = useRef(null);
  const isPlayingRef = useRef(false);
  
  // 播放音频数据
  const playAudioFromData = useCallback(async (audioData) => {
    if (!audioData) return;
    
    try {
      dispatch({ type: ActionTypes.SET_PLAYING, payload: audioData.message_id });
      
      // 确保我们有音频播放器
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = createAudioPlayer();
      }
      
      // 播放音频
      await audioPlayerRef.current.play(audioData);
      
      console.log('音频播放完成');
    } catch (error) {
      console.error('播放音频失败:', error);
      dispatch({ type: ActionTypes.SET_ERROR, payload: `播放音频失败: ${error.message}` });
    } finally {
      dispatch({ type: ActionTypes.SET_PLAYING, payload: null });
    }
  }, [dispatch]);
  
  // 初始化音频播放器
  useEffect(() => {
    audioPlayerRef.current = createAudioPlayer();
    
    // 监听用户交互以激活音频上下文
    const handleInteraction = () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.resume().catch(err => {
          console.warn('激活音频上下文失败:', err);
        });
      }
    };
    
    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, []);
  
  // 监听音频队列
  useEffect(() => {
    const processAudioQueue = async () => {
      if (state.audioQueue.length > 0 && !isPlayingRef.current) {
        isPlayingRef.current = true;
        
        try {
          const audioData = state.audioQueue[0];
          await playAudioFromData(audioData);
          
          // 移除已播放的音频
          dispatch({ type: ActionTypes.DEQUEUE_AUDIO });
        } catch (error) {
          console.error('处理音频队列失败:', error);
        } finally {
          isPlayingRef.current = false;
        }
      }
    };
    
    processAudioQueue();
  }, [state.audioQueue, dispatch, playAudioFromData]);
  
  // 重新播放消息音频
  const replayAudio = useCallback(async (messageId) => {
    if (state.currentlyPlaying) return;
    
    try {
      // 检查缓存
      const cachedAudio = state.audioData[messageId];
      if (cachedAudio) {
        await playAudioFromData(cachedAudio);
        return;
      }
      
      // 从服务器获取
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: true });
      const audioData = await fetchMessageAudio(messageId);
      
      // 缓存
      dispatch({
        type: ActionTypes.STORE_AUDIO_DATA,
        payload: { id: messageId, data: audioData }
      });
      
      // 播放
      await playAudioFromData(audioData);
    } catch (error) {
      console.error('重新播放失败:', error);
      dispatch({ type: ActionTypes.SET_ERROR, payload: `重新播放失败: ${error.message}` });
    } finally {
      dispatch({ type: ActionTypes.SET_PROCESSING, payload: false });
    }
  }, [state.currentlyPlaying, state.audioData, dispatch, playAudioFromData]);
  
  // 播放所有消息
  const playAllAudios = useCallback(async () => {
    if (state.currentlyPlaying) return;
    
    try {
      const assistantMessages = state.messages.filter(msg => msg.role === 'assistant');
      
      for (const message of assistantMessages) {
        await replayAudio(message.id);
        // 短暂暂停
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('播放所有音频失败:', error);
      dispatch({ type: ActionTypes.SET_ERROR, payload: '播放所有音频失败' });
    }
  }, [state.currentlyPlaying, state.messages, dispatch, replayAudio]);
  
  return {
    currentlyPlaying: state.currentlyPlaying,
    playAudioFromData,
    replayAudio,
    playAllAudios
  };
}