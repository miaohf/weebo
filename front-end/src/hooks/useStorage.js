import { useState, useEffect } from 'react';

const useStorage = () => {
  const [speaker, setSpeaker] = useState(() => {
    const savedSpeaker = localStorage.getItem('preferredSpeaker');
    return savedSpeaker || 'default';
  });

  // 当speaker变化时保存到localStorage
  useEffect(() => {
    localStorage.setItem('preferredSpeaker', speaker);
  }, [speaker]);

  return {
    speaker,
    setSpeaker
  };
};

export default useStorage; 