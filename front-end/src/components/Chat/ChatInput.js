import React, { useState, useRef, useEffect } from 'react';
// 使用其他图标替代，因为您可能没有安装react-icons
// 可以使用Unicode符号作为临时解决方案
import './ChatInput.css';

const ChatInput = ({ onSendMessage, isLoading, selectedSpeaker }) => {
  const [message, setMessage] = useState('');
  const [isRecordMode, setIsRecordMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const audioChunks = useRef([]);
  const mediaRecorder = useRef(null);
  const streamRef = useRef(null);

  // 预检麦克风权限
  useEffect(() => {
    // 清理函数
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 请求麦克风权限
  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setHasPermission(false);
      alert('无法访问麦克风，请检查浏览器权限设置。');
      return null;
    }
  };

  const toggleInputMode = async () => {
    // 当切换到录音模式时，提前请求权限
    if (!isRecordMode) {
      const hasAccess = await requestMicrophonePermission();
      if (!hasAccess) return; // 如果没有权限，不切换模式
    } else {
      // 切换回文本模式时，停止所有音频轨道
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
    setIsRecordMode(!isRecordMode);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message, selectedSpeaker);
      setMessage('');
    }
  };

  const startRecording = async (e) => {
    e.preventDefault();
    // 如果已经有流，使用现有流；否则请求新的权限
    try {
      const stream = streamRef.current || await requestMicrophonePermission();
      if (!stream) return; // 权限检查失败
      
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        sendAudioMessage(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('录音启动失败，请重试。');
    }
  };

  const stopRecording = (e) => {
    e.preventDefault();
    if (mediaRecorder.current && isRecording) {
      try {
        mediaRecorder.current.stop();
        setIsRecording(false);
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
    }
  };

  const sendAudioMessage = async (audioBlob) => {
    if (audioBlob.size > 0 && !isLoading) {
      onSendMessage(audioBlob, selectedSpeaker, true);
    }
  };

  return (
    <div className="chat-input">
      <form onSubmit={handleSubmit}>
        <div className="chat-input-controls">
          <button 
            type="button" 
            className="mode-toggle-button"
            onClick={toggleInputMode}
            disabled={isLoading}
          >
            {isRecordMode ? '⌨️' : '🎤'}
          </button>

          {isRecordMode ? (
            <button
              type="button" // 确保按钮类型是button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              onMouseLeave={isRecording ? stopRecording : undefined}
              disabled={isLoading || hasPermission === false}
            >
              {isRecording ? '录音中...' : hasPermission === false ? '麦克风访问被拒绝' : '长按录音'}
            </button>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="请输入您的问题..."
                disabled={isLoading}
                rows={1}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <button
                type="submit"
                className="send-button"
                disabled={!message.trim() || isLoading}
              >
                发送
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default ChatInput; 