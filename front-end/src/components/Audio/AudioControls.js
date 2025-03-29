import React from 'react';
import './AudioControls.css';

function AudioControls({ onPlayAll, isProcessing, currentlyPlaying }) {
  return (
    <div className="audio-controls">
      <button 
        onClick={onPlayAll}
        disabled={isProcessing || currentlyPlaying}
      >
        播放所有音频
      </button>
    </div>
  );
}

export default AudioControls; 