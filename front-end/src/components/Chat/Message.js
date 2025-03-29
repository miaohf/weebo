import React from 'react';
import './Message.css';

function Message({ message, showChinese, onReplayAudio, isPlaying }) {
  const { role, content, id } = message;
  
  // 格式化时间
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // 渲染消息内容
  const renderContent = () => {
    // 检查是否是语音消息
    if (typeof content === 'string' && content.includes('[语音消息]')) {
      return (
        <div className="audio-message">
          <span className="audio-message-icon">🎤</span>
          <span className="audio-message-text">语音消息</span>
        </div>
      );
    }
    
    // 检查content是否为字符串
    if (typeof content === 'string') {
      return <p>{content}</p>;
    }
    
    // 检查content是否有english和chinese属性
    if (!content.english && !content.chinese) {
      return <p>无内容</p>;
    }
    
    // 根据showChinese标志显示对应语言内容
    return (
      <>
        {showChinese ? (
          <p className="message-chinese">{content.chinese || '无中文内容'}</p>
        ) : (
          <p className="message-english">{content.english || '无英文内容'}</p>
        )}
      </>
    );
  };
  
  return (
    <div className={`message ${role}`}>
      <div className="message-bubble">
        <div className="message-header">
          <div className="header-left">
            <span className="role">{role === 'user' ? '用户' : '助手'}</span>
            {/* 播放按钮移动到助手标签右侧，只在助手消息中显示 */}
            {role === 'assistant' && (
              <button 
                className={`play-audio-button ${isPlaying ? 'playing' : ''}`}
                onClick={() => onReplayAudio && onReplayAudio(id)}
                disabled={isPlaying}
              >
                <span className="play-icon"></span>
                {isPlaying ? '播放中...' : '播放'}
              </button>
            )}
          </div>
          <span className="time">{formatTime(message.timestamp)}</span>
        </div>
        <div className="message-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default Message; 