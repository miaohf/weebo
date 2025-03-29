// 服务器地址配置
export const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.31.17:8080';

// 音频配置
export const AUDIO_CONFIG = {
  defaultSampleRate: 24000,
  defaultSpeaker: 'default'
};

// 聊天配置
export const CHAT_CONFIG = {
  maxMessagesStored: 100,
  autoPlayAudio: true
};

// // 添加全局speaker配置
export const AVAILABLE_SPEAKERS = [
  { id: 'default', label: 'default' },
  { id: 'af_sky', label: 'af_sky' },
  { id: 'Churcher', label: 'Churcher' },
  { id: 'Dinesen', label: 'Dinesen' },
  { id: 'Hearme', label: 'Hearme' },
  { id: 'Joa', label: 'Joa' },
  { id: 'Massi', label: 'Massi' },
  { id: 'Scarlett', label: 'Scarlett' },
  { id: 'zonos-t-british-female', label: 'zonos-t-british-female' },
  { id: 'zonos_americanfemale', label: 'zonos_americanfemale' }
]; 



// // 添加全局speaker配置
// export const AVAILABLE_SPEAKERS = ['default', 'af_sky', 'Churcher', 'Dinesen', 
//   'Hearme', 'Joa', 'Massi', 'Scarlett', 'zonos-t-british-female', 'zonos_americanfemale'];

