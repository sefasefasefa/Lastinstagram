import './styles.css';
import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';
import App from './App';

// API sunucusu her zaman localhost:8080'de çalışır.
const API_URL = 'http://localhost:8080';

// Tüm relative fetch çağrılarını (/api/...) localhost:8080'e yönlendir
// ve session cookie'lerini cross-origin olarak gönder.
const _originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  let resolved: RequestInfo | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    resolved = `${API_URL}${input}`;
  }
  return _originalFetch(resolved, { credentials: 'include', ...init });
};

setBaseUrl(API_URL);

createRoot(document.getElementById('root')!).render(<App />);
