// Open the full-page panel in a new tab when the toolbar icon is clicked.
// chrome.action.onClicked only fires when there is no popup defined in the manifest.
chrome.action.onClicked.addListener(() => {
  const panelUrl = chrome.runtime.getURL('panel.html');

  // Query ALL tabs and filter by URL so this works on Firefox (moz-extension://)
  // and Chrome/Edge (chrome-extension://) — the URL scheme differs per browser.
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
