import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { testBrowserAudio } from '../utils/audioUtils';

const AudioDebug = () => {
  const [logs, setLogs] = React.useState([]);
  
  const addLog = (message) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`].slice(-5));
  };
  
  const testAudio = async () => {
    try {
      addLog("Test audio start...");
      await testBrowserAudio();
      addLog("Test audio success");
    } catch (error) {
      addLog(`Test failed: ${error.message}`);
    }
  };
  
  const logState = () => {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    addLog(`Audio context state: ${context.state}`);
    
    if (window.Howler) {
      addLog(`Howler state: ${JSON.stringify({
        usingWebAudio: window.Howler.usingWebAudio,
        noAudio: window.Howler.noAudio,
        autoUnlock: window.Howler.autoUnlock
      })}`);
    }
  };
  
  return (
    <Box sx={{ 
      position: 'fixed', 
      right: 20, 
      top: 80, 
      zIndex: 100,
      backgroundColor: 'rgba(255,255,255,0.9)',
      boxShadow: 2,
      p: 1,
      borderRadius: 1,
      maxWidth: '300px'
    }}>
      {/* <Typography variant="subtitle2">音频调试</Typography> */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <Button 
          variant="outlined" 
          size="small"
          onClick={testAudio}
        >
          Test Audio
        </Button>
        <Button 
          variant="outlined" 
          size="small"
          onClick={logState}
        >
          Log status
        </Button>
      </Box>
      
      <Box sx={{ 
        backgroundColor: '#f5f5f5', 
        p: 1, 
        borderRadius: 1,
        fontSize: '12px',
        maxHeight: '100px',
        overflow: 'auto'
      }}>
        {logs.length > 0 ? logs.map((log, i) => (
          <div key={i}>{log}</div>
        )) : <div>no log</div>}
      </Box>
    </Box>
  );
};

export default AudioDebug; 