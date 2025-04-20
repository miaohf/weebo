import React, { useState, useRef } from 'react';
import { FaMicrophone, FaKeyboard, FaImage } from 'react-icons/fa';
import { BsArrowRightCircleFill, BsFillStopCircleFill } from "react-icons/bs";
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
      
      // 优化麦克风设置，设置最佳参数以获得清晰音频
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          // 降噪处理
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          
          // 使用标准采样率以提高兼容性
          sampleRate: 44100,
          
          // 使用单声道以减少数据量
          channelCount: 1
        } 
      });
      
      // console.log('[AudioDebug] 获取到麦克风流:', stream);
      const audioTracks = stream.getAudioTracks();
      
      // 获取并记录音频轨道的详细设置
      if (audioTracks.length > 0) {
        const track = audioTracks[0];
        // const settings = track.getSettings();

        // 尝试应用额外的音轨约束
        try {
          track.applyConstraints({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
          }).then(() => {
            // 已应用额外音轨约束
          }).catch(err => {
            console.warn('[AudioDebug] 无法应用额外音轨约束:', err);
          });
        } catch (err) {
          console.warn('[AudioDebug] 音轨约束错误:', err);
        }
      } else {
        console.warn('[AudioDebug] 未获取到音频轨道');
      }
      
      if (audioTracks.length === 0) {
        throw new Error('没有获取到音频轨道，请检查麦克风设备');
      }
      
      // 优化录音格式 - 尽量使用WAV或FLAC，这些是最适合语音识别的无损格式
      let options = {};
      const mimeTypes = [
        'audio/wav',     // 首选WAV格式（无损）
        'audio/flac',    // 或FLAC（无损压缩）
        'audio/webm',    // WebM通常使用较好的Opus编码
        'audio/mp4',     // AAC编码，较好的兼容性
        'audio/mpeg',    // MP3
        'audio/ogg'      // OGG Vorbis/Opus
      ];
      
      // 查找浏览器支持的类型
      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options.mimeType = type;
          selectedMimeType = type;
          break;
        }
      }
      
      // 如果没有找到支持的MIME类型，尝试使用最通用的
      if (!selectedMimeType) {
        // 尝试使用最通用的 WebM 或 MP4 格式
        for (const type of ['audio/webm', 'audio/mp4']) {
          if (MediaRecorder.isTypeSupported(type)) {
            options.mimeType = type;
            selectedMimeType = type;
            console.log(`[AudioDebug] 回退使用通用MIME类型: ${type}`);
            break;
          }
        }
      }
      
      try {
        // 使用合理比特率来确保音质，但不过高
        if (selectedMimeType) {
          // 根据不同格式设置不同比特率
          if (selectedMimeType.includes('wav') || selectedMimeType.includes('flac')) {
            options.audioBitsPerSecond = 128000; // 降低比特率以提高兼容性
          } else {
            options.audioBitsPerSecond = 96000; // 有损格式使用标准比特率
          }
        }
        
        mediaRecorder.current = new MediaRecorder(stream, options);

      } catch (e) {

        // 在失败时使用默认配置
        mediaRecorder.current = new MediaRecorder(stream);

      }

      
      audioChunks.current = [];

      // 确保ondataavailable在start()之前设置
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        } else {
          console.warn('[AudioDebug] ⚠️ 收到空的录音数据块');
        }
      };

      mediaRecorder.current.onerror = (event) => {
        console.error('[AudioDebug] MediaRecorder错误:', event.error);
      };

      mediaRecorder.current.onstop = () => {
        if (audioChunks.current.length === 0) {
          console.error('[AudioDebug] 没有收集到任何音频数据');
          
          // 显示错误但继续尝试处理
          if (window.confirm('录音未捕获到数据。是否发送文本消息代替？')) {
            // 不再尝试发送测试音频，而是直接发送文本消息
            const defaultMessage = "This is a voice message. ";
            onSendMessage(defaultMessage, [], 'text', selectedSpeaker, true);
          } else {
            // 保留关键错误提示
            alert('录音失败: 没有收集到任何音频数据。请检查麦克风权限和设置。');
          }
          return;
        }
        
        // 延迟处理音频数据，确保所有数据都被完全收集

        setTimeout(() => {
          // 根据使用的mimeType创建适当类型的Blob
          const mimeType = mediaRecorder.current.mimeType || 'audio/wav';


          
          // 检查是否有有效数据块
          const validChunks = audioChunks.current.filter(chunk => chunk.size > 0);
          if (validChunks.length === 0) {
            console.error('[AudioDebug] 所有音频块都为空!');
            alert('录音失败: 所有录音数据块都为空。请重试或检查麦克风设置。');
            return;
          }
          
          // 创建合并的Blob，确保使用所有有效的数据块
          const audioBlob = new Blob(validChunks, { type: mimeType });
          
          if (audioBlob.size > 0) {
            // 简单检查录音时长
            try {
              const tempUrl = URL.createObjectURL(audioBlob);
              const tempAudio = new Audio(tempUrl);
              tempAudio.onloadedmetadata = () => {
                URL.revokeObjectURL(tempUrl);
                
                // 只有当录音时长合理时才发送
                if (tempAudio.duration < 0.5) {
                  console.warn('[AudioDebug] 录音时长过短');
                  if (window.confirm('录音时间过短(不足0.5秒)。是否仍要发送？')) {
                    sendAudioMessage(audioBlob);
                  } else {
                    alert('已取消发送。请尝试重新录音并讲话时间长一些。');
                  }
                } else {
                  // 录音时长合理，直接发送
                  sendAudioMessage(audioBlob);
                }
              };
              
              tempAudio.onerror = (e) => {
                console.warn('[AudioDebug] 无法获取录音时长:', e);
                // 无法获取时长时，仍然尝试发送
                sendAudioMessage(audioBlob);
              };
            } catch (err) {
              console.warn('[AudioDebug] 检查录音时长失败:', err);
              // 出错时仍然尝试发送
              sendAudioMessage(audioBlob);
            }
          } else {
            console.error('[AudioDebug] ❌ 创建的audioBlob大小为0!');
            // 保留关键错误提示
            alert('录音失败: 生成的音频文件为空。请重试。');
          }
        }, 300); // 延迟300ms确保数据收集完整
        
        // 清理媒体流
        stream.getTracks().forEach(track => {
          track.stop();
        });
      };

      // 使用较大的时间片段收集数据，减少碎片化
      mediaRecorder.current.start(1000); // 使用1秒为单位收集数据
      setIsRecording(true);
      
      // 减少请求频率，每1秒主动请求一次数据
      let dataCollectionInterval = setInterval(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          try {
            mediaRecorder.current.requestData();
          } catch (err) {
            console.warn('[AudioDebug] 请求数据块失败:', err);
          }
        } else {
          clearInterval(dataCollectionInterval);
        }
      }, 1000); // 调整为1000ms，确保数据块较大和完整
      
      // 设置最大录音时间（60秒，给用户充足时间）
      setTimeout(() => {
        clearInterval(dataCollectionInterval);
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          // 在停止前先请求一次数据，确保捕获最后部分
          try {
            mediaRecorder.current.requestData();
          } catch (err) {
            console.warn('[AudioDebug] 停止前请求最终数据块失败:', err);
          }
          
          // 给requestData一点时间处理
          setTimeout(() => {
            mediaRecorder.current.stop();
            setIsRecording(false);
            // 自动切换回文本输入模式
            setIsRecordMode(false);
          }, 200);
        }
      }, 60000);
      
    } catch (error) {
      console.error('[AudioDebug] ❌ 访问麦克风失败:', error);
      // 保留关键错误提示
      alert(`无法访问麦克风: ${error.message}。请检查浏览器权限设置。`);
      // 出错时切换回文本模式
      setIsRecordMode(false);
    }
  };

  // 停止录音
  const stopRecording = (e) => {
    if (e) e.preventDefault();
    
    if (mediaRecorder.current && isRecording) {
      if (mediaRecorder.current.state === 'recording') {
        // 在停止前先请求一次数据，确保捕获最后部分
        try {
          mediaRecorder.current.requestData();
          
          // 给requestData一点时间处理
          setTimeout(() => {
            mediaRecorder.current.stop();
            setIsRecording(false);
            // 停止录音后自动切换回文本输入模式
            setIsRecordMode(false);
          }, 200);
        } catch (err) {
          console.warn('[AudioDebug] 停止前请求最终数据块失败:', err);
          mediaRecorder.current.stop();
          setIsRecording(false);
          setIsRecordMode(false);
        }
      } else {
        setIsRecording(false);
        setIsRecordMode(false);
      }
    } else {
      // 无法停止时也切换回文本模式
      setIsRecordMode(false);
    }
  };

  // 发送音频消息
  const sendAudioMessage = async (audioBlob) => {
    if (!audioBlob || audioBlob.size <= 0) {
      console.error('[AudioDebug] 无效的音频数据 - 大小为0或空');
      alert('无法处理语音: 录音数据为空。请重新尝试录音。');
      return;
    }

    // 检查音频大小是否合理
    if (audioBlob.size < 1000) {
      console.warn('[AudioDebug] 音频文件非常小，可能录制不完整');
      if (!window.confirm('录音文件非常小，可能录制不完整。是否仍要发送？')) {
        return;
      }
    }
    
    if (!isLoading) {
      try {
        // 延迟200ms后再发送，给浏览器足够时间处理音频数据
        setTimeout(async () => {
          // 检查onSendMessage
          if (typeof onSendMessage !== 'function') {
            console.error('[AudioDebug] onSendMessage不是一个函数');
            alert('内部错误: 无法发送消息。请刷新页面后重试。');
            return;
          }
          
          // 检查是否过大
          const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
          if (audioBlob.size > MAX_AUDIO_SIZE) {
            console.warn('[AudioDebug] 音频文件过大');
            if (!window.confirm('录音文件较大，可能发送时间较长。是否继续发送？')) {
              return;
            }
          }
          
          // 创建一个新的音频Blob，确保类型正确，并明确指定WAV格式
          let optimizedBlob;
          try {
            // 使用原始Blob创建新Blob，确保类型正确
            optimizedBlob = new Blob([audioBlob], { 
              type: 'audio/wav'
            });
          } catch (err) {
            console.warn('[AudioDebug] 无法创建优化Blob，使用原始Blob:', err);
            optimizedBlob = audioBlob;
          }
          
          // 显式传递第五个参数true，表示streamAudio
          onSendMessage('', [optimizedBlob], 'voice', selectedSpeaker, true);
        }, 200);
      } catch (error) {
        console.error('[AudioDebug] 发送音频消息时出错:', error);
        alert(`发送音频消息失败: ${error.message}`);
      }
    } else {
      alert('系统正在处理上一条消息，请稍后再试。');
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
        
        {/* 录音状态提示 */}
        {/* {isRecordMode && isRecording && (
          <div className="recording-status">
            {audioChunks.current.length > 0 && (
              <span className="recording-size">
                (总大小: {
                  audioChunks.current.reduce((sum, chunk) => sum + chunk.size, 0) / 1024
                  > 1024 
                    ? (audioChunks.current.reduce((sum, chunk) => sum + chunk.size, 0) / 1024 / 1024).toFixed(2) + "MB" 
                    : (audioChunks.current.reduce((sum, chunk) => sum + chunk.size, 0) / 1024).toFixed(2) + "KB"
                })
              </span>
            )}
          </div>
        )} */}
        
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
              <BsFillStopCircleFill className="stop-icon" style={{ fontSize: '24px' }} />
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