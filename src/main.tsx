import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureKeyboard, markNativePlatform } from './lib/native';
import { initErrorReporting } from './lib/errorReporting';
import './styles/index.css';

// Native (iOS) keyboard config + html.native-app tag — no-ops on web.
void configureKeyboard();
markNativePlatform();
// Uncaught errors / rejections → client_errors table (see errorReporting.ts).
initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
