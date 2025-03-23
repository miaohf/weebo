import { useState, useRef, useCallback } from 'react';
import axios from 'axios';

const useRecording = ({ addMessage, setError, setIsProcessing, API_URL, speaker }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      // 添加对不安全上下文的处理
      if (window.isSecureContext === false) {
        alert('请通过localhost访问或配置HTTPS');
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      // 设置数据可用时的处理函数
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError(null);
    } catch (error) {
      console.error('录音错误:', error);
      setError(error.message || '无法启动录音');
      setIsRecording(false);
      // 清理资源
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
    }
  }, [setError]);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm;codecs=opus'
          });
          audioChunksRef.current = []; // 清空缓存

          // 添加用户消息
          addMessage('user', {
            english: '[语音消息]',
            chinese: '[语音消息]',
            audio: {
              audio: audioBlob,
              sample_rate: 16000
            }
          });

          await sendAudioData(audioBlob);
        } catch (error) {
          console.error('处理录音数据时出错:', error);
          setError('处理录音数据失败');
        } finally {
          setIsRecording(false);
          mediaRecorderRef.current = null;
        }
      };
    }
  }, [isRecording, addMessage, setError]);

  // 发送音频数据
  const sendAudioData = useCallback(async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('sample_rate', '16000');
      formData.append('speaker', speaker);
      
      const response = await axios.post(`${API_URL}/conversation`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log('收到音频响应:', response.data);

      if (response.data.text) {
        // 生成唯一ID
        const messageId = `audio-response-${Date.now()}`;
        
        const newMessage = {
          english: response.data.text.english,
          chinese: response.data.text.chinese,
          audio: response.data.audio
        };
        
        // 只在这里添加一次消息，并传入ID
        addMessage('assistant', newMessage, messageId);
      }
    } catch (error) {
      console.error('发送音频错误:', error);
      setError('发送音频失败');
    } finally {
      setIsProcessing(false);
    }
  }, [API_URL, addMessage, setError, setIsProcessing, speaker]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    sendAudioData
  };
};

export default useRecording; 