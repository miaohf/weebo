import React from 'react';
import './Controls.css';

const LanguageToggle = ({ showChinese, onToggle }) => {
  return (
    <div className="control-item language-toggle-container">
      <button 
        className={`language-toggle ${showChinese ? 'active' : ''}`}
        onClick={onToggle}
        title={showChinese ? "点击隐藏中文" : "点击显示中文"}
      >
        {showChinese ? "CN" : "EN"}
      </button>
    </div>
  );
};

export default LanguageToggle; 