// Use singleton pattern to ensure only one instance exists
window.quizState = window.quizState || (function() {
  let quizQuestions = [];
  let aiAnswers = [];
  
  return {
    getQuestions: () => quizQuestions,
    getAnswers: () => aiAnswers,
    setQuestions: (questions) => { quizQuestions = questions; },
    setAnswers: (answers) => { aiAnswers = answers; },
    clearState: () => {
      quizQuestions = [];
      aiAnswers = [];
    }
  };
})();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'processQuiz') {
    processQuizQuestions(request.apiKey)
      .then(() => sendResponse({success: true}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Required for async sendResponse
  } else if (request.action === 'markAnswers') {
    try {
      markCorrectAnswers();
      sendResponse({success: true});
    } catch (error) {
      sendResponse({success: false, error: error.message});
    }
    return true; // Required for async sendResponse
  }
});

// Function to extract quiz questions from the page
async function extractQuizQuestions() {
  const questions = [];
  
  // Wait for dynamic content to load with retry mechanism
  let retryCount = 0;
  const maxRetries = 5;
  
  while (retryCount < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to find quiz content in main document first
    const mainQuestions = extractQuestionsFromDocument(document);
    if (mainQuestions.length > 0) {
      return mainQuestions;
    }
    
    // Try direct HTML parsing approach
    const directParsingQuestions = extractQuestionsFromHTML(document.documentElement.outerHTML);
    if (directParsingQuestions.length > 0) {
      return directParsingQuestions;
    }
    
    // Try to find quiz content in iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        // Try to access iframe content
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeQuestions = extractQuestionsFromDocument(iframeDoc);
        if (iframeQuestions.length > 0) {
          return iframeQuestions;
        }
        
        // Try direct HTML parsing on iframe content
        const iframeHTML = iframeDoc.documentElement.outerHTML;
        const iframeDirectQuestions = extractQuestionsFromHTML(iframeHTML);
        if (iframeDirectQuestions.length > 0) {
          return iframeDirectQuestions;
        }
      } catch (e) {
        console.warn('Could not access iframe content:', e);
        // If we can't access the iframe directly, try to inject a content script
        try {
          const rect = iframe.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && iframe.src) {
            // The iframe is visible and has a source URL
            console.log('Attempting to extract from visible iframe:', iframe.src);
          }
        } catch (e) {
          console.warn('Error checking iframe visibility:', e);
        }
      }
    }
    
    retryCount++;
    console.log(`Retry ${retryCount}/${maxRetries} - Waiting for quiz content to load...`);
  }
  
  throw new Error('No quiz questions found after maximum retries. Please ensure you are on a BookWidgets quiz page.');
}

