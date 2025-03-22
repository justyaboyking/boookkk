// Background script for BookWidgets Helper extension

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('BookWidgets Helper extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'logMessage') {
    console.log('Message from content script:', request.message);
    sendResponse({success: true});
  }
  return true;
});