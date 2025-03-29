import React, { useState, useRef, useEffect } from 'react';
import './Controls.css';
import { FiSettings } from 'react-icons/fi';
import { AVAILABLE_SPEAKERS } from '../../config'; // 导入配置

const SettingsMenu = ({ 
  selectedSpeaker, 
  onChangeSpeaker, 
  onClearHistory 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  
  // 处理点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 获取语音名称 - 使用配置数据
  const getSpeakerName = (speakerId) => {
    // 查找配置中的speaker
    const speaker = AVAILABLE_SPEAKERS.find(s => s.id === speakerId);
    
    // 如果找到配置，使用配置中的label，并添加中文标签
    if (speaker) {
      switch(speaker.id) {
        case 'default': return 'default';
        case 'af_sky': return 'AF Sky';
        case 'Churcher': return 'Churcher';
        case 'Dinesen': return 'Dinesen';
        case 'Hearme': return 'Hearme';
        case 'Joa': return 'Joa';
        case 'Massi': return 'Massi';
        case 'Scarlett': return 'Scarlett';
        case 'zonos-t-british-female': return 'british-fm';
        case 'zonos_americanfemale': return 'american-fm';
        default: return speaker.label || speaker.id;
      }
    }
    
    // 兼容处理，如果配置中没有找到
    return speakerId;
  };
  
  // 清空历史确认
  const [confirmingClear, setConfirmingClear] = useState(false);
  
  const handleClearClick = () => {
    if (confirmingClear) {
      onClearHistory();
      setConfirmingClear(false);
      setIsOpen(false);
    } else {
      setConfirmingClear(true);
      // 5秒后自动取消确认
      setTimeout(() => setConfirmingClear(false), 5000);
    }
  };
  
  return (
    <div className="settings-menu-container" ref={menuRef}>
      {/* 设置图标按钮 */}
      <button 
        className="settings-icon"
        onClick={() => setIsOpen(!isOpen)}
        title="设置"
      >
        <FiSettings color="#888" size={20} />
      </button>
      
      {/* 下拉菜单 */}
      {isOpen && (
        <div className="settings-dropdown">
          {/* 语音选择 */}
          <div className="dropdown-section">
            <h4>Voice Selection</h4>
            <div className="dropdown-options">
              {AVAILABLE_SPEAKERS.map(speaker => (
                <button 
                  key={speaker.id} 
                  className={`dropdown-option ${speaker.id === selectedSpeaker ? 'active' : ''}`}
                  onClick={() => {
                    onChangeSpeaker(speaker.id);
                    setIsOpen(false);
                  }}
                >
                  {getSpeakerName(speaker.id)}
                </button>
              ))}
            </div>
          </div>
          
          {/* 清空历史 */}
          <div className="dropdown-section">
            <button 
              className={`clear-history-btn ${confirmingClear ? 'confirming' : ''}`}
              onClick={handleClearClick}
            >
              {confirmingClear ? "确认清空?" : "clear history"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsMenu; 