// Function to extract questions from a document
function extractQuestionsFromDocument(doc) {
  const questions = [];
  
  // Find all question containers using BookWidgets specific selectors
  let questionContainers = Array.from(doc.querySelectorAll(
    '.bw-question, .bw-quiz-question, .bookwidgets-question, .vraag, ' +
    '.question-item, .question, .mc-question, .quiz-question, .question-container, ' +
    '.widget-question, .question-wrapper, .multiple-choice-question, ' +
    '.bw-widget-question, .bw-multiple-choice, .bw-quiz-item, .bw-quiz-content, ' +
    '[data-question-type], [data-question-id], [data-component="question"]'
  ));
  
  // Try to find questions in shadow DOM
  if (questionContainers.length === 0) {
    try {
      const shadowRoots = Array.from(doc.querySelectorAll('*'))
        .filter(el => el.shadowRoot)
        .map(el => el.shadowRoot);
      
      for (const root of shadowRoots) {
        const shadowQuestions = Array.from(root.querySelectorAll(
          '.bw-question, .bw-quiz-question, .bookwidgets-question, .vraag, ' +
          '.question-item, .question, .mc-question, .quiz-question, .question-container, ' +
          '.widget-question, .question-wrapper, .multiple-choice-question, ' +
          '.bw-widget-question, .bw-multiple-choice, .bw-quiz-item, .bw-quiz-content, ' +
          '[data-question-type], [data-question-id], [data-component="question"]'
        ));
        questionContainers = [...questionContainers, ...shadowQuestions];
      }
    } catch (e) {
      console.warn('Error accessing shadow DOM:', e);
    }
  }
  
  // If still no questions found, try to find any elements that might contain questions
  if (questionContainers.length === 0) {
    // Look for any elements that might be question containers based on their attributes or content
    const potentialContainers = Array.from(doc.querySelectorAll('div, section, article'));
    questionContainers = potentialContainers.filter(el => {
      const text = el.textContent.toLowerCase();
      const hasQuestionIndicator = text.includes('question') || text.includes('vraag') || 
                                  text.includes('choose') || text.includes('select') ||
                                  text.includes('pick') || text.includes('kies');
      const hasOptions = el.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
      return hasQuestionIndicator || hasOptions;
    });
  }
  
  console.log('Found question containers:', questionContainers.length);
  
  questionContainers.forEach((container, index) => {
    // Extract question text using BookWidgets specific selectors
    let questionText = container.querySelector(
      '.vraag-text, .question-text, .question-title, .stem, .mc-stem, ' +
      '.question-content, .question-prompt, .question-body, .question-label, ' +
      '.bw-question-text, .bw-stem, h1, h2, h3, h4, p, label'
    )?.textContent?.trim();
    
    // If no question text found using selectors, try to find the first text node
    if (!questionText) {
      // Try to find the first paragraph or heading element
      const textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, label');
      for (const el of textElements) {
        const text = el.textContent.trim();
        if (text && text.length > 10) { // Assume question text is reasonably long
          questionText = text;
          break;
        }
      }
      
      // If still no text found, use the first non-empty text node
      if (!questionText) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text && text.length > 10) {
            questionText = text;
            break;
          }
        }
      }
    }
    
    if (questionText) {
      console.log('Found question text:', questionText);
    }
    
    // Extract answer options using BookWidgets specific selectors
    const options = [];
    
    // Try multiple approaches to find options
    const optionSelectors = [
      '.antwoord, .answer-choice, .option-text, .choice, .mc-option, ' +
      '.radio-option, .option, .answer-option, .answer, .choice-text, ' +
      '.bw-option, .bw-answer, .bw-choice, input[type="radio"] + label, ' +
      'input[type="checkbox"] + label, li.option, .bw-button-label, .tmc-row'
    ];
    
    // Try each selector approach
    let optionElements = [];
    for (const selector of optionSelectors) {
      const elements = container.querySelectorAll(selector);
      if (elements.length > 0) {
        optionElements = Array.from(elements);
        break;
      }
    }
    
    // If no options found using selectors, try to find radio/checkbox inputs
    if (optionElements.length === 0) {
      const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      inputs.forEach(input => {
        // Find associated label
        let label = null;
        if (input.id) {
          label = container.querySelector(`label[for="${input.id}"]`);
        }
        if (!label) {
          // Try to find label as parent or sibling
          label = input.closest('label') || input.nextElementSibling;
        }
        if (label) {
          optionElements.push(label);
        }
      });
    }
    
    // If still no options found, look for list items or divs that might be options
    if (optionElements.length === 0) {
      optionElements = Array.from(container.querySelectorAll('li, div'));
      // Filter to likely option elements (those that are siblings and have similar structure)
      if (optionElements.length > 0) {
        const firstParent = optionElements[0].parentNode;
        optionElements = optionElements.filter(el => el.parentNode === firstParent);
      }
    }
    
    console.log('Found option elements for question:', optionElements.length);
    
    optionElements.forEach(option => {
      const optionText = option.textContent.trim();
      if (optionText && !options.includes(optionText)) {
        options.push(optionText);
      }
    });
    
    if (questionText && options.length > 0) {
      questions.push({
        id: index,
        text: questionText,
        options: options
      });
    }
  });
  
  return questions;
}

