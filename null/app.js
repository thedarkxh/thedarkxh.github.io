import {
    deriveMasterKey,
    deriveSubKeys,
    generateIdentityKeys,
    encryptPrivateKeys,
    decryptPrivateKeys,
    deriveRatchetMessageKey,
    decryptRatchetMessage,
    signAuthHandshake
} from './crypto.js';

// Application State
const state = {
    serverUrl: localStorage.getItem('null_server_url') || 'ws://localhost:8080',
    socket: null,
    currentUser: null,
    role: null,
    
    // In-memory decrypted keys
    identityPrivate: null,
    signingPrivate: null,
    identityPubJwk: null,
    signingPubJwk: null,
    
    // Local copy of key encryption key
    kEncrypt: null,
    authHashHex: null,
    
    // Chat states
    contacts: {}, // username -> { identityPubJwk, signingPubJwk }
    activeChat: null,
    messages: {}, // username -> array of message objects
    
    // Auth flow temporary challenge
    tempChallenge: null,
    
    // Reconnection
    reconnectTimer: null,
    
    // Auto-Lock Inactivity
    inactivityTimeout: null
};

// DOM Elements
const elements = {
    connStatusDot: document.getElementById('conn-status-dot'),
    connStatusText: document.getElementById('conn-status-text'),
    logoutBtn: document.getElementById('logout-btn'),
    adminPanelBtn: document.getElementById('admin-panel-btn'),
    
    // Overlays
    loginOverlay: document.getElementById('login-overlay'),
    registerOverlay: document.getElementById('register-overlay'),
    bootstrapOverlay: document.getElementById('bootstrap-overlay'),
    adminOverlay: document.getElementById('admin-overlay'),
    
    // Login form
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginSubmitBtn: document.getElementById('login-submit-btn'),
    loginSignupLink: document.getElementById('login-signup-link'),
    bootstrapNotice: document.getElementById('bootstrap-notice'),
    
    // Register form
    registerUsername: document.getElementById('register-username'),
    registerPassword: document.getElementById('register-password'),
    registerToken: document.getElementById('register-token'),
    registerSignature: document.getElementById('register-signature'),
    registerSubmitBtn: document.getElementById('register-submit-btn'),
    
    // Bootstrap form
    bootstrapUsername: document.getElementById('bootstrap-username'),
    bootstrapPassword: document.getElementById('bootstrap-password'),
    bootstrapToken: document.getElementById('bootstrap-token'),
    bootstrapSubmitBtn: document.getElementById('bootstrap-submit-btn'),
    
    // Dashboard / Chat UI
    chatsList: document.getElementById('chats-list'),
    chatSpace: document.getElementById('chat-space'),
    chatWithName: document.getElementById('chat-with-name'),
    chatWithStatus: document.getElementById('chat-with-status'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendMsgBtn: document.getElementById('send-msg-btn'),
    userProfileSection: document.getElementById('user-profile-section'),
    searchContacts: document.getElementById('search-contacts'),
    backToSidebarBtn: document.getElementById('back-to-sidebar-btn'),
    
    // Admin Panel
    closeAdminBtn: document.getElementById('close-admin-btn'),
    inviteNote: document.getElementById('invite-note'),
    generateInviteBtn: document.getElementById('generate-invite-btn'),
    inviteResultContainer: document.getElementById('invite-result-container'),
    inviteLinkOutput: document.getElementById('invite-link-output'),
    copyInviteBtn: document.getElementById('copy-invite-btn'),
    onlineUsersList: document.getElementById('online-users-list'),
    
    // Toast Container
    toastContainer: document.getElementById('toast-container')
};

// --- Toast System ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- Navigation / UI State Routing ---
function showOverlay(overlayEl) {
    elements.loginOverlay.classList.add('hidden');
    elements.registerOverlay.classList.add('hidden');
    elements.bootstrapOverlay.classList.add('hidden');
    
    if (overlayEl) {
        overlayEl.classList.remove('hidden');
    }
}

function handleRouting() {
    const hash = window.location.hash;
    
    if (hash.startsWith('#/register')) {
        showOverlay(elements.registerOverlay);
        // Pre-fill token and signature if present in query params (passed from invite link)
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        if (params.has('token')) {
            elements.registerToken.value = params.get('token');
        }
        if (params.has('sig')) {
            elements.registerSignature.value = params.get('sig');
        }
    } else if (hash === '#/bootstrap') {
        showOverlay(elements.bootstrapOverlay);
    } else if (hash === '#/chat' && state.currentUser) {
        showOverlay(null); // hide all overlays, go to chat
    } else {
        window.location.hash = '#/login';
        showOverlay(elements.loginOverlay);
    }
}

// --- WebSocket Core Connection ---
function connectToBackend() {
    if (state.socket) {
        try { state.socket.close(); } catch(e) {}
    }
    
    elements.connStatusDot.className = 'status-dot';
    elements.connStatusText.textContent = 'Connecting...';
    
    // Parse target ws URL. If localhost, we prompt/read configured URL
    let url = state.serverUrl;
    // Fallback URL config input in console or local storage if needed
    console.log(`Connecting to NULL backend at: ${url}`);
    
    try {
        state.socket = new WebSocket(url);
    } catch (err) {
        console.error('Socket init error:', err);
        handleConnectionFailure();
        return;
    }
    
    state.socket.onopen = () => {
        elements.connStatusDot.className = 'status-dot online';
        elements.connStatusText.textContent = 'Connected';
        console.log('WebSocket Connected successfully');
        
        // Trigger initial check for backend status
        sendWebSocketMessage({ type: 'bootstrap_check' });
        
        if (state.currentUser && state.authHashHex) {
            // Re-authenticate if connection drops and comes back
            requestLoginChallenge(state.currentUser);
        }
    };
    
    state.socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleIncomingMessage(data);
        } catch (err) {
            console.error('Error parsing WS message:', err);
        }
    };
    
    state.socket.onclose = () => {
        handleConnectionFailure();
    };
    
    state.socket.onerror = (err) => {
        console.error('WS Connection error:', err);
    };
}

