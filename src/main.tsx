import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureKeyboard } from './lib/native';
import './styles/index.css';

// Native (iOS) keyboard config — no-op on web. Fire-and-forget.
void configureKeyboard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
