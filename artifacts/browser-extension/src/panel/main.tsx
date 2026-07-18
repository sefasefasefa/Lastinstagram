import './styles.css';
import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';
import App from './App';

async function init() {
  // Load API URL from chrome extension storage (configured once via popup settings)
  const stored = await chrome.storage.local.get(['apiUrl']);
  const apiUrl = (
    (stored['apiUrl'] as string | undefined) ??
    (import.meta.env.VITE_PANEL_URL as string | undefined) ??
    'http://localhost:8080'
  ).replace(/\/+$/, '');

  // Patch global fetch:
  //   • Prepend apiUrl to all relative paths starting with /
  //   • Force credentials: 'include' so session cookies travel cross-origin
  const _originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let resolved: RequestInfo | URL = input;
    if (typeof input === 'string' && input.startsWith('/')) {
      resolved = `${apiUrl}${input}`;
    }
    return _originalFetch(resolved, { credentials: 'include', ...init });
  };

  setBaseUrl(apiUrl);

  createRoot(document.getElementById('root')!).render(<App />);
}

void init();
