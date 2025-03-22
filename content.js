// BookWidgets Helper - Debug Auto-running version
// Automatically processes the current question when navigation buttons are clicked

// Store API key and model globally
let apiKey = '';
let aiModel = 'flash';
let debugMode = true; // Enable debug mode

// Main initialization function
function initAutoHelper() {
  console.log('BookWidgets Auto Helper initialized');
  
  // Create debug status indicator
  const status = createStatusElement();
  updateStatus(status, 'Init');
  
  // First check if API key is set
  if (!apiKey || apiKey.length < 10) {
    updateStatus(status, 'No API key', 'error');
    console.error('API key not set or too short');
    return;
  }
  
  debugLog('API key is set, length: ' + apiKey.length);
  
  // Find navigation buttons (with debug info)
  const allButtons = document.querySelectorAll('[role="button"], button, .navbutton, [class*="arrow"]');
  debugLog(`Found ${allButtons.length} potential nav buttons`);
  
  // Set up observers for navigation buttons with detailed info
  setupNavigationObservers(status);
  
  // Process the initial question
  setTimeout(() => {
    processCurrentQuestion(status);
  }, 500);
}

// Set up observers for navigation buttons with detailed logging
function setupNavigationObservers(status) {
  // Function to handle navigation
  const handleNavigation = (e) => {
    // Show which button was clicked
    debugLog(`Navigation clicked: ${e.target.className || 'unknown button'}`);
    updateStatus(status, 'Nav click');
    
    // Wait a moment for the page to update
    setTimeout(() => {
      processCurrentQuestion(status);
    }, 500);
  };
  
  debugLog('Setting up button observers...');
  
  // Find all possible navigation buttons
  const navButtons = [];
  
  // Next buttons
  const nextButtons = document.querySelectorAll('.nextarrow, .move-forward, [aria-label="Volgende vraag"], .bw-icon-angle-right, .next, .forward');
  nextButtons.forEach(btn => navButtons.push({button: btn, type: 'next'}));
  
  // Previous buttons
  const prevButtons = document.querySelectorAll('.prevarrow, [aria-label="Vorige vraag"], .bw-icon-angle-left, .prev, .previous, .back');
  prevButtons.forEach(btn => navButtons.push({button: btn, type: 'prev'}));
  
  // Generic buttons that might be navigation
  const genericButtons = document.querySelectorAll('[role="button"], button');
  genericButtons.forEach(btn => {
    // Only add if not already in our list
    if (!navButtons.some(nb => nb.button === btn)) {
      // Check if it has arrow icons or text
      if (btn.classList.contains('navbutton') || 
          btn.textContent.match(/next|previous|volgende|vorige/i) ||
          btn.innerHTML.includes('arrow') ||
          btn.querySelector('[class*="arrow"]')) {
        navButtons.push({button: btn, type: 'generic'});
      }
    }
  });
  
  // Debug info
  debugLog(`Found ${nextButtons.length} next buttons, ${prevButtons.length} prev buttons, and ${navButtons.length - nextButtons.length - prevButtons.length} generic buttons`);
  
  // Add click listeners to all buttons
  navButtons.forEach(({button, type}) => {
    try {
      button.addEventListener('click', handleNavigation);
      debugLog(`Added listener to ${type} button: ${button.className || 'unnamed'}`);
    } catch (e) {
      debugLog(`Failed to add listener to button: ${e.message}`);
    }
  });
  
  // Also set up a MutationObserver to catch dynamically added buttons
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it might be a navigation button
            if (node.getAttribute('role') === 'button' || 
                node.tagName === 'BUTTON' || 
                node.classList && (
                  node.classList.contains('navbutton') ||
                  node.classList.contains('nextarrow') || 
                  node.classList.contains('prevarrow') ||
                  node.classList.contains('move-forward') ||
                  node.classList.contains('bw-icon-angle-right') ||
                  node.classList.contains('bw-icon-angle-left'))) {
              node.addEventListener('click', handleNavigation);
              debugLog(`Added listener to dynamically added button: ${node.className || 'unnamed'}`);
            }
            
            // Check children too
            const buttons = node.querySelectorAll('[role="button"], button, .navbutton, [class*="arrow"]');
            buttons.forEach(button => {
              button.addEventListener('click', handleNavigation);
              debugLog(`Added listener to button in added content: ${button.className || 'unnamed'}`);
            });
          }
        });
      }
    });
  });
  
  // Start observing
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
  
  debugLog('Observation setup complete');
  
  // Also listen for key presses (arrow keys)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      debugLog(`Arrow key pressed: ${e.key}`);
      updateStatus(status, 'Key press');
      
      setTimeout(() => {
        processCurrentQuestion(status);
      }, 500);
    }
  });
  
  updateStatus(status, 'Ready');
}

