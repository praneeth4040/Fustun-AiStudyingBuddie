// API Configuration
const GEMINI_API_KEY = 'AIzaSyCejafFlpUKqc7QFgD_Ic3fh1kj14E-N7M'; // Replace with your actual Gemini API key
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Function to open a new tab
async function openNewTab(url) {
  return new Promise((resolve) => {
    // Prepend https:// if the URL doesn't have a protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
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
    if (response === undefined) {
      return { success: false, message: 'No response from content script.' };
    }
    return response;
  } catch (error) {
    console.error('Error inserting text:', error);
    return { success: false, message: error.message };
  }
}

// Store last summary for chatbot context
let lastExtractedSummary = '';

// Listen for messages from the chat interface
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateResponse') {
    handleUserMessage(request.message)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  } else if (request.action === 'summarizeContent') {
    (async () => {
      try {
        const prompt = `Summarize the following web page content in a few sentences for context:\n\n${request.content}`;
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        let summary = '';
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
          summary = data.candidates[0].content.parts[0].text;
        }
        lastExtractedSummary = summary;
        sendResponse({ text: summary });
      } catch (e) {
        sendResponse({ text: 'Error summarizing content.' });
      }
    })();
    return true;
  }
});

function getSystemInstruction() {
  return `You are an AI assistant with web automation capabilities. Your primary goal is to perform actions on the user's active browser tab based on their requests. You have the following tools:

- **openTab**: Use this tool ONLY IF the user explicitly says "open [website]" or if their request clearly indicates a desire to navigate to a NEW website. If the request implies further actions after opening the tab (e.g., "open youtube and search for lofi songs"), proceed immediately with those actions.

- **insertText**: Use this tool when the user asks you to "type", "enter", "search for", "ask a question on", "interact with", or "provide information to" something. If the user does not provide a specific selector (e.g., by saying "into the search bar" or "into #my-input"), you MUST assume they want to insert text into the first suitable input field found on the page. **ABSOLUTELY CRUCIALLY: If the user asks to "ask a question on" or "talk to" another AI (like ChatGPT) via a website, you MUST use this tool to type into that website's input field. YOU ARE NOT TO RESPOND CONVERSATIONALLY ABOUT INABILITY TO INTERACT WITH OTHER AIs DIRECTLY IN SUCH SCENARIOS.** Always assume this action is intended for an input field on the CURRENTLY ACTIVE tab unless the request explicitly involves opening a new website first.

- **summarizePage**: Use this tool when the user asks you to summarize the content of the current web page.

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
                    }
                  },
                  required: ['text']
                }
              },
              {
                name: 'summarizePage',
                description: 'Extracts and summarizes the main content of the current web page',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: []
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
          let targetTabId = tab.id; // Default to current active tab

          switch (functionCall.name) {
            case 'openTab':
              const tabResult = await openNewTab(functionCall.args.url);
              toolResultData = { url: functionCall.args.url }; 
              toolOutputContent = `Successfully opened ${functionCall.args.url}.`;
              if (tabResult.success && tabResult.tabId) {
                  targetTabId = tabResult.tabId; // Update targetTabId to the newly opened tab
              }
              break;
              
            case 'insertText':
              const insertResult = await insertText(targetTabId, functionCall.args.text);
              if (insertResult.success) {
                  toolResultData = { insertedText: functionCall.args.text }; 
                  toolOutputContent = `Inserted text "${functionCall.args.text}".`;
              } else {
                  toolResultData = { error: insertResult.message }; 
                  toolOutputContent = `Failed to insert text: ${insertResult.message}.`;
              }
              break;

            case 'summarizePage':
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: targetTabId },
                  files: ['content.js']
                });
                // Use a 1-minute timeout for extraction
                const extracted = await new Promise((resolve, reject) => {
                  let isResolved = false;
                  const timeout = setTimeout(() => {
                    if (!isResolved) {
                      isResolved = true;
                      reject(new Error('Content extraction timed out.'));
                    }
                  }, 60000); // 1 minute
                  chrome.tabs.sendMessage(targetTabId, { action: 'extractContent' }, (response) => {
                    if (!isResolved) {
                      isResolved = true;
                      clearTimeout(timeout);
                      resolve(response);
                    }
                  });
                });
                // Log the extracted data for debugging
                console.log('Extracted content:', extracted && extracted.content ? extracted.content.substring(0, 500) : extracted);
                if (!extracted || !extracted.content) {
                  toolResultData = { error: 'Failed to extract content.' };
                  toolOutputContent = 'Failed to extract content.';
                  break;
                }
                let pageContent = extracted.content;
                let summary = '';
                if (pageContent.length > 8000) {
                  // Chunked summarization
                  function splitIntoChunks(text, chunkSize = 4000) {
                    const chunks = [];
                    for (let i = 0; i < text.length; i += chunkSize) {
                      chunks.push(text.slice(i, i + chunkSize));
                    }
                    return chunks;
                  }
                  const chunks = splitIntoChunks(pageContent, 4000);
                  let chunkSummaries = [];
                  for (const chunk of chunks) {
                    const chunkPrompt = `Summarize this part of the web page in detail:\n${chunk}`;
                    const chunkResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: chunkPrompt }] }] })
                    });
                    const chunkData = await chunkResponse.json();
                    let chunkSummary = '';
                    if (chunkData.candidates && chunkData.candidates[0] && chunkData.candidates[0].content && chunkData.candidates[0].content.parts && chunkData.candidates[0].content.parts[0].text) {
                      chunkSummary = chunkData.candidates[0].content.parts[0].text;
                    }
                    chunkSummaries.push(chunkSummary);
                  }
                  // Final summary of all chunk summaries
                  const combinedPrompt = `Combine and summarize the following summaries into a detailed, structured summary (bulleted list if possible):\n${chunkSummaries.join('\n')}`;
                  const finalResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }] })
                  });
                  const finalData = await finalResponse.json();
                  if (finalData.candidates && finalData.candidates[0] && finalData.candidates[0].content && finalData.candidates[0].content.parts && finalData.candidates[0].content.parts[0].text) {
                    summary = finalData.candidates[0].content.parts[0].text;
                  }
                } else {
                  // Normal summarization
                  const prompt = `Analyze the following web page content and provide a detailed summary that includes:\n- The main topic and purpose of the page\n- Key sections or headings present\n- Any important data, tables, lists, or links mentioned\n- Who might find this page useful\n- Any unique features, calls to action, or interactive elements\n\nFormat your answer as a bulleted list if possible.\n\nWeb page content:\n${pageContent}`;
                  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                  });
                  const data = await response.json();
                  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
                    summary = data.candidates[0].content.parts[0].text;
                  }
                }
                lastExtractedSummary = summary;
                toolResultData = { summary };
                toolOutputContent = summary;
              } catch (e) {
                toolResultData = { error: 'Could not access this page or the content was too large.' };
                toolOutputContent = 'Could not access this page or the content was too large.';
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