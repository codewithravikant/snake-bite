// Chat system (bonus feature - feature flag enabled)
let chatEnabled = false;
let chatVisible = false;
let chatInitialized = false; // Prevent multiple initializations

function initChat() {
  // Prevent multiple initializations
  if (chatInitialized) {
    return;
  }
  
  // Check if chat is enabled via feature flags
  // Try to get featureFlags from window (set by client.js)
  const flags = typeof window !== 'undefined' && window.featureFlags ? window.featureFlags : 
                typeof featureFlags !== 'undefined' ? featureFlags : {};
  
  if (flags.chat) {
    chatEnabled = true;
    chatInitialized = true;
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.log('Chat initialized and enabled');
    }
    createChatUI();
    setupChatListeners();
  } else {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.log('Chat not enabled (feature flag disabled)');
    }
  }
}

function createChatUI() {
  // Check if chat container already exists - prevent duplicates
  let chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    return; // Don't create duplicate
  }
  
  // Create chat container
  chatContainer = document.createElement('div');
  chatContainer.id = 'chatContainer';
  chatContainer.className = 'chat-container';
  chatContainer.innerHTML = `
    <div class="chat-header">
      <span>Chat</span>
      <button id="chatToggle" class="chat-toggle">−</button>
    </div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-container">
      <input type="text" id="chatInput" placeholder="Press Enter to send" maxlength="100">
    </div>
    <div class="chat-resize-handle"></div>
  `;

  document.body.appendChild(chatContainer);
  
  // Initialize chat resizing
  initChatResize();

  // Toggle chat visibility
  document.getElementById('chatToggle').addEventListener('click', () => {
    toggleChat();
  });

  // Send message on Enter key
  const chatInput = document.getElementById('chatInput');
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

function toggleChat() {
  const chatContainer = document.getElementById('chatContainer');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const toggleBtn = document.getElementById('chatToggle');
  const resizeHandle = chatContainer.querySelector('.chat-resize-handle');

  chatVisible = !chatVisible;

  if (chatVisible) {
    // Restore chat window
    chatMessages.style.display = 'block';
    chatInput.style.display = 'block';
    if (resizeHandle) resizeHandle.style.display = 'block';
    toggleBtn.textContent = '−';
    
    // Restore original height if it was stored
    const storedHeight = chatContainer.dataset.originalHeight;
    if (storedHeight) {
      chatContainer.style.height = storedHeight + 'px';
      delete chatContainer.dataset.originalHeight;
    } else {
      // Default height if no stored height
      chatContainer.style.height = '212.5px';
    }
  } else {
    // Minimize chat window
    chatMessages.style.display = 'none';
    chatInput.style.display = 'none';
    if (resizeHandle) resizeHandle.style.display = 'none';
    toggleBtn.textContent = '+';
    
    // Store current height before minimizing
    const currentHeight = parseInt(window.getComputedStyle(chatContainer).height, 10);
    if (currentHeight > 0) {
      chatContainer.dataset.originalHeight = currentHeight;
    }
    
    // Set height to fit just the header
    const headerHeight = chatContainer.querySelector('.chat-header').offsetHeight;
    chatContainer.style.height = headerHeight + 'px';
  }
}

function setupChatListeners() {
  // Try to get socket from window (set by client.js)
  const socketToUse = (typeof window !== 'undefined' && window.socket) ? window.socket : socket;
  
  if (!socketToUse) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Socket not available, retrying...');
    }
    // Retry after a short delay
    setTimeout(setupChatListeners, 500);
    return;
  }

  socketToUse.on('chatMessage', (data) => {
    addChatMessage(data.playerName, data.message, data.timestamp);
  });
  
  if (typeof window !== 'undefined' && window.devLog) {
    window.devLog.log('Chat listeners set up successfully');
  }
}

function sendChatMessage() {
  if (!chatEnabled) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Chat is not enabled');
    }
    return;
  }
  
  // Try to get socket from window (set by client.js)
  const socketToUse = (typeof window !== 'undefined' && window.socket) ? window.socket : socket;
  
  if (!socketToUse) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Socket not available');
    }
    return;
  }
  
  if (!socketToUse.connected) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Socket not connected, connection state:', socketToUse.connected);
    }
    return;
  }

  const chatInput = document.getElementById('chatInput');
  if (!chatInput) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Chat input element not found');
    }
    return;
  }
  
  const message = chatInput.value.trim();

  if (!message) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: Empty message, not sending');
    }
    return;
  }

  const roomCode = new URLSearchParams(window.location.search).get('room');
  if (!roomCode) {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.warn('Chat: No room code found in URL');
    }
    return;
  }

  socketToUse.emit('chatMessage', {
    roomCode: roomCode,
    message: message
  });

  chatInput.value = '';
  
  if (typeof window !== 'undefined' && window.devLog) {
    window.devLog.log('Chat: Message emitted successfully');
  }
}

function addChatMessage(playerName, message, timestamp) {
  if (!chatEnabled) return;

  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';

  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.innerHTML = `
    <span class="chat-player-name">${playerName}:</span>
    <span class="chat-message-text">${escapeHtml(message)}</span>
    <span class="chat-time">${timeStr}</span>
  `;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Limit message history (keep last 50 messages)
  while (chatMessages.children.length > 50) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Chat resizing functionality
function initChatResize() {
  const chatContainer = document.getElementById('chatContainer');
  const resizeHandle = chatContainer.querySelector('.chat-resize-handle');
  
  if (!chatContainer || !resizeHandle) return;
  
  let isResizing = false;
  let startX, startY, startWidth, startHeight;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = parseInt(window.getComputedStyle(chatContainer).width, 10);
    startHeight = parseInt(window.getComputedStyle(chatContainer).height, 10);
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    
    e.preventDefault();
  });
  
  function handleResize(e) {
    if (!isResizing) return;
    
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    
    // Min and max sizes
    const minWidth = 150;
    const maxWidth = 600;
    const minHeight = 150;
    const maxHeight = 800;
    
    const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
    const newHeight = Math.max(minHeight, Math.min(maxHeight, height));
    
    chatContainer.style.width = newWidth + 'px';
    chatContainer.style.height = newHeight + 'px';
    
    // Update max-height of messages container
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      // Calculate available height for messages (header + input + padding)
      const headerHeight = chatContainer.querySelector('.chat-header').offsetHeight;
      const inputHeight = chatContainer.querySelector('.chat-input-container').offsetHeight;
      const padding = 10; // Approximate padding
      const messagesMaxHeight = newHeight - headerHeight - inputHeight - padding;
      chatMessages.style.maxHeight = Math.max(100, messagesMaxHeight) + 'px';
    }
  }
  
  function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
}

// Initialize chat when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait for feature flags to be loaded
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.devLog) {
        window.devLog.log('Chat: Initializing chat system...');
        window.devLog.log('Chat: featureFlags available:', typeof window.featureFlags !== 'undefined');
        window.devLog.log('Chat: featureFlags.chat:', window.featureFlags?.chat);
      }
      initChat();
    }, 100);
  });
  
  // Also try to initialize after a longer delay in case feature flags load late
  setTimeout(() => {
    if (typeof window !== 'undefined' && window.devLog) {
      window.devLog.log('Chat: Retry initialization after delay');
    }
    initChat();
  }, 1000);
}

