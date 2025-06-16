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

// Function to ping content script and wait for a response
async function pingContentScript(tabId) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Content script not responding"));
    }, 5000); // 5-second timeout

    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      clearTimeout(timeout);
      if (response && response.success === true && response.message === 'pong') {
        resolve(true);
      } else {
        reject(new Error("Unexpected response from content script"));
      }
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  }); 
}

// Function to insert text into an input field
async function insertText(tabId, text, selector = null) {
  console.log('Insert Text - Text:', text, 'Selector:', selector);
  try {
    // Ensure the content script is injected and ready
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    await pingContentScript(tabId); // Wait for the content script to be ready
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'insertText',
      text: text,
      selector: selector
    });
    return response;
  } catch (error) {
    console.error('Error inserting text:', error);
    return { success: false, message: error.message };
  }
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

function getSystemInstruction() {
  return `You are an AI assistant with web automation capabilities. Your primary goal is to perform actions on the user's active browser tab based on their requests. You have the following tools:

- **openTab**: Use this tool ONLY IF the user explicitly says "open [website]" or if their request clearly indicates a desire to navigate to a NEW website. If the request implies further actions after opening the tab (e.g., "open youtube and search for lofi songs"), proceed immediately with those actions.

- **insertText**: Use this tool when the user asks you to "type", "enter", "search for", "ask a question on", "interact with", or "provide information to" something. **ABSOLUTELY CRUCIALLY: If the user asks to "ask a question on" or "talk to" another AI (like ChatGPT) via a website, you MUST use this tool to type into that website's input field. YOU ARE NOT TO RESPOND CONVERSATIONALLY ABOUT INABILITY TO INTERACT WITH OTHER AIs DIRECTLY IN SUCH SCENARIOS.** Always assume this action is intended for an input field on the CURRENTLY ACTIVE tab unless the request explicitly involves opening a new website first.

For any other type of request, answer conversationally. Always aim to complete the user's request fully, even if it requires multiple tool calls. If a single user request implies multiple tool calls (e.g., opening a website and then extracting information, or searching and then extracting), proceed with all necessary steps sequentially without waiting for further user input until the entire request is fulfilled.`;
}

// Main function to handle user messages
async function handleUserMessage(message) {
  const conversationHistory = [
    {
      role: 'user',
      parts: [
        { text: getSystemInstruction() }
      ]
    },
    { role: 'user', parts: [{ text: message }] }
  ];

  let responseText = '';
  let maxTurns = 5; // To prevent infinite loops
  let turn = 0;

  while (turn < maxTurns) {
    turn++;
    try {
      const requestBody = JSON.stringify({
        contents: conversationHistory,
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
              },
              {
                name: 'insertText',
                description: 'Inserts text into an input field on the current page',
                parameters: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'The text to insert'
                    },
                    selector: {
                      type: 'string',
                      description: 'Optional CSS selector for the input field'
                    }
                  },
                  required: ['text']
                }
              }
            ]
          }
        ]
      });

      console.log('Request Body sent to Gemini API:', requestBody);

      const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody
      });

      if (!apiResponse.ok) {
        throw new Error(`Failed to get AI response: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const data = await apiResponse.json();
      const candidate = data.candidates && data.candidates.length > 0 ? data.candidates[0] : null;

      if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const part = candidate.content.parts[0];

        if (part.functionCall) {
          const functionCall = part.functionCall;
          conversationHistory.push({ role: 'model', parts: [{ functionCall: functionCall }] });

          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          let toolResultData;
          let toolOutputContent;

          switch (functionCall.name) {
            case 'openTab':
              const tabResult = await openNewTab(functionCall.args.url);
              toolResultData = { url: functionCall.args.url }; 
              toolOutputContent = `Successfully opened ${functionCall.args.url}.`;
              break;
              
            case 'insertText':
              const insertResult = await insertText(tab.id, functionCall.args.text, functionCall.args.selector);
              if (insertResult.success) {
                  toolResultData = { insertedText: functionCall.args.text }; 
                  toolOutputContent = `Inserted text "${functionCall.args.text}".`;
              } else {
                  toolResultData = { error: insertResult.message }; 
                  toolOutputContent = `Failed to insert text: ${insertResult.message}.`;
              }
              break;

            default:
              toolResultData = { error: `Unknown tool: ${functionCall.name}` };
              toolOutputContent = `Unknown tool: ${functionCall.name}.`;
              break;
          }
          conversationHistory.push({ role: 'user', parts: [{ functionResponse: { name: functionCall.name, response: { result: toolResultData } } }] });

        } else if (part.text) {
          responseText = part.text.trim();
          conversationHistory.push({ role: 'model', parts: [{ text: responseText }] });
          return { text: responseText, success: true };
        } else {
          throw new Error('Invalid Gemini API response: no functionCall or text.');
        }
      } else {
        throw new Error('Invalid Gemini API response: no candidates or content.');
      }
    } catch (error) {
      console.error('Error in handleUserMessage loop:', error);
      return { text: `An error occurred: ${error.message}`, success: false };
    }
  }
  return { text: responseText || 'I could not complete the request in the given turns.', success: false };
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