// Load chat state from storage
let chatState = { messages: [] };

chrome.storage.local.get(['chatState'], function(result) {
  if (result.chatState) {
    chatState = result.chatState;
    updateResponseArea(); // Update UI with loaded history
  }
});

// Get references to UI elements
const responseArea = document.getElementById('response-area');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const closeButton = document.getElementById('close-button');
const refreshButton = document.getElementById('refresh-button');
const statusBar = document.getElementById('status-bar');

// Handle close button click
closeButton.addEventListener('click', () => {
  window.close(); // Closes the extension popup
});

// Handle refresh button click
refreshButton.addEventListener('click', () => {
  chatState.messages = []; // Clear current chat messages
  chrome.storage.local.remove(['chatState'], () => {
    console.log('Chat history cleared from storage.');
    updateResponseArea(); // Update UI to show empty chat
  });
});

let stopped = false;
let loadingInterval = null;
const loadingWords = ['Generating...', 'Preparing...', 'Analysing...'];
let loadingIndex = 0;
let loaderRunning = false;

function showStatusBar(message, showStop = false) {
  statusBar.innerHTML = `<span id="status-message" class="loader-text">${message}</span> ${showStop ? '<button id="stop-btn" class="stop-btn">Stop</button>' : ''}`;
  statusBar.style.display = 'flex';
  statusBar.classList.add('visible');
  if (showStop) {
    document.getElementById('stop-btn').onclick = handleStop;
  }
}

function startLoadingAnimation() {
  if (loaderRunning) return;
  loaderRunning = true;
  loadingIndex = 0;
  showStatusBar(loadingWords[loadingIndex], true);
  loadingInterval = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % loadingWords.length;
    showStatusBar(loadingWords[loadingIndex], true);
  }, 900);
}

function stopLoadingAnimation(finalMessage, showStop = false) {
  if (loadingInterval) clearInterval(loadingInterval);
  showStatusBar(finalMessage, showStop);
}

function handleStop() {
  stopped = true;
  stopLoadingAnimation('Process stopped.', false);
}

function hideStatusBar() {
  loaderRunning = false;
  console.log('Hiding status bar');
  statusBar.classList.remove('visible');
  setTimeout(() => { statusBar.style.display = 'none'; }, 300);
  if (loadingInterval) clearInterval(loadingInterval);
}

// Send message on button click
sendButton.addEventListener('click', async () => {
  stopped = false;
  startLoadingAnimation(); // Always show loader for AI requests
  const message = textInput.value.trim();
  if (!message) {
    hideStatusBar(); // Hide loader if no message
    return;
  }

  // Add user message to chat state
  chatState.messages.push({ sender: 'You', text: message });
  updateResponseArea();
  textInput.value = '';

  // Temporarily disable send button and show a loading indicator
  sendButton.disabled = true;
  sendButton.textContent = '...';

  // Send message to background script
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateResponse',
      message: message
    });
    chatState.messages.push({ sender: 'Fustun', text: response.text });
    updateResponseArea();
    // Save updated chat state
    chrome.storage.local.set({ chatState: chatState });
    hideStatusBar(); // Always hide loader after AI response
  } catch (error) {
    chatState.messages.push({ sender: 'Error', text: error.message });
    updateResponseArea();
    hideStatusBar(); // Always hide loader after error
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = '>';
  }
});

function updateResponseArea() {
  responseArea.innerHTML = '';
  chatState.messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    if (msg.type === 'selection') {
      messageDiv.classList.add('message-div', 'selection-block');
      messageDiv.innerHTML = `<strong>Selected Text:</strong><br><blockquote>${msg.text}</blockquote>`;
    } else {
      messageDiv.classList.add('message-div', msg.sender === 'You' ? 'you' : 'ai');
      messageDiv.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text}`;
    }
    responseArea.appendChild(messageDiv);
  });
  responseArea.scrollTop = responseArea.scrollHeight;
}

// Listen for selected text from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showSelectionInPopup' && request.text) {
    addSelectionBlock(request.text);
    summarizeSelection(request.text);
  }
});

function addSelectionBlock(text) {
  chatState.messages.push({ sender: 'Selection', text, type: 'selection' });
  updateResponseArea();
}

async function summarizeSelection(text) {
  stopped = false;
  startLoadingAnimation(); // Always show loader for AI requests
  const prompt = `Summarize the text concisely in 1-2 sentences. No preamble, no disclaimers, no repetition. Focus on the core idea only.\n\nText:\n${text}`;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'generateResponse', message: prompt });
    if (response && response.text) {
      chatState.messages.push({ sender: 'Fustun', text: response.text });
      updateResponseArea();
      // Save updated chat state
      chrome.storage.local.set({ chatState: chatState });
    } else {
      chatState.messages.push({ sender: 'Error', text: 'Failed to generate summary.' });
      updateResponseArea();
    }
  } catch (error) {
    chatState.messages.push({ sender: 'Error', text: error.message || 'Failed to generate summary.' });
    updateResponseArea();
  } finally {
    hideStatusBar(); // Always hide the loader after AI response
  }
}


