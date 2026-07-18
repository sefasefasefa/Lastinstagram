// ─── Instagram session watcher ───────────────────────────────────────────────
// Whenever the user logs into instagram.com (sessionid cookie appears or is
// refreshed), automatically open or focus the panel so they don't have to
// click anything manually.
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  const isInstagram =
    cookie.name === 'sessionid' &&
    (cookie.domain === 'instagram.com' || cookie.domain === '.instagram.com');

  if (!isInstagram || removed) return;

  const panelUrl = chrome.runtime.getURL('panel.html');

  chrome.tabs.query({}, (allTabs) => {
    const existing = allTabs.find((t) => t.url === panelUrl);
    if (existing?.id != null) {
      // Panel already open — focus it and let the polling loop pick up the session
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      // Open the panel in a new tab
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

// ─── Toolbar icon click ───────────────────────────────────────────────────────
// When a popup is defined in the manifest this listener does NOT fire —
// the popup opens instead.  We keep it as a fallback for any configuration
// that omits the popup (e.g. during development without a popup defined).
chrome.action.onClicked.addListener(() => {
  const panelUrl = chrome.runtime.getURL('panel.html');

  chrome.tabs.query({}, (allTabs) => {
    const existing = allTabs.find((t) => t.url === panelUrl);
    if (existing?.id != null) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

export {};
