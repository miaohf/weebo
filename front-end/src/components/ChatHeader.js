import React from 'react';
import {
  Box,
  Typography,
  Button,
  Checkbox,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';

const ChatHeader = ({ 
  clearHistory, 
  playAllAudios, 
  isPlayingAll, 
  showChinese, 
  setShowChinese,
  speaker,
  setSpeaker,
  messages,
  exportChatHistory
}) => {
  return (
    <Box sx={{ 
      position: 'sticky',
      top: 0,
      zIndex: 2,
      bgcolor: 'background.paper',
      py: { xs: 0.5, sm: 1 },
      mb: { xs: 1, sm: 2 },
    }}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: { xs: 1, sm: 0 }
      }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
          AI Conversation
        </Typography>
        
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap',
          alignItems: 'center', 
          gap: 0.5,
          width: { xs: '100%', sm: 'auto' }
        }}>
          <Button
            variant="outlined"
            size="small"
            onClick={clearHistory}
            color="error"
            sx={{ minWidth: '32px' }}
          >
            C
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={playAllAudios}
            disabled={isPlayingAll || !messages.some(msg => msg.role === 'assistant')}
            sx={{ minWidth: '32px' }}
          >
            {isPlayingAll ? <CircularProgress size={20} /> : 'PL'}
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">CN</Typography>
            <Checkbox
              checked={showChinese}
              onChange={(e) => setShowChinese(e.target.checked)}
              color="primary"
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography 
              variant="body2" 
              sx={{ 
                display: { xs: 'none', sm: 'block' }
              }}
            >
              Voice
            </Typography>
            <Select
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              size="small"
              sx={{ 
                width: { xs: 80, sm: 120 },
                '& .MuiSelect-select': {
                  py: { xs: 0.5, sm: 1 },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }
              }}
            >
              <MenuItem value="default">default</MenuItem>
              <MenuItem value="Scarlett">Scarlett</MenuItem>
              <MenuItem value="af_sky">af_sky</MenuItem>
              <MenuItem value="Churcher">Churcher</MenuItem>
              <MenuItem value="Dinesen">Dinesen</MenuItem>
              <MenuItem value="Joa">Joa</MenuItem>
              <MenuItem value="Massi">Massi</MenuItem>
              <MenuItem value="exampleaudio">exampleaudio</MenuItem>
              <MenuItem value="zonos_americanfemale">zonos_americanfemale</MenuItem>
              <MenuItem value="zonos-t-british-female">zonos-t-british-female</MenuItem>
            </Select>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={exportChatHistory}
            title="导出聊天记录"
            sx={{ minWidth: '32px' }}
          >
            <DownloadIcon fontSize="small" />
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={clearHistory}
            color="error"
            sx={{ minWidth: '32px' }}
          >
            <DeleteIcon fontSize="small" />
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatHeader; 