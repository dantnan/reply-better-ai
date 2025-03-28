// Elements
const firstTimeSetup = document.getElementById('first-time-setup');
const mainInterface = document.getElementById('main-interface');
const settingsPanel = document.getElementById('settings-panel');
const showSettingsBtn = document.getElementById('show-settings');
const saveSettingsBtn = document.getElementById('save-settings');
const firstTimeSaveBtn = document.getElementById('first-time-save');
const apiKeyInput = document.getElementById('api-key');
const firstTimeApiKeyInput = document.getElementById('first-time-api-key');
const modelSelect = document.getElementById('model-select');
const messageTypeSelect = document.getElementById('message-type-select');
const customPromptInput = document.getElementById('custom-prompt');
const newPromptNameInput = document.getElementById('new-prompt-name');
const saveCustomPromptBtn = document.getElementById('save-custom-prompt');
const promptsListContainer = document.querySelector('.prompts-list-container');
const closePopupBtn = document.getElementById('close-popup');
const inputText = document.getElementById('input-text');
const outputText = document.getElementById('output-text');
const improveTextBtn = document.getElementById('improve-text');
const copyToClipboardBtn = document.getElementById('copy-to-clipboard');
const charCount = document.getElementById('char-count');
// Inline improvement settings
const enableInlineButton = document.getElementById('enable-inline-button');
const inlineMessageType = document.getElementById('inline-message-type');
const showTypeIndicator = document.getElementById('show-type-indicator');
// Snippet elements
const newSnippetTrigger = document.getElementById('new-snippet-trigger');
const newSnippetContent = document.getElementById('new-snippet-content');
const saveSnippetBtn = document.getElementById('save-snippet');
const snippetsListContainer = document.querySelector('.snippets-list-container');

// Saved prompts array
let savedPrompts = [];
// Saved snippets array
let snippets = [];

// Constants for identifiers
const CUSTOM_PROMPT_PREFIX = 'custom_prompt_';

// First-time setup detection
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const settings = await browser.storage.sync.get([
      'apiKey', 'model', 'messageType', 'customPrompt', 'savedPrompts',
      'enableInlineButton', 'inlineMessageType', 'showTypeIndicator', 'snippets'
    ]);
    
    // Load saved prompts
    if (settings.savedPrompts) {
      savedPrompts = settings.savedPrompts;
      renderSavedPrompts();
      addCustomPromptsToDropdown(messageTypeSelect);
      // Also add custom prompts to inline message type dropdown
      addCustomPromptsToDropdown(inlineMessageType);
    }
    
    // Load saved snippets
    if (settings.snippets) {
      snippets = settings.snippets;
      renderSavedSnippets();
    }
    
    // Check if this is the first time (no API key)
    if (!settings.apiKey) {
      firstTimeSetup.classList.remove('hidden');
      mainInterface.classList.add('hidden');
    } else {
      firstTimeSetup.classList.add('hidden');
      mainInterface.classList.remove('hidden');
      
      // Load saved settings
      apiKeyInput.value = settings.apiKey;
      
      if (settings.model) {
        modelSelect.value = settings.model;
      }
      
      if (settings.messageType) {
        messageTypeSelect.value = settings.messageType;
      }
      
      // Load custom prompt if available
      if (settings.customPrompt) {
        customPromptInput.value = settings.customPrompt;
      }
      
      // Load inline improvement settings
      if (settings.enableInlineButton !== undefined) {
        enableInlineButton.checked = settings.enableInlineButton;
      }
      
      if (settings.inlineMessageType) {
        inlineMessageType.value = settings.inlineMessageType;
      }
      
      if (settings.showTypeIndicator !== undefined) {
        showTypeIndicator.checked = settings.showTypeIndicator;
      }
    }
    
    // Inform content scripts about current settings
    updateContentScriptSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
});

// Close popup button
closePopupBtn.addEventListener('click', () => {
  window.close();
});

