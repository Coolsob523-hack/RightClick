let tesseractWorker = null;

// Initialize Tesseract as soon as the content script is injected
initializeTesseract();

async function initializeTesseract() {
  if (!tesseractWorker) {
    try {
      await loadTesseractScript();
      tesseractWorker = await Tesseract.createWorker();
      await tesseractWorker.load();
      await tesseractWorker.loadLanguage('eng');
      await tesseractWorker.initialize('eng');
    } catch (error) {
      console.error('Error initializing Tesseract worker:', error);
    }
  }
}

function loadTesseractScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/tesseract.min.js');
    script.onload = () => {
      if (typeof Tesseract !== 'undefined') {
        resolve();
      } else {
        reject(new Error('Tesseract is undefined after loading'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract'));
    document.head.appendChild(script);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'displayResponse') {
    displayResponseInPage(message.response, message.type);
  } else if (message.action === 'processCapturedImage') {
    captureAndProcess(message.imageUri, message.startX, message.startY, message.width, message.height);
    sendResponse({ status: 'Capture processed' });
  } else if (message.action === 'triggerSelection') {
    chrome.runtime.sendMessage({ action: 'triggerSelection' }, (response) => {});
    sendResponse({ status: 'Selection process initiated' });
  }
});

async function captureAndProcess(imageUri, startX, startY, width, height) {
  try {
    if (!tesseractWorker) {
      await initializeTesseract();
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const img = new Image();
    img.src = imageUri;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const adjustedStartX = startX * pixelRatio;
    const adjustedStartY = startY * pixelRatio;
    const adjustedWidth = width * pixelRatio;
    const adjustedHeight = height * pixelRatio;

    canvas.width = adjustedWidth;
    canvas.height = adjustedHeight;

    ctx.drawImage(img, adjustedStartX, adjustedStartY, adjustedWidth, adjustedHeight, 0, 0, adjustedWidth, adjustedHeight);

    const { data: { text } } = await tesseractWorker.recognize(canvas.toDataURL('image/png'));

    chrome.runtime.sendMessage(
      { action: 'ocrCompleted', extractedText: text },
      (response) => {}
    );
  } catch (error) {
    console.error('Error in captureAndProcess:', error);
  }
}

function displayResponseInPage(response, type) {
  chrome.storage.local.get(['stealthMode', 'subscriptionActive'], (result) => {
    const isStealthMode = result.stealthMode || true;
    const subscriptionActive = result.subscriptionActive || true;
