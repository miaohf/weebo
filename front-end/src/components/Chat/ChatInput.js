import React, { useState, useRef } from 'react';
import { FaMicrophone, FaKeyboard, FaImage } from 'react-icons/fa';
import { BsArrowRightCircleFill } from "react-icons/bs";
import './ChatInput.css';

const ChatInput = ({ onSendMessage, isLoading, selectedSpeaker }) => {
  const [message, setMessage] = useState('');
  const [isRecordMode, setIsRecordMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState(null);
  
  const audioChunks = useRef([]);
  const mediaRecorder = useRef(null);
  const fileInputRef = useRef(null);
  
  // 切换输入模式（文本/录音）
  const toggleInputMode = () => {
    setIsRecordMode(!isRecordMode);
  };

  // 处理文本消息提交
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 检查onSendMessage是否为函数
    if (typeof onSendMessage !== 'function') {
      console.error('Error: onSendMessage is not a function', onSendMessage);
      alert('发送消息失败：内部错误');
      return;
    }
    
    if (selectedImage) {
      // 发送图像消息
      onSendMessage(message, [selectedImage], 'image', selectedSpeaker);
      setMessage('');
      setSelectedImage(null);
      setSelectedImagePreview(null);
    } else if (message.trim() && !isLoading) {
      // 发送纯文本消息
      onSendMessage(message, [], 'text', selectedSpeaker);
      setMessage('');
    }
  };

  // 处理图像选择
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      
      // 创建预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 清除选择的图像
  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImagePreview(null);
    fileInputRef.current.value = '';
  };

  // 打开文件选择器
  const openFileSelector = () => {
    fileInputRef.current.click();
  };

  // 开始录音
  const startRecording = async (e) => {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        
        // 清理媒体流
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('无法访问麦克风，请检查权限设置。');
    }
  };

  // 停止录音
  const stopRecording = (e) => {
    e.preventDefault();
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  // 发送音频消息
  const sendAudioMessage = async (audioBlob) => {
    if (audioBlob.size > 0 && !isLoading) {
      // 创建File对象，以便FormData可以正确处理
      const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });
      onSendMessage('', [audioFile], 'voice', selectedSpeaker);
    }
  };

  return (
    <div className="chat-input">
      <form onSubmit={handleSubmit}>
        {/* 图像预览 */}
        {selectedImagePreview && (
          <div className="image-preview-container">
            <img src={selectedImagePreview} alt="Preview" className="image-preview" />
            <button 
              type="button" 
              className="clear-image-btn action-button"
              onClick={clearSelectedImage}
            >
              &times;
            </button>
          </div>
        )}
        
        <div className="chat-input-controls">
          {/* 切换录音/键盘模式 */}
          <button 
            type="button" 
            className="mode-toggle-button action-button"
            onClick={toggleInputMode}
            disabled={isLoading}
          >
            {isRecordMode ? <FaKeyboard /> : <FaMicrophone />}
          </button>

          {/* 录音模式 */}
          {isRecordMode ? (
            <button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              onMouseLeave={isRecording ? stopRecording : undefined}
              disabled={isLoading}
            >
              {isRecording ? 'Recording...' : 'Long press to record'}
            </button>
          ) : (
            <>
              {/* 文本输入模式 */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={selectedImage ? "Add image description..." : "Please enter your message..."}
                disabled={isLoading}
                rows={1}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              
              {/* 图像上传按钮 */}
              <button
                type="button"
                className="image-upload-button action-button"
                onClick={openFileSelector}
                disabled={isLoading}
              >
                <FaImage />
              </button>
              
              {/* 隐藏的文件输入 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageSelect}
              />
              
              {/* 发送按钮 */}
              <button
                type="submit"
                className="send-button action-button"
                disabled={(!(message.trim() || selectedImage)) || isLoading}
              >
                <BsArrowRightCircleFill />
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default ChatInput; 