// Function to extract questions from HTML content directly
function extractQuestionsFromHTML(htmlContent) {
  console.log('Attempting to extract questions directly from HTML...');
  const questions = [];
  
  try {
    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    tempDiv.innerHTML = htmlContent;
    document.body.appendChild(tempDiv);
    
    // Common patterns for question containers in BookWidgets
    const questionPatterns = [
      // Pattern 1: Question with class indicators
      /<div[^>]*class="[^"]*(?:question|vraag|quiz-question)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // Pattern 2: Question with data attributes
      /<div[^>]*data-question[^>]*>([\s\S]*?)<\/div>/gi,
      // Pattern 3: Question with specific structure
      /<div[^>]*class="[^"]*stem[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    ];
    
    // Common patterns for answer options
    const optionPatterns = [
      // Pattern 1: Options with class indicators
      /<div[^>]*class="[^"]*(?:option|answer|choice)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // Pattern 2: Options with input elements
      /<input[^>]*type="(?:radio|checkbox)"[^>]*>[\s\S]*?<label[^>]*>([\s\S]*?)<\/label>/gi,
      // Pattern 3: Options with specific structure
      /<div[^>]*class="[^"]*(?:bw-button-label|tmc-row)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    ];
    
    // Extract potential question blocks
    let questionBlocks = [];
    for (const pattern of questionPatterns) {
      const matches = [...htmlContent.matchAll(pattern)];
      questionBlocks = [...questionBlocks, ...matches.map(match => match[0])];
    }
    
    // Process each potential question block
    questionBlocks.forEach((block, index) => {
      // Extract question text
      const questionTextMatch = block.match(/<div[^>]*class="[^"]*(?:question-text|stem|vraag-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
                              block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/) ||
                              block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      
      let questionText = '';
      if (questionTextMatch && questionTextMatch[1]) {
        // Clean up the question text (remove HTML tags)
        questionText = questionTextMatch[1].replace(/<[^>]*>/g, '').trim();
      }
      
      // If no question text found, try to extract from the block itself
      if (!questionText) {
        const cleanBlock = block.replace(/<[^>]*>/g, '').trim();
        const lines = cleanBlock.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length > 0) {
          questionText = lines[0];
        }
      }
      
      // Extract options
      const options = [];
      for (const pattern of optionPatterns) {
        const optionMatches = [...block.matchAll(pattern)];
        for (const match of optionMatches) {
          if (match && match[1]) {
            // Clean up the option text (remove HTML tags)
            const optionText = match[1].replace(/<[^>]*>/g, '').trim();
            if (optionText && !options.includes(optionText)) {
              options.push(optionText);
            }
          }
        }
      }
      
      // If no options found using patterns, try to extract list items
      if (options.length === 0) {
        const listItemMatches = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        for (const match of listItemMatches) {
          if (match && match[1]) {
            const optionText = match[1].replace(/<[^>]*>/g, '').trim();
            if (optionText) {
              options.push(optionText);
            }
          }
        }
      }
      
      // Add question if we have both question text and options
      if (questionText && options.length > 0) {
        questions.push({
          id: index,
          text: questionText,
          options: options
        });
      }
    });
    
    // Clean up
    document.body.removeChild(tempDiv);
    
    console.log(`Extracted ${questions.length} questions directly from HTML`);
    return questions;
  } catch (error) {
    console.error('Error extracting questions from HTML:', error);
    return [];
  }
}

// Function to process quiz questions with AI
async function processQuizQuestions(apiKey) {
  try {
    // Extract questions from the page
    const extractedQuestions = await extractQuizQuestions();
    
    if (extractedQuestions.length === 0) {
      throw new Error('No quiz questions found on the page. Please ensure you are on a BookWidgets quiz page and the content has fully loaded.');
    }
    
    // Clear previous answers and update questions
    quizState.clearState();
    quizState.setQuestions(extractedQuestions);
    
    // Process each question with AI
    for (const question of quizState.getQuestions()) {
      const answer = await getAnswerFromAI(question, apiKey);
      const currentAnswers = quizState.getAnswers();
      quizState.setAnswers([...currentAnswers, answer]);
    }
    
    console.log('Quiz processed successfully:', quizState.getAnswers());
    return true;
  } catch (error) {
    console.error('Error processing quiz:', error);
    throw error;
  }
}

