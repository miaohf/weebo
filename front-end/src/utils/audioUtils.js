// 将Base64转换为AudioBuffer
export async function decodeBase64Audio(audioBase64, format = 'wav') {
  try {
    // 转换为Blob
    const byteCharacters = atob(audioBase64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: `audio/${format}` });
    
    return blob;
  } catch (error) {
    console.error('解码Base64音频失败:', error);
    throw error;
  }
}

// 解析WAV头获取采样率
export function parseWavHeader(byteArray) {
  if (byteArray.length < 44) return null;
  
  try {
    const sampleRate = byteArray[24] + 
                     (byteArray[25] << 8) + 
                     (byteArray[26] << 16) + 
                     (byteArray[27] << 24);
    
    const numChannels = byteArray[22] + (byteArray[23] << 8);
    const bitsPerSample = byteArray[34] + (byteArray[35] << 8);
    
    return {
      sampleRate,
      numChannels,
      bitsPerSample
    };
  } catch (error) {
    console.warn('解析WAV头失败:', error);
    return null;
  }
}

// 使用Web Audio API创建音频播放器
export function createAudioPlayer() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  const play = async (audioData) => {
    // 处理 Base64 编码的 WAV 音频
    if (audioData.audio_data && audioData.isBase64) {
      try {
        // 创建 Blob
        const byteCharacters = atob(audioData.audio_data);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        
        // 创建一个带有适当MIME类型的Blob
        const blob = new Blob([byteArray], { type: 'audio/wav' });
        
        // 解码音频
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 创建音频源并播放
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        source.start(0);
        return new Promise(resolve => {
          source.onended = resolve;
        });
      } catch (error) {
        console.error("解码Base64音频失败:", error);
        throw error;
      }
    }
    
    // 如果是Blob对象
    if (audioData instanceof Blob) {
      const arrayBuffer = await audioData.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      return new Promise((resolve) => {
        source.onended = resolve;
        source.start(0);
      });
    }
    
    // 如果是Base64字符串
    else if (typeof audioData === 'string') {
      const blob = await decodeBase64Audio(audioData);
      return play(blob);
    }
    
    // 如果是数组数据
    else if (Array.isArray(audioData.audio)) {
      const audioArray = new Float32Array(audioData.audio.length);
      
      // 判断数据类型并转换
      if (audioData.audio[0] <= 1 && audioData.audio[0] >= -1) {
        for (let i = 0; i < audioData.audio.length; i++) {
          audioArray[i] = audioData.audio[i];
        }
      } else {
        for (let i = 0; i < audioData.audio.length; i++) {
          audioArray[i] = audioData.audio[i] / 32768.0;
        }
      }
      
      const buffer = audioContext.createBuffer(
        1,
        audioArray.length,
        audioData.sample_rate || 24000
      );
      
      buffer.getChannelData(0).set(audioArray);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      
      return new Promise((resolve) => {
        source.onended = resolve;
        source.start(0);
      });
    }
    
    throw new Error('不支持的音频数据格式');
  };
  
  const resume = async () => {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  };
  
  return {
    play,
    resume,
    context: audioContext
  };
} 