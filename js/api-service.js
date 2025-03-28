/**
 * Reply Better AI - API Service
 * 
 * This module provides functions for interacting with the OpenRouter API.
 */

// Create a global API service namespace compatible with Firefox
const ApiService = {
  /**
   * Improves a text message using the OpenRouter API
   * 
   * @param {string} text - The input text to improve
   * @param {string} apiKey - The OpenRouter API key
   * @param {string} model - The model to use
   * @param {string} systemPrompt - The system prompt to use
   * @returns {Promise<string>} - The improved text
   */
  async improveText(text, apiKey, model, systemPrompt) {
    try {
      // Rate limiting check (to prevent excessive API calls)
      const lastCallTime = await this.getLastCallTime();
      const now = Date.now();
      
      if (lastCallTime && (now - lastCallTime < 1000)) {
        throw new Error('Please wait a moment before making another request.');
      }
      
      // Update last call time
      await this.setLastCallTime(now);
      
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
  
  /**
   * Gets the timestamp of the last API call
   * 
   * @returns {Promise<number|null>} - Timestamp of the last call or null
   */
  async getLastCallTime() {
    try {
      const result = await browser.storage.local.get(['lastCallTime']);
      return result.lastCallTime || null;
    } catch (error) {
      console.error('Error getting last call time:', error);
      return null;
    }
  },
  
  /**
   * Sets the timestamp of the last API call
   * 
   * @param {number} timestamp - The timestamp to set
   * @returns {Promise<void>}
   */
  async setLastCallTime(timestamp) {
    try {
      await browser.storage.local.set({ lastCallTime: timestamp });
    } catch (error) {
      console.error('Error setting last call time:', error);
    }
  },
  
  /**
   * Validates an OpenRouter API key by making a test request
   * 
   * @param {string} apiKey - The API key to validate
   * @returns {Promise<boolean>} - Whether the key is valid
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Error validating API key:', error);
      return false;
    }
  }
};

// Let's confirm that the background script has been started in Firefox
console.log('API Service loaded successfully');

// Export the service for use in other modules (this line can be removed)
// window.ApiService = ApiService; // Code that can cause issues in Firefox 