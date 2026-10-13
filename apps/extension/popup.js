const msg = document.getElementById('msg');
document.getElementById('send').addEventListener('click', async () => {
  const { site } = await chrome.storage.sync.get('site');
  if (!site) { msg.textContent = 'First tell the extension where your earshelf is.'; chrome.runtime.openOptionsPage(); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url ?? '')) { msg.textContent = 'This page cannot be sent. Open a normal web page first.'; return; }
  chrome.tabs.create({ url: `${site}/?import=${encodeURIComponent(tab.url)}` });
  window.close();
});
