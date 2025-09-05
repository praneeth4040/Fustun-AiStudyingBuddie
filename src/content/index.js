// Listen for messages from the background script
console.log('Content script loaded and listening for messages.');
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'insertText') {
    const result = await insertTextIntoInput(request.text, request.selector);
    if (result.success) {
      const searchResult = await clickSearchButton();
      if (searchResult.success) {
        result.message += ' Search initiated.';
      }
    }
    sendResponse(result);
  } else if (request.action === 'ping') {
    sendResponse({ success: true, message: 'pong' });
  } else if (request.action === 'extractContent') {
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
  }
  return true;
});

function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 100);
    }
    check();
  });
}

async function clickSearchButton() {
  try {
    const searchButtonSelectors = [
      'button#search-icon-legacy',
      '#search-icon-legacy',
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
      '[data-original-title="Search"]',
      'button[data-tooltip-target-id]',
      '[class*="yt-spec-button-shape-next--call-to-action"]',
      '[class*="yt-icon-button"]',
      '#search-icon-img',
      'ytd-searchbox #search-icon-legacy'
    ];
    for (const selector of searchButtonSelectors) {
      const button = await waitForElement(selector, 2000);
      if (button && isElementVisible(button)) {
        button.click();
        return { success: true, message: 'Search button clicked' };
      }
    }
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      activeElement.dispatchEvent(event);
      return { success: true, message: 'Enter key pressed' };
    }
    return { success: false, message: 'No search button found' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function insertTextIntoInput(text, selector) {
  try {
    let inputElement;
    if (selector) {
      inputElement = await waitForElement(selector);
    } else {
      const potentialInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      const visibleInputs = potentialInputs.filter(isElementVisible);
      if (visibleInputs.length > 0) {
        inputElement = visibleInputs[0];
      }
    }
    if (!inputElement) {
      return { success: false, message: 'No suitable input field found' };
    }
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

// Tooltip for summarizing selected text
let summarizeTooltip = null;

function applyTooltipTheme(el) {
  if (!el) return;
  el.style.background = '#D2B48C'; // biscuit
  el.style.color = '#FFFFFF'; // white text
  el.style.fontFamily = "'Kreon', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  el.style.width = '36px';
  el.style.height = '36px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.fontSize = '1.25em';
  el.style.fontWeight = '700';
  el.style.borderRadius = '50%';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
  el.style.cursor = 'pointer';
  el.style.zIndex = 999999;
  el.style.userSelect = 'none';
  el.style.transition = 'box-shadow 0.2s, transform 0.3s';
  el.style.border = '2px solid #C8A97A';
  el.style.outline = 'none';
  el.style.padding = '0';
  el.style.lineHeight = '36px';
  el.style.textAlign = 'center';
}

function createSummarizeTooltip() {
  // If an old tooltip exists from a previous content script version, reuse and re-theme it
  const existing = document.getElementById('summarize-tooltip');
  if (existing) {
    summarizeTooltip = existing;
    applyTooltipTheme(summarizeTooltip);
    return summarizeTooltip;
  }
  if (summarizeTooltip) {
    applyTooltipTheme(summarizeTooltip);
    return summarizeTooltip;
  }
  try {
    if (!document.getElementById('fustun-kreon-font')) {
      const link1 = document.createElement('link');
      link1.rel = 'preconnect';
      link1.href = 'https://fonts.googleapis.com';
      link1.id = 'fustun-kreon-font';
      const link2 = document.createElement('link');
      link2.rel = 'preconnect';
      link2.href = 'https://fonts.gstatic.com';
      link2.crossOrigin = 'anonymous';
      const link3 = document.createElement('link');
      link3.rel = 'stylesheet';
      link3.href = 'https://fonts.googleapis.com/css2?family=Kreon:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link1);
      document.head.appendChild(link2);
      document.head.appendChild(link3);
    }
  } catch (e) {}
  summarizeTooltip = document.createElement('div');
  summarizeTooltip.id = 'summarize-tooltip';
  summarizeTooltip.textContent = 'F';
  summarizeTooltip.style.position = 'absolute';
  applyTooltipTheme(summarizeTooltip);
  summarizeTooltip.style.display = 'none';
  summarizeTooltip.onmouseenter = () => {
    summarizeTooltip.style.transform = 'rotate(-20deg)';
    summarizeTooltip.style.background = '#C8A97A'; // darker biscuit
    summarizeTooltip.style.borderColor = '#B8936C';
    summarizeTooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.16)';
  };
  summarizeTooltip.onmouseleave = () => {
    summarizeTooltip.style.transform = 'none';
    applyTooltipTheme(summarizeTooltip);
  };
  document.body.appendChild(summarizeTooltip);
  return summarizeTooltip;
}

function showSummarizeTooltip(x, y) {
  const tooltip = createSummarizeTooltip();
  const tooltipWidth = 36; const tooltipHeight = 36;
  const viewportWidth = window.innerWidth; const viewportHeight = window.innerHeight;
  let left = x; let top = y + 10;
  if (left + tooltipWidth > viewportWidth) { left = viewportWidth - tooltipWidth - 10; }
  if (left < 10) { left = 10; }
  if (top + tooltipHeight > viewportHeight) { top = y - tooltipHeight - 10; }
  if (top < 10) { top = 10; }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.display = 'block';
}

function hideSummarizeTooltip() { if (summarizeTooltip) summarizeTooltip.style.display = 'none'; }

function showInlineNotice(message, x, y) {
  try {
    const note = document.createElement('div');
    note.textContent = message;
    note.style.position = 'absolute';
    note.style.left = `${(x || 20)}px`;
    note.style.top = `${(y || 20)}px`;
    note.style.background = '#FFF8EE';
    note.style.color = '#5a4b3a';
    note.style.border = '1px solid #D2B48C';
    note.style.borderRadius = '8px';
    note.style.padding = '8px 10px';
    note.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    note.style.fontFamily = "'Kreon', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    note.style.fontSize = '12px';
    note.style.zIndex = 1000000;
    document.body.appendChild(note);
    setTimeout(() => { if (note && note.parentNode) note.parentNode.removeChild(note); }, 3000);
  } catch (e) { /* noop */ }
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection && selection.toString().trim();
    if (text && text.length > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showSummarizeTooltip(rect.left + window.scrollX, rect.bottom + window.scrollY);
    } else {
      hideSummarizeTooltip();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => { if (summarizeTooltip && !summarizeTooltip.contains(e.target)) { hideSummarizeTooltip(); } });

createSummarizeTooltip();
summarizeTooltip.onclick = () => {
  const selection = window.getSelection();
  const text = selection && selection.toString().trim();
  if (text && text.length > 0) {
    try {
      chrome.runtime.sendMessage({ action: 'openSidePanelWithSelection', text });
    } catch (e) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showInlineNotice('Extension context lost. Reload the page or extension.', rect.left + window.scrollX, rect.bottom + window.scrollY + 12);
      console.warn('Extension context lost. Please reload the page or extension.');
    }
    hideSummarizeTooltip();
  }
};


