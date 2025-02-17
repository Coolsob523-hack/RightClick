let port;

chrome.runtime.onInstalled.addListener(() => {
  // console.log("RightClick extension installed");

  // Create context menu items
  createContextMenuItems(true); // Now enabled as the subscription is simulated as active

  // Schedule the subscription check
  chrome.alarms.create('checkSubscription', { periodInMinutes: 144088888888 }); // 1440 minutes = 1 day

  // Check subscription status and enable/disable context menu items
  checkSubscriptionStatus();

  // Inject content script into all open tabs
  chrome.tabs.query({}, (tabs) => {
    for (let tab of tabs) {
      if (isValidUrl(tab.url)) {
        injectContentScript(tab.id);
      }
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log('Background script received message:', message);

  switch (message.action) {
    case 'captureArea':
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (imageUri) => {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'processCapturedImage',
          imageUri: imageUri,
          startX: message.coordinates.startX,
          startY: message.coordinates.startY,
          width: message.coordinates.width,
          height: message.coordinates.height
        }, async (response) => {
          console.log('Captured image processed, received response:', response);

          // Send the extracted text to GPT-4 to get a response
          const gptResponse = await getCaptureResponse(response.extractedText);

          // Send the GPT response to the content script to display on the page
          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'displayResponse',
            response: gptResponse,
            type: 'capture'
          });

          // Send the GPT response to the popup to update the displayed answer
          chrome.runtime.sendMessage({
            action: 'updatePopupResponse',
            response: gptResponse
          });

          // Store the response in local storage for later use
          chrome.storage.local.set({ response: gptResponse });
        });
      });
      break;

    case 'ocrCompleted':
      console.log('OCR Completed, extracted text:', message.extractedText);

      // Now that we have the extracted text, get the response from GPT-4
      (async () => {
        const gptResponse = await getCaptureResponse(message.extractedText);

        // Send the response to the content script to display in the page
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'displayResponse',
          response: gptResponse,
          type: 'capture'
        });

        // Send the response to the popup to update the displayed answer
        chrome.runtime.sendMessage({
          action: 'updatePopupResponse',
          response: gptResponse
        });

        // Store the response locally
        chrome.storage.local.set({ response: gptResponse });
      })();
      break;

    case 'checkSubscriptionStatus':
      checkSubscriptionStatus().then(isActive => {
        sendResponse({ active: isActive });
      });
      return true;  // Will respond asynchronously

    case 'triggerSelection':
      // console.log('Handling triggerSelection');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0].id;

        chrome.scripting.executeScript({
          target: { tabId: activeTab },
          files: ['selectionOverlay.js']
        }, () => {
          if (chrome.runtime.lastError) {
            // console.error('Error injecting selection script:', chrome.runtime.lastError.message);
            sendResponse({ success: false });
          } else {
            // console.log('Selection overlay script injected successfully');
            sendResponse({ success: true });
          }
        });
      });
      break;

    default:
      // console.log('Unknown action received in background script');
      break;
  }

  return true; // Ensure async responses are handled
});


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkSubscription') {
    checkSubscriptionStatus();
  }
});

chrome.runtime.onStartup.addListener(() => {
  // console.log("Extension starting up...");
  checkSubscriptionStatus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'captureQuestion' || info.menuItemId === 'captureHint' || info.menuItemId === 'capturePointers') {
    const type = info.menuItemId === 'captureQuestion' ? 'answer' : info.menuItemId === 'captureHint' ? 'hint' : 'pointers';

    // Fetch and process the selected text
    processText(info.selectionText, tab.id, type);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture_shortcut') {
    // console.log('Capture shortcut triggered');

    // Retrieve subscription and stealth mode status from storage
    chrome.storage.local.get(['subscriptionActive', 'stealthMode'], (result) => {
      const isSubscriptionActive = result.subscriptionActive || false;
      const isStealthMode = result.stealthMode || false;

      if (!isSubscriptionActive) {
        // console.log('Shortcut disabled: No active subscription');
        return; // Exit if subscription is inactive
      }

      // Trigger the same message that the popup sends for capturing
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'triggerSelection', stealthMode: isStealthMode });
      });
    });
  }
});

function createContextMenuItems(enable) {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "captureQuestion",
      title: "⚡️ Quick Answer",
      contexts: ["selection"],
      enabled: enable
    });

    chrome.contextMenus.create({
      id: "captureHint",
      title: "💡 Hint",
      contexts: ["selection"],
      enabled: enable
    });

    chrome.contextMenus.create({
      id: "capturePointers",
      title: "🧠 Pointers",
      contexts: ["selection"],
      enabled: enable
    });
  });
}

async function checkSubscriptionStatus() {
  // Simulating an active subscription, bypassing the actual API call
  const isActive = true;  // Always return "active"

  // Store the subscription status
  chrome.storage.local.set({ subscriptionActive: isActive });

  // Enable/disable context menus based on subscription status
  createContextMenuItems(isActive);

  return isActive;
}