// Process the current visible question
async function processCurrentQuestion(status) {
  updateStatus(status, 'Scanning...');
  
  // Extract the current visible question
  const question = extractCurrentQuestion();
  
  if (!question) {
    updateStatus(status, 'No question', 'error');
    debugLog('No current question found');
    return;
  }
  
  debugLog(`Found question: "${question.text.substring(0, 30)}..."`);
  debugLog(`Type: ${question.type}, Has options: ${!!question.options}, Has input: ${!!question.inputElement}`);
  
  updateStatus(status, 'Processing...');
  
  // Special case for animal center
  if (question.text.toLowerCase().includes('animal center') || 
      question.text.toLowerCase().includes('name of the animal')) {
    fillAnswer(question, "Wildlife Haven");
    updateStatus(status, 'Filled');
    return;
  }
  
  try {
    // Get answer from AI
    debugLog('Sending to AI: ' + question.text.substring(0, 30) + '...');
    const answer = await getAIAnswer(question.text, question.options, apiKey, aiModel);
    
    debugLog('Got answer: ' + answer);
    
    // Fill the answer
    const fillResult = fillAnswer(question, answer);
    updateStatus(status, fillResult ? 'Filled ✓' : 'Fill failed', fillResult ? 'success' : 'error');
  } catch (error) {
    console.error('AI Error:', error);
    debugLog('Error getting AI answer: ' + error.message);
    updateStatus(status, 'AI failed', 'error');
  }
}

// Extract the current visible question with detailed debugging
function extractCurrentQuestion() {
  debugLog('Extracting current question...');
  
  // List of all possible container selectors
  const selectors = [
    '.question.active', 
    '.question-container.active', 
    '.current-question', 
    '.visible-question', 
    '.active[class*="question"]',
    '.question:not(.hidden)', 
    '.question-container:not(.hidden)',
    '[class*="question"]:not([style*="display: none"])',
    '.bw-question-wrapper:not(.hidden)'
  ];
  
  // Try each selector
  let container = null;
  for (const selector of selectors) {
    const containers = document.querySelectorAll(selector);
    if (containers.length > 0) {
      container = containers[0]; // Take the first one
      debugLog(`Found container using selector: ${selector}`);
      break;
    }
  }
  
  // If no active container found, use any visible question container
  if (!container) {
    debugLog('No container found with active/visible selectors, looking for any visible question');
    const allContainers = document.querySelectorAll('[class*="question"], .bw-question, .question-container');
    debugLog(`Found ${allContainers.length} total potential containers`);
    
    // Use the first visible container
    for (const c of allContainers) {
      const style = window.getComputedStyle(c);
      if (style.display !== 'none' && style.visibility !== 'hidden' && c.offsetParent !== null) {
        container = c;
        debugLog(`Found visible container: ${c.className}`);
        break;
      }
    }
  }
  
  if (!container) {
    debugLog('No question container found at all');
    return null;
  }
  
  // Get question text
  let questionText = '';
  const textSelectors = [
    'p', 'h2', 'h3', '.question-text', '[class*="question-text"]', 
    '.bw-question-title', '.bw-fill-in-the-blanks-question-text'
  ];
  
  for (const selector of textSelectors) {
    const elements = container.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.textContent.trim();
      if (text && text.length > 5) {
        questionText = text;
        debugLog(`Found question text using selector: ${selector}`);
        break;
      }
    }
    if (questionText) break;
  }
  
  // If still no text, use container text
  if (!questionText) {
    questionText = container.textContent.trim().substring(0, 100);
    debugLog('Used container text as fallback');
  }
  
  if (!questionText || questionText.length < 5) {
    debugLog('No valid question text found');
    return null;
  }
  
  // Determine question type and inputs
  const textInputs = container.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
  const choiceInputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  
  debugLog(`Found ${textInputs.length} text inputs and ${choiceInputs.length} choice inputs`);
  
  let type = textInputs.length > 0 ? 'text' : 'multiple-choice';
  let options = [];
  
  if (type === 'multiple-choice' && choiceInputs.length > 0) {
    // Extract options
    const labelElements = container.querySelectorAll('label');
    labelElements.forEach(label => {
      if (label.textContent.trim()) {
        options.push(label.textContent.trim());
      }
    });
    
    debugLog(`Found ${options.length} options from labels`);
    
    // If no options from labels, try other methods
    if (options.length === 0) {
      const optionContainers = container.querySelectorAll('.option, .choice, .bw-option');
      optionContainers.forEach(opt => {
        if (opt.textContent.trim()) {
          options.push(opt.textContent.trim());
        }
      });
      debugLog(`Found ${options.length} options from option containers`);
    }
  }
  
  // Return question data
  return {
    text: questionText,
    type: type,
    options: options.length > 0 ? options : null,
    element: container,
    inputElement: textInputs.length > 0 ? textInputs[0] : null,
    choiceInputs: choiceInputs.length > 0 ? Array.from(choiceInputs) : null
  };
}

