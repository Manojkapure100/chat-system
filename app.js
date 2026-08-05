// const apiOrigin = window.location.protocol === 'file:'
//   ? 'http://localhost:8000'
//   : `${window.location.protocol}//${window.location.host}`;

// const wsUrl = apiOrigin.replace(/^http/, 'ws') + '/api/v1/chat/ws';

// const wsUrl = "ws://127.0.0.1:8000/api/v1/chat/ws";
const wsUrl = "ws://manojbackend.duckdns.org/api/v1/chat/ws"

const assignedIdEl = document.getElementById('assignedId');
const myIdEl = document.getElementById('myId');
const peerIdLabelEl = document.getElementById('peerIdLabel');
const landingScreen = document.getElementById('landing');
const waitingScreen = document.getElementById('waiting');
const chatScreen = document.getElementById('chat');
const connectBtn = document.getElementById('connectBtn');
const cancelWaitBtn = document.getElementById('cancelWaitBtn');
const leaveBtn = document.getElementById('leaveBtn');
const messageList = document.getElementById('messageList');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const peerIdInput = document.getElementById('peerId');
const copyIdBtn = document.getElementById('copyIdBtn');
const copyMyIdBtn = document.getElementById('copyMyIdBtn');
const waitingStatus = document.getElementById('waitingStatus');
const landingMessage = document.getElementById('landingMessage');
const chatStatus = document.getElementById('chatStatus');

let websocket;
let userId = null;
let peerId = null;
let sessionId = null;
let intentionalDisconnect = false;
let reconnectAttempts = 0;

function switchScreen(screen) {
  [landingScreen, waitingScreen, chatScreen].forEach((el) => el.classList.remove('active'));
  screen.classList.add('active');
}

function renderMessage(message, isSelf = false, link = null) {
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isSelf ? 'self' : 'peer'}`;
  bubble.innerHTML = `<div>${message}</div>`;

  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    anchor.textContent = 'Download file';
    anchor.className = 'message-metadata';
    bubble.appendChild(anchor);
  }

  messageList.appendChild(bubble);
  messageList.scrollTop = messageList.scrollHeight;
}

function showLandingMessage(text) {
  landingMessage.textContent = text;
}

function showChatStatus(text) {
  chatStatus.textContent = text;
}

function showCopyStatus(text) {
  if (chatScreen.classList.contains('active')) {
    showChatStatus(text);
    return;
  }
  showLandingMessage(text);
}

async function copyUserId() {
  if (!userId) {
    showCopyStatus('Your ID is not assigned yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(userId);
    showCopyStatus('Your ID was copied to clipboard.');
  } catch (error) {
    showCopyStatus('Unable to copy automatically. Please copy manually.');
  }
}

async function connectWebSocket() {
  intentionalDisconnect = false;
  websocket = new WebSocket(wsUrl);

  websocket.onopen = () => {
    reconnectAttempts = 0;
    showLandingMessage('Connected to chat backend. Waiting for your ID...');
  };

  websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
    //   const data = event.data;
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('Invalid websocket payload', error);
    }
  };

  websocket.onclose = () => {
    if (intentionalDisconnect) {
      showChatStatus('Connection closed. Refresh to reconnect.');
      return;
    }

    showChatStatus('Connection dropped. Reconnecting...');
    attemptReconnect();
  };

  websocket.onerror = () => {
    showChatStatus('WebSocket error. Please refresh or try again.');
  };
}

function attemptReconnect() {
  if (reconnectAttempts >= 4) {
    showChatStatus('Unable to reconnect automatically. Reload the page to try again.');
    return;
  }

  reconnectAttempts += 1;
  const timeout = 100 * reconnectAttempts;

  setTimeout(() => {
    connectWebSocket();
  }, timeout);
}

function handleWebSocketMessage(data) {
  const type = data.type;

  if (type === 'assign_id') {
    userId = data.id;
    assignedIdEl.textContent = userId;
    myIdEl.textContent = userId;
    switchScreen(landingScreen);
    showLandingMessage('Your ID is ready. Enter a peer ID to connect.');
    return;
  }

  if (type === 'pair_status') {
    if (data.status === 'accepted') {
      peerId = data.peer;
      sessionId = data.sessionId;
      peerIdLabelEl.textContent = peerId;
      switchScreen(chatScreen);
      showChatStatus('Chat connected. Send a message or upload an image.');
      return;
    }

    if (data.status === 'peer_not_found') {
      switchScreen(landingScreen);
      showLandingMessage('Peer not found. Please verify the ID and try again.');
      return;
    }

    if (data.status === 'rejected') {
      switchScreen(landingScreen);
      showLandingMessage(data.message || 'Unable to pair with this peer.');
      return;
    }

    if (data.status === 'waiting') {
      switchScreen(waitingScreen);
      waitingStatus.textContent = data.message || 'Waiting for the peer to join.';
      return;
    }
  }

  if (type === 'chat_message') {
    const text = `${data.from}: ${data.text}`;
    renderMessage(text, data.from === userId);
    return;
  }

  if (type === 'file_notify') {
    const text = `${data.from} sent a file: ${data.filename}`;
    renderMessage(text, data.from === userId, data.url);
    return;
  }

  if (type === 'peer_left') {
    showChatStatus(data.message || 'Peer left the chat.');
    switchScreen(landingScreen);
    return;
  }

  if (type === 'error') {
    showChatStatus(data.message || 'Unexpected error received.');
    return;
  }
}

connectBtn.addEventListener('click', () => {
  const target = peerIdInput.value.trim().toUpperCase();
  if (!target || target.length !== 5) {
    showLandingMessage('Please enter a valid 5-character peer ID.');
    return;
  }

  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    showLandingMessage('Not connected to backend yet. Please wait.');
    return;
  }

  switchScreen(waitingScreen);
  waitingStatus.textContent = 'Requesting connection...';
  websocket.send(JSON.stringify({ type: 'pair_request', target }));
});

cancelWaitBtn.addEventListener('click', () => {
  switchScreen(landingScreen);
  showLandingMessage('Pair request canceled.');
});

copyIdBtn?.addEventListener('click', copyUserId);
copyMyIdBtn?.addEventListener('click', copyUserId);

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

    websocket.send(JSON.stringify({ type: 'chat_message', text }));
    messageInput.value = '';
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    showChatStatus('Choose an image before uploading.');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showChatStatus('File must be 5MB or smaller.');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sender_id', userId);
  formData.append('session_id', sessionId);

  try {
    const response = await fetch(`${apiOrigin}/api/v1/chat/upload`, {
      method: 'POST',
      body: formData,
    });
    const json = await response.json();
    if (!response.ok) {
      showChatStatus(json.detail || json.body?.error || 'Upload failed.');
      return;
    }

    renderMessage(`You uploaded ${json.body.filename}`, true, json.body.url);
    showChatStatus('Image uploaded successfully. Your peer will receive a notification.');
    fileInput.value = '';
  } catch (error) {
    showChatStatus('Upload failed. Check your backend connection.');
  }
});

leaveBtn.addEventListener('click', () => {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: 'leave' }));
  }
  intentionalDisconnect = true;
  if (websocket) {
    websocket.close();
  }
  switchScreen(landingScreen);
  showLandingMessage('You left the chat. Refresh to start another session.');
});

window.addEventListener('load', () => {
  connectWebSocket();
});
