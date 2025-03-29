import React from 'react';
import { AppProvider } from './context/AppContext';
import ChatContainer from './components/Chat/ChatContainer';
import './App.css';


function App() {
  return (
    <AppProvider>
      <div className="App">
        <header className="App-header">
          <h5>聊天助手</h5>
        </header>
        <main>
          <ChatContainer />
        </main>
      </div>
    </AppProvider>
  );
}

export default App; 