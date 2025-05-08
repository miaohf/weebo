// 服务器地址配置
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// 音频配置
export const AUDIO_CONFIG = {
  defaultSampleRate: 24000,
  defaultSpeaker: 'default',
  autoPlay: true
};

// 聊天配置
export const CHAT_CONFIG = {
  maxMessagesStored: 100,
  autoPlayAudio: true
};

// // 添加全局speaker配置
export const AVAILABLE_SPEAKERS = [
  { id: 'default', label: 'default' },
  { id: 'Scarlett', label: 'Scarlett' },
  { id: 'zhongli_male5_cn', label: 'male-zhongli' },
  { id: 'wenrou_female3_cn', label: 'female-sexy-you' },
  { id: 'zaogao_female1', label: 'female-softly-you' },
  { id: 'wenrou_female2_cn', label: 'female-softly-mid' },
  { id: 'american-female', label: 'female-american' },
  { id: 'american-male', label: 'male-american' },
  { id: 'british-female', label: 'female-british' },
  { id: 'british-male', label: 'male-british' },
  { id: 'PatrikBaab', label: 'male-PatrikBaab' },
]; 





