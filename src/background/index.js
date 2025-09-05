import { GEMINI_API_KEY, GEMINI_API_URL } from '../services/config.js';

// Function to open a new tab
async function openNewTab(url) {
  return new Promise((resolve) => {
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
      reject(new Error('Content script not responding'));
    }, 5000);
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      clearTimeout(timeout);
      if (response && response.success === true && response.message === 'pong') {
        resolve(true);
      } else {
        reject(new Error('Unexpected response from content script'));
      }
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Function to insert text into an input field
async function insertText(tabId, text, selector = null) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/index.js'] });
    await pingContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { action: 'insertText', text, selector });
    if (response === undefined) {
      return { success: false, message: 'No response from content script.' };
    }
    return response;
  } catch (error) {
    return { success: false, message: error.message };
  }
}

let lastExtractedSummary = '';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateResponse') {
    handleUserMessage(request.message, request.history || [])
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  } else if (request.action === 'summarizeContent') {
    (async () => {
      try {
        const prompt = `Summarize the content concisely in 2-3 sentences. No preamble.\n\n${request.content}`;
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const summary = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || '';
        lastExtractedSummary = summary;
        sendResponse({ text: summary });
      } catch (e) {
        sendResponse({ text: 'Error summarizing content.' });
      }
    })();
    return true;
  } else if (request.action === 'openSidePanelWithSelection') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'showSelectionInPopup', text: request.text });
      }, 500);
    });
    return true;
  }
});

function getSystemInstruction() {
  return `You are an AI assistant with web automation capabilities. Your primary goal is to perform actions on the user's active browser tab based on their requests. You have the following tools:

- **openTab**: Use this tool ONLY IF the user explicitly says "open [website]" or if their request clearly indicates a desire to navigate to a NEW website. If the request implies further actions after opening the tab (e.g., "open youtube and search for lofi songs"), proceed immediately with those actions.

- **insertText**: Use this tool when the user asks you to "type", "enter", "search for", "ask a question on", "interact with", or "provide information to" something. If the user does not provide a specific selector (e.g., by saying "into the search bar" or "into #my-input"), you MUST assume they want to insert text into the first suitable input field found on the page. Always assume this action is intended for an input field on the CURRENTLY ACTIVE tab unless the request explicitly involves opening a new website first.

- **summarizePage**: Use this tool when the user asks you to summarize the content of the current web page.

For any other type of request, answer conversationally. Always aim to complete the user's request fully, even if it requires multiple tool calls.`;
}

