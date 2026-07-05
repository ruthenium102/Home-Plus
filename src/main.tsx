import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureKeyboard, markNativePlatform } from './lib/native';
import './styles/index.css';

// Native (iOS) keyboard config + html.native-app tag — no-ops on web.
void configureKeyboard();
markNativePlatform();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
