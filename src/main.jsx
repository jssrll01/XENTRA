import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import './lib/lockdown';
import './lib/holdopen';
import App from './App.jsx';
import DialogHost from './lib/dialog';
import RulesHost from './lib/rulesDialog';
import { getTheme, applyTheme } from './lib/theme';

applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <DialogHost />
    <RulesHost />
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
