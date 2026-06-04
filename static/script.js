// ===== STATE =====
let recognition = null;
let isListening = false;
let lastReply = "";
let messageCount = 0;
let autoTranslateOn = true;

// Multi-turn memory: stores {role, content} for the full conversation
let conversationHistory = [];

// Speech control defaults
let ttsRate = 1.0;
let ttsPitch = 1.0;

const langNames = {
    en: "English", hi: "Hindi", mr: "Marathi", fr: "French",
    es: "Spanish", de: "German", it: "Italian", pt: "Portuguese",
    ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese",
    ar: "Arabic", tr: "Turkish", te: "Telugu"
};

const langBCP = {
    en: "en-US", hi: "hi-IN", mr: "mr-IN", fr: "fr-FR",
    es: "es-ES", de: "de-DE", it: "it-IT", pt: "pt-PT",
    ru: "ru-RU", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN",
    ar: "ar-SA", tr: "tr-TR", te: "te-IN"
};

// ===== AUTOPLAY UNLOCK =====
document.body.addEventListener("click", () => { window.speechSynthesis.resume(); }, { once: true });

// ===== INIT =====
window.addEventListener("DOMContentLoaded", () => {
    onLangChange();
    onTranslateToggle(document.getElementById("autoTranslate"));
    renderHistory();
    initSpeechControls();
});

// ===== LANGUAGE CHANGE =====
function onLangChange() {
    const lang = document.getElementById("language").value;
    document.getElementById("active-lang-label").textContent = langNames[lang] || "English";
}

// ===== TRANSLATE TOGGLE =====
function onTranslateToggle(el) {
    autoTranslateOn = el.checked;
    document.getElementById("translate-status").textContent = autoTranslateOn ? "Translate ON" : "Translate OFF";
}

// ===== THEME =====
function toggleTheme() {
    document.body.classList.toggle("light");
}

// ===== AUTO-RESIZE TEXTAREA =====
function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// ===== KEY HANDLER =====
function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendText();
    }
}

// ===== MIC TOGGLE =====
function toggleMic() {
    if (isListening) stopListening();
    else startListening();
}

function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showStatus("⚠️ Browser doesn't support speech recognition"); return; }

    recognition = new SR();
    const lang = document.getElementById("language").value;
    recognition.lang = langBCP[lang] || "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    isListening = true;
    document.getElementById("micBtn").classList.add("active");
    document.getElementById("voiceVisualizer").classList.add("active");
    document.getElementById("listenLabel").textContent = "Listening...";
    showStatus("🎤 Listening in " + (langNames[lang] || "English") + "…");

    recognition.start();

    recognition.onresult = (event) => {
        let interim = "", final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
        }
        const input = document.getElementById("textInput");
        input.value = final || interim;
        autoResize(input);
        if (final) {
            document.getElementById("listenLabel").textContent = "Got it! Sending…";
            stopListening();
            setTimeout(() => sendText(), 300);
        }
    };

    recognition.onerror = (e) => { showStatus("Mic error: " + e.error); stopListening(); };
    recognition.onend = () => { if (isListening) stopListening(); };
}

function stopListening() {
    isListening = false;
    if (recognition) { try { recognition.stop(); } catch(e) {} recognition = null; }
    document.getElementById("micBtn").classList.remove("active");
    document.getElementById("voiceVisualizer").classList.remove("active");
    hideStatus();
}

// ===== STOP ALL =====
function stopAll() {
    stopListening();
    window.speechSynthesis.cancel();
    hideStatus();
}

// ===== SEND TEXT =====
function sendText() {
    const input = document.getElementById("textInput");
    const text = input.value.trim();
    if (!text) return;

    const welcome = document.querySelector(".welcome-card");
    if (welcome) welcome.remove();

    addUserMessage(text);
    input.value = "";
    autoResize(input);
    sendToServer(text);
}

// ===== API CALL (with history) =====
function sendToServer(message) {
    const lang = document.getElementById("language").value;
    const translate = document.getElementById("autoTranslate").checked;

    addTypingIndicator();
    showStatus("Thinking…");

    fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: message,
            lang: translate ? lang : "en",
            history: conversationHistory   // ← send full history
        })
    })
    .then(res => res.json())
    .then(data => {
        removeTypingIndicator();
        hideStatus();
        const reply = data.reply;

        // Update history AFTER sending (user turn first, then assistant)
        conversationHistory.push({ role: "user", content: message });
        conversationHistory.push({ role: "assistant", content: reply });

        // Keep history from growing unbounded (last 20 turns = 40 messages)
        if (conversationHistory.length > 40) {
            conversationHistory = conversationHistory.slice(conversationHistory.length - 40);
        }

        addBotMessage(reply);
        lastReply = reply;
        speakText(reply, lang);
        saveSessionToStorage();
    })
    .catch(() => {
        removeTypingIndicator();
        hideStatus();
        addBotMessage("⚠️ Connection error. Please check the server.");
    });
}

