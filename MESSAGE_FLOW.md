# Message Flow Diagram - Fustun AI Assistant

## Complete Journey: User Message → AI Response → Action

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FUSTUN AI EXTENSION                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐
│   USER INPUT (UI)       │
│   src/ui/panel.js       │
│                         │
│ 1. User types message   │
│ 2. Clicks send button   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: SEND MESSAGE TO BACKGROUND                         │
│                                                             │
│  panel.js line ~200:                                        │
│  chrome.runtime.sendMessage({                              │
│    action: 'generateResponse',                             │
│    message: userInput,                                     │
│    history: chatState.messages  // Previous chat history  │
│  })                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             │ Message passes through Chrome's message system
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: BACKGROUND RECEIVES MESSAGE                        │
│                                                             │
│  src/background/index.js line ~49:                          │
│  chrome.runtime.onMessage.addListener((request) => {       │
│    if (request.action === 'generateResponse') {            │
│      handleUserMessage(request.message, request.history)  │
│    }                                                       │
│  })                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: PARSE MESSAGE & BUILD CONVERSATION HISTORY         │
│                                                              │
│  background/index.js line ~130:                             │
│  function handleUserMessage(message, recentHistory) {      │
│    - Create system instruction                             │
│    - Add AI tools (openTab, insertText, summarizePage)     │
│    - Combine with chat history                             │
│    - Build final conversation for Gemini                   │
│  }                                                         │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: SEND TO GEMINI AI API                               │
│                                                              │
│  services/geminiClient.js line ~10:                          │
│  callGemini(contents)  // Called from background            │
│                                                              │
│  Sends POST to:                                              │
│  https://generativelanguage.googleapis.com/                 │
│    v1beta/models/gemini-2.0-flash:generateContent          │
│                                                              │
│  Headers: {'Content-Type': 'application/json'}             │
│  Body: { contents: [...messages...] }                       │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
     ┌───────────────────┐
     │  GEMINI PROCESSES │
     │  - Understands    │
     │  - Decides action │
     │  - Generates text │
     └───────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: GEMINI RETURNS RESPONSE                             │
│                                                              │
│  Response includes:                                          │
│  - Text message                                              │
│  - Tool calls (if needed): openTab, insertText, etc.        │
│                                                              │
│  Example response:                                           │
│  {                                                          │
│    "candidates": [{                                         │
│      "content": {                                           │
│        "parts": [{                                          │
│          "text": "I'll search for this on Google..."        │
│        }],                                                  │
│        "functionCall": {  // If using a tool               │
│          "name": "openTab",                                 │
│          "args": { "url": "google.com" }                   │
│        }                                                   │
│      }                                                     │
│    }]                                                      │
│  }                                                         │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 6: HANDLE TOOL CALLS (IF ANY)                          │
│                                                              │
│  background/index.js line ~170:                             │
│  if (toolCall) {                                            │
│    switch(toolCall.name) {                                  │
│      case 'openTab': openNewTab(args.url);                 │
│      case 'insertText': insertText(tabId, text);           │
│      case 'summarizePage': summarizePageContent();         │
│    }                                                       │
│  }                                                         │
└────────────┬─────────────────────────────────────────────────┘
             │
             ├─ If openTab: Creates new browser tab
             │
             ├─ If insertText: 
             │   └─ Sends message to CONTENT SCRIPT
             │      src/content/index.js line ~3:
             │      chrome.tabs.sendMessage(tabId, {
             │        action: 'insertText',
             │        text: userText
             │      })
             │      └─ Content script types text in active field
             │      └─ Content script clicks search button
             │
             └─ If summarizePage: Extracts page content
                └─ Sends to Gemini for summary
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 7: SEND RESPONSE BACK TO UI                            │
│                                                              │
│  background/index.js line ~220:                             │
│  sendResponse({                                             │
│    success: true,                                           │
│    response: aiText,        // AI's text message            │
│    toolAction: toolResult   // Result of any tool call     │
│  })                                                        │
└────────────┬─────────────────────────────────────────────────┘
             │
             │ Message passes back through Chrome's system
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 8: UI RECEIVES RESPONSE                                │
│                                                              │
│  panel.js line ~205:                                        │
│  chrome.runtime.sendMessage(...).then((response) => {      │
│    // Handle response                                       │
│  })                                                        │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 9: UPDATE UI & SAVE CHAT HISTORY                       │
│                                                              │
│  panel.js:                                                  │
│  1. Add user message to chatState.messages                  │
│  2. Add AI response to chatState.messages                   │
│  3. Save to chrome.storage.local                            │
│  4. Display in response area                                │
│  5. Clear input field                                       │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 10: USER SEES RESPONSE                                 │
│                                                              │
│  - Message appears in chat panel                            │
│  - If tool was used, action was already performed           │
│  - Chat history is saved locally                            │
│  - Next message uses updated history                        │
└──────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Breakdown

