// 录音工具类
export default class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
  }

  // 开始录音
  async startRecording() {
    if (this.isRecording) return;

    try {
      // 请求麦克风访问权限
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      
      // 创建媒体录制器
      this.mediaRecorder = new MediaRecorder(this.stream);
      
      // 监听数据可用事件
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      // 开始录制
      this.mediaRecorder.start();
      this.isRecording = true;
      
      console.log('录音开始');
      return true;
    } catch (error) {
      console.error('启动录音失败:', error);
      return false;
    }
  }

  // 停止录音并返回录音数据
  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return null;
    }

    return new Promise((resolve) => {
      // 监听录音停止事件
      this.mediaRecorder.onstop = async () => {
        // 创建Blob对象
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        
        // 转换为Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1]; // 移除Data URL前缀
          
          // 清理资源
          this.cleanUp();
          
          // 返回录音数据
          resolve({
            blob: audioBlob,
            base64: base64Audio,
            duration: this.getDuration()
          });
        };
      };
      
      // 停止录制
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('录音停止');
    });
  }

  // 取消录音
  cancelRecording() {
    if (!this.isRecording) return;
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.cleanUp();
    this.isRecording = false;
    console.log('录音取消');
  }

  // 清理资源
  cleanUp() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  // 获取录音时长（估计值）
  getDuration() {
    // 简单估计，基于收集的数据块
    return this.audioChunks.length > 0 ? this.audioChunks.length * 100 : 0; // 粗略估计ms
  }
} 