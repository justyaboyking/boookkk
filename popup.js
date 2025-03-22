document.addEventListener('DOMContentLoaded', function() {
  // Set default API key
  const defaultApiKey = 'AIzaSyBry97WDtrisAkD52ZbbTShzoEUHenMX_w';
  document.getElementById('apiKey').value = defaultApiKey;
  
  // Save the default API key
  chrome.storage.sync.set({apiKey: defaultApiKey});
  
  // Load saved API key if available and different from default
  chrome.storage.sync.get(['apiKey'], function(result) {
    if (result.apiKey && result.apiKey !== defaultApiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
  });

  // Save API key when changed
  document.getElementById('apiKey').addEventListener('change', function() {
    const apiKey = document.getElementById('apiKey').value;
    chrome.storage.sync.set({apiKey: apiKey});
  });

  // Process Quiz button click handler
  document.getElementById('processQuiz').addEventListener('click', function() {
    const apiKey = document.getElementById('apiKey').value;
    if (!apiKey) {
      updateStatus('Error: Please enter an API key');
      return;
    }

    updateStatus('Processing quiz questions...');
    
    // Send message to content script to process the quiz
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('bookwidgets.com')) {
        updateStatus('Error: Please navigate to a BookWidgets quiz page');
        return;
      }
      // Inject content script before sending message
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }).then(() => {
        // Send message after ensuring content script is injected
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'processQuiz',
          apiKey: apiKey
        }, function(response) {
          if (chrome.runtime.lastError) {
            updateStatus('Error: ' + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.success) {
            updateStatus('Quiz processed successfully!');
          } else {
            updateStatus('Error: ' + (response ? response.error : 'Unknown error'));
          }
        });
      }).catch(err => {
        updateStatus('Error: Failed to inject content script - ' + err.message);
      });
    });
  });

  // Mark Answers button click handler
  document.getElementById('markAnswers').addEventListener('click', function() {
    updateStatus('Marking correct answers...');
    
    // Send message to content script to mark answers
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('bookwidgets.com')) {
        updateStatus('Error: Please navigate to a BookWidgets quiz page');
        return;
      }
      // Inject content script before sending message
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }).then(() => {
        // Send message after ensuring content script is injected
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'markAnswers'
        }, function(response) {
          if (chrome.runtime.lastError) {
            updateStatus('Error: ' + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.success) {
            updateStatus('Answers marked successfully!');
          } else {
            updateStatus('Error: ' + (response ? response.error : 'Unknown error'));
          }
        });
      }).catch(err => {
        updateStatus('Error: Failed to inject content script - ' + err.message);
      });
    });
  });

  function updateStatus(message) {
    document.getElementById('status').textContent = 'Status: ' + message;
  }
});