function handleConnectionFailure() {
    elements.connStatusDot.className = 'status-dot';
    elements.connStatusText.textContent = 'Disconnected';
    
    // Attempt reconnection every 5 seconds
    if (!state.reconnectTimer) {
        state.reconnectTimer = setInterval(() => {
            console.log('Attempting reconnection...');
            connectToBackend();
        }, 5000);
    }
}

function sendWebSocketMessage(msgObj) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(msgObj));
    } else {
        showToast('Operation failed: Server is offline', 'error');
    }
}

// --- WebSocket Event Router ---
async function handleIncomingMessage(msg) {
    switch (msg.type) {
        case 'bootstrap_check_res':
            if (!msg.bootstrapped) {
                elements.bootstrapNotice.classList.remove('hidden');
                elements.loginSignupLink.classList.add('hidden');
                showToast('First run detected: System bootstrap required.', 'info');
            } else {
                elements.bootstrapNotice.classList.add('hidden');
                elements.loginSignupLink.classList.remove('hidden');
            }
            break;
            
        case 'bootstrap_res':
        case 'register_res':
            if (msg.success) {
                showToast(`${msg.type === 'bootstrap_res' ? 'Bootstrap' : 'Registration'} successful! Please log in.`, 'success');
                window.location.hash = '#/login';
            } else {
                showToast(msg.error || 'Operation failed', 'error');
            }
            break;
            
        case 'login_challenge':
            // Server verifies username & hash, returns challenge
            await handleLoginChallenge(msg.challenge, msg.encryptedPrivateKeys);
            break;
            
        case 'login_res':
            if (msg.success) {
                state.currentUser = msg.username;
                state.role = msg.role;
                showToast(`Access granted. Welcome back, ${msg.username}!`, 'success');
                
                // Set up UI for profile
                elements.userProfileSection.innerHTML = `
                    <div class="user-avatar-mini">${state.currentUser.substring(0,2).toUpperCase()}</div>
                    <span style="font-weight:600;">${state.currentUser}</span>
                    <span style="font-size:10px; color:var(--text-secondary); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:8px;">
                        ${state.role}
                    </span>
                `;
                
                if (state.role === 'admin') {
                    elements.adminPanelBtn.classList.remove('hidden');
                } else {
                    elements.adminPanelBtn.classList.add('hidden');
                }
                
                elements.logoutBtn.classList.remove('hidden');
                window.location.hash = '#/chat';
                
                // Start tracking inactivity timeout
                resetInactivityTimeout();
                
                // Load contacts
                sendWebSocketMessage({ type: 'get_contacts' });
            } else {
                showToast(msg.error || 'Authentication failed', 'error');
                state.authHashHex = null;
                state.kEncrypt = null;
            }
            break;
            
        case 'contacts_res':
            updateContactsList(msg.contacts);
            // Fetch unread messages
            sendWebSocketMessage({ type: 'get_offline_messages' });
            break;
            
        case 'new_message':
            await handleIncomingChatMessage(msg.sender, msg.payload);
            break;
            
        case 'offline_messages_res':
            for (const item of msg.messages) {
                await handleIncomingChatMessage(item.sender, JSON.parse(item.encrypted_content));
            }
            break;
            
        case 'admin_invite_res':
            if (msg.success) {
                const inviteUrl = `${window.location.origin}${window.location.pathname}#/register?token=${encodeURIComponent(msg.token)}&sig=${encodeURIComponent(msg.signature)}`;
                elements.inviteLinkOutput.value = inviteUrl;
                elements.inviteResultContainer.classList.remove('hidden');
                showToast('Invite link generated and signed successfully!', 'success');
            } else {
                showToast(msg.error || 'Failed to generate invite', 'error');
            }
            break;
            
        case 'admin_users_res':
            renderAdminUsersList(msg.users);
            break;
            
        case 'error':
            showToast(msg.message || 'Server error', 'error');
            break;
    }
}

