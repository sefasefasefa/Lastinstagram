import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';
import App from './App';

// Patch global fetch once at module load:
// - Prepend the stored panelUrl to all relative paths starting with /
// - Force credentials: 'include' so session cookies travel cross-origin
let _panelBase = '';
const _originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  let resolved: RequestInfo | URL = input;
  if (_panelBase && typeof input === 'string' && input.startsWith('/')) {
    resolved = `${_panelBase}${input}`;
  }
  return _originalFetch(resolved, { credentials: 'include', ...init });
};

function applyPanelUrl(url: string) {
  const clean = url.replace(/\/+$/, '');
  _panelBase = clean;
  setBaseUrl(clean || null);
}

// Dynamically import the panel CSS so Vite resolves it from the right root
import('@/index.css');

function Root() {
  const [panelUrl, setPanelUrl] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get('panelUrl', (result) => {
      const url: string = result['panelUrl'] ?? '';
      applyPanelUrl(url);
      setPanelUrl(url);
    });
  }, []);

  function handleChangePanelUrl(url: string) {
    const clean = url.replace(/\/+$/, '');
    chrome.storage.local.set({ panelUrl: clean }, () => {
      applyPanelUrl(clean);
      setPanelUrl(clean);
      // Reload the page so the query client starts fresh with the new base URL
      window.location.reload();
    });
  }

  // Still loading from storage
  if (panelUrl === null) return null;

  return <App panelUrl={panelUrl} onChangePanelUrl={handleChangePanelUrl} />;
}

createRoot(document.getElementById('root')!).render(<Root />);