async function handleUserMessage(message, recentHistory) {
  const conversationHistory = [];
  // System-style instruction (Gemini v1beta uses role labels; we embed as a user part for guidance)
  conversationHistory.push({ role: 'user', parts: [{ text: getSystemInstruction() }] });

  // Optional page-context summary to help grounding
  if (lastExtractedSummary && lastExtractedSummary.trim().length > 0) {
    conversationHistory.push({ role: 'user', parts: [{ text: `Context summary of current page (if relevant):\n${lastExtractedSummary}` }] });
  }

  // Map recent chat history into Gemini roles
  if (Array.isArray(recentHistory)) {
    for (const msg of recentHistory) {
      const text = typeof msg.text === 'string' ? msg.text : '';
      if (!text) continue;
      const role = msg.sender === 'Fustun' ? 'model' : 'user';
      conversationHistory.push({ role, parts: [{ text }] });
    }
  }

  // Append the new user message
  conversationHistory.push({ role: 'user', parts: [{ text: message }] });

  let responseText = '';
  let maxTurns = 5;
  let turn = 0;

  while (turn < maxTurns) {
    turn++;
    try {
      const requestBody = JSON.stringify({
        contents: conversationHistory,
        tools: [{
          functionDeclarations: [
            { name: 'openTab', description: 'Opens a new tab with the specified URL', parameters: { type: 'object', properties: { url: { type: 'string', description: 'The URL to open' } }, required: ['url'] } },
            { name: 'insertText', description: 'Inserts text into an input field on the current page', parameters: { type: 'object', properties: { text: { type: 'string', description: 'The text to insert' } }, required: ['text'] } },
            { name: 'summarizePage', description: 'Extracts and summarizes the main content of the current web page', parameters: { type: 'object', properties: {}, required: [] } }
          ]
        }]
      });

      const apiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });
      if (!apiResponse.ok) throw new Error(`Failed to get AI response: ${apiResponse.status} ${apiResponse.statusText}`);
      const data = await apiResponse.json();
      const candidate = data.candidates && data.candidates.length > 0 ? data.candidates[0] : null;
      if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const part = candidate.content.parts[0];
        if (part.functionCall) {
          const functionCall = part.functionCall;
          conversationHistory.push({ role: 'model', parts: [{ functionCall }] });
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          let toolResultData; let targetTabId = tab.id;
          switch (functionCall.name) {
            case 'openTab': {
              const tabResult = await openNewTab(functionCall.args.url);
              toolResultData = { url: functionCall.args.url };
              if (tabResult.success && tabResult.tabId) targetTabId = tabResult.tabId;
              break;
            }
            case 'insertText': {
              const insertResult = await insertText(targetTabId, functionCall.args.text);
              toolResultData = insertResult.success ? { insertedText: functionCall.args.text } : { error: insertResult.message };
              break;
            }
            case 'summarizePage': {
              try {
                await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: ['src/content/index.js'] });
                const extracted = await new Promise((resolve, reject) => {
                  let isResolved = false;
                  const timeout = setTimeout(() => { if (!isResolved) { isResolved = true; reject(new Error('Content extraction timed out.')); } }, 60000);
                  chrome.tabs.sendMessage(targetTabId, { action: 'extractContent' }, (response) => {
                    if (!isResolved) { isResolved = true; clearTimeout(timeout); resolve(response); }
                  });
                });
                if (!extracted || !extracted.content) { toolResultData = { error: 'Failed to extract content.' }; break; }
                let pageContent = extracted.content; let summary = '';
                if (pageContent.length > 8000) {
                  function splitIntoChunks(text, chunkSize = 4000) { const chunks = []; for (let i = 0; i < text.length; i += chunkSize) { chunks.push(text.slice(i, i + chunkSize)); } return chunks; }
                  const chunks = splitIntoChunks(pageContent, 4000); let chunkSummaries = [];
                  for (const chunk of chunks) {
                    const chunkPrompt = `Summarize this part concisely in 1-2 sentences. No preamble, no disclaimers. Focus on key points only.\n\nText:\n${chunk}`;
                    const chunkResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: chunkPrompt }] }] }) });
                    const chunkData = await chunkResponse.json();
                    let chunkSummary = '';
                    if (chunkData.candidates && chunkData.candidates[0] && chunkData.candidates[0].content && chunkData.candidates[0].content.parts && chunkData.candidates[0].content.parts[0].text) {
                      chunkSummary = chunkData.candidates[0].content.parts[0].text;
                    }
                    chunkSummaries.push(chunkSummary);
                  }
                  const combinedPrompt = `Combine the points below into a concise, structured bullet list (5-8 bullets). No preamble, no repetition, no conclusions. Use short, information-dense bullets.\n\n${chunkSummaries.join('\n')}`;
                  const finalResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }] }) });
                  const finalData = await finalResponse.json();
                  if (finalData.candidates && finalData.candidates[0] && finalData.candidates[0].content && finalData.candidates[0].content.parts && finalData.candidates[0].content.parts[0].text) { summary = finalData.candidates[0].content.parts[0].text; }
                } else {
                  const prompt = `Provide a concise, structured bullet list (5-8 bullets) summarizing the page. No preamble. Focus on: purpose, key sections, notable data or links, who it's for, and any CTAs/features. Keep bullets short and information-dense.\n\nContent:\n${pageContent}`;
                  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
                  const data = await response.json();
                  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) { summary = data.candidates[0].content.parts[0].text; }
                }
                lastExtractedSummary = summary; toolResultData = { summary };
              } catch (e) { toolResultData = { error: 'Could not access this page or the content was too large.' }; }
              break;
            }
            default:
              toolResultData = { error: `Unknown tool: ${functionCall.name}` };
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
      return { text: `An error occurred: ${error.message}`, success: false };
    }
  }
  return { text: responseText || 'I could not complete the request in the given turns.', success: false };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onUpdateAvailable.addListener(() => { chrome.runtime.reload(); });


