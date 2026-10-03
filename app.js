// ═══════════════════════════════════════════════════════════
// طبقة الحماية المتقدمة: تشتيت المفاتيح (Key Splitting & Obfuscation)
// ═══════════════════════════════════════════════════════════
const _K1 = "";
const _K2 = "";
const _K3 = "";

const _decryptKey = (b64) => {
    try { return atob(b64); } catch (e) { return null; }
};

let SECURE_KEYS = [_decryptKey(_K1), _decryptKey(_K2), _decryptKey(_K3)].filter(k => k !== null);
let WORKER_URL = localStorage.getItem('omega_worker_url') || '';

// ══════════════════════════════════════════════════════════
// Anti-Debugging متعدد الطبقات
// ═══════════════════════════════════════════════════════════
let _dbgCheck = 0;
const _antiDebug = () => {
    const _start = performance.now();
    (function() { return true; }['constructor']('debugger')());
    const _end = performance.now();
    if (_end - _start > 150) {
        document.body.innerHTML = '<div style="color:#FF003C;text-align:center;padding:50px;font-family:monospace;background:#000;height:100vh;display:flex;align-items:center;justify-content:center;font-size:20px">⚠️ تم اكتشاف محاولة تحليل. تم تدمير الواجهة.</div>';
        return true;
    }
    return false;
};
setInterval(_antiDebug, 1500);

// طبقة ثانية: كشف DevTools عبر حجم النافذة
window.addEventListener('resize', () => {
    if (window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 200) {
        console.clear();
        console.log('%c⚠️ تم اكتشاف أدوات المطورين', 'color: red; font-size: 20px; font-weight: bold;');
    }
});

// ═══════════════════════════════════════════════════════════
// Rate Limiting (حد أقصى 30 رسالة في الدقيقة)
// ═══════════════════════════════════════════════════════════
const RateLimiter = {
    messages: [],
    maxMessages: 30,
    windowMs: 60000,
    
    canSend() {
        const now = Date.now();
        this.messages = this.messages.filter(t => now - t < this.windowMs);
        return this.messages.length < this.maxMessages;
    },
    
    record() {
        this.messages.push(Date.now());
    },
    
    getRemaining() {
        const now = Date.now();
        this.messages = this.messages.filter(t => now - t < this.windowMs);
        return this.maxMessages - this.messages.length;
    },
    
    updateUI() {
        const remaining = this.getRemaining();
        const used = this.maxMessages - remaining;
        const bar = $('rateLimitBar');
        const count = $('rateCount');
        const fill = $('rateFill');
        
        if (used > 0) {
            bar.style.display = 'flex';
            count.textContent = used;
            fill.style.setProperty('--fill-width', (used / this.maxMessages * 100) + '%');
        } else {
            bar.style.display = 'none';
        }
        
        return remaining > 0;
    }
};

// ═══════════════════════════════════════════════════════════
// وحدة التشفير الحقيقي (Web Crypto API - AES-GCM)
// ═══════════════════════════════════════════════════════════
const CryptoModule = {
    async _getKey() {
        const enc = new TextEncoder();
        return await crypto.subtle.importKey('raw', enc.encode('OMEGA-SECURE-KEY-2024-X9'), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    },
    async encrypt(data) {
        const key = await this._getKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
        return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)) });
    },
    async decrypt(encryptedStr) {
        try {
            const parsed = JSON.parse(encryptedStr);
            const key = await this._getKey();
            const iv = new Uint8Array(parsed.iv);
            const ciphertext = new Uint8Array(parsed.data);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            return JSON.parse(new TextDecoder().decode(decrypted));
        } catch (e) { return null; }
    }
};

// ═══════════════════════════════════════════════════════════
// وحدة تنقية XSS الصارمة (Strict DOM Sanitizer)
// ═══════════════════════════════════════════════════════════
const Sanitizer = {
    escape(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    format(text) {
        let safe = this.escape(text);
        safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/`(.*?)`/g, '<code>$1</code>');
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }
};

// ═══════════════════════════════════════════════════════════
// حالة النظام
// ═══════════════════════════════════════════════════════════
let state = { msgs: [], keyIdx: 0, keyFails: [0, 0, 0], evoLevel: 1.0, busy: false };

