import '@/index.css';
import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';
import App from './App';

// Build-time default; override with VITE_PANEL_URL env var before building.
const PANEL_URL = (import.meta.env.VITE_PANEL_URL as string | undefined ?? 'http://localhost:8080')
  .replace(/\/+$/, '');

// Patch global fetch once at module load:
// - Prepend PANEL_URL to all relative paths starting with /
// - Force credentials: 'include' so session cookies travel cross-origin
const _originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  let resolved: RequestInfo | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    resolved = `${PANEL_URL}${input}`;
  }
  return _originalFetch(resolved, { credentials: 'include', ...init });
};

setBaseUrl(PANEL_URL);

createRoot(document.getElementById('root')!).render(<App />);