// Get answer from AI with better error handling
async function getAIAnswer(question, options, apiKey, model) {
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Invalid API key');
  }
  
  // Clean question for better results
  const cleanQuestion = question.replace(/^\s*question\s+\d+\s*[☆★]\s*/i, '')
                               .replace(/^\s*\([^)]*\)\s*/i, '')
                               .trim();
  
  // Select model endpoint
  let modelEndpoint = model === 'pro' ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
  
  // Create simple prompt
  const prompt = options ? 
    `Question: ${cleanQuestion}\nOptions: ${options.join(', ')}\nAnswer:` : 
    `Question: ${cleanQuestion}\nAnswer:`;
  
  // Create payload
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 50
    }
  };
  
  try {
    debugLog('Making API request...');
    
    // Make API request
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelEndpoint}:generateContent?key=${apiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const status = response.status;
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error response';
      }
      
      debugLog(`API error ${status}: ${errorText.substring(0, 100)}`);
      throw new Error(`API error: ${status}`);
    }
    
    // Parse response
    const data = await response.json();
    debugLog('Got API response');
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      debugLog('Invalid response structure: ' + JSON.stringify(data).substring(0, 100));
      throw new Error('Invalid response structure');
    }
    
    const answer = data.candidates[0].content.parts[0].text;
    if (!answer) {
      debugLog('No answer text in response');
      throw new Error('No answer text');
    }
    
    return answer.trim();
  } catch (error) {
    // Enhanced error handling
    debugLog(`API request failed: ${error.message}`);
    return options ? options[0] : "Answer not available";
  }
}

// Fill answer in the question with result status
function fillAnswer(question, answer) {
  try {
    debugLog(`Filling answer: "${answer}"`);
    
    if (question.type === 'text' && question.inputElement) {
      // Fill text input
      debugLog('Filling text input');
      question.inputElement.value = answer;
      try { question.inputElement.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
      try { question.inputElement.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
      return true;
    } else if (question.type === 'multiple-choice' && question.choiceInputs?.length > 0) {
      // For multiple choice, try to match or select first option
      debugLog('Handling multiple choice with ' + question.choiceInputs.length + ' options');
      let matched = false;
      
      for (let i = 0; i < question.choiceInputs.length; i++) {
        const input = question.choiceInputs[i];
        let label = '';
        
        // Try multiple ways to get the label text
        const labelFor = document.querySelector(`label[for="${input.id}"]`);
        if (labelFor) {
          label = labelFor.textContent;
        } else if (input.parentElement.tagName === 'LABEL') {
          label = input.parentElement.textContent;
        } else {
          // Try to get text near the input
          const wrapper = input.closest('.option, .choice, label, .bw-option');
          if (wrapper) {
            label = wrapper.textContent;
          }
        }
        
        label = label.trim();
        debugLog(`Option ${i+1}: "${label}"`);
        
        if (label.toLowerCase().includes(answer.toLowerCase())) {
          debugLog(`Match found for option ${i+1}`);
          input.checked = true;
          try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
          try { input.click(); } catch(e) {}
          matched = true;
          break;
        }
      }
      
      // Select first if no match
      if (!matched && question.choiceInputs[0]) {
        debugLog('No match found, selecting first option');
        question.choiceInputs[0].checked = true;
        try { question.choiceInputs[0].dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
        try { question.choiceInputs[0].click(); } catch(e) {}
      }
      
      return true;
    } else {
      debugLog('No matching input element found for this question type');
      return false;
    }
  } catch (error) {
    console.error('Error filling answer:', error);
    debugLog('Fill error: ' + error.message);
    return false;
  }
}

// Helper functions for status display with colors
function createStatusElement() {
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;top:5px;right:5px;background:#333;color:white;padding:5px;z-index:9999;font-size:12px;border-radius:3px;';
  document.body.appendChild(status);
  return status;
}

function updateStatus(element, message, type = 'info') {
  element.textContent = 'BW: ' + message;
  
  switch (type) {
    case 'error':
      element.style.backgroundColor = '#e53935';
      break;
    case 'success':
      element.style.backgroundColor = '#43a047';
      break;
    case 'warning':
      element.style.backgroundColor = '#ff9800';
      break;
    default:
      element.style.backgroundColor = '#333';
  }
}

// Debug logging function
function debugLog(message) {
  if (debugMode) {
    console.log('BW Debug: ' + message);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Received message: ' + JSON.stringify(request));
  
  if (request.action === 'processQuiz' || request.action === 'processAndMark') {
    debugLog('Activating auto helper with API key length: ' + (request.apiKey?.length || 0));
    
    // Store API key and model
    apiKey = request.apiKey;
    aiModel = request.model || 'flash';
    
    // Initialize auto helper
    initAutoHelper();
    
    sendResponse({ success: true, message: 'Auto helper activated' });
    return true;
  }
});

// Initialize when page is loaded
window.addEventListener('load', () => {
  console.log('BookWidgets Helper loaded - waiting for API key');
});