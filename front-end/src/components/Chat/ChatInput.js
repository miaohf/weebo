import React, { useState, useRef } from 'react';
import { FaMicrophone, FaKeyboard, FaImage } from 'react-icons/fa';
import { BsArrowRightCircleFill, BsFillRecordCircleFill, BsFillRSquareFill } from "react-icons/bs";
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
    if (!isRecordMode) {
      // 从文本模式切换到录音模式时立即开始录音
      setIsRecordMode(true);
      // 使用setTimeout确保状态更新后再开始录音
      setTimeout(() => {
        startRecording();
      }, 0);
    } else {
      // 从录音模式切换回文本模式
      setIsRecordMode(false);
      // 如果正在录音，停止录音
      if (isRecording) {
        stopRecording();
      }
    }
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
    // 移除事件参数，因为现在这个函数可能不是直接从事件处理程序调用的
    if (e) e.preventDefault(); 
    
    try {
      // 清空之前的录音数据
      audioChunks.current = [];
      
      console.log('===== 开始录音 =====');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // 明确请求高质量音频
          sampleRate: 44100,
          channelCount: 1
        } 
      });
      
      console.log('获取到麦克风流:', stream);
      const audioTracks = stream.getAudioTracks();
      console.log('音频轨道:', audioTracks);
      
      if (audioTracks.length === 0) {
        throw new Error('没有获取到音频轨道，请检查麦克风设备');
      }
      
      // 尝试最广泛支持的音频格式 - MP3更容易支持
      let options = {};
      const mimeTypes = [
        'audio/mp3',
        'audio/mpeg',
        'audio/webm',
        'audio/ogg'
      ];
      
      // 查找浏览器支持的类型
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options.mimeType = type;
          console.log(`浏览器支持的录音MIME类型: ${type}`);
          break;
        }
      }
      
      try {
        // 增加音频比特率，确保音质
        options.audioBitsPerSecond = 128000;
        mediaRecorder.current = new MediaRecorder(stream, options);
        console.log('MediaRecorder创建成功，使用MIME类型:', 
          mediaRecorder.current.mimeType || '默认类型');
      } catch (e) {
        console.warn('创建MediaRecorder失败，尝试使用默认配置:', e);
        mediaRecorder.current = new MediaRecorder(stream);
      }
      
      console.log('创建的MediaRecorder:', {
        状态: mediaRecorder.current.state,
        支持的类型: mediaRecorder.current.mimeType || '默认类型'
      });
      
      audioChunks.current = [];

      // 确保ondataavailable在start()之前设置
      mediaRecorder.current.ondataavailable = (event) => {
        console.log('录音数据可用:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          console.log('当前已收集的音频块数量:', audioChunks.current.length);
        } else {
          console.warn('⚠️ 收到空的录音数据块');
        }
      };

      mediaRecorder.current.onerror = (event) => {
        console.error('MediaRecorder错误:', event.error);
      };

      mediaRecorder.current.onstop = () => {
        console.log('录音停止，收集的音频块数量:', audioChunks.current.length);
        
        if (audioChunks.current.length === 0) {
          console.error('❌ 没有收集到任何音频数据!');
          
          // 显示错误但继续尝试处理
          if (window.confirm('录音未捕获到数据。是否发送文本消息代替？')) {
            // 不再尝试发送测试音频，而是直接发送文本消息
            console.log('使用文本消息代替语音消息');
            
            // 通过onSendMessage发送一条文本消息
            const defaultMessage = "This is a voice message. ";
            onSendMessage(defaultMessage, [], 'text', selectedSpeaker, true);
          } else {
            // 保留关键错误提示
            alert('录音失败: 没有收集到任何音频数据。请检查麦克风权限和设置。');
          }
          return;
        }
        
        // 根据使用的mimeType创建适当类型的Blob
        const mimeType = mediaRecorder.current.mimeType || 'audio/mpeg';
        console.log('使用MIME类型创建Blob:', mimeType);
        
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        console.log('创建的音频Blob大小:', audioBlob.size, 'bytes, 类型:', audioBlob.type);
        
        if (audioBlob.size > 0) {
          sendAudioMessage(audioBlob);
        } else {
          console.error('❌ 创建的audioBlob大小为0!');
          // 保留关键错误提示
          alert('录音失败: 生成的音频文件为空。请重试。');
        }
        
        // 清理媒体流
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('已停止音频轨道:', track.label);
        });
      };

      // 使用更小的时间片段，增加采集频率
      mediaRecorder.current.start(200);
      console.log('MediaRecorder已启动，状态:', mediaRecorder.current.state);
      setIsRecording(true);
      
      // 每500ms主动请求一次数据，增加数据采集频率
      let dataCollectionInterval = setInterval(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          try {
            mediaRecorder.current.requestData();
            console.log('主动请求录音数据');
          } catch (err) {
            console.warn('请求数据失败:', err);
          }
        } else {
          clearInterval(dataCollectionInterval);
        }
      }, 500);
      
      // 设置最大录音时间（10秒，降低以便于测试）
      setTimeout(() => {
        clearInterval(dataCollectionInterval);
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          console.log('达到最大录音时间，自动停止');
          mediaRecorder.current.stop();
          setIsRecording(false);
          // 自动切换回文本输入模式
          setIsRecordMode(false);
        }
      }, 10000);
      
    } catch (error) {
      console.error('❌ 访问麦克风失败:', error);
      // 保留关键错误提示
      alert(`无法访问麦克风: ${error.message}。请检查浏览器权限设置。`);
      // 出错时切换回文本模式
      setIsRecordMode(false);
    }
  };

  // 停止录音
  const stopRecording = (e) => {
    if (e) e.preventDefault();
    
    console.log('===== 停止录音 =====');
    if (mediaRecorder.current && isRecording) {
      console.log('停止MediaRecorder，当前状态:', mediaRecorder.current.state);
      if (mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
        console.log('MediaRecorder已停止');
      } else {
        console.warn('⚠️ MediaRecorder不在录音状态，当前状态:', mediaRecorder.current.state);
      }
      setIsRecording(false);
      // 停止录音后自动切换回文本输入模式
      setIsRecordMode(false);
    } else {
      console.warn('⚠️ 无法停止录音: MediaRecorder不存在或未在录音');
      // 无法停止时也切换回文本模式
      setIsRecordMode(false);
    }
  };

  // 发送音频消息
  const sendAudioMessage = async (audioBlob) => {
    console.log('=== 发送音频消息开始 ===');
    console.log('收到的 audioBlob:', {
      大小: audioBlob.size,
      类型: audioBlob.type,
      是否为Blob: audioBlob instanceof Blob
    });
    
    if (!audioBlob || audioBlob.size <= 0) {
      console.error('❌ 错误: 无效的音频数据 - 大小为0或空');
      alert('无法处理语音: 录音数据为空。请重新尝试录音。');
      return;
    }
    
    if (!isLoading) {
      try {
        // 提取MIME类型，确保有效
        const mimeType = audioBlob.type || 'audio/mpeg';
        
        console.log(`使用MIME类型 ${mimeType} 处理音频数据`);
        
        // 直接使用blob对象发送，让API服务负责Base64编码
        console.log('直接发送音频Blob，大小:', audioBlob.size, 'bytes');
        
        // 检查onSendMessage
        if (typeof onSendMessage !== 'function') {
          console.error('❌ 错误: onSendMessage不是一个函数');
          alert('内部错误: 无法发送消息。请刷新页面后重试。');
          return;
        }
        
        // 记录传给onSendMessage的参数
        console.log('调用onSendMessage，参数:', {
          消息: '',
          文件数组: [audioBlob],  // 直接传递audioBlob，不再创建File对象
          消息类型: 'voice',
          发言人: selectedSpeaker,
          流式音频: true
        });
        
        // 显式传递第五个参数true，表示streamAudio
        onSendMessage('', [audioBlob], 'voice', selectedSpeaker, true);
        
        // 打印日志，确认文件已添加到请求中
        console.log('✅ 发送语音消息完成，音频大小:', audioBlob.size, 'bytes, 类型:', audioBlob.type);
      } catch (error) {
        console.error('❌ 发送音频消息时出错:', error);
        alert(`发送音频消息失败: ${error.message}`);
      }
    } else {
      console.warn('⚠️ 当前正在加载中，忽略音频消息');
      alert('系统正在处理上一条消息，请稍后再试。');
    }
    console.log('=== 发送音频消息结束 ===');
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
          {/* 切换录音/键盘模式按钮 - 仅在非录音状态显示麦克风图标，在录音状态显示键盘图标 */}
          <button 
            type="button" 
            className="mode-toggle-button action-button"
            onClick={toggleInputMode}
            disabled={isLoading}
          >
            {isRecordMode ? <FaKeyboard /> : <FaMicrophone />}
          </button>

          {/* 录音模式 - 不再需要onMouseDown启动录音，只需要onMouseUp停止录音 */}
          {isRecordMode ? (
            <button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              onClick={stopRecording}
              disabled={isLoading || !isRecording}
            >
              <BsFillRSquareFill />
            </button>
          ) : (
            <>
              {/* 文本输入模式 */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={selectedImage ? "Add image description..." : "Your message here..."}
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