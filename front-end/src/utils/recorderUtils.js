// 录音工具类
export default class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.audioContext = null; // 用于音频处理
  }

  // 开始录音
  async startRecording() {
    if (this.isRecording) return;

    try {
      // 请求麦克风访问权限，使用优化参数
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,    // 高采样率提高质量
          channelCount: 1       // 单声道录音，适合语音
        } 
      });
      
      this.audioChunks = [];
      
      // 尝试获取轨道设置
      const tracks = this.stream.getAudioTracks();
      if (tracks.length > 0) {
        const settings = tracks[0].getSettings();
        console.log('[AudioDebug] 录音轨道设置:', {
          设备: settings.deviceId || '默认',
          采样率: settings.sampleRate || '未知',
          声道数: settings.channelCount || '未知',
          延迟: settings.latency || '未知'
        });
      }
      
      // 尝试使用最优的音频格式
      const mimeTypes = [
        'audio/wav',       // 无损，STT友好
        'audio/webm;codecs=pcm', // WebM PCM (无损)
        'audio/webm',      // WebM (通常使用opus编码)
        'audio/mp4',       // AAC编码
        'audio/mpeg'       // MP3
      ];
      
      let options = {};
      
      // 查找浏览器支持的最佳格式
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options.mimeType = type;
          console.log(`[AudioDebug] 选择使用录音格式: ${type}`);
          break;
        }
      }
      
      // 设置较高比特率
      if (options.mimeType) {
        options.audioBitsPerSecond = 128000; // 高比特率
      }
      
      // 创建媒体录制器
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, options);
        console.log('[AudioDebug] 创建MediaRecorder:', {
          类型: this.mediaRecorder.mimeType || '默认类型',
          状态: this.mediaRecorder.state
        });
      } catch (err) {
        console.warn('[AudioDebug] 使用指定配置创建MediaRecorder失败，使用默认配置:', err);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }
      
      // 监听数据可用事件
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log(`[AudioDebug] 录音片段 #${this.audioChunks.length}, 大小: ${event.data.size} 字节`);
        } else {
          console.warn('[AudioDebug] 收到空的音频数据块');
        }
      };
      
      // 开始录制，使用较小的时间片
      this.mediaRecorder.start(100); // 每100ms生成一个数据块
      this.isRecording = true;
      
      // 添加主动请求数据的机制，增加捕获精度
      this.dataInterval = setInterval(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          try {
            this.mediaRecorder.requestData();
          } catch (err) {
            // 有些浏览器可能不支持requestData
            console.warn('[AudioDebug] requestData失败:', err);
          }
        }
      }, 250); // 每250ms请求一次数据
      
      console.log('[AudioDebug] 录音开始，使用格式:', this.mediaRecorder.mimeType || '默认格式');
      return true;
    } catch (error) {
      console.error('[AudioDebug] 启动录音失败:', error);
      return false;
    }
  }

  // 停止录音并返回录音数据
  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return null;
    }

    // 清除主动请求数据的定时器
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
      this.dataInterval = null;
    }

    return new Promise((resolve) => {
      // 监听录音停止事件
      this.mediaRecorder.onstop = async () => {
        // 创建Blob对象，使用最适合的类型
        const blobType = this.mediaRecorder.mimeType || 'audio/wav';
        const audioBlob = new Blob(this.audioChunks, { type: blobType });
        
        console.log('[AudioDebug] 录音结束，音频数据:', {
          块数: this.audioChunks.length,
          总大小: audioBlob.size,
          MIME类型: blobType
        });
        
        if (audioBlob.size <= 0) {
          console.error('[AudioDebug] 录音失败: 音频数据为空');
          this.cleanUp();
          resolve(null);
          return;
        }
        
        // 转换为Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          // 获取Base64数据
          const base64String = reader.result;
          const base64Audio = base64String.split(',')[1]; // 移除Data URL前缀
          
          if (!base64Audio) {
            console.error('[AudioDebug] Base64转换失败');
            this.cleanUp();
            resolve(null);
            return;
          }
          
          console.log('[AudioDebug] 音频转换为Base64完成:', {
            原始大小: audioBlob.size,
            Base64长度: base64Audio.length
          });
          
          // 清理资源
          this.cleanUp();
          
          // 返回录音数据
          resolve({
            blob: audioBlob,
            base64: base64Audio,
            mimeType: blobType,
            duration: this.getDuration(),
            chunks: this.audioChunks.length
          });
        };
        
        reader.onerror = (error) => {
          console.error('[AudioDebug] Base64转换错误:', error);
          this.cleanUp();
          resolve(null);
        };
      };
      
      try {
        // 请求最后一块数据
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        
        // 停止录制
        this.mediaRecorder.stop();
        this.isRecording = false;
        console.log('[AudioDebug] 录音停止命令已发送');
      } catch (error) {
        console.error('[AudioDebug] 停止录音时出错:', error);
        this.cleanUp();
        resolve(null);
      }
    });
  }

  // 取消录音
  cancelRecording() {
    if (!this.isRecording) return;
    
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
      this.dataInterval = null;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.cleanUp();
    this.isRecording = false;
    console.log('[AudioDebug] 录音取消');
  }

  // 清理资源
  cleanUp() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log('[AudioDebug] 已停止音频轨道:', track.kind);
      });
      this.stream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(err => {
        console.warn('[AudioDebug] 关闭音频上下文失败:', err);
      });
      this.audioContext = null;
    }
  }

  // 获取录音时长（估计值）
  getDuration() {
    if (this.audioChunks.length === 0) return 0;
    // 一个更精确的估计，基于收集的数据块和采样间隔
    return this.audioChunks.length * 100; // 假设每100ms一个块
  }
} 