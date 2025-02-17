(function() {
  let startX, startY, isSelecting = false;
  let selectionBox, overlay;

  function removeExistingElements() {
    if (overlay) {
      overlay.remove();
    }
    if (selectionBox) {
      selectionBox.remove();
    }
    document.body.style.pointerEvents = 'auto';
    document.body.style.cursor = 'auto';
  }

  function createMessage() {
    const message = document.createElement('div');
    message.innerText = 'I paid for it';
    message.style.position = 'fixed';
    message.style.top = '10px';
    message.style.left = '50%';
    message.style.transform = 'translateX(-50%)';
    message.style.padding = '10px 20px';
    message.style.backgroundColor = 'black';
    message.style.color = 'white';
    message.style.fontSize = '16px';
    message.style.borderRadius = '5px';
    message.style.zIndex = '10001';
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  }

  function createOverlay(stealthMode) {
    removeExistingElements();
    createMessage();
    
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '10000';
    overlay.style.pointerEvents = 'auto';
    overlay.style.backgroundColor = stealthMode ? 'transparent' : 'rgba(0, 0, 0, 0.3)';
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);

    document.body.style.pointerEvents = 'none';
    document.body.style.cursor = 'crosshair';

    overlay.addEventListener('mousedown', startSelection);
    overlay.addEventListener('mousemove', updateSelection);
    overlay.addEventListener('mouseup', endSelection);
  }

  function startSelection(event) {
    if (event.button !== 0) return;
    isSelecting = true;
    startX = event.clientX;
    startY = event.clientY;
    
    if (!document.body.classList.contains('stealth-mode')) {
      selectionBox = document.createElement('div');
      selectionBox.style.position = 'fixed';
      selectionBox.style.border = '2px solid #71E89B';
      selectionBox.style.backgroundColor = 'transparent';
      selectionBox.style.pointerEvents = 'none';
      selectionBox.style.zIndex = '10001';
      selectionBox.style.boxShadow = '0 0 0 99999px rgba(0, 0, 0, 0.3)';
      document.body.appendChild(selectionBox);
    }
  }

  function updateSelection(event) {
    if (!isSelecting) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    if (!document.body.classList.contains('stealth-mode')) {
      selectionBox.style.left = `${Math.min(startX, currentX)}px`;
      selectionBox.style.top = `${Math.min(startY, currentY)}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    }
  }

  function endSelection(event) {
    if (!isSelecting) return;
    isSelecting = false;
    
    const endX = event.clientX;
    const endY = event.clientY;
    const selectionData = {
      startX: Math.min(startX, endX),
      startY: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
    
    chrome.runtime.sendMessage({
      action: 'captureArea',
      coordinates: selectionData
    });

    removeExistingElements();
  }

  chrome.storage.local.get(['stealthMode'], (result) => {
    const isStealthMode = result.stealthMode || false;
    if (isStealthMode) {
      document.body.classList.add('stealth-mode');
    }
    createOverlay(isStealthMode);
  });
})();
