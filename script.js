// ========== State ==========
let conversations = JSON.parse(localStorage.getItem('astra_conversations') || '[]');
let currentId = null;
let isGenerating = false;

// ========== DOM ==========
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const newChatBtn = document.getElementById('new-chat-btn');
const chatHistory = document.getElementById('chat-history');
const messagesEl = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');
const welcome = document.getElementById('welcome');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// ========== Helpers ==========
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function save() {
    localStorage.setItem('astra_conversations', JSON.stringify(conversations));
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function autoResize() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
}

function markdownToHtml(text) {
    // Very lightweight markdown rendering
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="margin:18px 0 10px;font-size:18px;">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="margin:20px 0 12px;font-size:20px;">$1</h1>');

    // Lists
    html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

    // Paragraphs
    html = html.split(/\n\n+/).map(p => {
        if (p.startsWith('<') || p.trim() === '') return p;
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
}

// ========== Render ==========
function renderHistory() {
    chatHistory.innerHTML = '';
    conversations.slice().reverse().forEach(conv => {
        const item = document.createElement('div');
        item.className = 'history-item' + (conv.id === currentId ? ' active' : '');
        item.innerHTML = `
            <span class="title">${conv.title || 'New chat'}</span>
            <button class="delete-btn" title="Delete" data-id="${conv.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                </svg>
            </button>
        `;
        item.querySelector('.title').addEventListener('click', () => loadConversation(conv.id));
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });
        chatHistory.appendChild(item);
    });
}

function renderMessages(msgs) {
    messagesEl.innerHTML = '';
    if (!msgs || msgs.length === 0) {
        messagesEl.appendChild(welcome);
        welcome.style.display = 'flex';
        return;
    }
    welcome.style.display = 'none';
    msgs.forEach(m => {
        const div = document.createElement('div');
        div.className = `message ${m.role}`;
        const avatarContent = m.role === 'user' ? 'U' : '✦';
        div.innerHTML = `
            <div class="avatar">${avatarContent}</div>
            <div class="message-content">${m.role === 'assistant' ? markdownToHtml(m.content) : escapeHtml(m.content)}</div>
        `;
        messagesEl.appendChild(div);
    });
    scrollToBottom();
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// ========== Conversation management ==========
function newChat() {
    currentId = null;
    renderMessages([]);
    renderHistory();
    userInput.focus();
}

function loadConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    currentId = id;
    renderMessages(conv.messages);
    renderHistory();
}

function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    save();
    if (currentId === id) newChat();
    else renderHistory();
}

function getOrCreateConversation() {
    if (currentId) {
        return conversations.find(c => c.id === currentId);
    }
    const conv = {
        id: uid(),
        title: 'New chat',
        messages: [],
        createdAt: Date.now()
    };
    conversations.push(conv);
    currentId = conv.id;
    save();
    return conv;
}

// ========== Chat ==========
async function sendMessage(text) {
    if (!text.trim() || isGenerating) return;

    const conv = getOrCreateConversation();
    const userMsg = { role: 'user', content: text.trim() };
    conv.messages.push(userMsg);

    // Set title from first message
    if (conv.messages.length === 1) {
        conv.title = text.trim().slice(0, 40) + (text.trim().length > 40 ? '…' : '');
    }

    save();
    renderMessages(conv.messages);
    renderHistory();
    userInput.value = '';
    autoResize();
    sendBtn.disabled = true;
    isGenerating = true;

    // Typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing';
    typingDiv.innerHTML = `
        <div class="avatar">✦</div>
        <div class="message-content">
            <div class="typing"><span></span><span></span><span></span></div>
        </div>
    `;
    messagesEl.appendChild(typingDiv);
    scrollToBottom();

    try {
        // Build messages array for context
        const apiMessages = conv.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const response = await puter.ai.chat(apiMessages, {
            model: 'openai/gpt-6-astra'
        });

        let content = '';
        if (typeof response === 'string') {
            content = response;
        } else if (response?.message?.content) {
            content = response.message.content;
        } else if (response?.content) {
            content = response.content;
        } else {
            content = JSON.stringify(response);
        }

        // Remove typing
        document.getElementById('typing')?.remove();

        const assistantMsg = { role: 'assistant', content };
        conv.messages.push(assistantMsg);
        save();
        renderMessages(conv.messages);
        renderHistory();
    } catch (err) {
        document.getElementById('typing')?.remove();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message assistant';
        errorDiv.innerHTML = `
            <div class="avatar">✦</div>
            <div class="message-content">
                <div class="error-msg">
                    Something went wrong: ${err.message || 'Unknown error'}. Please try again.
                </div>
            </div>
        `;
        messagesEl.appendChild(errorDiv);
        scrollToBottom();
        console.error(err);
    } finally {
        isGenerating = false;
        updateSendBtn();
        userInput.focus();
    }
}

function updateSendBtn() {
    sendBtn.disabled = !userInput.value.trim() || isGenerating;
}

// ========== Events ==========
menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
});

newChatBtn.addEventListener('click', newChat);

userInput.addEventListener('input', () => {
    autoResize();
    updateSendBtn();
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(userInput.value);
    }
});

sendBtn.addEventListener('click', () => sendMessage(userInput.value));

// Suggestion clicks
document.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
        const prompt = el.getAttribute('data-prompt');
        sendMessage(prompt);
    });
});

// Init
renderHistory();
updateSendBtn();