// Function to update content scripts with current settings
function updateContentScriptSettings() {
  browser.storage.sync.get([
    'enableInlineButton', 'inlineMessageType', 'showTypeIndicator', 'savedPrompts', 'snippets'
  ]).then(settings => {
    // Create a settings object to send to all active tabs
    const contentSettings = {
      enableInlineButton: settings.enableInlineButton !== undefined ? settings.enableInlineButton : true,
      inlineMessageType: settings.inlineMessageType || 'professional',
      showTypeIndicator: settings.showTypeIndicator !== undefined ? settings.showTypeIndicator : true,
      savedPrompts: settings.savedPrompts || [],
      snippets: settings.snippets || []
    };
    
    // Send settings to all active tabs
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          settings: contentSettings
        }).catch(err => {
          // Content script might not be loaded on this tab yet, which is fine
          console.log(`Could not update settings for tab ${tab.id}:`, err);
        });
      });
    });
  });
}

// Render saved prompts in the settings panel
function renderSavedPrompts() {
  promptsListContainer.innerHTML = '';
  
  if (savedPrompts.length === 0) {
    promptsListContainer.innerHTML = '<div class="no-prompts">No saved prompts yet</div>';
    return;
  }
  
  savedPrompts.forEach((prompt, index) => {
    const promptItem = document.createElement('div');
    promptItem.className = 'prompt-item';
    
    const promptName = document.createElement('div');
    promptName.className = 'prompt-item-name';
    promptName.textContent = prompt.name;
    
    const promptActions = document.createElement('div');
    promptActions.className = 'prompt-item-actions';
    
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', () => editPrompt(index));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => deletePrompt(index));
    
    promptActions.appendChild(editBtn);
    promptActions.appendChild(deleteBtn);
    
    promptItem.appendChild(promptName);
    promptItem.appendChild(promptActions);
    
    promptsListContainer.appendChild(promptItem);
  });
}

// Add custom prompts to a dropdown
function addCustomPromptsToDropdown(dropdownElement) {
  if (!dropdownElement) return;
  
  // Remove existing custom prompts from dropdown
  for (let i = dropdownElement.options.length - 1; i >= 0; i--) {
    if (dropdownElement.options[i].value.startsWith(CUSTOM_PROMPT_PREFIX)) {
      dropdownElement.remove(i);
    }
  }
  
  // Add separator if there are custom prompts
  if (savedPrompts.length > 0) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '──────────────';
    dropdownElement.appendChild(separator);
    
    // Add custom prompts
    savedPrompts.forEach((prompt, index) => {
      const option = document.createElement('option');
      option.value = `${CUSTOM_PROMPT_PREFIX}${index}`;
      option.textContent = prompt.name;
      dropdownElement.appendChild(option);
    });
  }
}

// Save custom prompt button
saveCustomPromptBtn.addEventListener('click', async () => {
  const promptText = customPromptInput.value.trim();
  const promptName = newPromptNameInput.value.trim();
  
  if (!promptText) {
    alert('Please enter prompt instructions before saving.');
    return;
  }
  
  if (!promptName) {
    alert('Please enter a name for your prompt.');
    return;
  }
  
  // Add to saved prompts
  savedPrompts.push({
    name: promptName,
    text: promptText
  });
  
  // Save to storage
  await browser.storage.sync.set({ savedPrompts });
  
  // Update UI
  renderSavedPrompts();
  addCustomPromptsToDropdown(messageTypeSelect);
  addCustomPromptsToDropdown(inlineMessageType);
  
  // Clear inputs
  newPromptNameInput.value = '';
  customPromptInput.value = '';
  
  alert('Prompt saved successfully!');
});

