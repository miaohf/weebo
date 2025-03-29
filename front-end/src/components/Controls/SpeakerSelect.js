import React from 'react';
import './Controls.css';

const SpeakerSelect = ({ selectedSpeaker, speakers, onChange }) => {
  // 获取显示名称（用于正常屏幕）
  const getDisplayName = (speaker) => {
    switch(speaker) {
      case 'default': return '默认';
      case 'female': return '女声';
      case 'male': return '男声';
      default: return speaker;
    }
  };
  
  // 获取短名称（用于小屏幕）
  const getShortName = (speaker) => {
    switch(speaker) {
      case 'default': return '默';
      case 'female': return '女';
      case 'male': return '男';
      default: return speaker.charAt(0);
    }
  };
  
  return (
    <div className="control-item speaker-select-container">
      {/* 大屏幕版本 */}
      <select 
        className="speaker-select desktop-only"
        value={selectedSpeaker}
        onChange={(e) => onChange(e.target.value)}
        title="选择语音"
      >
        {speakers.map(speaker => (
          <option key={`desktop-${speaker}`} value={speaker}>
            {getDisplayName(speaker)}
          </option>
        ))}
      </select>
      
      {/* 小屏幕版本 */}
      <select 
        className="speaker-select mobile-only"
        value={selectedSpeaker}
        onChange={(e) => onChange(e.target.value)}
        title="选择语音"
      >
        {speakers.map(speaker => (
          <option key={`mobile-${speaker}`} value={speaker}>
            {getShortName(speaker)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SpeakerSelect; 