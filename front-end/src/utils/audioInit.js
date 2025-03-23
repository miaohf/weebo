// 解锁浏览器音频上下文
export const unlockAudioContext = async () => {
  // 音频上下文解锁
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    
    // 创建一个空的音频缓冲区并播放它
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    // 在某些浏览器中，需要由用户交互触发
    console.log("尝试解锁音频上下文");
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    source.start(0);
    source.stop(0.001); // 几乎立即停止
    
    return true;
  } catch (error) {
    console.error("解锁音频上下文失败:", error);
    return false;
  }
};

// 解锁音频播放
export const unlockAudioPlayback = async () => {
  try {
    // 创建并播放静音音频
    const silentAudio = new Audio("data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
    
    // 设置音量为0防止实际播放出声音
    silentAudio.volume = 0;
    
    // 播放并立即暂停
    await silentAudio.play();
    silentAudio.pause();
    
    console.log("音频播放已解锁");
    return true;
  } catch (error) {
    console.error("解锁音频播放失败:", error);
    return false;
  }
};

// 初始化所有音频系统
export const initAudioSystems = async () => {
  // 解锁音频上下文
  const contextUnlocked = await unlockAudioContext();
  
  // 解锁音频播放
  const playbackUnlocked = await unlockAudioPlayback();
  
  // 初始化Howler
  if (window.Howler) {
    window.Howler.autoUnlock = true;
    window.Howler.html5PoolSize = 10;
  }
  
  return {
    contextUnlocked,
    playbackUnlocked,
    overallSuccess: contextUnlocked && playbackUnlocked
  };
}; 