// Edit prompt function
async function editPrompt(index) {
  if (index < 0 || index >= savedPrompts.length) return;
  
  const prompt = savedPrompts[index];
  
  // Show current values
  customPromptInput.value = prompt.text;
  newPromptNameInput.value = prompt.name;
  
  // Show settings panel and hide other content
  settingsPanel.classList.remove('hidden');
  document.querySelector('.message-type').classList.add('hidden');
  document.querySelector('.editor').classList.add('hidden');
  document.querySelector('.footer').classList.add('hidden');
  document.querySelector('.settings-toggle').classList.add('hidden');
  
  // Create a temporary edit button or modify the save button behavior
  const originalButtonText = saveCustomPromptBtn.textContent;
  saveCustomPromptBtn.textContent = 'Update Prompt';
  
  // Create a one-time event handler for updating
  const updateHandler = async () => {
    const newText = customPromptInput.value.trim();
    const newName = newPromptNameInput.value.trim();
    
    if (!newText || !newName) {
      alert('Please enter both a name and instructions for your prompt.');
      return;
    }
    
    // Update prompt
    savedPrompts[index] = {
      name: newName,
      text: newText
    };
    
    // Save to storage
    await browser.storage.sync.set({ savedPrompts });
    
    // Update UI
    renderSavedPrompts();
    addCustomPromptsToDropdown(messageTypeSelect);
    addCustomPromptsToDropdown(inlineMessageType);
    
    // Reset button and inputs
    saveCustomPromptBtn.textContent = originalButtonText;
    newPromptNameInput.value = '';
    customPromptInput.value = '';
    
    // Remove this one-time handler
    saveCustomPromptBtn.removeEventListener('click', updateHandler);
    saveCustomPromptBtn.addEventListener('click', originalSaveHandler);
    
    // Show main content and hide settings
    settingsPanel.classList.add('hidden');
    document.querySelector('.message-type').classList.remove('hidden');
    document.querySelector('.editor').classList.remove('hidden');
    document.querySelector('.footer').classList.remove('hidden');
    document.querySelector('.settings-toggle').classList.remove('hidden');
    
    alert('Prompt updated successfully!');
  };
  
  // Store the original handler
  const originalSaveHandler = saveCustomPromptBtn.onclick;
  
  // Replace with update handler temporarily
  saveCustomPromptBtn.removeEventListener('click', originalSaveHandler);
  saveCustomPromptBtn.addEventListener('click', updateHandler);
}

// Delete prompt function
async function deletePrompt(index) {
  if (index < 0 || index >= savedPrompts.length) return;
  
  if (confirm(`Delete prompt "${savedPrompts[index].name}"?`)) {
    // Remove from array
    savedPrompts.splice(index, 1);
    
    // Save to storage
    await browser.storage.sync.set({ savedPrompts });
    
    // Update UI
    renderSavedPrompts();
    addCustomPromptsToDropdown(messageTypeSelect);
    addCustomPromptsToDropdown(inlineMessageType);
    
    // If the current selection is this prompt, reset to default
    const currentValue = messageTypeSelect.value;
    if (currentValue === `${CUSTOM_PROMPT_PREFIX}${index}`) {
      messageTypeSelect.value = 'professional';
    }
    
    // Check other custom prompt indices and update if needed
    for (let i = 0; i < messageTypeSelect.options.length; i++) {
      const option = messageTypeSelect.options[i];
      if (option.value.startsWith(CUSTOM_PROMPT_PREFIX)) {
        const promptIndex = parseInt(option.value.replace(CUSTOM_PROMPT_PREFIX, ''));
        if (promptIndex > index) {
          option.value = `${CUSTOM_PROMPT_PREFIX}${promptIndex - 1}`;
        }
      }
    }
  }
}

