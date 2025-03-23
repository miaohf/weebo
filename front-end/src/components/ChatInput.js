import React, { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  CircularProgress
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import SendIcon from '@mui/icons-material/Send';

const ChatInput = ({ 
  isRecording, 
  startRecording, 
  stopRecording, 
  handleChatRequest,
  isProcessing
}) => {
  const [input, setInput] = useState('');

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const message = input;
    setInput('');
    
    await handleChatRequest(message);
  };

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      bgcolor: 'background.paper',
      py: { xs: 1, sm: 2 },
      px: { xs: 1, sm: 2 },
      maxWidth: 'md',
      margin: '0 auto',
      boxShadow: 3,
      zIndex: 1
    }}>
      <Box sx={{ 
        display: 'flex', 
        gap: { xs: 0.5, sm: 1 },
        alignItems: 'flex-end',
        maxWidth: 'md',
        margin: '0 auto'
      }}>
        <IconButton
          color={isRecording ? 'error' : 'primary'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          size="medium"
          sx={{ padding: { xs: 0.5, sm: 1 } }}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </IconButton>

        <TextField
          fullWidth
          variant="outlined"
          multiline
          minRows={1}
          maxRows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="输入你的消息 (回车发送)"
          sx={{
            '& .MuiOutlinedInput-root': {
              alignItems: 'flex-end',
              fontSize: { xs: '0.875rem', sm: '1rem' },
              padding: { xs: '8px 10px', sm: '12px 14px' }
            },
          }}
          disabled={isRecording}
        />

        <IconButton
          color="primary"
          onClick={handleSendMessage}
          disabled={!input.trim() || isProcessing || isRecording}
          size="medium"
          sx={{ padding: { xs: 0.5, sm: 1 } }}
        >
          {isProcessing ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>
    </Box>
  );
};

export default ChatInput; 