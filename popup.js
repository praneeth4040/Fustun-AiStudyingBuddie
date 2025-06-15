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

// Send message on button click
sendButton.addEventListener('click', async () => {
  const message = textInput.value.trim();
  if (!message) return;

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
    chatState.messages.push({ sender: 'AI', text: response.text });
    updateResponseArea();
    // Save updated chat state
    chrome.storage.local.set({ chatState: chatState });
  } catch (error) {
    chatState.messages.push({ sender: 'Error', text: error.message });
    updateResponseArea();
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = '>';
  }
});

function updateResponseArea() {
  responseArea.innerHTML = '';
  chatState.messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message-div', msg.sender === 'You' ? 'you' : 'ai');
    messageDiv.innerHTML = `<strong>${msg.sender}:</strong> ${msg.text}`;
    responseArea.appendChild(messageDiv);
  });
  responseArea.scrollTop = responseArea.scrollHeight; // Scroll to bottom
} 