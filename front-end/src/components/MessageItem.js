import React from 'react';
import {
  ListItem,
  Paper,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Tooltip
} from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';

const MessageItem = ({ 
  message, 
  index, 
  showChinese, 
  playingIndex, 
  isPlayingAll, 
  playSingleAudio, 
  replayAudio,
  isProcessing,
  currentlyPlaying
}) => {
  const messageId = message.id;

  return (
    <ListItem
      sx={{
        justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
        mb: 1,
        px: { xs: 0, sm: 1 },
      }}
    >
      <Paper
        sx={{
          p: { xs: 0.75, sm: 1 },
          maxWidth: { xs: '90%', sm: '85%' },
          width: 'fit-content',
          backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5',
          borderRadius: '8px',
          boxShadow: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <Box sx={{ flex: 1 }}>
          {typeof message.content === 'string' ? (
            <Typography 
              variant="body1" 
              sx={{ 
                whiteSpace: 'pre-wrap',
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }}
            >
              {message.content}
            </Typography>
          ) : (
            <Box>
              {message.content?.english && (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap'
                }}>
                  <Typography 
                    variant="body1" 
                    component="span" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      fontSize: { xs: '0.875rem', sm: '1rem' },
                      mr: 0.5
                    }}
                  >
                    {message.content.english}
                  </Typography>
                  
                  {message.content.audio ? (
                    <IconButton
                      size="small"
                      onClick={() => playSingleAudio(message.content.audio, index)}
                      disabled={playingIndex !== null || isPlayingAll}
                      sx={{ 
                        p: { xs: 0.3, sm: 0.5 },
                        mt: { xs: 0, sm: 0.5 }
                      }}
                    >
                      {playingIndex === index ? 
                        <CircularProgress size={16} /> : 
                        <VolumeUpIcon fontSize="small" />
                      }
                    </IconButton>
                  ) : (
                    message.role === 'assistant' && (
                      <IconButton
                        size="small"
                        onClick={() => replayAudio(messageId)}
                        disabled={isProcessing}
                        title="尝试获取音频"
                        sx={{ 
                          p: { xs: 0.3, sm: 0.5 },
                          mt: { xs: 0, sm: 0.5 }
                        }}
                      >
                        <VolumeUpIcon fontSize="small" />
                      </IconButton>
                    )
                  )}
                </Box>
              )}
              
              {showChinese && message.content && message.content.chinese && (
                <Typography variant="body1" sx={{ 
                  whiteSpace: 'pre-wrap', 
                  mt: 1,
                  fontSize: { xs: '0.8rem', sm: '0.9rem' }
                }}>
                  {message.content.chinese}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </ListItem>
  );
};

export default MessageItem; 