// Function to get answer from AI
async function getAnswerFromAI(question, apiKey) {
  try {
    // Check if this is a true/false question
    const isTrueFalse = question.options.length === 2 && 
      ((question.options[0].toLowerCase().includes('true') && question.options[1].toLowerCase().includes('false')) ||
       (question.options[0].toLowerCase().includes('false') && question.options[1].toLowerCase().includes('true')));
    
    let prompt;
    if (isTrueFalse) {
      prompt = `Question: ${question.text}\nOptions: ${question.options.join(', ')}\n\nIs this statement true or false? Please respond with just the letter (A or B) corresponding to the correct option.`;
    } else {
      prompt = `Question: ${question.text}\nOptions: ${question.options.join(', ')}\n\nWhich option is the correct answer? Please respond with just the letter (A, B, C, etc.) corresponding to the correct option.`;
    }
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 50
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    // Extract response from Gemini API format
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Extract the letter answer (A, B, C, etc.)
    const answerLetter = aiResponse.match(/^[A-Z]/)?.[0] || '';
    
    // Convert letter to index (A=0, B=1, etc.)
    const answerIndex = answerLetter.charCodeAt(0) - 65;
    
    // Add additional information for true/false questions
    const result = {
      questionId: question.id,
      answerIndex: answerIndex,
      answerLetter: answerLetter,
      isTrueFalse: isTrueFalse
    };
    
    // For true/false questions, add explicit true/false value
    if (isTrueFalse) {
      const correctOption = question.options[answerIndex] || '';
      result.isTrue = correctOption.toLowerCase().includes('true');
    }
    
    return result;
  } catch (error) {
    console.error('Error getting answer from AI:', error);
    throw error;
  }
}

// Function to mark correct answers on the page
function markCorrectAnswers() {
  const answers = quizState.getAnswers();
  if (answers.length === 0) {
    throw new Error('No answers available. Process the quiz first.');
  }
  
  // Find all question containers using BookWidgets specific selectors
  const questionContainers = document.querySelectorAll(
    '.vraag, .question-item, .question, .mc-question, .quiz-question, ' +
    '.question-container, .widget-question, .question-wrapper, ' +
    '.multiple-choice-question, .bw-question, .bookwidgets-question'
  );
  
  // If we can't find question containers using selectors, try to find them using HTML patterns
  if (questionContainers.length === 0 || questionContainers.length < answers.length) {
    console.log('Using direct HTML approach to mark answers...');
    markAnswersUsingHTML(answers);
    return true;
  }
  
  answers.forEach(answer => {
    const container = questionContainers[answer.questionId];
    if (!container) return;
    
    // Find the option elements
    const optionElements = container.querySelectorAll(
      '.antwoord, .answer-choice, .option-text, .choice, .mc-option, ' +
      '.radio-option, .option, .answer-option, .answer, .choice-text'
    );
    
    // Mark the correct answer with a red dot
    if (optionElements[answer.answerIndex]) {
      const correctOption = optionElements[answer.answerIndex];
      
      // Remove any existing red dots
      const existingDots = correctOption.querySelectorAll('.answer-dot');
      existingDots.forEach(dot => dot.remove());
      
      // Create a red dot element
      const redDot = document.createElement('span');
      redDot.className = 'answer-dot';
      redDot.style.display = 'inline-block';
      redDot.style.width = '8px';
      redDot.style.height = '8px';
      redDot.style.backgroundColor = '#FF4444';
      redDot.style.borderRadius = '50%';
      redDot.style.marginLeft = '8px';
      redDot.style.verticalAlign = 'middle';
      
      // Append the red dot after the option text
      correctOption.appendChild(redDot);
    }
  });
  
  return true;
}

