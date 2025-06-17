// Listen for messages from the background script
console.log('Content script loaded and listening for messages.');
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'insertText') {
    const result = await insertTextIntoInput(request.text, request.selector);
    if (result.success) {
      // After successful text insertion, try to click the search button
      const searchResult = await clickSearchButton();
      if (searchResult.success) {
        result.message += ' Search initiated.';
      }
    }
    sendResponse(result);
  } else if (request.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
  } else if (request.action === 'extractContent') {
    // Extract main visible text content
    let content = '';
    const main = document.querySelector('main');
    if (main) {
      content = main.innerText;
    } else {
      const article = document.querySelector('article');
      if (article) {
        content = article.innerText;
      } else {
        content = document.body.innerText;
      }
    }
    sendResponse({ success: true, content });
  } else if (request.action === 'scrollToBottomAndExtract') {
    // Scroll to bottom, wait, then extract content
    (async () => {
      function scrollToBottom() {
        return new Promise(resolve => {
          let totalHeight = 0;
          let distance = 500;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight - window.innerHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
      }
      await scrollToBottom();
      await new Promise(r => setTimeout(r, 2000)); // Wait for lazy content
      window.scrollTo(0, 0); // Optionally scroll back to top
      let content = '';
      const main = document.querySelector('main');
      if (main) {
        content = main.innerText;
      } else {
        const article = document.querySelector('article');
        if (article) {
          content = article.innerText;
        } else {
          content = document.body.innerText;
        }
      }
      sendResponse({ success: true, content });
    })();
    return true;
  }
  return true;
});

// Helper function to check if an element is visible
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

// Utility function to wait for an element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Function to find and click the search button
async function clickSearchButton() {
  try {
    // Common search button selectors
    const searchButtonSelectors = [
      'button#search-icon-legacy', // YouTube's main search button
      '#search-icon-legacy', // Another common YouTube selector
      'button[aria-label="Search"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button.search',
      '.search-button',
      '[aria-label*="search" i]',
      '[title*="search" i]',
      '[role="search"] button',
      'form button',
      'form input[type="submit"]',
      '#search-button',
      '.submit-button',
      '.search__button',
      '.search-submit',
      '[data-test-id*="search-button"]',
      '[class*="search"] button',
      '[class*="submit"] button',
      // More generic selectors for search icons/buttons
      '[data-original-title="Search"]',
      'button[data-tooltip-target-id]',
      '[class*="yt-spec-button-shape-next--call-to-action"]',
      '[class*="yt-icon-button"]',
      '#search-icon-img', // For search icon images sometimes used as buttons
      'ytd-searchbox #search-icon-legacy' // More specific for YouTube
    ];

    // Try each selector
    for (const selector of searchButtonSelectors) {
      const button = await waitForElement(selector, 2000); // Shorter timeout for individual buttons
      if (button && isElementVisible(button)) {
        console.log('Attempting to click button with selector:', selector);
        button.click();
        return { success: true, message: 'Search button clicked' };
      }
    }

    // If no button found, try pressing Enter on the active input field as a fallback
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      console.log('No search button found, attempting to press Enter on active element:', activeElement);
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      activeElement.dispatchEvent(event);
      return { success: true, message: 'Enter key pressed' };
    }

    console.log('No search button found and no active input field.');
    return { success: false, message: 'No search button found' };
  } catch (error) {
    console.error('Error clicking search button:', error);
    return { success: false, message: error.message };
  }
}

// Function to insert text into input fields
async function insertTextIntoInput(text, selector) {
  try {
    let inputElement;
    
    if (selector) {
      inputElement = await waitForElement(selector);
    } else {
      // Find the first visible input or textarea
      const potentialInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      const visibleInputs = potentialInputs.filter(isElementVisible);

      if (visibleInputs.length > 0) {
        inputElement = visibleInputs[0]; // Take the very first visible input field
      }
    }

    if (!inputElement) {
      return { success: false, message: 'No suitable input field found' };
    }

    // Check if the value property is writable
    const descriptor = Object.getOwnPropertyDescriptor(inputElement, 'value');
    if (descriptor && !descriptor.writable) {
      return { success: false, message: 'Input field is not writable' };
    }

    inputElement.focus();
    inputElement.value = text;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, message: 'Text inserted successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
} 