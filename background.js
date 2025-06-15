// API Configuration
const GEMINI_API_KEY = 'AIzaSyCejafFlpUKqc7QFgD_Ic3fh1kj14E-N7M'; // Replace with your actual Gemini API key
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Function to open a new tab
async function openNewTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, (tab) => {
      resolve({ success: true, tabId: tab.id });
    });
  });
}

// Listen for messages from the chat interface
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateResponse') {
    handleUserMessage(request.message)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Main function to handle user messages
async function handleUserMessage(message) {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an AI assistant whose SOLE PURPOSE when a user asks to "open" a website is to use the 'openTab' tool. 

IMPORTANT: Do NOT provide informational answers about websites or ask for clarification. Your ONLY action for website opening requests is to use the 'openTab' tool immediately with the most relevant and official URL.

Examples:
- "open youtube" or "open youtube.com" -> USE openTab with url: https://youtube.com
- "open google" -> USE openTab with url: https://google.com
- "open google gemini" or "open gemini" -> USE openTab with url: https://gemini.google.com
- "open amazon" -> USE openTab with url: https://amazon.com
- "open wikipedia" -> USE openTab with url: https://wikipedia.org

For any other type of request, answer conversationally. The user said: ${message}`
              }
            ]
          }
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'openTab',
                description: 'Opens a new tab with the specified URL',
                parameters: {
                  type: 'object',
                  properties: {
                    url: {
                      type: 'string',
                      description: 'The URL to open'
                    }
                  },
                  required: ['url']
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get AI response: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check if the response includes a tool call from Gemini
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0 && 
        data.candidates[0].content.parts[0].functionCall) {
      
      const functionCall = data.candidates[0].content.parts[0].functionCall;
      if (functionCall.name === 'openTab') {
        await openNewTab(functionCall.args.url);
        return { 
          text: `I've opened ${functionCall.args.url} for you. What would you like to do there?`,
          success: true 
        };
      }
    }

    // If no tool call, return the AI's text response from Gemini
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      return { text: data.candidates[0].content.parts[0].text.trim() };
    } else {
      throw new Error('Invalid Gemini API response format or no text response');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Handle extension lifecycle events
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  // Set the side panel to open when the toolbar icon is clicked
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension context suspended');
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log('Extension update available');
  chrome.runtime.reload();
});

// Handle connection errors
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      console.error('Connection error:', chrome.runtime.lastError);
    }
  });
}); 