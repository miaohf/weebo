import React, { useEffect, useState } from 'react';
import './ErrorDisplay.css';

function ErrorDisplay({ error, onDismiss }) {
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    if (error) {
      setVisible(true);
      
      // 自动消失
      const timer = setTimeout(() => {
        setVisible(false);
        if (onDismiss) onDismiss();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [error, onDismiss]);
  
  if (!error) return null;
  
  return (
    <div className={`error-display ${visible ? 'visible' : ''}`}>
      <p>{error}</p>
      <button onClick={() => {
        setVisible(false);
        if (onDismiss) onDismiss();
      }}>
        关闭
      </button>
    </div>
  );
}

export default ErrorDisplay; 