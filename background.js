chrome.commands.onCommand.addListener((command) => {
  if (command === 'lint-clipboard') {
    chrome.storage.session.set({ lintClipboardPending: true });
    chrome.action.openPopup().catch(() => {});
  }
});