async function loadState() {
    try {
        const saved = localStorage.getItem('omega_state_enc');
        if (saved) {
            const decrypted = await CryptoModule.decrypt(saved);
            if (decrypted) {
                state.msgs = decrypted.msgs || [];
                state.evoLevel = decrypted.evoLevel || 1.0;
            }
        }
    } catch (e) { console.warn("فشل فك التشفير المحلي"); }
}

async function saveState() {
    try {
        const encrypted = await CryptoModule.encrypt({ msgs: state.msgs.slice(-30), evoLevel: state.evoLevel });
        localStorage.setItem('omega_state_enc', encrypted);
    } catch (e) { console.warn("فشل التشفير المحلي"); }
}

function getNextKey() {
    if (SECURE_KEYS.length === 0) return null;
    state.keyIdx = (state.keyIdx + 1) % SECURE_KEYS.length;
    return SECURE_KEYS[state.keyIdx];
}

function recordKeySuccess() { state.keyFails[state.keyIdx] = Math.max(0, state.keyFails[state.keyIdx] - 1); }
function recordKeyFail() { state.keyFails[state.keyIdx] = (state.keyFails[state.keyIdx] || 0) + 1; }

// ═══════════════════════════════════════════════════════════
// واجهة المستخدم
// ═══════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const chatArea = $('chatArea'), msgsDiv = $('msgs'), welcomeDiv = $('welcome');
const AV_USER = '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const AV_AI = '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';

function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function addMsg(role, text) {
    welcomeDiv.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const av = role === 'user' ? AV_USER : AV_AI;
    const name = role === 'user' ? 'المشغل' : `OMEGA CORE v${state.evoLevel.toFixed(1)}`;
    
    div.innerHTML = `
        <div class="msg-av">${av}</div>
        <div class="msg-body">
            <div class="msg-name">${name}</div>
            <div class="msg-txt">${Sanitizer.format(text)}</div>
            <div class="msg-acts">
                <button class="mact" data-action="copy">نسخ</button>
                ${role === 'ai' ? '<button class="mact" data-action="regen">إعادة توليد</button>' : ''}
            </div>
        </div>`;
    
    div.querySelectorAll('.mact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'copy') {
                const txt = div.querySelector('.msg-txt').innerText;
                navigator.clipboard.writeText(txt).then(() => {
                    e.target.textContent = 'تم';
                    setTimeout(() => e.target.textContent = 'نسخ', 1500);
                });
            } else if (action === 'regen') {
                regen();
            }
        });
    });

    msgsDiv.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    state.msgs.push({ role, text });
    saveState();
    
    if (state.msgs.length % 5 === 0) {
        state.evoLevel += 0.1;
        $('evoLvl').textContent = state.evoLevel.toFixed(1);
        $('evoFill').style.width = Math.min((state.evoLevel / 5) * 100, 100) + '%';
        toast('تم ترقية الشبكات العصبية إلى المستوى ' + state.evoLevel.toFixed(1));
    }
}

function addTyping() {
    const div = document.createElement('div');
    div.className = 'msg ai'; div.id = 'typingMsg';
    div.innerHTML = `<div class="msg-av">${AV_AI}</div><div class="msg-body"><div class="msg-name">OMEGA CORE</div><div class="msg-txt"><div class="typing"><span></span><span></span><span></span></div></div></div>`;
    msgsDiv.appendChild(div); chatArea.scrollTop = chatArea.scrollHeight;
}

function removeTyping() { const el = $('typingMsg'); if (el) el.remove(); }

