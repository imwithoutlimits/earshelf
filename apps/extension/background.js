// Right-click menu: send the page, a link, or the selected text to earshelf.
const MENU = [
  { id: 'page', title: 'Send this page to earshelf', contexts: ['page'] },
  { id: 'link', title: 'Send this link to earshelf', contexts: ['link'] },
  { id: 'selection', title: 'Send the selected text to earshelf', contexts: ['selection'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => MENU.forEach((m) => chrome.contextMenus.create(m)));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { site } = await chrome.storage.sync.get('site');
  if (!site) { chrome.runtime.openOptionsPage(); return; }
  let query;
  if (info.menuItemId === 'selection') query = `title=${encodeURIComponent(tab?.title ?? '')}&text=${encodeURIComponent((info.selectionText ?? '').slice(0, 6000))}`;
  else query = `import=${encodeURIComponent(info.menuItemId === 'link' ? info.linkUrl : info.pageUrl)}`;
  chrome.tabs.create({ url: `${site}/?${query}` });
});
