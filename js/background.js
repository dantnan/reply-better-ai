/**
 * Reply Better AI - Background Script
 * 
 * This script runs in the background and can handle tasks
 * that need to be performed regardless of whether the popup is open.
 */

// Log extension startup
console.log('Reply Better AI extension loaded - Background Script v1.0.3');

// Set up a global indicator that background script is running
const BACKGROUND_ACTIVE = true;

// Log that we're ready to receive messages
console.log('Background script ready to receive messages');

// Import API Service is automatically handled since we load api-service.js first in manifest.json
// Check if ApiService is available - otherwise provide fallback implementation
if (typeof ApiService === 'undefined') {
  console.error('ApiService not found! Using internal implementation.');
  // Fallback implementation
  const ApiService = {
    async improveText(text, apiKey, model, systemPrompt) {
      try {
        // Make API request
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://reply-better-ai.extension',
            'X-Title': 'Reply Better AI'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: "system", 
                content: systemPrompt
              },
              {
                role: "user",
                content: text
              }
            ]
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `Error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        console.error('API Service Error:', error);
        throw error;
      }
    },
    
    // Minimal implementation for the fallback
    async getLastCallTime() { return null; },
    async setLastCallTime() { return; }
  };
} else {
  console.log('ApiService found and ready to use');
}

// Listen for installation or update
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Reply Better AI extension installed');
    
    // Initialize default settings
    browser.storage.sync.get(['apiKey']).then((result) => {
      if (!result.apiKey) {
        browser.storage.sync.set({
          model: 'meta-llama/llama-3-8b-instruct',
          messageType: 'professional'
        });
      }
    }).catch(err => {
      console.error('Error initializing settings:', err);
    });
  } else if (details.reason === 'update') {
    console.log('Reply Better AI extension updated');
  }
});

// Get system prompt based on message type
function getSystemPrompt(messageType) {
  // Default prompts
  const defaultPrompts = {
    'professional': "You are a professional editor. Improve the given message to make it more professional, polished, and business-appropriate. Fix grammar errors and enhance the expression while maintaining the original intent. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'friendly': "You are a friendly editor. Make this message warm, personable, and engaging while keeping it natural. Fix any errors but maintain a conversational tone. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'customer': "You are a customer service expert. Transform this message into a helpful, empathetic response that addresses customer needs professionally while maintaining a positive tone. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'concise': "You are a concise editor. Make this message brief, clear, and to-the-point while maintaining professionalism and all key information. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly."
  };

  // Check if using a custom saved prompt
  if (messageType && messageType.startsWith('custom_prompt_')) {
    // We'll need to load saved prompts and find the right one
    return browser.storage.sync.get(['savedPrompts']).then(result => {
      if (result.savedPrompts) {
        const promptIndex = parseInt(messageType.replace('custom_prompt_', ''));
        if (!isNaN(promptIndex) && promptIndex >= 0 && promptIndex < result.savedPrompts.length) {
          return `${result.savedPrompts[promptIndex].text} IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.`;
        }
      }
      // Fall back to professional if custom prompt not found
      return defaultPrompts.professional;
    });
  }
  
  return Promise.resolve(defaultPrompts[messageType] || defaultPrompts.professional);
}

// Main message handler function
function messageHandler(message, sender, sendResponse) {
  // Log messages with helpful info
  console.log(`Background received: ${message.action} [${new Date().toISOString()}]`);
  
  // Handle ping request to check if background script is running
  if (message.action === 'ping') {
    console.log("Ping received, responding immediately");
    sendResponse({ 
      status: 'ok',
      version: '1.0.3',
      timestamp: Date.now()
    });
    return true;
  }
  
  // Handle improve text request from content script
  if (message.action === 'improveText') {
    console.log("Improve text request received");
    
    browser.storage.sync.get(['apiKey', 'model', 'messageType', 'savedPrompts'])
      .then(async settings => {
        try {
          if (!settings.apiKey) {
            console.log("API key not found in settings");
            sendResponse({ error: 'API key not set. Please set up the extension first.' });
            return;
          }
          
          // Use the messageType from the request if available, otherwise use the default from settings
          const messageTypeToUse = message.messageType || settings.messageType || 'professional';
          console.log(`Using message type: ${messageTypeToUse}`);
          
          // Get the system prompt
          const systemPrompt = await getSystemPrompt(messageTypeToUse);
          console.log("System prompt retrieved");
          
          // Call the API service
          console.log(`Calling API with model: ${settings.model || 'meta-llama/llama-3-8b-instruct'}`);
          const improvedText = await ApiService.improveText(
            message.text,
            settings.apiKey,
            settings.model || 'meta-llama/llama-3-8b-instruct',
            systemPrompt
          );
          
          console.log("API call successful");
          sendResponse({ improvedText });
        } catch (error) {
          console.error('Error improving text:', error);
          sendResponse({ error: error.message || 'Unknown error occurred' });
        }
      })
      .catch(error => {
        console.error('Error getting settings:', error);
        sendResponse({ error: 'Failed to load settings' });
      });
    
    return true; // Indicate we'll call sendResponse asynchronously
  }
  
  // If the message type is not recognized, still respond
  console.log(`Unknown message type: ${message.action}`);
  sendResponse({ error: "Unknown message type" });
  return true;
}

// Register the message handler
browser.runtime.onMessage.addListener(messageHandler);

console.log("Background script fully loaded and ready for messages");

/**
 * This background script is minimal as most functionality is handled
 * through the popup interface. If needed, you could add additional
 * functionality here like:
 * 
 * - Context menu integration
 * - Keyboard shortcut handling
 * - Badge updating
 * - Notifications
 * - Communication with other extensions or websites
 */ 