// --- Cryptographic Flow Orchestrators ---

// 1. Bootstrapping Admin Account
async function submitBootstrap() {
    const username = elements.bootstrapUsername.value.trim().toLowerCase();
    const passphrase = elements.bootstrapPassword.value;
    const token = elements.bootstrapToken.value.trim();
    
    if (!username || !passphrase || !token) {
        showToast('Please fill in all bootstrap fields', 'error');
        return;
    }
    
    showToast('Generating keys (this may take a moment)...', 'info');
    
    try {
        // Derive master and subkeys
        const masterKey = await deriveMasterKey(username, passphrase);
        const { kEncrypt, authHashHex } = await deriveSubKeys(masterKey);
        
        // Generate E2EE key pairs
        const { identityKeyPair, signingKeyPair } = await generateIdentityKeys();
        
        // Encrypt the private keys locally using K_encrypt
        const encryptedPrivateKeys = await encryptPrivateKeys(
            identityKeyPair.privateKey,
            signingKeyPair.privateKey,
            kEncrypt
        );
        
        // Export public keys in JWK format
        const identityPubJwk = await window.crypto.subtle.exportKey('jwk', identityKeyPair.publicKey);
        const signingPubJwk = await window.crypto.subtle.exportKey('jwk', signingKeyPair.publicKey);
        
        sendWebSocketMessage({
            type: 'bootstrap',
            username,
            authHashHex,
            encryptedPrivateKeys,
            identityPubJwk,
            signingPubJwk,
            token
        });
    } catch (err) {
        console.error('Bootstrap error:', err);
        showToast('Key generation failed.', 'error');
    }
}

// 2. User Registration with Invitation Token & Signature
async function submitRegistration() {
    const username = elements.registerUsername.value.trim().toLowerCase();
    const passphrase = elements.registerPassword.value;
    const token = elements.registerToken.value.trim();
    const signature = elements.registerSignature.value.trim();
    
    if (!username || !passphrase || !token || !signature) {
        showToast('Please fill in all registration fields', 'error');
        return;
    }
    
    showToast('Generating keys & encrypting...', 'info');
    
    try {
        // Derive master and subkeys
        const masterKey = await deriveMasterKey(username, passphrase);
        const { kEncrypt, authHashHex } = await deriveSubKeys(masterKey);
        
        // Generate E2EE key pairs
        const { identityKeyPair, signingKeyPair } = await generateIdentityKeys();
        
        // Encrypt private keys locally
        const encryptedPrivateKeys = await encryptPrivateKeys(
            identityKeyPair.privateKey,
            signingKeyPair.privateKey,
            kEncrypt
        );
        
        // Export public keys to JWK
        const identityPubJwk = await window.crypto.subtle.exportKey('jwk', identityKeyPair.publicKey);
        const signingPubJwk = await window.crypto.subtle.exportKey('jwk', signingKeyPair.publicKey);
        
        sendWebSocketMessage({
            type: 'register',
            username,
            authHashHex,
            encryptedPrivateKeys,
            identityPubJwk,
            signingPubJwk,
            token,
            signature
        });
    } catch (err) {
        console.error('Registration error:', err);
        showToast('Registration key agreement failed.', 'error');
    }
}

