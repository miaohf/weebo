import React, { useState, useEffect, useRef } from 'react';
import AudioRecorder from '../../utils/recorderUtils';
import './RecordButton.css';

function RecordButton({ onRecordingComplete, isProcessing }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef(new AudioRecorder());
  const timerRef = useRef(null);

  // 处理录音状态变化
  useEffect(() => {
    // 创建一个引用的副本
    const recorder = recorderRef.current;
    
    if (isRecording) {
      // 启动计时器
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      // 清除计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    // 组件卸载时清理
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (isRecording) {
        // 使用之前保存的引用副本
        recorder.cancelRecording();
      }
    };
  }, [isRecording]);

  // 开始录音
  const startRecording = async () => {
    if (isProcessing) return;
    
    const started = await recorderRef.current.startRecording();
    if (started) {
      setIsRecording(true);
      setRecordingTime(0);
    }
  };

  // 停止录音
  const stopRecording = async () => {
    if (!isRecording) return;
    
    const recordingData = await recorderRef.current.stopRecording();
    setIsRecording(false);
    setRecordingTime(0);
    
    if (recordingData && onRecordingComplete) {
      onRecordingComplete(recordingData);
    }
  };

  // 取消录音
  const cancelRecording = () => {
    if (!isRecording) return;
    
    recorderRef.current.cancelRecording();
    setIsRecording(false);
    setRecordingTime(0);
  };

  // 格式化录音时间
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="record-button-container">
      {!isRecording ? (
        <button 
          className="record-button"
          onClick={startRecording}
          disabled={isProcessing}
          title="开始录音"
        >
          <i className="record-icon"></i>
          录音
        </button>
      ) : (
        <div className="recording-controls">
          <span className="recording-time">{formatTime(recordingTime)}</span>
          <button 
            className="stop-button"
            onClick={stopRecording}
            title="停止录音"
          >
            <i className="stop-icon"></i>
          </button>
          <button
            className="cancel-button"
            onClick={cancelRecording}
            title="取消录音"
          >
            <i className="cancel-icon"></i>
          </button>
        </div>
      )}
    </div>
  );
}

export default RecordButton; 