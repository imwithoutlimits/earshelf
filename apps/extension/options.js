const input = document.getElementById('site');
const status = document.getElementById('status');
chrome.storage.sync.get('site').then(({ site }) => { if (site) input.value = site; });
document.getElementById('save').addEventListener('click', async () => {
  let url;
  try { url = new URL(input.value.trim()); } catch { status.textContent = 'That does not look like a web address. Include https://.'; return; }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') { status.textContent = 'Use the https:// address of your earshelf.'; return; }
  await chrome.storage.sync.set({ site: url.origin });
  status.textContent = 'Saved. You can now right-click any page and choose "Send this page to earshelf".';
});
