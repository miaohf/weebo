import React from 'react';
import './Controls.css';

const LanguageToggle = ({ showChinese, onToggle }) => {
  return (

    <button
      className={`language-toggle`}
      onClick={onToggle}
      title={showChinese ? "点击隐藏中文" : "点击显示中文"}
    >
      {showChinese ? "CN" : "EN"}
    </button>

  );
};

export default LanguageToggle; 