// First-time API key save
firstTimeSaveBtn.addEventListener('click', async () => {
  const apiKey = firstTimeApiKeyInput.value.trim();
  
  if (!apiKey) {
    alert('Please enter a valid API key.');
    return;
  }
  
  // Show loading state
  firstTimeSaveBtn.disabled = true;
  firstTimeSaveBtn.textContent = 'Validating...';
  
  try {
    // Validate the API key
    const isValid = await ApiService.validateApiKey(apiKey);
    
    if (!isValid) {
      throw new Error('Invalid API key. Please check and try again.');
    }
    
    await browser.storage.sync.set({
      apiKey: apiKey,
      model: modelSelect.value,
      messageType: 'professional'
    });
    
    firstTimeSetup.classList.add('hidden');
    mainInterface.classList.remove('hidden');
    apiKeyInput.value = apiKey;
  } catch (error) {
    console.error('Error saving API key:', error);
    alert(error.message || 'Error saving API key. Please try again.');
  } finally {
    firstTimeSaveBtn.disabled = false;
    firstTimeSaveBtn.textContent = 'Save API Key';
  }
});

// Settings toggle
showSettingsBtn.addEventListener('click', () => {
  // Show settings panel, hide main content sections
  settingsPanel.classList.remove('hidden');
  
  // Hide these elements when settings are shown
  document.querySelector('.message-type').classList.add('hidden');
  document.querySelector('.editor').classList.add('hidden');
  document.querySelector('.footer').classList.add('hidden');
  document.querySelector('.settings-toggle').classList.add('hidden');
});

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    alert('Please enter a valid API key.');
    return;
  }
  
  // Show loading state
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = 'Saving...';
  
  try {
    // Validate the API key
    const isValid = await ApiService.validateApiKey(apiKey);
    
    if (!isValid) {
      throw new Error('Invalid API key. Please check and try again.');
    }
    
    // Save all settings including inline improvement settings
    await browser.storage.sync.set({
      apiKey: apiKey,
      model: modelSelect.value,
      messageType: messageTypeSelect.value,
      customPrompt: customPromptInput.value,
      enableInlineButton: enableInlineButton.checked,
      inlineMessageType: inlineMessageType.value,
      showTypeIndicator: showTypeIndicator.checked,
      snippets: snippets
    });
    
    // Update content scripts with new settings
    updateContentScriptSettings();
    
    // Hide settings panel, show main content
    settingsPanel.classList.add('hidden');
    document.querySelector('.message-type').classList.remove('hidden');
    document.querySelector('.editor').classList.remove('hidden');
    document.querySelector('.footer').classList.remove('hidden');
    document.querySelector('.settings-toggle').classList.remove('hidden');
    
    alert('Settings saved successfully!');
  } catch (error) {
    console.error('Error saving settings:', error);
    alert(error.message || 'Error saving settings. Please try again.');
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = 'Save Settings';
  }
});

// Character counter
inputText.addEventListener('input', () => {
  updateCharCount();
});

function updateCharCount() {
  const count = inputText.value.length;
  charCount.textContent = `${count} characters`;
}

// Get system prompt based on message type
function getSystemPrompt(messageType) {
  // Check if using a custom saved prompt
  if (messageType.startsWith(CUSTOM_PROMPT_PREFIX)) {
    const promptIndex = parseInt(messageType.replace(CUSTOM_PROMPT_PREFIX, ''));
    if (!isNaN(promptIndex) && promptIndex >= 0 && promptIndex < savedPrompts.length) {
      return `${savedPrompts[promptIndex].text} IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.`;
    }
  }
  
  // Default prompts
  const prompts = {
    'professional': "You are a professional editor. Improve the given message to make it more professional, polished, and business-appropriate. Fix grammar errors and enhance the expression while maintaining the original intent. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'friendly': "You are a friendly editor. Make this message warm, personable, and engaging while keeping it natural. Fix any errors but maintain a conversational tone. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'customer': "You are a customer service expert. Transform this message into a helpful, empathetic response that addresses customer needs professionally while maintaining a positive tone. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly.",
    'concise': "You are a concise editor. Make this message brief, clear, and to-the-point while maintaining professionalism and all key information. IMPORTANT: Your response should ONLY contain the improved message without any explanations, introductions, or comments like 'Here's a rewritten version' or 'Here's the improved message'. Just output the improved message directly."
  };
  
  return prompts[messageType] || prompts['professional'];
}