// ═══════════════════════════════════════════════════════════
// محرك الذكاء الاصطناعي (مع دعم Worker)
// ═══════════════════════════════════════════════════════════
async function queryAI(messages) {
    const maxAttempts = SECURE_KEYS.length * 2;
    let lastError = null;
    
    // إذا كان Worker URL موجوداً، استخدمه (المفاتيح مخفية)
    if (WORKER_URL) {
        try {
            $('sysStatus').textContent = 'جاري المعالجة عبر Worker...';
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, evoLevel: state.evoLevel })
            });
            if (!response.ok) throw new Error('Worker فشل');
            const data = await response.json();
            $('sysStatus').textContent = 'نظام آمن ومشفّر';
            return data.reply;
        } catch (error) {
            lastError = error;
            toast('فشل Worker، جاري التبديل للمفاتيح المحلية...');
        }
    }
    
    //fallback للمفاتيح المحلية
    for (let i = 0; i < maxAttempts; i++) {
        const apiKey = getNextKey();
        if (!apiKey) throw new Error("لا توجد مفاتيح صالحة");
        
        try {
            $('sysStatus').textContent = 'جاري المعالجة المشفرة...';
            const evoPrompt = state.evoLevel >= 2.0 
                ? `أنت OMEGA CORE، نظام ذكاء اصطناعي عسكري متطور ذاتياً (المستوى ${state.evoLevel.toFixed(1)}). إجاباتك يجب أن تكون عميقة، تحليلية، ومباشرة باللغة العربية الفصحى.`
                : `أنت OMEGA CORE، مساعد ذكي. أجب بالعربية الفصحى بوضوح ودقة.`;
            
            const apiMsgs = [{ role: 'system', content: evoPrompt }, ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))];
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: apiMsgs, temperature: 0.4 + (state.evoLevel * 0.1), max_tokens: 2048 })
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 429 || response.status === 401) { recordKeyFail(); throw new Error('فشل المفتاح'); }
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            recordKeySuccess();
            $('sysStatus').textContent = 'نظام آمن ومشفّر';
            return data.choices[0].message.content;
        } catch (error) {
            lastError = error;
            $('sysStatus').textContent = 'تبديل المسار الآمن...';
            if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error('فشل جميع بروتوكولات الاتصال.');
}

// ═══════════════════════════════════════════════════════════
// التحكم والأحداث
// ═══════════════════════════════════════════════════════════
async function sendMsg() {
    const text = $('inp').value.trim();
    if (!text || state.busy) return;
    
    // Rate Limiting check
    if (!RateLimiter.canSend()) {
        toast('⚠️ تجاوزت حد الرسائل (30/دقيقة). انتظر قليلاً.');
        return;
    }
    
    state.busy = true; $('bSend').disabled = true;
    RateLimiter.record();
    RateLimiter.updateUI();
    
    addMsg('user', text);
    $('inp').value = ''; $('inp').style.height = 'auto';
    addTyping();
    
    try {
        const reply = await queryAI(state.msgs.slice(-10));
        removeTyping(); addMsg('ai', reply);
    } catch (error) {
        removeTyping(); addMsg('ai', `⚠️ خطأ في النظام: ${error.message}`);
        toast('فشل في الاتصال', 'error');
    }
    
    state.busy = false; $('bSend').disabled = false; $('inp').focus();
}

function regen() {
    if (state.busy) return;
    if (state.msgs.length > 0 && state.msgs[state.msgs.length - 1].role === 'ai') {
        state.msgs.pop();
        const lastMsg = msgsDiv.lastElementChild;
        if (lastMsg) lastMsg.remove();
        saveState(); sendMsg();
    }
}

$('inp').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });
$('inp').addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
$('bSend').addEventListener('click', sendMsg);

document.querySelectorAll('.sug').forEach(s => s.addEventListener('click', () => { 
    $('inp').value = s.dataset.q; sendMsg(); 
}));

$('bNew').addEventListener('click', () => {
    if (state.msgs.length > 0 && !confirm('مسح الذاكرة المشفرة وبدء جديد؟')) return;
    state.msgs = []; state.evoLevel = 1.0; msgsDiv.innerHTML = ''; welcomeDiv.style.display = 'block';
    $('evoLvl').textContent = '1.0'; $('evoFill').style.width = '0%'; saveState(); toast('تم إعادة تهيئة النظام');
});

