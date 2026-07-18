// Open the full-page panel in a new tab when the toolbar icon is clicked.
// chrome.action.onClicked only fires when there is no popup defined in the manifest.
chrome.action.onClicked.addListener(() => {
  const panelUrl = chrome.runtime.getURL('panel.html');

  // If a panel tab is already open, focus it instead of opening a duplicate.
  chrome.tabs.query({ url: panelUrl }, (existing) => {
    if (existing.length > 0 && existing[0].id != null) {
      chrome.tabs.update(existing[0].id, { active: true });
      if (existing[0].windowId != null) {
        chrome.windows.update(existing[0].windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

export {};
