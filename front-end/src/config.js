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
  { id: 'af_sky', label: 'af_sky' },
  { id: 'Churcher', label: 'Churcher' },
  { id: 'Dinesen', label: 'Dinesen' },
  { id: 'Hearme', label: 'Hearme' },
  { id: 'Joa', label: 'Joa' },
  { id: 'Massi', label: 'Massi' },
  { id: 'Scarlett', label: 'Scarlett' },
  { id: 'zonos-t-british-female', label: 'zonos-t-british-female' },
  { id: 'zonos_americanfemale', label: 'zonos_americanfemale' },
  { id: 'megatts_keai', label: 'megatts_keai' },
  { id: 'megatts_liansheng', label: 'megatts_liansheng' },
  { id: 'megatts_wuyuetian_cn', label: 'megatts_wuyuetian_cn' },
  { id: 'megatts_hunhou_male_cn', label: 'megatts_hunhou_male_cn' },
  { id: 'megatts_hunhou_male2_cn', label: 'megatts_hunhou_male2_cn' },
  { id: 'megatts_hunhou_male3_cn', label: 'megatts_hunhou_male3_cn' },
  { id: 'megatts_hunhou_male3_cn', label: 'megatts_hunhou_male3_cn' },
  { id: 'megatts_hentaoyan_male4_cn', label: 'megatts_hentaoyan_male4_cn' },
  { id: 'megatts_zhongli_male5_cn', label: 'megatts_zhongli_male5_cn' },
  { id: 'megatts_xwlb_female1_cn', label: 'megatts_xwlb_female1_cn' },
  { id: 'megatts_wenrou_female2_cn', label: 'megatts_wenrou_female2_cn' },
  { id: 'megatts_wenrou_female3_cn', label: 'megatts_wenrou_female3_cn' },
  { id: 'megatts-british-male', label: 'megatts-british-male' },
  { id: 'megatts-british-female', label: 'megatts-british-female' },
  { id: 'megatts-american-male', label: 'megatts-american-male' },
  { id: 'megatts-american-female', label: 'megatts-american-female' },
]; 





