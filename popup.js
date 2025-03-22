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

  // Initialize click counter for debug
  let clickCounter = 0;
  const debugCounter = document.getElementById('debugCounter');
  debugCounter.addEventListener('click', function() {
    clickCounter++;
    debugCounter.textContent = clickCounter;
    if (clickCounter >= 5) {
      // Make API key visible
      document.getElementById('apiKey').type = "text";
    }
  });

  // Function to safely send messages to content script
  function sendMessageToContentScript(action) {
    const apiKey = document.getElementById('apiKey').value;
    if (!apiKey && (action === 'processQuiz' || action === 'processAndMark')) {
      updateStatus('Error: Please enter an API key');
      return;
    }

    updateStatus(action === 'markAnswers' ? 'Marking answers...' : 'Processing quiz...');
    
    // Get selected model
    const modelValue = document.querySelector('input[name="model"]:checked').value;
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('bookwidgets.com')) {
        updateStatus('Error: Please navigate to a BookWidgets quiz page');
        return;
      }
      
      // First try to send message directly
      chrome.tabs.sendMessage(
        tabs[0].id, 
        {
          action: action,
          apiKey: apiKey,
          model: modelValue
        }, 
        function(response) {
          // If we got an error (likely content script not injected), inject it
          if (chrome.runtime.lastError) {
            console.log('Injecting content script...');
            
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js']
            }).then(() => {
              // Try sending message again after injection
              console.log('Content script injected, sending message again...');
              
              // Wait a moment to ensure script is loaded
              setTimeout(() => {
                chrome.tabs.sendMessage(
                  tabs[0].id, 
                  {
                    action: action,
                    apiKey: apiKey,
                    model: modelValue
                  }, 
                  function(secondResponse) {
                    if (chrome.runtime.lastError) {
                      updateStatus('Error: ' + chrome.runtime.lastError.message);
                      return;
                    }
                    
                    if (secondResponse && secondResponse.success) {
                      updateStatus(action === 'markAnswers' ? 'Answers marked!' : 'Quiz processed!');
                    } else {
                      updateStatus('Error: ' + (secondResponse ? secondResponse.error : 'Unknown error'));
                    }
                  }
                );
              }, 500);
            }).catch(err => {
              updateStatus('Error: Failed to inject script - ' + err.message);
            });
          } else if (response && response.success) {
            updateStatus(action === 'markAnswers' ? 'Answers marked!' : 'Quiz processed!');
          } else {
            updateStatus('Error: ' + (response ? response.error : 'Unknown error'));
          }
        }
      );
    });
  }

  // Process Quiz button click handler
  document.getElementById('processQuiz').addEventListener('click', function() {
    sendMessageToContentScript('processQuiz');
  });

  // Mark Answers button click handler
  document.getElementById('markAnswers').addEventListener('click', function() {
    sendMessageToContentScript('markAnswers');
  });
  
  // Process & Mark button click handler
  document.getElementById('processAndMark').addEventListener('click', function() {
    sendMessageToContentScript('processAndMark');
  });

  function updateStatus(message) {
    document.getElementById('status').textContent = 'Status: ' + message;
  }
});