// Improve text functionality
improveTextBtn.addEventListener('click', async () => {
  const text = inputText.value.trim();
  
  if (!text) {
    alert('Please enter a message to improve.');
    return;
  }
  
  try {
    // Get settings
    const settings = await browser.storage.sync.get(['apiKey', 'model']);
    
    if (!settings.apiKey) {
      alert('Please add your OpenRouter API key in settings.');
      settingsPanel.classList.remove('hidden');
      return;
    }
    
    // Show processing state
    improveTextBtn.disabled = true;
    improveTextBtn.textContent = 'Processing...';
    outputText.value = 'Improving your message...';
    
    // Get system prompt based on selected message type
    const messageType = messageTypeSelect.value;
    const systemPrompt = getSystemPrompt(messageType);
    
    // Use API service to improve text
    const improvedText = await ApiService.improveText(
      text,
      settings.apiKey,
      settings.model || modelSelect.value,
      systemPrompt
    );
    
    outputText.value = improvedText;
  } catch (error) {
    console.error('Error improving text:', error);
    outputText.value = `Error: ${error.message}\n\nIf this model is unavailable, please try another free model from the settings.`;
  } finally {
    improveTextBtn.disabled = false;
    improveTextBtn.textContent = 'Improve Message';
  }
});

// Copy to clipboard functionality
copyToClipboardBtn.addEventListener('click', () => {
  outputText.select();
  document.execCommand('copy');
  
  const originalText = copyToClipboardBtn.textContent;
  copyToClipboardBtn.textContent = 'Copied!';
  
  setTimeout(() => {
    copyToClipboardBtn.textContent = originalText;
  }, 1500);
});

// Initialize character counter
updateCharCount();

// Render saved snippets in the settings panel
function renderSavedSnippets() {
  if (!snippetsListContainer) return;
  
  snippetsListContainer.innerHTML = '';
  
  if (snippets.length === 0) {
    snippetsListContainer.innerHTML = '<div class="no-snippets">No saved snippets yet</div>';
    return;
  }
  
  snippets.forEach((snippet, index) => {
    const snippetItem = document.createElement('div');
    snippetItem.className = 'snippet-item';
    
    const snippetTrigger = document.createElement('div');
    snippetTrigger.className = 'snippet-item-trigger';
    snippetTrigger.textContent = snippet.trigger;
    
    const snippetContent = document.createElement('div');
    snippetContent.className = 'snippet-item-content';
    snippetContent.textContent = snippet.content;
    snippetContent.title = snippet.content; // Show full content on hover
    
    const snippetActions = document.createElement('div');
    snippetActions.className = 'snippet-item-actions';
    
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', () => editSnippet(index));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => deleteSnippet(index));
    
    snippetActions.appendChild(editBtn);
    snippetActions.appendChild(deleteBtn);
    
    snippetItem.appendChild(snippetTrigger);
    snippetItem.appendChild(snippetContent);
    snippetItem.appendChild(snippetActions);
    
    snippetsListContainer.appendChild(snippetItem);
  });
}

// Save snippet button
if (saveSnippetBtn) {
  saveSnippetBtn.addEventListener('click', async () => {
    const trigger = newSnippetTrigger.value.trim();
    const content = newSnippetContent.value.trim();
    
    if (!trigger) {
      alert('Please enter a trigger for your snippet.');
      return;
    }
    
    if (!content) {
      alert('Please enter content for your snippet.');
      return;
    }
    
    // Check if trigger already exists
    const existingIndex = snippets.findIndex(s => s.trigger === trigger);
    if (existingIndex >= 0) {
      if (!confirm(`A snippet with trigger "${trigger}" already exists. Do you want to replace it?`)) {
        return;
      }
      snippets[existingIndex].content = content;
    } else {
      // Add to saved snippets
      snippets.push({
        trigger: trigger,
        content: content
      });
    }
    
    // Save to storage
    await browser.storage.sync.set({ snippets });
    
    // Update UI
    renderSavedSnippets();
    updateContentScriptSettings();
    
    // Clear inputs
    newSnippetTrigger.value = '';
    newSnippetContent.value = '';
    
    alert('Snippet saved successfully!');
  });
}