// 3. Requesting login challenge
function requestLoginChallenge(username) {
    sendWebSocketMessage({
        type: 'login_request',
        username,
        authHashHex: state.authHashHex
    });
}

async function startLogin() {
    const username = elements.loginUsername.value.trim().toLowerCase();
    const passphrase = elements.loginPassword.value;
    
    if (!username || !passphrase) {
        showToast('Please enter username and passphrase', 'error');
        return;
    }
    
    showToast('Deriving local key wrappers...', 'info');
    
    try {
        // Derive subkeys from password to get Auth Hash and Encryption key
        const masterKey = await deriveMasterKey(username, passphrase);
        const { kEncrypt, authHashHex } = await deriveSubKeys(masterKey);
        
        // Cache in memory for this session
        state.kEncrypt = kEncrypt;
        state.authHashHex = authHashHex;
        
        requestLoginChallenge(username);
    } catch (err) {
        console.error('Login key derivation failed:', err);
        showToast('Failed to derive auth token from password.', 'error');
    }
}

// 4. Handle challenge & decrypt private keys
async function handleLoginChallenge(challenge, encryptedPrivateKeys) {
    try {
        // Decrypt user private keys in memory
        const decrypted = await decryptPrivateKeys(encryptedPrivateKeys, state.kEncrypt);
        state.identityPrivate = decrypted.identityPrivate;
        state.signingPrivate = decrypted.signingPrivate;
        
        // Sign the server challenge with the private signing key
        const timestamp = Date.now().toString();
        const clientSignature = await signAuthHandshake(challenge, timestamp, state.signingPrivate);
        
        // Send signature back to authenticate connection
        sendWebSocketMessage({
            type: 'login_auth',
            signature: clientSignature,
            timestamp
        });
    } catch (err) {
        console.error('Challenge solution error:', err);
        showToast('Could not decrypt private keys. Wrong passphrase?', 'error');
        state.authHashHex = null;
        state.kEncrypt = null;
    }
}

// 5. Encrypting & Sending Chat Message
async function sendChatMessage() {
    const text = elements.messageInput.value.trim();
    if (!text || !state.activeChat) return;
    
    const recipient = state.activeChat;
    const recipientKeys = state.contacts[recipient];
    
    if (!recipientKeys) {
        showToast('Recipient keys not found', 'error');
        return;
    }
    
    try {
        // Encrypt message text natively using ratcheting key derivation and padding
        const encryptedPayload = await deriveRatchetMessageKey(
            recipientKeys.identityPubJwk,
            recipientKeys.signingPubJwk,
            state.signingPrivate,
            text
        );
        
        // Send to server
        sendWebSocketMessage({
            type: 'send_msg',
            receiver: recipient,
            payload: encryptedPayload
        });
        
        // Add to local history
        appendLocalMessage(recipient, state.currentUser, text);
        elements.messageInput.value = '';
        resetInactivityTimeout();
    } catch (err) {
        console.error('Encryption failed:', err);
        showToast('Failed to encrypt message securely.', 'error');
    }
}

// 6. Decrypting & Displaying Chat Message
async function handleIncomingChatMessage(sender, payload) {
    const senderKeys = state.contacts[sender];
    if (!senderKeys) {
        console.warn(`No keys cached for sender: ${sender}`);
        return;
    }
    
    try {
        // Decrypt natively verifying signature and padding integrity
        const plaintext = await decryptRatchetMessage(
            senderKeys.signingPubJwk,
            state.identityPrivate,
            payload
        );
        
        appendLocalMessage(sender, sender, plaintext);
        showToast(`Secure message received from ${sender}`, 'info');
        resetInactivityTimeout();
    } catch (err) {
        console.error('Decryption failed:', err);
        appendLocalMessage(sender, sender, '[ERROR: Secure decryption failed - Key mismatch or bad signature]');
    }
}

// --- UI Interaction Rendering ---

