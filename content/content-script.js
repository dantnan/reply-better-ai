/**
 * Reply Better AI - Content Script
 * This script detects text areas/inputs on webpages and adds improvement functionality
 */

// Global variables
let activeTextElement = null;
let assistantButtons = [];
let ignoreNextBlur = false; // Flag to ignore the next blur event

// Settings with default values
let settings = {
  enableInlineButton: true,
  inlineMessageType: 'professional',
  showTypeIndicator: true,
  savedPrompts: [],
  snippets: [] // Array to store user-defined snippets
};

// Type labels for display
const typeLabels = {
  'professional': 'Pro',
  'friendly': 'Friendly',
  'customer': 'Service',
  'concise': 'Concise'
};

// Create stylesheet
const injectStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    .reply-better-button {
      position: absolute;
      width: 30px;
      height: 30px;
      background-color: #3498db;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      font-size: 16px;
      z-index: 99999;
      transition: transform 0.2s, background-color 0.2s;
      border: none;
    }
    
    .reply-better-button:hover {
      transform: scale(1.1);
      background-color: #2980b9;
    }
    
    .reply-better-button.processing {
      background-color: #f39c12;
      animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
    
    .reply-better-tooltip {
      position: absolute;
      background-color: #34495e;
      color: white;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      white-space: nowrap;
    }
    
    .reply-better-button:hover + .reply-better-tooltip {
      opacity: 1;
    }
    
    .reply-better-type-indicator {
      position: absolute;
      background-color: #34495e;
      color: white;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 10px;
      z-index: 99998;
      white-space: nowrap;
      letter-spacing: -0.5px;
    }
  `;
  document.head.appendChild(style);
};

// Get type label for display
const getTypeLabel = (type) => {
  // Handle custom prompts
  if (type.startsWith('custom_prompt_')) {
    const index = parseInt(type.replace('custom_prompt_', ''));
    if (!isNaN(index) && index >= 0 && index < settings.savedPrompts.length) {
      return settings.savedPrompts[index].name.substring(0, 10); // Limit to 10 chars
    }
    return 'Custom';
  }
  
  return typeLabels[type] || 'Pro';
};

// Function to position button next to a text element
const positionButtonForElement = (textElement, button, tooltip, typeIndicator) => {
  const rect = textElement.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Position button in the top-right corner of the text element
  button.style.top = `${rect.top + scrollTop + 5}px`;
  button.style.left = `${rect.right + scrollLeft - 35}px`;
  
  // Position tooltip
  tooltip.style.top = `${rect.top + scrollTop - 25}px`;
  tooltip.style.left = `${rect.right + scrollLeft - 80}px`;
  
  // Position type indicator if it exists
  if (typeIndicator) {
    typeIndicator.style.top = `${rect.top + scrollTop + 5}px`;
    typeIndicator.style.left = `${rect.right + scrollLeft - 65}px`;
  }
};

// Function to create assistant button for a text element
const createAssistantButton = (textElement) => {
  // Don't create button if it's disabled in settings
  if (!settings.enableInlineButton) return null;
  
  // Create button
  const button = document.createElement('button');
  button.className = 'reply-better-button';
  button.innerHTML = '✍️';
  button.title = 'Improve with Reply Better AI';
  document.body.appendChild(button);
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'reply-better-tooltip';
  tooltip.textContent = `Improve text (${getTypeLabel(settings.inlineMessageType)})`;
  document.body.appendChild(tooltip);
  
  // Create type indicator if enabled - but keep hidden by default
  let typeIndicator = null;
  if (settings.showTypeIndicator) {
    typeIndicator = document.createElement('div');
    typeIndicator.className = 'reply-better-type-indicator';
    typeIndicator.textContent = getTypeLabel(settings.inlineMessageType);
    typeIndicator.style.display = 'none'; // Hide by default
    document.body.appendChild(typeIndicator);
  }
  
  // Position the elements
  positionButtonForElement(textElement, button, tooltip, typeIndicator);
  
  // Add mousedown handler to prevent blur
  button.addEventListener('mousedown', (e) => {
    // Set flag to ignore the next blur event
    ignoreNextBlur = true;
    // Prevent default to avoid focus change
    e.preventDefault();
  });
  
  // Add click handler
  button.addEventListener('click', (e) => {
    // Prevent default browser actions
    e.preventDefault();
    e.stopPropagation();
    
    // Improve the text
    improveText(textElement, button);
  });
  
  // Save reference to clean up later
  assistantButtons.push({ button, tooltip, typeIndicator, textElement });
  
  return { button, tooltip, typeIndicator };
};

// Function to improve text with the extension
const improveText = async (textElement, button) => {
  const text = textElement.value || textElement.innerText;
  
  if (!text.trim()) {
    // Don't do anything if there's no text
    return;
  }
  
  // Keep focus on the text element
  textElement.focus();
  
  // Keep buttons visible during processing
  ignoreNextBlur = true;
  
  // Show processing state
  button.classList.add('processing');
  
  try {
    console.log("Attempting to connect to background service...");
    
    // Try direct communication first (fastest path)
    try {
      console.log("Sending improve text request directly...");
      const response = await sendMessageWithTimeout({
        action: 'improveText',
        text: text,
        messageType: settings.inlineMessageType,
        from: 'content-script',
        timestamp: Date.now()
      }, 60000); // 60 second timeout for AI processing
      
      if (response && response.improvedText) {
        // Update the text element with improved text
        if (textElement.tagName === 'TEXTAREA' || textElement.tagName === 'INPUT') {
          textElement.value = response.improvedText;
          // Trigger input event so framework bindings update
          const event = new Event('input', { bubbles: true });
          textElement.dispatchEvent(event);
        } else {
          textElement.innerText = response.improvedText;
        }
        
        // Remove processing state
        button.classList.remove('processing');
        
        // Allow blur events again after a short delay
        setTimeout(() => {
          ignoreNextBlur = false;
        }, 500);
        
        // Make sure text element stays focused
        textElement.focus();
        return;
      } else if (response && response.error) {
        console.error('Error improving text:', response.error);
        alert(`Error improving text: ${response.error}`);
        
        // Remove processing state
        button.classList.remove('processing');
        
        // Allow blur events again after a short delay
        setTimeout(() => {
          ignoreNextBlur = false;
        }, 500);
        
        return;
      }
    } catch (directError) {
      console.warn("Direct request failed, trying ping-first approach:", directError);
      // Fall through to ping-then-request approach
    }
    
    // If direct approach failed, try ping-first approach
    console.log("Sending ping to background script...");
    
    // Use a longer timeout for initial ping
    let pingRetriesLeft = 3;
    let pingSuccess = false;
    
    // Try pinging multiple times with increasing timeout
    while (pingRetriesLeft > 0 && !pingSuccess) {
      try {
        const pingTimeout = (4 - pingRetriesLeft) * 1000; // 1s, then 2s, then 3s
        console.log(`Ping attempt ${4 - pingRetriesLeft} with ${pingTimeout}ms timeout`);
        const pingResult = await sendMessageWithTimeout({
          action: 'ping',
          from: 'content-script',
          timestamp: Date.now()
        }, pingTimeout);
        
        console.log("Ping response received:", pingResult);
        
        if (pingResult && pingResult.status === 'ok') {
          pingSuccess = true;
          console.log("Ping successful, background service is active");
        } else {
          console.warn("Received invalid ping response:", pingResult);
          pingRetriesLeft--;
        }
      } catch (pingError) {
        console.warn(`Ping attempt failed (${pingRetriesLeft} retries left):`, pingError);
        pingRetriesLeft--;
        
        // If all retries failed, throw error to be caught by outer catch
        if (pingRetriesLeft === 0) {
          throw new Error("Background script not responding to ping");
        }
      }
    }
    
    console.log("Sending improve text request after successful ping...");
    // If ping succeeds, send the improve text message
    const response = await sendMessageWithTimeout({
      action: 'improveText',
      text: text,
      messageType: settings.inlineMessageType,
      from: 'content-script',
      timestamp: Date.now()
    }, 60000); // 60 second timeout for AI processing
    
    console.log("Improve text response received:", response ? "success" : "empty");
    
    if (response && response.improvedText) {
      // Update the text element with improved text
      if (textElement.tagName === 'TEXTAREA' || textElement.tagName === 'INPUT') {
        textElement.value = response.improvedText;
        // Trigger input event so framework bindings update
        const event = new Event('input', { bubbles: true });
        textElement.dispatchEvent(event);
      } else {
        textElement.innerText = response.improvedText;
      }
    } else if (response && response.error) {
      console.error('Error improving text:', response.error);
      alert(`Error improving text: ${response.error}`);
    } else {
      console.error('Empty or invalid response received');
      throw new Error('Empty or invalid response received');
    }
    
    // Remove processing state
    button.classList.remove('processing');
    
    // Allow blur events again after a short delay
    setTimeout(() => {
      ignoreNextBlur = false;
    }, 500);
    
    // Make sure text element stays focused
    textElement.focus();
  } catch (error) {
    console.error('Failed to process text improvement:', error);
    
    // Show more user-friendly error message
    if (error.message?.includes('Receiving end does not exist')) {
      alert('Browser extension needs to be reloaded. Please refresh this page and try again.');
    } else if (error.message?.includes('timed out')) {
      alert('Request timed out. The AI service might be busy, please try again in a moment.');
    } else if (error.message?.includes('Background script not responding')) {
      alert('Background service not responding. Please reload the page and try again.');
    } else {
      alert(`Error: ${error.message || 'Unknown error occurred'}`);
    }
    
    // Remove processing state
    button.classList.remove('processing');
    
    // Allow blur events again
    setTimeout(() => {
      ignoreNextBlur = false;
    }, 500);
  }
};

// Helper function to send a message with timeout
const sendMessageWithTimeout = (message, timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    // Add a unique ID to each message for debugging
    const messageWithId = {
      ...message,
      messageId: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };
    
    console.log(`Sending message ${messageWithId.messageId} with timeout ${timeoutMs}ms`);
    
    // Create a timeout that will reject the promise if exceeded
    const timeoutId = setTimeout(() => {
      reject(new Error(`Message ${messageWithId.messageId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    try {
      // Special check for Firefox: is runtime defined?
      if (!browser || !browser.runtime) {
        clearTimeout(timeoutId);
        reject(new Error("Browser runtime not available"));
        return;
      }
      
      // Error handling for compatibility between Firefox versions using Promise.catch
      const sendPromise = browser.runtime.sendMessage(messageWithId);
      
      if (typeof sendPromise.then !== "function") {
        clearTimeout(timeoutId);
        reject(new Error("Browser runtime sendMessage did not return a Promise"));
        return;
      }
      
      sendPromise
        .then(response => {
          clearTimeout(timeoutId);
          console.log(`Received response for message ${messageWithId.messageId}:`, response);
          
          if (response === undefined || response === null) {
            reject(new Error(`Empty response received for message ${messageWithId.messageId}`));
          } else {
            resolve(response);
          }
        })
        .catch(error => {
          clearTimeout(timeoutId);
          
          // Special Firefox error handling
          if (error && error.message && error.message.includes("Receiving end does not exist")) {
            console.error(`Firefox connection error for message ${messageWithId.messageId}:`, error);
            reject(new Error("Extension background page is not available. Try reloading the page."));
          } else {
            console.error(`Error for message ${messageWithId.messageId}:`, error);
            reject(error);
          }
        });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Exception sending message ${messageWithId.messageId}:`, error);
      reject(error);
    }
  });
};

// Function to clean up buttons when not needed
const cleanupButtons = () => {
  assistantButtons.forEach(({ button, tooltip, typeIndicator }) => {
    if (button && button.parentNode) {
      button.parentNode.removeChild(button);
    }
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    if (typeIndicator && typeIndicator.parentNode) {
      typeIndicator.parentNode.removeChild(typeIndicator);
    }
  });
  assistantButtons = [];
};

// Function to handle text element focus
const handleFocus = (event) => {
  if (!settings.enableInlineButton) return;
  
  if (event.target.tagName === 'TEXTAREA' || 
      (event.target.tagName === 'INPUT' && event.target.type === 'text') ||
      event.target.contentEditable === 'true') {
    activeTextElement = event.target;
    
    // Only create button if there's text in the element
    const text = activeTextElement.value || activeTextElement.innerText;
    if (text.trim()) {
      createAssistantButton(activeTextElement);
    }
  }
};

// Function to handle text element blur (losing focus)
const handleBlur = (event) => {
  if (!settings.enableInlineButton) return;
  
  // If we should ignore this blur event, reset the flag and return
  if (ignoreNextBlur) {
    ignoreNextBlur = false;
    
    // Short timeout to allow click event to execute before allowing new blur events
    setTimeout(() => {
      ignoreNextBlur = false;
    }, 100);
    
    return;
  }
  
  if (event.target.tagName === 'TEXTAREA' || 
      (event.target.tagName === 'INPUT' && event.target.type === 'text') ||
      event.target.contentEditable === 'true') {
    
    // Use setTimeout to delay the button removal
    // This gives the click event time to fire if the blur was caused by clicking the button
    setTimeout(() => {
      // Check if we should still remove the button
      if (ignoreNextBlur) {
        return;
      }
      
      // Remove the button if it exists for this element
      const existingButtonInfo = assistantButtons.find(b => b.textElement === event.target);
      if (existingButtonInfo) {
        if (existingButtonInfo.button && existingButtonInfo.button.parentNode) {
          existingButtonInfo.button.parentNode.removeChild(existingButtonInfo.button);
        }
        if (existingButtonInfo.tooltip && existingButtonInfo.tooltip.parentNode) {
          existingButtonInfo.tooltip.parentNode.removeChild(existingButtonInfo.tooltip);
        }
        if (existingButtonInfo.typeIndicator && existingButtonInfo.typeIndicator.parentNode) {
          existingButtonInfo.typeIndicator.parentNode.removeChild(existingButtonInfo.typeIndicator);
        }
        assistantButtons = assistantButtons.filter(b => b.textElement !== event.target);
      }
      
      // If this was the active text element, clear it
      if (activeTextElement === event.target) {
        activeTextElement = null;
      }
    }, 200); // Small delay to let click events process first
  }
};

// Function to check if element is a valid text input
const isTextInput = (element) => {
  return (
    element.tagName === 'TEXTAREA' || 
    (element.tagName === 'INPUT' && element.type === 'text') ||
    element.contentEditable === 'true'
  );
};

// Function to handle text input events
const handleInput = (event) => {
  if (!settings.enableInlineButton && !settings.snippets.length) return;
  
  const element = event.target;
  if (!isTextInput(element)) return;
  
  // Handle button visibility based on text content and focus
  if (settings.enableInlineButton) {
    const text = element.value || element.innerText;
    
    // Find existing button for this element
    const existingButtonInfo = assistantButtons.find(b => b.textElement === element);
    
    // Only show button if element has focus (it must be the one we're currently typing in)
    // This is guaranteed since we're handling an input event
    if (text.trim()) {
      // Create button if there's text and no button exists
      if (!existingButtonInfo) {
        createAssistantButton(element);
      }
    } else {
      // Remove button if there's no text
      if (existingButtonInfo) {
        if (existingButtonInfo.button && existingButtonInfo.button.parentNode) {
          existingButtonInfo.button.parentNode.removeChild(existingButtonInfo.button);
        }
        if (existingButtonInfo.tooltip && existingButtonInfo.tooltip.parentNode) {
          existingButtonInfo.tooltip.parentNode.removeChild(existingButtonInfo.tooltip);
        }
        if (existingButtonInfo.typeIndicator && existingButtonInfo.typeIndicator.parentNode) {
          existingButtonInfo.typeIndicator.parentNode.removeChild(existingButtonInfo.typeIndicator);
        }
        assistantButtons = assistantButtons.filter(b => b.textElement !== element);
      }
    }
  }
  
  // Handle snippets expansion
  if (settings.snippets.length > 0) {
    let text = element.value || element.innerText;
    let cursorPosition = getCursorPosition(element);
    
    // Check for snippet triggers
    for (const snippet of settings.snippets) {
      if (text.includes(snippet.trigger)) {
        // Get text before the cursor
        const textBeforeCursor = text.substring(0, cursorPosition);
        
        // Check if the trigger is right before the cursor
        if (textBeforeCursor.endsWith(snippet.trigger)) {
          // Replace the trigger with the snippet content
          const newText = text.replace(snippet.trigger, snippet.content);
          
          // Update the text element
          if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            element.value = newText;
            // Calculate new cursor position
            const newPosition = cursorPosition - snippet.trigger.length + snippet.content.length;
            setCursorPosition(element, newPosition);
          } else {
            element.innerText = newText;
            // For contentEditable, cursor handling is more complex
            // We'll set it at the end of the inserted content
            setCursorPosition(element, textBeforeCursor.length - snippet.trigger.length + snippet.content.length);
          }
          
          // Trigger input event for framework bindings
          const inputEvent = new Event('input', { bubbles: true });
          element.dispatchEvent(inputEvent);
          
          break; // Process only one snippet at a time
        }
      }
    }
  }
};

// Function to handle window resize (reposition buttons)
const handleResize = () => {
  cleanupButtons();
  
  // Only add button to active text element if it has content
  if (activeTextElement) {
    const text = activeTextElement.value || activeTextElement.innerText;
    if (text.trim()) {
      createAssistantButton(activeTextElement);
    }
  }
};

// Update buttons with new settings
const updateButtons = () => {
  cleanupButtons();
  
  // Only add button to active text element if it exists and has content
  if (activeTextElement) {
    const text = activeTextElement.value || activeTextElement.innerText;
    if (text.trim()) {
      createAssistantButton(activeTextElement);
    }
  }
};

// Helper function to get cursor position in a text element
const getCursorPosition = (element) => {
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    return element.selectionStart;
  } else if (element.contentEditable === 'true') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return range.startOffset;
    }
  }
  return 0;
};

// Helper function to set cursor position in a text element
const setCursorPosition = (element, position) => {
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    element.selectionStart = position;
    element.selectionEnd = position;
  } else if (element.contentEditable === 'true') {
    const selection = window.getSelection();
    const range = document.createRange();
    
    // Try to find the text node where the cursor should be positioned
    let currentNode = element.firstChild;
    let currentPos = 0;
    
    // If there are no children, create a text node
    if (!currentNode) {
      const textNode = document.createTextNode(element.innerText);
      element.appendChild(textNode);
      currentNode = textNode;
    }
    
    // Find the appropriate text node and position
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const nodeLength = currentNode.textContent.length;
        if (currentPos + nodeLength >= position) {
          range.setStart(currentNode, position - currentPos);
          range.setEnd(currentNode, position - currentPos);
          break;
        }
        currentPos += nodeLength;
      }
      currentNode = currentNode.nextSibling;
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
  }
};

// Function to initialize the content script
const init = async () => {
  // Load settings from browser.storage.sync
  try {
    const loadedSettings = await browser.storage.sync.get([
      'enableInlineButton', 'inlineMessageType', 'showTypeIndicator', 'savedPrompts', 'snippets'
    ]);
    
    // Update settings with loaded values
    if (loadedSettings.enableInlineButton !== undefined) {
      settings.enableInlineButton = loadedSettings.enableInlineButton;
    }
    
    if (loadedSettings.inlineMessageType) {
      settings.inlineMessageType = loadedSettings.inlineMessageType;
    }
    
    if (loadedSettings.showTypeIndicator !== undefined) {
      settings.showTypeIndicator = loadedSettings.showTypeIndicator;
    }
    
    if (loadedSettings.savedPrompts) {
      settings.savedPrompts = loadedSettings.savedPrompts;
    }
    
    if (loadedSettings.snippets) {
      settings.snippets = loadedSettings.snippets;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  
  // Inject CSS
  injectStyles();
  
  // Add event listeners
  document.addEventListener('focus', handleFocus, true);
  document.addEventListener('blur', handleBlur, true);
  document.addEventListener('input', handleInput, true);
  window.addEventListener('resize', handleResize);
  
  // No need for initial scan anymore since we only show buttons for active elements
  
  // Set up message listener for extension communication
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateSettings') {
      // Update local settings
      settings = { ...settings, ...message.settings };
      // Update buttons with new settings
      updateButtons();
      return true;
    }
  });
  
  console.log('Reply Better AI content script initialized');
};

// Initialize when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 