// Edit snippet function
async function editSnippet(index) {
  if (index < 0 || index >= snippets.length) return;
  
  const snippet = snippets[index];
  
  // Show current values
  newSnippetTrigger.value = snippet.trigger;
  newSnippetContent.value = snippet.content;
  
  // Show settings panel and hide other content
  settingsPanel.classList.remove('hidden');
  document.querySelector('.message-type').classList.add('hidden');
  document.querySelector('.editor').classList.add('hidden');
  document.querySelector('.footer').classList.add('hidden');
  document.querySelector('.settings-toggle').classList.add('hidden');
  
  newSnippetTrigger.focus();
  
  // Scroll to snippet section
  document.querySelector('.snippet-management').scrollIntoView({ behavior: 'smooth' });
  
  // Create a temporary edit button or modify the save button behavior
  const originalButtonText = saveSnippetBtn.textContent;
  saveSnippetBtn.textContent = 'Update Snippet';
  
  // Create a one-time event handler for updating
  const updateHandler = async () => {
    const newTrigger = newSnippetTrigger.value.trim();
    const newContent = newSnippetContent.value.trim();
    
    if (!newTrigger || !newContent) {
      alert('Please enter both a trigger and content for your snippet.');
      return;
    }
    
    // Check if the new trigger already exists (and it's not the one we're editing)
    const existingIndex = snippets.findIndex(s => s.trigger === newTrigger);
    if (existingIndex >= 0 && existingIndex !== index) {
      if (!confirm(`A snippet with trigger "${newTrigger}" already exists. Do you want to replace it?`)) {
        return;
      }
      // Remove the conflicting snippet
      snippets.splice(existingIndex, 1);
      // Adjust index if needed
      if (existingIndex < index) index--;
    }
    
    // Update snippet
    snippets[index] = {
      trigger: newTrigger,
      content: newContent
    };
    
    // Save to storage
    await browser.storage.sync.set({ snippets });
    
    // Update UI
    renderSavedSnippets();
    updateContentScriptSettings();
    
    // Reset button and inputs
    saveSnippetBtn.textContent = originalButtonText;
    newSnippetTrigger.value = '';
    newSnippetContent.value = '';
    
    // Remove this one-time handler
    saveSnippetBtn.removeEventListener('click', updateHandler);
    saveSnippetBtn.addEventListener('click', originalSaveHandler);
    
    // Show main content and hide settings
    settingsPanel.classList.add('hidden');
    document.querySelector('.message-type').classList.remove('hidden');
    document.querySelector('.editor').classList.remove('hidden');
    document.querySelector('.footer').classList.remove('hidden');
    document.querySelector('.settings-toggle').classList.remove('hidden');
    
    alert('Snippet updated successfully!');
  };
  
  // Store the original handler
  const originalSaveHandler = saveSnippetBtn.onclick;
  
  // Replace with update handler temporarily
  saveSnippetBtn.removeEventListener('click', originalSaveHandler);
  saveSnippetBtn.addEventListener('click', updateHandler);
}

// Delete snippet function
async function deleteSnippet(index) {
  if (index < 0 || index >= snippets.length) return;
  
  if (confirm(`Delete snippet "${snippets[index].trigger}"?`)) {
    // Remove from array
    snippets.splice(index, 1);
    
    // Save to storage
    await browser.storage.sync.set({ snippets });
    
    // Update UI
    renderSavedSnippets();
    updateContentScriptSettings();
  }
} 