// 写入字符串到DataView
export const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// 创建WAV头
export const createWavHeader = ({ sampleRate, channels, bitDepth, data }) => {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = data.byteLength;

  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (raw)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, channels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // Block align
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, bitDepth, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataSize, true);

  return buffer;
};

// 在audioUtils.js中添加测试函数
export const testBrowserAudio = () => {
  return new Promise((resolve, reject) => {
    try {
      // 创建一个简单的音频振荡器
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // 低音量测试
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5); // 播放0.5秒
      
      setTimeout(() => {
        resolve(true);
      }, 600);
    } catch (error) {
      reject(error);
    }
  });
};

// 解析WAV文件头
export const parseWavHeader = (dataView) => {
  // 检查RIFF标识
  const riff = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3)
  );
  
  // 检查WAVE标识
  const wave = String.fromCharCode(
    dataView.getUint8(8),
    dataView.getUint8(9),
    dataView.getUint8(10),
    dataView.getUint8(11)
  );
  
  // 获取音频格式信息
  const sampleRate = dataView.getUint32(24, true);
  const channels = dataView.getUint16(22, true);
  const bitsPerSample = dataView.getUint16(34, true);
  
  return {
    isValid: riff === 'RIFF' && wave === 'WAVE',
    sampleRate,
    channels,
    bitsPerSample
  };
};

// 检查系统音量
export const checkSystemVolume = async () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("AudioContext状态:", audioContext.state);
    
    // 创建增益节点检查音量
    const gainNode = audioContext.createGain();
    console.log("默认增益:", gainNode.gain.value);
    
    // 尝试获取媒体设备
    if (navigator.mediaDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      console.log("音频输出设备:", audioOutputs);
    }
    
    return {
      contextState: audioContext.state,
      defaultGain: gainNode.gain.value
    };
  } catch (error) {
    console.error("检查系统音量失败:", error);
    return {
      error: error.message
    };
  }
}; 