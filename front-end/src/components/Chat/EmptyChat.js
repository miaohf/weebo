import React from 'react';
import './EmptyChat.css';

function EmptyChat() {
  return (
    <div className="empty-chat">
      <div className="empty-chat-icon">💬</div>
      <h3>开始新的对话</h3>
      <p>发送消息开始与语音助手交流，您可以询问任何问题或使用录音功能进行语音交流。</p>
      <div className="empty-chat-examples">
        <div className="example-title">示例问题:</div>
        <div className="example-items">
          <button className="example-item">如何学习英语口语？</button>
          <button className="example-item">给我讲个笑话</button>
          <button className="example-item">介绍一下中国的传统文化</button>
          <button className="example-item">如何有效地管理时间？</button>
        </div>
      </div>
    </div>
  );
}

export default EmptyChat; 