// Function to mark answers using direct HTML approach
function markAnswersUsingHTML(answers) {
  // Get all option elements that could potentially be answers
  const optionSelectors = [
    '.antwoord', '.answer-choice', '.option-text', '.choice', '.mc-option',
    '.radio-option', '.option', '.answer-option', '.answer', '.choice-text',
    'input[type="radio"] + label', 'input[type="checkbox"] + label',
    'li.option', '.bw-button-label', '.tmc-row'
  ];
  
  const allOptions = document.querySelectorAll(optionSelectors.join(', '));
  console.log(`Found ${allOptions.length} potential option elements`);
  
  // Get all question containers
  const questionContainerSelectors = [
    '.vraag', '.question-item', '.question', '.mc-question', '.quiz-question',
    '.question-container', '.widget-question', '.question-wrapper',
    '.multiple-choice-question', '.bw-question', '.bookwidgets-question',
    '[data-question-type]', '[data-question-id]', '[data-component="question"]'
  ];
  
  const questionContainers = document.querySelectorAll(questionContainerSelectors.join(', '));
  console.log(`Found ${questionContainers.length} potential question containers`);
  
  // If we can't find options using selectors, create floating markers
  if (allOptions.length === 0) {
    console.log('Using advanced HTML pattern matching to mark answers...');
    // Create overlay markers for each answer
    answers.forEach((answer, index) => {
      // Create a floating marker
      const marker = document.createElement('div');
      marker.textContent = `Answer ${index + 1}: ${answer.answerLetter}`;
      marker.style.position = 'fixed';
      marker.style.top = `${50 + (index * 40)}px`;
      marker.style.right = '20px';
      marker.style.backgroundColor = '#FF4444';
      marker.style.color = 'white';
      marker.style.padding = '8px 12px';
      marker.style.borderRadius = '4px';
      marker.style.zIndex = '9999';
      marker.style.fontWeight = 'bold';
      marker.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
      document.body.appendChild(marker);
    });
    return;
  }
  
  // Map answers to options based on text content
  const questions = quizState.getQuestions();
  answers.forEach((answer, index) => {
    const question = questions[answer.questionId];
    if (!question || !question.options || answer.answerIndex >= question.options.length) return;
    
    const correctOptionText = question.options[answer.answerIndex];
    if (!correctOptionText) return;
    
    // Find the option element with matching text
    let foundOption = null;
    for (const option of allOptions) {
      const optionText = option.textContent.trim();
      if (optionText.includes(correctOptionText) || correctOptionText.includes(optionText)) {
        // Remove any existing red dots
        const existingDots = option.querySelectorAll('.answer-dot');
        existingDots.forEach(dot => dot.remove());
        
        // Create a red dot element
        const redDot = document.createElement('span');
        redDot.className = 'answer-dot';
        redDot.style.display = 'inline-block';
        redDot.style.width = '8px';
        redDot.style.height = '8px';
        redDot.style.backgroundColor = '#FF4444';
        redDot.style.borderRadius = '50%';
        redDot.style.marginLeft = '8px';
        redDot.style.verticalAlign = 'middle';
        
        // Append the red dot after the option text
        option.appendChild(redDot);
        foundOption = option;
        break;
      }
    }
    
    // Add answer information at the bottom of the question
    const questionContainer = index < questionContainers.length ? questionContainers[index] : null;
    if (questionContainer) {
      // Check if this is a true/false question
      const isTrueFalse = question.options.length === 2 && 
        ((question.options[0].toLowerCase().includes('true') && question.options[1].toLowerCase().includes('false')) ||
         (question.options[0].toLowerCase().includes('false') && question.options[1].toLowerCase().includes('true')));
      
      // Create answer info element
      const answerInfo = document.createElement('div');
      answerInfo.style.marginTop = '10px';
      answerInfo.style.padding = '8px';
      answerInfo.style.backgroundColor = '#f0f8ff';
      answerInfo.style.border = '1px solid #add8e6';
      answerInfo.style.borderRadius = '4px';
      answerInfo.style.fontWeight = 'bold';
      
      if (isTrueFalse) {
        // For true/false questions, explicitly state if the answer is True or False
        const isTrue = correctOptionText.toLowerCase().includes('true');
        answerInfo.textContent = `Answer: ${isTrue ? 'TRUE' : 'FALSE'}`;
        answerInfo.style.backgroundColor = isTrue ? '#e6ffe6' : '#ffe6e6';
        answerInfo.style.border = isTrue ? '1px solid #99cc99' : '1px solid #cc9999';
      } else {
        // For multiple choice questions
        answerInfo.textContent = `Answer: ${answer.answerLetter} - ${correctOptionText}`;
      }
      
      // Append the answer info to the question container
      questionContainer.appendChild(answerInfo);
    }
  });
}
}