### 1. **UI Panel** (`src/ui/panel.js`)
- **Role**: User interface where user types messages
- **Responsibilities**:
  - Display chat messages
  - Accept user input
  - Send messages to background
  - Store chat history in localStorage
  - Handle Google login/logout

**Key Functions**:
```javascript
// Line ~200: Send user message
function sendMessage(userText) {
  chrome.runtime.sendMessage({
    action: 'generateResponse',
    message: userText,
    history: chatState.messages
  });
}

// Line ~150: Display response
function addResponseToUI(text, sender) {
  // Add message to UI
  // Save to chatState
  // Update storage
}
```

---

### 2. **Background Service Worker** (`src/background/index.js`)
- **Role**: Main AI logic processor
- **Responsibilities**:
  - Receive messages from UI
  - Call Gemini AI API
  - Parse AI responses
  - Execute tool calls
  - Manage content script interactions

**Key Functions**:
```javascript
// Line ~49: Main message listener
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'generateResponse') {
    handleUserMessage(request.message, request.history)
  }
});

// Line ~130: Process message with AI
async function handleUserMessage(message, recentHistory) {
  // 1. Build conversation history
  // 2. Call Gemini API
  // 3. Parse response
  // 4. Execute tools if needed
  // 5. Return result
}
```

---

### 3. **Gemini Client** (`src/services/geminiClient.js`)
- **Role**: API communication
- **Responsibilities**:
  - Send formatted requests to Gemini API
  - Handle responses
  - Parse AI function calls
  - Error handling

**Key Functions**:
```javascript
// Line ~10: Call Gemini API
export async function callGemini(contents, extra) {
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  });
  return response.json();
}
```

---

### 4. **Content Script** (`src/content/index.js`)
- **Role**: Executes actions in the active webpage
- **Responsibilities**:
  - Insert text into input fields
  - Click buttons
  - Extract page content
  - React to background script commands

**Key Functions**:
```javascript
// Line ~3: Listen for background commands
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'insertText') {
    insertTextIntoInput(request.text);
    clickSearchButton();
  }
});

// Line ~40: Find and fill input field
function insertTextIntoInput(text, selector) {
  const input = document.querySelector(selector);
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
}
```

---

## Example Flow: "Search for cat videos on YouTube"

```
1. USER TYPES & SENDS
   Input: "Search for cat videos on YouTube"
   → Sent to background

2. BACKGROUND RECEIVES
   → Calls handleUserMessage()

3. BACKGROUND CALLS GEMINI
   Sends: {
     system: "You have openTab and insertText tools...",
     messages: [
       { role: 'user', parts: [{ text: 'Search for cat videos on YouTube' }] }
     ]
   }

4. GEMINI RESPONDS
   "I'll help you search for cat videos on YouTube. Let me open YouTube first, then search for you."
   Tool calls:
   - openTab('youtube.com')
   - insertText('cat videos')

5. BACKGROUND EXECUTES TOOLS
   - Opens new YouTube tab
   - Waits 2 seconds
   - Sends insertText message to content script
   - Content script finds search input
   - Types "cat videos"
   - Clicks search button

6. RESPONSE SENT BACK TO UI
   { success: true, response: "I'll help you search..." }

7. UI DISPLAYS
   - Shows AI message: "I'll help you search..."
   - User sees new YouTube tab opening
   - Search happens automatically
   - Chat history saved
```

---

## Key Points

✅ **Message Path**: UI → Background → Gemini → Background → UI
✅ **Tool Execution**: Background ↔ Content Script (on active page)
✅ **Async Operations**: All major operations use promises
✅ **History**: Saved locally in chrome.storage.local
✅ **Error Handling**: Try-catch blocks in all key functions
✅ **Security**: Content scripts only run on user-initiated actions
