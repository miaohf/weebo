import React, { useRef, useEffect } from 'react';
import { List } from '@mui/material';
import MessageItem from './MessageItem';

const ChatList = ({ 
  messages, 
  showChinese, 
  playingIndex, 
  isPlayingAll, 
  playSingleAudio, 
  replayAudio,
  isProcessing,
  currentlyPlaying
}) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <List sx={{ 
      flexGrow: 1, 
      overflow: 'auto', 
      mb: 2,
      px: { xs: 0, sm: 1 }
    }}>
      {messages.map((msg, index) => (
        <MessageItem
          key={msg.id || index}
          message={msg}
          index={index}
          showChinese={showChinese}
          playingIndex={playingIndex}
          isPlayingAll={isPlayingAll}
          playSingleAudio={playSingleAudio}
          replayAudio={replayAudio}
          isProcessing={isProcessing}
          currentlyPlaying={currentlyPlaying}
        />
      ))}
      <div ref={messagesEndRef} />
    </List>
  );
};

export default ChatList; 