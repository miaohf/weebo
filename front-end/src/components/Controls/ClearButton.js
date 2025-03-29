import React, { useState } from 'react';
import './Controls.css';

const ClearButton = ({ onClear }) => {
  const [confirming, setConfirming] = useState(false);
  
  const handleClick = () => {
    if (confirming) {
      // 二次确认通过，执行清空
      onClear();
      setConfirming(false);
    } else {
      // 首次点击，等待确认
      setConfirming(true);
      
      // 5秒后自动取消确认状态
      setTimeout(() => {
        setConfirming(false);
      }, 5000);
    }
  };
  
  return (
    <div className="control-item clear-button-container">
      {/* 桌面版本 */}
      <button 
        className={`clear-button desktop-only ${confirming ? 'confirming' : ''}`}
        onClick={handleClick}
        title={confirming ? "再次点击确认清空" : "清空聊天记录"}
      >
        {confirming ? "确认清空?" : "清空"}
      </button>
      
      {/* 移动版本 - 只使用图标 */}
      <button 
        className={`clear-button mobile-only ${confirming ? 'confirming' : ''}`}
        onClick={handleClick}
        title={confirming ? "再次点击确认清空" : "清空聊天记录"}
      >
        {confirming ? "✓" : "🗑️"}
      </button>
    </div>
  );
};

export default ClearButton; 