// Load chat state from storage
import { supabase, saveChatMessage, getChatHistory, clearChatHistory } from '../database/supabase-bundled.js';
let chatState = { messages: [] };
let isGoogleLoginActive = false;
let isGoogleSignedIn = false;
let userId = null; // Store user ID for Supabase operations

chrome.storage.local.get(['chatState', 'isGoogleLoginActive', 'isGoogleSignedIn', 'userId'], function(result) {
  if (result.chatState) {
    chatState = result.chatState;
    updateResponseArea();
  }
  if (result.isGoogleLoginActive !== undefined) {
    isGoogleLoginActive = result.isGoogleLoginActive;
  }
  if (result.isGoogleSignedIn !== undefined) {
    isGoogleSignedIn = result.isGoogleSignedIn;
  }
  if (result.userId) {
    userId = result.userId;
    console.log('User ID loaded:', userId);
  }
  updateViewState();
});

// Get references to UI elements
const responseArea = document.getElementById('response-area');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const closeButton = document.getElementById('close-button');
const refreshButton = document.getElementById('refresh-button');
const statusBar = document.getElementById('status-bar');
const suggestionsEl = document.getElementById('suggestions');
const googleToggleButton = document.getElementById('google-toggle-button');
const googleLoginSection = document.getElementById('google-login-section');
const chatbotView = document.getElementById('chatbot-view');
const googleSigninBtn = document.querySelector('.google-signin-btn');
const googleLogoutBtn = document.querySelector('.google-logout-btn');

// Handle close button click
closeButton.addEventListener('click', () => {
  window.close(); // Closes the extension popup
});

// Handle refresh button click
refreshButton.addEventListener('click', async () => {
  chatState.messages = []; // Clear current chat messages
  chrome.storage.local.remove(['chatState'], () => {
    console.log('Chat history cleared from local storage.');
    updateResponseArea(); // Update UI to show empty chat
  });
  
  // Clear Supabase history if user is logged in
  if (userId && isGoogleSignedIn) {
    const result = await clearChatHistory(userId);
    if (result.success) {
      console.log('Chat history cleared from Supabase');
    } else {
      console.error('Failed to clear Supabase history:', result.error);
    }
  }
});

// Handle Google toggle button click
googleToggleButton.addEventListener('click', () => {
  isGoogleLoginActive = !isGoogleLoginActive;
  chrome.storage.local.set({ isGoogleLoginActive });
  updateViewState();
});

// Handle Google sign-in button click
googleSigninBtn.addEventListener('click', async () => {
  console.log("Initiating Google sign-in...");

  // Use Chrome's identity API for OAuth flow
  const clientId = '814625779566-rotjontt0j2sbaa9u956qv3orknopsip.apps.googleusercontent.com';
  const redirectUrl = chrome.identity.getRedirectURL();
  console.log("Redirect URL:", redirectUrl);
  
  // Build OAuth URL with correct scopes
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&scope=openid%20email%20profile&redirect_uri=${encodeURIComponent(redirectUrl)}`;

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    async (redirectedUrl) => {
      if (chrome.runtime.lastError) {
        console.error("Google sign-in failed:", chrome.runtime.lastError.message);
        alert(`Google login failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!redirectedUrl) {
        console.error("No redirect URL received!");
        alert("Authentication cancelled or no redirect URL received");
        return;
      }

      console.log("Redirected URL:", redirectedUrl);

      // Extract token from redirect URL hash
      let token = null;
      try {
        const urlObj = new URL(redirectedUrl);
        const hash = urlObj.hash.substring(1);
        const params = new URLSearchParams(hash);
        token = params.get('access_token');
      } catch (e) {
        console.error("Error parsing redirect URL:", e);
      }

      if (!token) {
        console.error("No access token in redirect!");
        alert("Failed to extract access token from OAuth response");
        return;
      }

      console.log("Google OAuth Token received successfully");

      isGoogleSignedIn = true;
      chrome.storage.local.set({ isGoogleSignedIn, googleToken: token });
      updateViewState();

      try {
        // Fetch Google profile
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) {
          throw new Error(`Google API error: ${res.status}`);
        }
        
        const profile = await res.json();
        console.log("Google profile:", profile);

        // Save user to Supabase
        const { data: userData, error: userError } = await supabase
          .from('fustonusers')
          .upsert({
            google_id: profile.id,
            email: profile.email,
            name: profile.name,
            avatar_url: profile.picture
          }, { onConflict: ['google_id'] })
          .select();

        if (userError) {
          console.error('Supabase user save error:', userError.message);
          alert('Failed to save user data');
        } else if (userData && userData.length > 0) {
          console.log('User saved in Supabase:', userData);
          const userId = userData[0].id;
          chrome.storage.local.set({ userId });
        } else {
          console.log('User data is empty, but no error:', userData);
          chrome.storage.local.set({ email: profile.email });
        }
      } catch (err) {
        console.error("Error during Google profile fetch or Supabase integration:", err.message);
        alert(`Error: ${err.message}`);
      }
    }
  );

  console.log("launchWebAuthFlow initiated, waiting for callback...");
});