// ===== UI: USER MESSAGE =====
function addUserMessage(text) {
    messageCount++;
    updateMsgCount();

    const chatBox = document.getElementById("chatBox");
    const row = document.createElement("div");
    row.className = "msg-row user";
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
        <div class="msg-avatar">You</div>
        <div class="msg-content">
            <div class="msg-bubble">${escapeHtml(text)}</div>
            <div class="msg-meta"><span>${now}</span></div>
        </div>`;

    chatBox.appendChild(row);
    scrollBottom();
}

// ===== UI: BOT MESSAGE =====
function addBotMessage(text) {
    messageCount++;
    updateMsgCount();

    const chatBox = document.getElementById("chatBox");
    const row = document.createElement("div");
    row.className = "msg-row bot";
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const lang = document.getElementById("language").value;
    const msgId = "msg-" + Date.now();

    row.innerHTML = `
        <div class="msg-avatar">AI</div>
        <div class="msg-content">
            <div class="msg-bubble" id="${msgId}">${formatBotText(text)}</div>
            <div class="msg-meta">
                <span>${now}</span>
                <div class="msg-actions">
                    <button class="msg-action-btn" onclick="speakOne('${msgId}', '${lang}')" title="Read aloud">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.536 8.464a5 5 0 010 7.072M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        Read
                    </button>
                    <button class="msg-action-btn" onclick="copyMsg('${msgId}')" title="Copy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copy
                    </button>
                </div>
            </div>
        </div>`;

    chatBox.appendChild(row);
    scrollBottom();
}

// ===== UI: TYPING INDICATOR =====
function addTypingIndicator() {
    const chatBox = document.getElementById("chatBox");
    const row = document.createElement("div");
    row.id = "typing-row";
    row.className = "typing-row";
    row.innerHTML = `
        <div class="msg-avatar" style="background:rgba(108,99,255,0.2);border:1px solid rgba(108,99,255,0.3);color:#a99fff;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;">AI</div>
        <div class="typing-bubble">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>`;
    chatBox.appendChild(row);
    scrollBottom();
}

function removeTypingIndicator() {
    const t = document.getElementById("typing-row");
    if (t) t.remove();
}

// ===== STATUS =====
function showStatus(msg) {
    const strip = document.getElementById("statusStrip");
    document.getElementById("status").textContent = msg;
    strip.classList.remove("hidden");
}
function hideStatus() {
    document.getElementById("statusStrip").classList.add("hidden");
}

// ===== SPEECH OUTPUT =====
const ttsFallback = {
    "mr-IN": ["hi-IN", "hi"],
    "te-IN": ["hi-IN", "hi"],
    "ar-SA": ["ar-EG", "ar"],
    "pt-PT": ["pt-BR", "pt"],
};

function speakText(text, lang) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const targetBCP = langBCP[lang] || "en-US";
    utt.rate = ttsRate;
    utt.pitch = ttsPitch;

    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        let match = voices.find(v => v.lang === targetBCP);
        if (!match && ttsFallback[targetBCP]) {
            for (const fb of ttsFallback[targetBCP]) {
                match = voices.find(v => v.lang === fb || v.lang.startsWith(fb));
                if (match) break;
            }
        }
        if (!match) match = voices.find(v => v.lang.startsWith(lang));
        if (!match) match = voices[0];

        utt.voice = match;
        utt.lang = match ? match.lang : targetBCP;
        window.speechSynthesis.speak(utt);

        if (match && match.lang !== targetBCP) {
            showStatus(`🔊 Speaking in ${match.lang} (${langNames[lang]} TTS not available)`);
            setTimeout(hideStatus, 3500);
        }
    };

    if (window.speechSynthesis.getVoices().length) setVoice();
    else window.speechSynthesis.onvoiceschanged = setVoice;
}

function speakLast() {
    if (lastReply) speakText(lastReply, document.getElementById("language").value);
}

function speakOne(msgId, lang) {
    const el = document.getElementById(msgId);
    if (el) speakText(el.textContent, lang);
}

// ===== COPY =====
function copyMsg(msgId) {
    const el = document.getElementById(msgId);
    if (el) navigator.clipboard.writeText(el.textContent).catch(() => {});
}

// ===== CLEAR =====
function clearChat() {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    messageCount = 0;
    updateMsgCount();
    lastReply = "";
    conversationHistory = [];
    window.speechSynthesis.cancel();
    clearSessionFromStorage();
    renderWelcomeCard();
}

// ===== WELCOME CARD =====
function renderWelcomeCard() {
    const chatBox = document.getElementById("chatBox");
    const welcome = document.createElement("div");
    welcome.className = "welcome-card";
    welcome.innerHTML = `
        <div class="welcome-orb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h2>Polyglot AI</h2>
        <p>Your intelligent multilingual voice assistant. Speak or type in any of 15 languages and get instant, natural responses.</p>
        <div class="welcome-features">
            <div class="feature-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>Voice Input</div>
            <div class="feature-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>15 Languages</div>
            <div class="feature-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.536 8.464a5 5 0 010 7.072M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>Text-to-Speech</div>
            <div class="feature-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>GPT-4o Mini</div>
            <div class="feature-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>Multi-turn Memory</div>
        </div>`;
    chatBox.appendChild(welcome);
}

// ===== SPEECH CONTROLS (speed & pitch) =====
function initSpeechControls() {
    const rateSlider = document.getElementById("ttsRate");
    const pitchSlider = document.getElementById("ttsPitch");
    const rateVal = document.getElementById("ttsRateVal");
    const pitchVal = document.getElementById("ttsPitchVal");

    if (!rateSlider) return;

    rateSlider.addEventListener("input", () => {
        ttsRate = parseFloat(rateSlider.value);
        rateVal.textContent = ttsRate.toFixed(1) + "×";
    });

    pitchSlider.addEventListener("input", () => {
        ttsPitch = parseFloat(pitchSlider.value);
        pitchVal.textContent = ttsPitch.toFixed(1);
    });
}

function toggleSpeechPanel() {
    const panel = document.getElementById("speechPanel");
    if (panel) panel.classList.toggle("open");
}

// ===== CHAT HISTORY (localStorage) =====
const HISTORY_KEY = "polyglot_sessions";

function saveSessionToStorage() {
    try {
        const sessions = loadAllSessions();
        const today = new Date().toLocaleDateString();
        const chatBox = document.getElementById("chatBox");
        const messages = [];

        chatBox.querySelectorAll(".msg-row").forEach(row => {
            const isUser = row.classList.contains("user");
            const bubble = row.querySelector(".msg-bubble");
            const time = row.querySelector(".msg-meta span");
            if (bubble) {
                messages.push({
                    role: isUser ? "user" : "assistant",
                    text: bubble.textContent,
                    time: time ? time.textContent : ""
                });
            }
        });

        if (messages.length === 0) return;

        // Find existing session for today or create new
        const existingIdx = sessions.findIndex(s => s.date === today);
        const session = {
            date: today,
            timestamp: Date.now(),
            lang: document.getElementById("language").value,
            messages,
            history: conversationHistory
        };

        if (existingIdx >= 0) sessions[existingIdx] = session;
        else sessions.unshift(session);

        // Keep only last 10 sessions
        const trimmed = sessions.slice(0, 10);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        renderHistory();
    } catch(e) { console.warn("History save failed", e); }
}

function loadAllSessions() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch { return []; }
}

function clearSessionFromStorage() {
    const sessions = loadAllSessions();
    const today = new Date().toLocaleDateString();
    const filtered = sessions.filter(s => s.date !== today);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    renderHistory();
}

function renderHistory() {
    const panel = document.getElementById("historyPanel");
    if (!panel) return;

    const sessions = loadAllSessions();
    if (sessions.length === 0) {
        panel.innerHTML = `<div class="history-empty">No saved sessions yet.<br>Start chatting to save history.</div>`;
        return;
    }

    panel.innerHTML = sessions.map((s, i) => `
        <div class="history-item" onclick="loadSession(${i})">
            <div class="history-item-date">${s.date}</div>
            <div class="history-item-preview">${s.messages.length} messages · ${langNames[s.lang] || s.lang}</div>
        </div>`).join("");
}

function loadSession(index) {
    const sessions = loadAllSessions();
    const session = sessions[index];
    if (!session) return;

    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    messageCount = 0;
    conversationHistory = session.history || [];

    session.messages.forEach(m => {
        messageCount++;
        const row = document.createElement("div");
        row.className = "msg-row " + (m.role === "user" ? "user" : "bot");
        const msgId = "msg-" + Date.now() + Math.random();
        const lang = session.lang || "en";
        row.innerHTML = `
            <div class="msg-avatar">${m.role === "user" ? "You" : "AI"}</div>
            <div class="msg-content">
                <div class="msg-bubble" id="${msgId}">${m.role === "user" ? escapeHtml(m.text) : formatBotText(m.text)}</div>
                <div class="msg-meta">
                    <span>${m.time}</span>
                    ${m.role === "assistant" ? `
                    <div class="msg-actions">
                        <button class="msg-action-btn" onclick="speakOne('${msgId}', '${lang}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.536 8.464a5 5 0 010 7.072"/></svg> Read
                        </button>
                    </div>` : ""}
                </div>
            </div>`;
        chatBox.appendChild(row);
    });

    updateMsgCount();
    scrollBottom();

    // Set language to session lang
    const langSelect = document.getElementById("language");
    if (langSelect) langSelect.value = session.lang;
    onLangChange();

    showStatus(`✅ Loaded session from ${session.date}`);
    setTimeout(hideStatus, 2500);
    toggleHistoryPanel();
}

function toggleHistoryPanel() {
    const panel = document.getElementById("historyDrawer");
    if (panel) panel.classList.toggle("open");
}

// ===== EXPORT CHAT =====
function exportChat(format) {
    const chatBox = document.getElementById("chatBox");
    const rows = chatBox.querySelectorAll(".msg-row");
    if (rows.length === 0) { showStatus("Nothing to export!"); setTimeout(hideStatus, 2000); return; }

    const lines = [];
    const dateStr = new Date().toLocaleString();
    lines.push(`Polyglot AI — Chat Export`);
    lines.push(`Exported: ${dateStr}`);
    lines.push(`Language: ${langNames[document.getElementById("language").value] || "English"}`);
    lines.push("=".repeat(50));
    lines.push("");

    rows.forEach(row => {
        const isUser = row.classList.contains("user");
        const bubble = row.querySelector(".msg-bubble");
        const time = row.querySelector(".msg-meta span");
        if (bubble) {
            const speaker = isUser ? "You" : "Polyglot AI";
            const timeStr = time ? ` [${time.textContent}]` : "";
            lines.push(`${speaker}${timeStr}:`);
            lines.push(bubble.textContent);
            lines.push("");
        }
    });

    const content = lines.join("\n");

    if (format === "txt") {
        const blob = new Blob([content], { type: "text/plain" });
        downloadBlob(blob, "polyglot-chat.txt");
    } else if (format === "pdf") {
        exportAsPDF(lines, dateStr);
    }

    toggleExportMenu();
}

function exportAsPDF(lines, dateStr) {
    // Simple HTML-based PDF export via print dialog
    const langName = langNames[document.getElementById("language").value] || "English";
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Polyglot AI Chat Export</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; color: #111; font-size: 14px; }
  h1 { font-size: 22px; color: #6c63ff; border-bottom: 2px solid #6c63ff; padding-bottom: 8px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .msg { margin: 12px 0; padding: 10px 14px; border-radius: 10px; max-width: 85%; }
  .user { background: #ede9ff; margin-left: auto; text-align: right; }
  .bot { background: #f4f4f8; }
  .speaker { font-weight: 600; font-size: 12px; margin-bottom: 4px; color: #6c63ff; }
  .user .speaker { color: #a855f7; }
  .time { font-size: 11px; color: #999; margin-top: 4px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>Polyglot AI — Chat Export</h1>
<div class="meta">Exported: ${dateStr} &nbsp;|&nbsp; Language: ${langName}</div>
${document.getElementById("chatBox").querySelectorAll(".msg-row") ? Array.from(document.getElementById("chatBox").querySelectorAll(".msg-row")).map(row => {
    const isUser = row.classList.contains("user");
    const bubble = row.querySelector(".msg-bubble");
    const time = row.querySelector(".msg-meta span");
    if (!bubble) return "";
    return `<div class="msg ${isUser ? "user" : "bot"}">
        <div class="speaker">${isUser ? "You" : "Polyglot AI"}</div>
        <div>${escapeHtml(bubble.textContent)}</div>
        ${time ? `<div class="time">${time.textContent}</div>` : ""}
    </div>`;
}).join("") : ""}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
        win.document.write(htmlContent);
        win.document.close();
        setTimeout(() => win.print(), 600);
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function toggleExportMenu() {
    const menu = document.getElementById("exportMenu");
    if (menu) menu.classList.toggle("open");
}

// ===== HELPERS =====
function scrollBottom() {
    const w = document.querySelector(".chat-wrapper");
    if (w) w.scrollTop = w.scrollHeight;
}

function updateMsgCount() {
    document.getElementById("msg-count").textContent = messageCount + (messageCount === 1 ? " message" : " messages");
}

function escapeHtml(t) {
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatBotText(t) {
    return escapeHtml(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
}