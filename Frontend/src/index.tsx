import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Log backend errors to browser console for all fetch calls
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (!response.ok) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      console.error(`[API ${response.status}] ${response.url}:`, data.error || data);
      if (data.traceback) console.error("Backend traceback:\n", data.traceback);
    } catch { /* ignore parse errors */ }
  }
  return response;
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
