// Listen for messages from the background script
console.log('Content script loaded and listening for messages.');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'insertText') {
    const result = insertTextIntoInput(request.text, request.selector);
    if (result.success) {
      // After successful text insertion, try to click the search button
      const searchResult = clickSearchButton();
      if (searchResult.success) {
        result.message += ' Search initiated.';
      }
    }
    sendResponse(result);
  } else if (request.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
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

// Function to find and click the search button
function clickSearchButton() {
  try {
    // Common search button selectors
    const searchButtonSelectors = [
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
      '[class*="submit"] button'
    ];

    // Try each selector
    for (const selector of searchButtonSelectors) {
      const button = document.querySelector(selector);
      if (button && isElementVisible(button)) {
        button.click();
        return { success: true, message: 'Search button clicked' };
      }
    }

    // If no button found, try pressing Enter
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
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

    return { success: false, message: 'No search button found' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Function to insert text into input fields
function insertTextIntoInput(text, selector) {
  try {
    let inputElement;
    
    if (selector) {
      inputElement = document.querySelector(selector);
    } else {
      // Dynamic search for the most suitable input field
      const potentialInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      const visibleInputs = potentialInputs.filter(isElementVisible);

      // Prioritize common search input types/names/placeholders
      inputElement = visibleInputs.find(input => 
        (input.type === 'search' && input.type !== 'file') ||
        (input.name === 'q' && input.type !== 'file') ||
        (input.placeholder && input.placeholder.toLowerCase().includes('search') && input.type !== 'file') ||
        (input.placeholder && input.placeholder.toLowerCase().includes('enter text') && input.type !== 'file')
      );

      // Fallback to the first visible input or textarea, excluding file inputs
      if (!inputElement && visibleInputs.length > 0) {
        inputElement = visibleInputs.find(input => input.type !== 'file');
      }
    }

    if (!inputElement) {
      return { success: false, message: 'No suitable input field found' };
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