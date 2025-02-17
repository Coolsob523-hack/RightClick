// Ensure DOM content is loaded before executing the code
document.addEventListener('DOMContentLoaded', () => {

  // Retrieve stored response and update the popup
  chrome.storage.local.get(['response', 'subscriptionActive', 'subscriptionId', 'stealthMode', 'stealthModeExpiry'], (result) => {
    document.getElementById('answer').textContent = result.response || 'No response yet.';

    const currentTime = Date.now();
    if (result.stealthMode && result.stealthModeExpiry && currentTime > result.stealthModeExpiry) {
      // If current time is past the expiry, auto-disable Stealth Mode
      chrome.storage.local.set({ stealthMode: true });
      document.getElementById('stealthSwitch').checked = true;
    } else {
      document.getElementById('stealthSwitch').checked = result.stealthMode || true;
    }

    if (result.subscriptionActive) {
      displaySubscriptionActive();
      enableFeatures();  // Enable Capture A Question and Stealth Mode
    } else {
      disableFeatures();  // Disable Capture A Question and Stealth Mode
    }
  });

  // Listen for messages to update the popup with new responses
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updatePopupResponse') {
      // Update the answer in the popup when a new response is received

      if (message.response === "Not defined") {
        document.getElementById('answer').textContent = "Thinking...";
      } else {
        document.getElementById('answer').textContent = message.response;
      }

      // Store the new response to ensure it persists on future page loads
      chrome.storage.local.set({ response: message.response });
    }
  });

  // Event listener for the "Capture a Question" button
  document.getElementById('captureQuestion').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'triggerSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        // console.error('Error sending message:', chrome.runtime.lastError.message);
      } else {
        // console.log('Message sent to background:', response);
      }
    });

    // Close the popup right after the message is sent
    window.close();
  });

  // Event listener for the Stealth Mode toggle
  document.getElementById('stealthSwitch').addEventListener('change', (event) => {
    const stealthMode = event.target.checked;
    chrome.storage.local.set({ stealthMode });  // Save Stealth Mode status to local storage
    // console.log('Stealth Mode:', stealthMode);

    if (stealthMode) {
      // If Stealth Mode is turned on, set a timer to auto-turn it off after 2 hours
      const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000; // Current time + 2 hours
      chrome.storage.local.set({ stealthModeExpiry: twoHoursFromNow });

      // Set a timeout to auto-disable Stealth Mode after 2 hours
      setTimeout(() => {
        chrome.storage.local.set({ stealthMode: false }, () => {
          // console.log('Stealth Mode auto-turned off after 2 hours');
          document.getElementById('stealthSwitch').checked = false; // Update the toggle in the UI
        });
      }, 2 * 60 * 60 * 1000); // 2 hours in milliseconds
    } else {
      // If Stealth Mode is turned off manually, clear the expiry time
      chrome.storage.local.remove('stealthModeExpiry');
    }
  });

  // Subscription activation logic
  document.getElementById('saveSubscriptionId').addEventListener('click', () => {
    const subscriptionId = document.getElementById('subscriptionId').value;
    if (subscriptionId) {
      checkSubscriptionStatus(subscriptionId).then(isActive => {
        if (isActive) {
          chrome.storage.local.set({ subscriptionId: subscriptionId, subscriptionActive: true }, () => {
            alert('RightClick has been Activated!');
            displaySubscriptionActive();
            enableFeatures();  // Enable buttons after activation
            chrome.runtime.sendMessage({ action: 'checkSubscriptionStatus' });
          });
        } else {
          alert('Invalid Activation Code.');
        }
      });
    } else {
      alert('Please enter your Activation Code.');
    }
  });

  // Update the popup with a new response from GPT-4 or any updates
  chrome.runtime.onMessage.addListener((message) => {
    // console.log('Popup received message:', message);
    if (message.action === 'updatePopupResponse') {
      document.getElementById('answer').textContent = message.response;
      chrome.storage.local.set({ response: message.response });
    }
  });

  function displaySubscriptionActive() {
    document.getElementById('subscription-section').innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <p style="color: green; font-weight: bold;">Subscription Active - Paid For!</p>
        <button id="deregisterSubscription" style="background-color: #FB6107; color: white;">Deregister</button>
      </div>
    `;

    document.getElementById('deregisterSubscription').addEventListener('click', () => {
      chrome.storage.local.remove(['subscriptionId', 'subscriptionActive'], () => {
        alert('Subscription Unlinked.');
        disableFeatures();  // Disable buttons after deactivation
        chrome.runtime.sendMessage({ action: 'checkSubscriptionStatus' });
        displaySubscriptionInput();
      });
    });
  }

  function displaySubscriptionInput() {
    document.getElementById('subscription-section').innerHTML = `
      <h3>Enter Activation Code:</h3>
      <input type="text" id="subscriptionId" placeholder="Activation Code">
      <button id="saveSubscriptionId">Activate</button>
    `;
  }

  async function checkSubscriptionStatus(subscriptionId) {
    try {
        const response = await fetch(`https://rightclickpay.atrus.uk/check-subscription?subscriptionId=${subscriptionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        return data.status === 'active' && data.paid; // Assuming 'paid' is part of the response
    } catch (error) {
        console.error('Error fetching subscription status from API:', error);
        return false;
    }
  }

  // Function to disable the "Capture A Question" button and Stealth Mode
  function disableFeatures() {
    const captureButton = document.getElementById('captureQuestion');
    const stealthSwitch = document.getElementById('stealthSwitch');

    // Disable Capture A Question
    captureButton.disabled = true;
    captureButton.classList.add('disabled'); // Apply the disabled class
    captureButton.innerHTML = "&#128274; Capture A Question";  // Add lock emoji
    captureButton.style.backgroundColor = '#ccc';  // Change button style

    // Disable Stealth Mode
    stealthSwitch.disabled = true;
    document.querySelector('.stealth-mode-label').innerHTML = '&#128274; Stealth Mode';  // Add lock emoji
  }

  // Function to enable the "Capture A Question" button and Stealth Mode
  function enableFeatures() {
    const captureButton = document.getElementById('captureQuestion');
    const stealthSwitch = document.getElementById('stealthSwitch');

    // Enable Capture A Question
    captureButton.disabled = false;
    captureButton.classList.remove('disabled'); // Remove the disabled class

    captureButton.innerHTML = "&#128248; Capture A Question";  // Restore original text
    captureButton.style.backgroundColor = '#6FE89A';  // Restore button color

    // Enable Stealth Mode
    stealthSwitch.disabled = false;
    document.querySelector('.stealth-mode-label').innerHTML = '&#129399; Stealth Mode';  // Restore original text
  }
});

// Handle "Learn More" link click
document.getElementById('learnMoreLink').addEventListener('click', function() {
  chrome.tabs.create({ url: 'https://www.notion.so/Stealth-Mode-107069fffad380eea35dc4af8e1ad5e5' });
});

document.getElementById('learnRC').addEventListener('click', function() {
  chrome.tabs.create({ url: 'https://www.notion.so/How-To-Use-10c069fffad380c29326dde2b3811397' });
});