function updateContactsList(contactsArray) {
    elements.chatsList.innerHTML = '';
    state.contacts = {};
    
    // Filter contacts to exclude self
    const filtered = contactsArray.filter(u => u.username !== state.currentUser);
    
    if (filtered.length === 0) {
        elements.chatsList.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); margin-top: 40px; font-size: 14px;">
                No active contacts. Invite users via Admin Panel.
            </div>
        `;
        return;
    }
    
    filtered.forEach(user => {
        // Cache keys
        state.contacts[user.username] = {
            identityPubJwk: JSON.parse(user.identity_public_key),
            signingPubJwk: JSON.parse(user.signing_public_key)
        };
        
        const lastMsg = getLastMessagePreview(user.username);
        const item = document.createElement('div');
        item.className = `chat-item ${state.activeChat === user.username ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-avatar">${user.username.substring(0, 2).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name-row">
                    <span class="chat-name">${user.username}</span>
                    <span class="chat-time">${lastMsg.time}</span>
                </div>
                <div class="chat-preview">${lastMsg.text}</div>
            </div>
        `;
        
        item.onclick = () => selectContact(user.username);
        elements.chatsList.appendChild(item);
    });
}

function selectContact(username) {
    state.activeChat = username;
    
    // Toggle active state in sidebar UI
    const items = elements.chatsList.querySelectorAll('.chat-item');
    items.forEach(el => {
        const name = el.querySelector('.chat-name').textContent;
        if (name === username) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    elements.chatWithName.textContent = username;
    elements.chatWithStatus.textContent = 'End-to-End Encrypted Session Active';
    elements.messageInput.removeAttribute('disabled');
    elements.sendMsgBtn.removeAttribute('disabled');
    
    // Mobile responsiveness responsive toggle
    if (window.innerWidth <= 768) {
        elements.chatSpace.classList.add('active');
        elements.backToSidebarBtn.style.display = 'block';
    }
    
    renderMessages(username);
}

function appendLocalMessage(chatPartner, sender, text) {
    if (!state.messages[chatPartner]) {
        state.messages[chatPartner] = [];
    }
    
    state.messages[chatPartner].push({
        sender,
        text,
        timestamp: Date.now()
    });
    
    // Refresh message view if looking at this chat
    if (state.activeChat === chatPartner) {
        renderMessages(chatPartner);
    }
    
    // Re-render sidebar to update last message preview
    sendWebSocketMessage({ type: 'get_contacts' });
}

function renderMessages(chatPartner) {
    elements.chatMessages.innerHTML = '';
    const chatList = state.messages[chatPartner] || [];
    
    if (chatList.length === 0) {
        elements.chatMessages.innerHTML = `
            <div style="display: flex; height: 100%; justify-content: center; align-items: center; color: var(--text-secondary);">
                No messages yet. Direct E2EE established.
            </div>
        `;
        return;
    }
    
    chatList.forEach(msg => {
        const isSent = msg.sender === state.currentUser;
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
        bubble.innerHTML = `
            <div class="message-content">${escapeHTML(msg.text)}</div>
            <span class="message-meta">${timeStr}</span>
        `;
        elements.chatMessages.appendChild(bubble);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function getLastMessagePreview(username) {
    const list = state.messages[username] || [];
    if (list.length === 0) {
        return { text: 'Secure session open', time: '' };
    }
    const last = list[list.length - 1];
    const timeStr = new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
        text: last.text,
        time: timeStr
    };
}

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Admin Dashboard UI Handlers ---

function openAdminPanel() {
    if (state.role !== 'admin') return;
    elements.adminOverlay.classList.remove('hidden');
    elements.inviteResultContainer.classList.add('hidden');
    elements.inviteNote.value = '';
    
    // Fetch registered users & presence status
    sendWebSocketMessage({ type: 'admin_get_users' });
}

function closeAdminPanel() {
    elements.adminOverlay.classList.add('hidden');
}

function renderAdminUsersList(usersArray) {
    elements.onlineUsersList.innerHTML = '';
    
    if (usersArray.length === 0) {
        elements.onlineUsersList.innerHTML = '<div style="color:var(--text-secondary); text-align:center;">No users registered.</div>';
        return;
    }
    
    usersArray.forEach(user => {
        const row = document.createElement('div');
        row.className = 'user-row';
        
        const nameCol = document.createElement('div');
        nameCol.style.display = 'flex';
        nameCol.style.alignItems = 'center';
        nameCol.style.gap = '8px';
        
        // Status dot for user
        const dot = document.createElement('span');
        dot.className = `status-dot ${user.online ? 'online' : ''}`;
        
        const nameText = document.createElement('span');
        nameText.textContent = user.username;
        if (user.username === state.currentUser) {
            nameText.textContent += ' (You)';
        }
        
        nameCol.appendChild(dot);
        nameCol.appendChild(nameText);
        
        const roleCol = document.createElement('div');
        roleCol.className = `role-badge ${user.role}`;
        roleCol.textContent = user.role;
        
        row.appendChild(nameCol);
        row.appendChild(roleCol);
        elements.onlineUsersList.appendChild(row);
    });
}

function generateInvitation() {
    const note = elements.inviteNote.value.trim();
    sendWebSocketMessage({
        type: 'admin_generate_invite',
        note: note || 'Default invite'
    });
}

function copyInviteLink() {
    elements.inviteLinkOutput.select();
    elements.inviteLinkOutput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(elements.inviteLinkOutput.value);
    showToast('Invite link copied to clipboard!', 'success');
}

// --- Inactivity Auto-Lock Tracker ---
function resetInactivityTimeout() {
    if (!state.currentUser) return; // only track if logged in
    
    if (state.inactivityTimeout) {
        clearTimeout(state.inactivityTimeout);
    }
    
    // 15 minutes session expiry
    state.inactivityTimeout = setTimeout(lockSession, 15 * 60 * 1000);
}

function lockSession() {
    if (!state.currentUser) return;
    console.log('Session locked due to inactivity.');
    elements.logoutBtn.click(); // trigger secure logout routine
    showToast('Session locked due to inactivity. Memory cleared.', 'error');
}

// --- Event Listeners Binding ---

function bindEvents() {
    // Form buttons
    elements.loginSubmitBtn.onclick = startLogin;
    elements.registerSubmitBtn.onclick = submitRegistration;
    elements.bootstrapSubmitBtn.onclick = submitBootstrap;
    
    // Sending message
    elements.sendMsgBtn.onclick = sendChatMessage;
    elements.messageInput.onkeydown = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };
    
    // Admin features
    elements.adminPanelBtn.onclick = openAdminPanel;
    elements.closeAdminBtn.onclick = closeAdminPanel;
    elements.generateInviteBtn.onclick = generateInvitation;
    elements.copyInviteBtn.onclick = copyInviteLink;
    
    // Navigation / Router triggers
    elements.logoutBtn.onclick = () => {
        // Clear inactivity timer
        if (state.inactivityTimeout) {
            clearTimeout(state.inactivityTimeout);
            state.inactivityTimeout = null;
        }
        
        // Zero-out in-memory keys for security
        state.currentUser = null;
        state.role = null;
        state.identityPrivate = null;
        state.signingPrivate = null;
        state.identityPubJwk = null;
        state.signingPubJwk = null;
        state.kEncrypt = null;
        state.authHashHex = null;
        state.contacts = {};
        state.activeChat = null;
        state.messages = {};
        
        elements.logoutBtn.classList.add('hidden');
        elements.adminPanelBtn.classList.add('hidden');
        window.location.hash = '#/login';
        showToast('Logged out securely. Memory cleared.', 'info');
        handleRouting();
    };
    
    // Search bar helper
    elements.searchContacts.oninput = (e) => {
        resetInactivityTimeout();
        const val = e.target.value.toLowerCase();
        const items = elements.chatsList.querySelectorAll('.chat-item');
        items.forEach(item => {
            const name = item.querySelector('.chat-name').textContent.toLowerCase();
            if (name.includes(val)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    };
    
    // Mobile responsive back button
    elements.backToSidebarBtn.onclick = () => {
        resetInactivityTimeout();
        elements.chatSpace.classList.remove('active');
        elements.backToSidebarBtn.style.display = 'none';
        state.activeChat = null;
        // Recheck lists
        sendWebSocketMessage({ type: 'get_contacts' });
    };
    
    // Watch for route/hash changes
    window.onhashchange = handleRouting;
    
    // Support toggleable config for testing other server URL port/IP
    elements.logoSection = document.querySelector('.logo-section');
    elements.logoSection.style.cursor = 'pointer';
    elements.logoSection.title = 'Configure server URL';
    elements.logoSection.onclick = () => {
        const newUrl = prompt('Enter WebSocket Server URL:', state.serverUrl);
        if (newUrl) {
            localStorage.setItem('null_server_url', newUrl);
            state.serverUrl = newUrl;
            showToast(`Server URL updated. Reconnecting...`, 'info');
            connectToBackend();
        }
    };

    // Activity tracking listeners to reset inactivity auto-lock
    window.addEventListener('mousemove', resetInactivityTimeout);
    window.addEventListener('keydown', resetInactivityTimeout);
    window.addEventListener('mousedown', resetInactivityTimeout);
    window.addEventListener('touchstart', resetInactivityTimeout);
}

// Initialize Application
function init() {
    bindEvents();
    handleRouting();
    connectToBackend();
}

window.onload = init;
