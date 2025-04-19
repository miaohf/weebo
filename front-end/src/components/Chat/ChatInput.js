import React, { useState, useRef } from 'react';
import { FaMicrophone, FaKeyboard, FaImage } from 'react-icons/fa';
import { BsArrowRightCircleFill, BsFillRSquareFill } from "react-icons/bs";
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
      
      // 优化麦克风设置，设置最佳参数以获得清晰音频
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          // 降噪处理
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          
          // 使用较高采样率以保持音频清晰度
          sampleRate: 48000,
          
          // 使用单声道以减少数据量
          channelCount: 1,
          
          // 设置较高的比特率
          latency: 0.01,
          
          // 适合语音的设置
          volume: 1.0
        } 
      });
      
      console.log('[AudioDebug] 获取到麦克风流:', stream);
      const audioTracks = stream.getAudioTracks();
      
      // 获取并记录音频轨道的详细设置
      if (audioTracks.length > 0) {
        const track = audioTracks[0];
        const settings = track.getSettings();
        console.log('[AudioDebug] 音频轨道设置:', {
          设备ID: settings.deviceId,
          采样率: settings.sampleRate || '未知',
          声道数: settings.channelCount || '未知',
          自动增益: settings.autoGainControl || '未知',
          回声消除: settings.echoCancellation || '未知',
          噪声抑制: settings.noiseSuppression || '未知',
          延迟: settings.latency || '未知'
        });
        
        // 尝试应用额外的音轨约束
        try {
          track.applyConstraints({
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
          }).then(() => {
            console.log('[AudioDebug] 已应用额外音轨约束');
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
          console.log(`[AudioDebug] 选择使用MIME类型: ${type}`);
          break;
        }
      }
      
      try {
        // 使用最高比特率来确保音质
        if (selectedMimeType) {
          // 根据不同格式设置不同比特率
          if (selectedMimeType.includes('wav') || selectedMimeType.includes('flac')) {
            options.audioBitsPerSecond = 256000; // 无损格式使用更高比特率
          } else {
            options.audioBitsPerSecond = 128000; // 有损格式使用标准比特率
          }
        }
        
        mediaRecorder.current = new MediaRecorder(stream, options);
        console.log('[AudioDebug] MediaRecorder创建成功，使用配置:', {
          MIME类型: mediaRecorder.current.mimeType || '默认类型',
          比特率: options.audioBitsPerSecond || '默认'
        });
      } catch (e) {
        console.warn('[AudioDebug] 创建MediaRecorder失败，尝试使用默认配置:', e);
        // 在失败时使用默认配置
        mediaRecorder.current = new MediaRecorder(stream);
        console.log('[AudioDebug] 已回退到默认MediaRecorder配置');
      }
      
      console.log('[AudioDebug] 最终创建的MediaRecorder:', {
        状态: mediaRecorder.current.state,
        使用类型: mediaRecorder.current.mimeType || '默认类型',
        比特率: mediaRecorder.current.audioBitsPerSecond || '默认'
      });
      
      audioChunks.current = [];

      // 确保ondataavailable在start()之前设置
      mediaRecorder.current.ondataavailable = (event) => {
        console.log('[AudioDebug] 录音数据块可用:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          console.log('[AudioDebug] 当前已收集的音频块数量:', audioChunks.current.length);
        } else {
          console.warn('[AudioDebug] ⚠️ 收到空的录音数据块');
        }
      };

      mediaRecorder.current.onerror = (event) => {
        console.error('[AudioDebug] MediaRecorder错误:', event.error);
      };

      mediaRecorder.current.onstop = () => {
        console.log('[AudioDebug] 录音停止，收集的音频块数量:', audioChunks.current.length);
        
        if (audioChunks.current.length === 0) {
          console.error('[AudioDebug] ❌ 没有收集到任何音频数据!');
          
          // 显示错误但继续尝试处理
          if (window.confirm('录音未捕获到数据。是否发送文本消息代替？')) {
            // 不再尝试发送测试音频，而是直接发送文本消息
            console.log('[AudioDebug] 使用文本消息代替语音消息');
            
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
        const mimeType = mediaRecorder.current.mimeType || 'audio/wav';
        console.log('[AudioDebug] 使用MIME类型创建Blob:', mimeType);
        
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        console.log('[AudioDebug] 创建的音频Blob:', {
          大小: audioBlob.size,
          类型: audioBlob.type,
          块数: audioChunks.current.length
        });
        
        if (audioBlob.size > 0) {
          sendAudioMessage(audioBlob);
        } else {
          console.error('[AudioDebug] ❌ 创建的audioBlob大小为0!');
          // 保留关键错误提示
          alert('录音失败: 生成的音频文件为空。请重试。');
        }
        
        // 清理媒体流
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('[AudioDebug] 已停止音频轨道:', track.label);
        });
      };

      // 使用较小的时间片段收集数据，提高分辨率
      mediaRecorder.current.start(100);
      console.log('[AudioDebug] MediaRecorder已启动，状态:', mediaRecorder.current.state);
      setIsRecording(true);
      
      // 每250ms主动请求一次数据，增加数据采集频率和精度
      let dataCollectionInterval = setInterval(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          try {
            mediaRecorder.current.requestData();
            console.log('[AudioDebug] 主动请求录音数据块');
          } catch (err) {
            console.warn('[AudioDebug] 请求数据块失败:', err);
          }
        } else {
          clearInterval(dataCollectionInterval);
        }
      }, 250);
      
      // 设置最大录音时间（15秒，给用户充足时间）
      setTimeout(() => {
        clearInterval(dataCollectionInterval);
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          console.log('[AudioDebug] 达到最大录音时间，自动停止');
          mediaRecorder.current.stop();
          setIsRecording(false);
          // 自动切换回文本输入模式
          setIsRecordMode(false);
        }
      }, 15000);
      
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
    console.log('[AudioDebug] ===================');
    console.log('[AudioDebug] === 发送音频消息开始 ===');
    console.log('[AudioDebug] 收到的 audioBlob:', {
      大小: audioBlob.size,
      类型: audioBlob.type,
      是否为Blob: audioBlob instanceof Blob
    });
    
    if (!audioBlob || audioBlob.size <= 0) {
      console.error('[AudioDebug] ❌ 错误: 无效的音频数据 - 大小为0或空');
      alert('无法处理语音: 录音数据为空。请重新尝试录音。');
      return;
    }
    
    if (!isLoading) {
      try {
        // 提取MIME类型，确保有效
        const mimeType = audioBlob.type || 'audio/wav';
        
        console.log(`[AudioDebug] 使用MIME类型 ${mimeType} 处理音频数据`);
        
        // 保存原始录音 - 便于调试
        try {
          const url = URL.createObjectURL(audioBlob);
          console.log('[AudioDebug] 创建的临时音频URL:', url);
          
          // 创建一个隐藏的音频元素来检验录音质量
          const audio = new Audio(url);
          
          // 添加播放和错误事件监听器
          audio.onloadedmetadata = () => {
            console.log('[AudioDebug] 加载的音频元数据:', {
              时长: audio.duration.toFixed(2) + '秒',
              音量: audio.volume,
              当前时间: audio.currentTime,
              是否就绪: audio.readyState,
              是否暂停: audio.paused
            });
          };
          
          // 添加下载链接（调试时用）
          // 注意：这段代码仅供调试，实际生产环境可以移除
          if (false) { // 设置为true以启用下载功能进行调试
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `recording-${Date.now()}.${mimeType.split('/')[1] || 'wav'}`;
            downloadLink.innerHTML = "下载录音";
            downloadLink.style.display = "none";
            document.body.appendChild(downloadLink);
            //downloadLink.click(); // 自动下载
            setTimeout(() => {
              URL.revokeObjectURL(url);
              document.body.removeChild(downloadLink);
            }, 100);
          }
        } catch (err) {
          console.warn('[AudioDebug] 无法创建音频预览:', err);
        }
        
        // 直接使用blob对象发送，让API服务负责Base64编码
        console.log('[AudioDebug] 准备发送音频Blob，大小:', audioBlob.size, 'bytes');
        
        // 检查onSendMessage
        if (typeof onSendMessage !== 'function') {
          console.error('[AudioDebug] ❌ 错误: onSendMessage不是一个函数');
          alert('内部错误: 无法发送消息。请刷新页面后重试。');
          return;
        }
        
        // 验证AudioBlob
        if (audioBlob.size < 100) {
          console.warn('[AudioDebug] ⚠️ 警告: 音频文件非常小，可能录制失败');
        }
        
        // 创建一个新的音频Blob，确保类型正确
        // 这有助于修复可能的格式问题
        let optimizedBlob;
        try {
          // 优先使用WAV格式，因为STT服务器可能对其处理更好
          optimizedBlob = new Blob([audioBlob], { 
            type: 'audio/wav'
          });
          console.log('[AudioDebug] 创建了优化的音频Blob，使用WAV格式');
        } catch (err) {
          console.warn('[AudioDebug] 无法创建优化Blob，使用原始Blob:', err);
          optimizedBlob = audioBlob;
        }
        
        // 记录传给onSendMessage的参数
        console.log('[AudioDebug] 调用onSendMessage，参数:', {
          消息: '',
          文件数组: [optimizedBlob],
          消息类型: 'voice',
          发言人: selectedSpeaker,
          流式音频: true
        });
        
        // 显式传递第五个参数true，表示streamAudio
        onSendMessage('', [optimizedBlob], 'voice', selectedSpeaker, true);
        
        // 打印日志，确认文件已添加到请求中
        console.log('[AudioDebug] ✅ 发送语音消息完成', {
          原始大小: audioBlob.size,
          优化后大小: optimizedBlob.size,
          类型: optimizedBlob.type,
          发送时间: new Date().toISOString()
        });
      } catch (error) {
        console.error('[AudioDebug] ❌ 发送音频消息时出错:', error);
        alert(`发送音频消息失败: ${error.message}`);
      }
    } else {
      console.warn('[AudioDebug] ⚠️ 当前正在加载中，忽略音频消息');
      alert('系统正在处理上一条消息，请稍后再试。');
    }
    console.log('[AudioDebug] === 发送音频消息结束 ===');
    console.log('[AudioDebug] ===================');
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