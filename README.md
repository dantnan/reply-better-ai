# Reply Better AI - Firefox Extension

Reply Better AI is a Firefox extension that helps you improve your messages professionally using free AI models through OpenRouter.

## Features

- Improve messages with AI assistance using free LLM models
- Multiple improvement types: Professional, Friendly, Customer Service, Concise
- Create custom prompts for personalized text improvements
- Text snippets feature for quick text expansion (like TextBlaze)
- Inline improvement button that appears only when actively typing
- Save and reuse your frequently used prompts
- Uses free AI models only - no subscription needed
- Clean, intuitive interface
- Copy improved messages with one click

## Installation Instructions

### From Firefox Add-ons Store
1. Visit the Firefox Add-ons store page for Reply Better AI
2. Click "Add to Firefox"
3. Follow the installation prompts

### Development Mode

1. Clone or download this repository
2. Open Firefox and go to `about:debugging`
3. Click on "This Firefox" tab
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file in the extension directory

### Icons

The extension uses a single icon:
- 512x512 pixels: `icons/icon.png`

Icons are custom created for Reply Better AI.

## Getting an OpenRouter API Key

1. Visit [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create a free account
3. Generate an API key
4. Copy the API key and paste it in the extension settings

## Usage

### Main Popup
1. Click on the Reply Better AI icon in your Firefox toolbar
2. Enter your message in the text area
3. Select a message type
4. Click "Improve Message"
5. The improved message will appear in the output area
6. Click "Copy to Clipboard" to copy the improved message

### Inline Text Improvement
1. Click on any text field on a webpage
2. When actively typing, an improvement button (✍️) will appear
3. Click the button to improve your text using your default settings
4. The text will be automatically replaced with the improved version

### Text Snippets
1. Go to Settings and create snippets with triggers (e.g., "/wel")
2. When typing in any text field, enter your trigger
3. The trigger will automatically expand to your defined content

### Custom Prompts
1. Create personalized improvement instructions in the Settings
2. Give your prompt a name
3. Your custom prompts become available in the dropdown menus

## Supported Free Models

The extension uses these free models from OpenRouter:
- Llama 3 8B
- Mistral 7B
- Phi-3 Mini
- Gemma 7B
- Nous Hermes 2

## Privacy

- Your API key is stored locally in your browser
- Messages are sent directly to OpenRouter API and are not stored by the extension
- No data is collected or shared with third parties
- Text snippets and custom prompts are stored locally in your browser

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues, please create an issue in the repository.

## Sponsor

If you enjoy using Reply Better AI and want to support the development, you can buy me a coffee!

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=antnan&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/antnan)

## Attributions

### Icons
- <a href="https://www.flaticon.com/free-icons/robot" title="robot icons">Extension icon created by Flaticon</a>