async function injectContentScript(tabId) {
  try {
    chrome.tabs.get(tabId, (tab) => {
      // Ensure the URL is valid before injecting the content script
      if (isValidUrl(tab.url)) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            // console.error('Script injection failed: ', chrome.runtime.lastError.message);
          } else {
            // console.log('Content script injected successfully');
          }
        });
      } else {
        // console.warn('Invalid URL for content script injection:', tab.url);
      }
    });
  } catch (error) {
    // Catch any unexpected errors and log them
    // console.error('Failed to inject content script:', error);
  }
}

// Helper function to validate URLs
function isValidUrl(url) {
  // Only allow valid HTTP or HTTPS URLs, exclude chrome:// or internal URLs
  return (url.startsWith('http://') || url.startsWith('https://')) &&
         !url.startsWith('chrome://') &&
         !url.startsWith('chrome-extension://') &&
         !url.startsWith('chrome.google.com');
}

async function processText(questionText, tabId, type) {
  let responseText;

  switch (type) {
    case 'answer':
      responseText = await getShortAnswerFromOpenAI(questionText);
      break;

    case 'hint':
      responseText = await getHintFromOpenAI(questionText);
      break;

    case 'pointers':
      responseText = await getPointersFromOpenAI(questionText);
      break;

    case 'capture':
      chrome.storage.local.get(['captureAnswer'], function(result) {
        responseText = result.captureAnswer;
      });
      break;

    default:
      // console.error('Unknown type:', type);
      return;
  }

  // Inject the response into the content script for page insertion
  chrome.tabs.sendMessage(tabId, {
    action: 'displayResponse',
    response: responseText,
    type: type // Pass the type (capture, answer, etc.)
  });

  // Store the response in chrome.storage.local and update the popup
  chrome.storage.local.set({ response: responseText }, () => {
    // console.log('Response stored in local storage:', responseText);

    // Send a message to update the popup with the response
    chrome.runtime.sendMessage({
      action: 'updatePopupResponse',
      response: responseText
    });

    // Set the badge to "1" after the GPT-4 response is retrieved
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFB202' });

    // Clear the badge after 10 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 10000);
  });
}

async function getShortAnswerFromOpenAI(questionText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer sk-proj-iVh1LEs7YUU6k7A89WwBT3BlbkFJdAosaN0GAY6Uwh1RGGSA`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Question: ${questionText}\nProvide a short answer to this ideally 1 or 2 words max, but use up to 5 if you deem necessary.` }
      ],
      max_tokens: 100,
      temperature: 0
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function getHintFromOpenAI(questionText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer sk-proj-iVh1LEs7YUU6k7A89WwBT3BlbkFJdAosaN0GAY6Uwh1RGGSA`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Question: ${questionText}\nProvide a hint to the answer of this question in one sentence or less. Don't include Hint: at the front, just give me the hint by itself.` }
      ],
      max_tokens: 50,
      temperature: 0
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function getPointersFromOpenAI(questionText) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer sk-proj-iVh1LEs7YUU6k7A89WwBT3BlbkFJdAosaN0GAY6Uwh1RGGSA`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Question: ${questionText}\nProvide 5 bullet points with memory jogs/pointers for the answer, they don't have to be grammatically correct, just as valuable words as possible to achieve academic marks.` }
      ],
      max_tokens: 100,
      temperature: 0
    })
  });

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Function to get capture response from OpenAI
async function getCaptureResponse(extractedText) {
  console.log("Getting capture response for: ", extractedText);
  const prompt = `Please provide as short as possible and concise response to the following.
                    If it's a math equation, just provide the solution e.g solve it, find the variables e.g  if it was 7x - y = 14, find what x and y are and respond with those.
                    If it's a text-based question, provide the briefest possible answer ideally 1-2 words, but less than 5 if possible.

                    Input: "${extractedText}"`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer sk-proj-iVh1LEs7YUU6k7A89WwBT3BlbkFJdAosaN0GAY6Uwh1RGGSA`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.1
    })
  });

  const data = await response.json();
  return data.choices[0]?.message?.content.trim() || 'No response found';
}


// Trigger the content script to start the capture process
function triggerCaptureProcess(startX, startY, width, height) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0].id;

    chrome.tabs.sendMessage(activeTab, {
      action: 'startCapture',
      startX: startX,
      startY: startY,
      width: width,
      height: height
    });
  });
}


async function sendToGPT4o(extractedText) {
  // console.log('Starting sendToGPT4o function with extracted text:', extractedText);

  try {
    // Use the getCaptureResponse function to handle the logic for capture responses
    const answer = await getCaptureResponse(extractedText);

    // console.log('Answer from GPT-4o:', answer);
    chrome.storage.local.set({ captureAnswer: answer }, function() {
    });

    // Store the answer in Chrome's storage
    chrome.storage.local.set({ response: answer }, () => {
      // console.log('Answer saved to storage.');

      // Send a message to update the popup
      chrome.runtime.sendMessage({ action: 'updatePopupResponse', response: answer });
    });

  } catch (error) {
    // console.error('Error in sendToGPT4o:', error);
  }
}
