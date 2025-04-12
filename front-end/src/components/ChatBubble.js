import React from 'react';
import PropTypes from 'prop-types';
import './ChatBubble.css';

const ChatBubble = ({ message, isUser }) => {
  return (
    <div className={`chat-bubble-container ${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-bubble">
        <div className="chat-content">
          {message}
        </div>
      </div>
    </div>
  );
};

ChatBubble.propTypes = {
  message: PropTypes.node.isRequired,
  isUser: PropTypes.bool.isRequired
};

export default ChatBubble; 