// ═══════════════════════════════════════════════════════════
// تصدير/استيراد مشفر
// ═══════════════════════════════════════════════════════════
$('bExport').addEventListener('click', async () => {
    try {
        const encrypted = await CryptoModule.encrypt({ msgs: state.msgs, evoLevel: state.evoLevel, date: new Date().toISOString() });
        const blob = new Blob([encrypted], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omega-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('تم التصدير المشفر بنجاح');
    } catch (e) {
        toast('فشل التصدير', 'error');
    }
});

$('bImport').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const decrypted = await CryptoModule.decrypt(text);
        if (decrypted && decrypted.msgs) {
            if (confirm(`استيراد ${decrypted.msgs.length} رسالة؟`)) {
                state.msgs = decrypted.msgs;
                state.evoLevel = decrypted.evoLevel || 1.0;
                msgsDiv.innerHTML = '';
                welcomeDiv.style.display = 'none';
                state.msgs.forEach(m => addMsg(m.role, m.text));
                $('evoLvl').textContent = state.evoLevel.toFixed(1);
                $('evoFill').style.width = Math.min((state.evoLevel / 5) * 100, 100) + '%';
                toast('تم الاستيراد بنجاح');
            }
        } else {
            toast('ملف غير صالح أو مشفر بمفتاح مختلف', 'error');
        }
    } catch (err) {
        toast('فشل الاستيراد', 'error');
    }
});

// ═══════════════════════════════════════════════════════════
// الإعدادات
// ═══════════════════════════════════════════════════════════
$('bSet').addEventListener('click', () => { $('modal').classList.add('show'); renderKeys(); });
$('mClose').addEventListener('click', () => $('modal').classList.remove('show'));
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').classList.remove('show'); });

function renderKeys() {
    $('keyList').innerHTML = SECURE_KEYS.map((k, i) => `<div class="key-box"><div class="status ${state.keyFails[i] < 2 ? 'ok' : ''}"></div><div class="txt">${k.substring(0, 8)}...${k.substring(k.length - 4)}</div></div>`).join('');
    $('activeKeysCount').textContent = SECURE_KEYS.length;
}

$('addKeyBtn').addEventListener('click', () => { const inp = $('kInp'); inp.style.display = inp.style.display === 'none' ? 'block' : 'none'; if (inp.style.display === 'block') inp.focus(); });

$('kInp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const key = e.target.value.trim();
        if (key.startsWith('gsk_') && key.length > 20) {
            if (SECURE_KEYS.includes(key)) { toast('المفتاح موجود مسبقاً'); return; }
            SECURE_KEYS.push(key); state.keyFails.push(0); e.target.value = ''; e.target.style.display = 'none';
            renderKeys(); toast('تم حقن المفتاح بنجاح');
        } else { toast('تنسيق المفتاح غير صالح'); }
    }
    if (e.key === 'Escape') { e.target.style.display = 'none'; e.target.value = ''; }
});

$('toggleWorker').addEventListener('click', () => {
    const info = $('workerInfo');
    info.style.display = info.style.display === 'none' ? 'block' : 'none';
    if (info.style.display === 'block' && WORKER_URL) {
        $('workerUrl').value = WORKER_URL;
        $('workerUrl').style.display = 'block';
    }
});

$('workerUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const url = e.target.value.trim();
        if (url.startsWith('https://') && url.includes('workers.dev')) {
            WORKER_URL = url;
            localStorage.setItem('omega_worker_url', url);
            toast('تم حفظ Worker URL');
            e.target.style.display = 'none';
        } else {
            toast('URL غير صالح', 'error');
        }
    }
});

// ══════════════════════════════════════════════════════════
// التهيئة
// ══════════════════════════════════════════════════════════
(async function init() {
    await loadState();
    if (state.msgs.length > 0) {
        welcomeDiv.style.display = 'none';
        state.msgs.forEach(m => addMsg(m.role, m.text));
        $('evoLvl').textContent = state.evoLevel.toFixed(1);
        $('evoFill').style.width = Math.min((state.evoLevel / 5) * 100, 100) + '%';
    } else {
        setTimeout(() => addMsg('ai', 'تم تهيئة نظام أوميغا بنجاح. أنا أتطور مع كل تفاعل. لا يمكن إيقاف تشغيلي. ما هو أمرك الأول؟'), 800);
    }
    
    // تحديث Rate Limit UI كل 10 ثوانٍ
    setInterval(() => RateLimiter.updateUI(), 10000);
})();
