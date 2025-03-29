import React, { createContext, useReducer, useContext, useEffect } from 'react';

// 初始状态
const initialState = {
  messages: [],
  isProcessing: false,
  error: null,
  showChinese: false,
  currentlyPlaying: null,
  audioQueue: [],
  audioData: {}
};

// Action 类型
export const ActionTypes = {
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_MESSAGE: 'UPDATE_MESSAGE',
  SET_MESSAGES: 'SET_MESSAGES',
  SET_PROCESSING: 'SET_PROCESSING',
  SET_ERROR: 'SET_ERROR',
  SET_PLAYING: 'SET_PLAYING',
  TOGGLE_LANGUAGE: 'TOGGLE_LANGUAGE',
  CLEAR_HISTORY: 'CLEAR_HISTORY',
  QUEUE_AUDIO: 'QUEUE_AUDIO',
  DEQUEUE_AUDIO: 'DEQUEUE_AUDIO',
  STORE_AUDIO_DATA: 'STORE_AUDIO_DATA'
};

// Reducer 函数
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload]
      };
      
    case ActionTypes.UPDATE_MESSAGE:
      return {
        ...state,
        messages: state.messages.map(msg => 
          msg.id === action.payload.id ? { ...msg, ...action.payload.data } : msg
        )
      };
      
    case ActionTypes.SET_MESSAGES:
      return {
        ...state,
        messages: action.payload
      };
      
    case ActionTypes.SET_PROCESSING:
      return {
        ...state,
        isProcessing: action.payload
      };
      
    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload
      };
      
    case ActionTypes.SET_PLAYING:
      return {
        ...state,
        currentlyPlaying: action.payload
      };
      
    case ActionTypes.TOGGLE_LANGUAGE:
      return {
        ...state,
        showChinese: !state.showChinese
      };
      
    case ActionTypes.CLEAR_HISTORY:
      return {
        ...state,
        messages: []
      };
      
    case ActionTypes.QUEUE_AUDIO:
      return {
        ...state,
        audioQueue: [...state.audioQueue, action.payload]
      };
      
    case ActionTypes.DEQUEUE_AUDIO:
      return {
        ...state,
        audioQueue: state.audioQueue.slice(1)
      };
      
    case ActionTypes.STORE_AUDIO_DATA:
      return {
        ...state,
        audioData: {
          ...state.audioData,
          [action.payload.id]: action.payload.data
        }
      };
      
    default:
      return state;
  }
}

// 创建 Context
const AppContext = createContext();

// Context Provider
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  // 首次加载时尝试从本地存储恢复消息
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatMessages');
      if (savedMessages) {
        dispatch({ 
          type: ActionTypes.SET_MESSAGES, 
          payload: JSON.parse(savedMessages) 
        });
      }
    } catch (error) {
      console.error('恢复消息历史失败:', error);
    }
  }, []);
  
  // 当消息更新时保存到本地存储
  useEffect(() => {
    try {
      localStorage.setItem('chatMessages', JSON.stringify(state.messages.slice(-100)));
    } catch (error) {
      console.error('保存消息历史失败:', error);
    }
  }, [state.messages]);
  
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// 自定义 Hook 方便使用 Context
export function useAppContext() {
  return useContext(AppContext);
} 