// Handle Google logout button click
googleLogoutBtn.addEventListener('click', () => {
  isGoogleSignedIn = false;
  chrome.storage.local.set({ isGoogleSignedIn });
  updateViewState();
});

// Function to update view state based on Google login
function updateViewState() {
  if (isGoogleLoginActive) {
    // Show Google login section, hide chatbot
    googleLoginSection.classList.add('active');
    chatbotView.classList.add('hidden');
    
    // Show correct button based on sign-in state
    if (isGoogleSignedIn) {
      googleSigninBtn.classList.remove('active');
      googleLogoutBtn.classList.add('active');
    } else {
      googleSigninBtn.classList.add('active');
      googleLogoutBtn.classList.remove('active');
    }
  } else {
    // Show chatbot, hide Google login
    googleLoginSection.classList.remove('active');
    chatbotView.classList.remove('hidden');
  }
}

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

  // Send message to background script (with conversation history)
  try {
    // Prepare a lightweight recent history (exclude selection blocks)
    const historyLimit = 12;
    const filtered = chatState.messages.filter(m => m.type !== 'selection');
    const recentHistory = filtered.slice(-historyLimit);
    const response = await chrome.runtime.sendMessage({
      action: 'generateResponse',
      message: message,
      history: recentHistory,
      userId: userId // Pass userId for Supabase context retrieval
    });
    chatState.messages.push({ sender: 'Fustun', text: response.text });
    updateResponseArea();
    // Save updated chat state
    chrome.storage.local.set({ chatState: chatState });
    
    // Save message to Supabase if user is logged in
    if (userId && isGoogleSignedIn) {
      await saveChatMessage(userId, message, response.text, recentHistory);
    } else {
      console.log('Not saving to Supabase - user not logged in');
    }
    
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
  // Show suggestions if no chat messages (excluding selection blocks)
  const nonSelection = chatState.messages.filter(m => m.type !== 'selection');
  if (nonSelection.length === 0) {
    const wrapper = document.createElement('div');
    wrapper.id = 'suggestions';
    const header = document.createElement('div');
    header.style.color = '#5a4b3a';
    header.style.margin = '4px 0';
    header.style.fontWeight = '600';
    header.textContent = 'Try one of these:';
    wrapper.appendChild(header);
    const chips = [
      'Give me a 5-bullet summary',
      "Explain it like I'm five",
      'Create study notes with headings',
      'Outline steps I should take next'
    ];
    chips.forEach(text => {
      const chip = document.createElement('span');
      chip.className = 'suggestion-chip';
      chip.textContent = text;
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      const trigger = () => { textInput.value = text; sendButton.click(); };
      chip.onclick = trigger;
      chip.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } };
      wrapper.appendChild(chip);
    });
    responseArea.appendChild(wrapper);
  }
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

// Enter to send, Shift+Enter newline
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      return; // allow newline
    }
    e.preventDefault();
    sendButton.click();
  }
});

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
