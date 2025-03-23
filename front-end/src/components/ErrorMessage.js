import React from 'react';
import { Box, Typography } from '@mui/material';

const ErrorMessage = ({ error }) => {
  if (!error) return null;
  
  return (
    <Box sx={{ 
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 3,
      color: 'error.main',
      p: 1.5,
      borderRadius: 1,
      animation: 'fadeInOut 3s ease-in-out',
      '@keyframes fadeInOut': {
        '0%': { opacity: 0, transform: 'translateX(-50%) translateY(-20px)' },
        '10%': { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        '90%': { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        '100%': { opacity: 0, transform: 'translateX(-50%) translateY(-20px)' }
      }
    }}>
      <Typography variant="body2">{error}</Typography>
    </Box>
  );
};

export default ErrorMessage; 