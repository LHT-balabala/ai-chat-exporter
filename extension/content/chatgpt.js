
(function() {
    'use strict';

    function _getMessage(key) {
        const msgs = {
            'exportButtonText': '导出对话',
            'exportAsJSON': '导出为 JSON',
            'exportAsMarkdown': '导出为 Markdown',
            'exportAsText': '导出为纯文本',
            'exportAsHTML': '导出为 HTML',
            'exportingProcessing': '处理中…',
            'exportingLoading': '正在准备导出…',
            'exportingScrolling': '正在加载所有消息…',
            'noMessagesFound': '没有找到聊天消息',
            'exportError': '导出时发生错误',
            'exportFailed': '导出失败',
            'filterSectionTitle': '导出内容筛选',
            'includeUserQuestions': '保留用户问题',
            'includeThinkingProcess': '保留思考过程',
            'onlyReplyContent': '只保留回复信息'
        };
        return msgs[key] || key;
    }

    const SETTINGS_DEFAULTS = {
        includeUserQuestions: true,
        includeThinkingProcess: true,
        onlyReplyContent: false
    };

    // ---- ChatGPT helpers ----
    function getChatGPTTitle() {
        // Try the page title first (ChatGPT includes conversation title)
        const title = document.title || '';
        const cleaned = title.replace(' - ChatGPT', '').replace('ChatGPT - ', '').replace('ChatGPT', '').trim();
        if (cleaned && cleaned !== 'ChatGPT') return cleaned;

        // Try sidebar active item
        const sidebarActive = document.querySelector('nav .bg-token-sidebar-surface-secondary, nav [class*="active"]');
        if (sidebarActive) {
            const text = sidebarActive.textContent.trim();
            if (text && text.length < 100) return text;
        }

        return 'ChatGPT Chat';
    }

    function getChatGPTId() {
        try {
            const url = window.location.href;
            const m = url.match(/\/c\/([a-zA-Z0-9_-]+)/);
            if (m) return m[1];
            const m2 = url.match(/\/([a-f0-9-]{36})/i);
            if (m2) return m2[1];
            return '';
        } catch(e) { return ''; }
    }

    // ---- Image popup ----
    function showImagePopup(title, imgSrc) {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(3px)";
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;border-radius:16px;padding:0;max-width:92vw;max-height:92vh;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.25);position:relative;text-align:center";
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.style.cssText = "position:absolute;top:8px;right:12px;border:none;background:rgba(0,0,0,0.5);color:#fff;width:28px;height:28px;border-radius:14px;font-size:16px;cursor:pointer;z-index:10";
        closeBtn.onclick = function() { overlay.remove(); };
        box.appendChild(closeBtn);
        const img = document.createElement("img");
        img.src = imgSrc;
        img.style.cssText = "display:block;max-width:100%;max-height:85vh;width:auto;height:auto";
        box.appendChild(img);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function showDonatePopup() {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(3px)";
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.25);max-width:360px;position:relative";
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.style.cssText = "position:absolute;top:8px;right:12px;border:none;background:rgba(0,0,0,0.5);color:#fff;width:28px;height:28px;border-radius:14px;font-size:16px;cursor:pointer";
        closeBtn.onclick = function() { overlay.remove(); };
        box.appendChild(closeBtn);
        const title = document.createElement("h3");
        title.textContent = "赞赏支持";
        title.style.cssText = "margin:0 0 8px;font-size:18px;color:#333";
        const desc = document.createElement("p");
        desc.textContent = "如果这个工具对你有帮助，欢迎扫码赞赏";
        desc.style.cssText = "margin:0 0 16px;font-size:13px;color:#666";
        box.appendChild(title);
        box.appendChild(desc);
        const img = document.createElement("img");
        img.src = "https://raw.githubusercontent.com/LHT-balabala/ai-chat-exporter/main/assets/donate-qr.png";
        img.style.cssText = "display:block;max-width:260px;width:100%;height:auto;margin:0 auto;border-radius:8px";
        box.appendChild(img);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // ---- Message parsing ----
    function extractMarkdownFromElement(el) {
        // ChatGPT renders messages as markdown converted to HTML
        // Try to reconstruct markdown from the DOM
        if (!el) return '';

        // Check for code blocks
        const codeBlocks = el.querySelectorAll('pre');
        codeBlocks.forEach(pre => {
            const code = pre.querySelector('code');
            if (code) {
                const lang = code.className.replace('language-', '').replace('!', '');
                const langTag = lang ? lang + '\n' : '';
                pre.setAttribute('data-raw-code', langTag + code.textContent);
            }
        });

        // Get the raw text but preserve structure
        let text = '';
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();

            // Skip copy buttons, etc.
            if (node.classList.contains('copy-btn') || node.classList.contains('flex') && node.textContent.trim() === 'Copy code') {
                return;
            }

            if (tag === 'pre' && node.getAttribute('data-raw-code')) {
                text += '\n```' + node.getAttribute('data-raw-code') + '\n```\n';
                return;
            }
            if (tag === 'code' && node.closest('pre')) {
                // Code inside pre is handled by pre
                return;
            }
            if (tag === 'code') {
                text += '`' + node.textContent + '`';
                return;
            }
            if (tag === 'strong' || tag === 'b') {
                text += '**';
                Array.from(node.childNodes).forEach(walk);
                text += '**';
                return;
            }
            if (tag === 'em' || tag === 'i') {
                text += '*';
                Array.from(node.childNodes).forEach(walk);
                text += '*';
                return;
            }
            if (tag === 'a') {
                const href = node.getAttribute('href') || '';
                text += '[';
                Array.from(node.childNodes).forEach(walk);
                text += '](' + href + ')';
                return;
            }
            if (tag === 'h1') { text += '\n# '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'h2') { text += '\n## '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'h3') { text += '\n### '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'h4') { text += '\n#### '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'ul' || tag === 'ol') { text += '\n'; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'li') { text += '- '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'p') { text += '\n'; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'br') { text += '\n'; return; }
            if (tag === 'blockquote') { text += '\n> '; Array.from(node.childNodes).forEach(walk); text += '\n'; return; }
            if (tag === 'hr') { text += '\n---\n'; return; }
            if (tag === 'table') {
                text += '\n';
                const rows = node.querySelectorAll('tr');
                rows.forEach((row, ri) => {
                    const cells = row.querySelectorAll('td, th');
                    text += '| ' + Array.from(cells).map(c => c.textContent.trim()).join(' | ') + ' |\n';
                    if (ri === 0) text += '| ' + Array.from(cells).map(() => '---').join(' | ') + ' |\n';
                });
                text += '\n';
                return;
            }
            if (tag === 'img') {
                const alt = node.getAttribute('alt') || '';
                const src = node.getAttribute('src') || '';
                text += '![' + alt + '](' + src + ')';
                return;
            }

            Array.from(node.childNodes).forEach(walk);
        };
        walk(el);
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function extractChatGPTMessages() {
        const messages = [];

        // ChatGPT uses data-message-author-role attribute
        const msgElements = document.querySelectorAll('[data-message-author-role]');

        if (msgElements.length > 0) {
            msgElements.forEach(el => {
                const role = el.getAttribute('data-message-author-role');
                // Skip system messages
                if (role === 'system') return;

                // Get the markdown content div
                const markdownDiv = el.querySelector('.markdown');
                let content = '';
                if (markdownDiv) {
                    content = extractMarkdownFromElement(markdownDiv);
                } else {
                    // Fallback: get text content from the message body
                    const body = el.querySelector('[data-message-content-role]') || el;
                    content = body.textContent.trim();
                }

                if (content && content.trim()) {
                    messages.push({
                        role: role === 'user' ? 'user' : 'assistant',
                        content: content.trim()
                    });
                }
            });
            return messages;
        }

        // Fallback strategy for older ChatGPT UI or DOM changes
        const mainContent = document.querySelector('main') || document.body;
        const articleElements = mainContent.querySelectorAll('article');
        if (articleElements.length > 0) {
            articleElements.forEach((article, index) => {
                const role = index % 2 === 0 ? 'user' : 'assistant';
                const markdown = article.querySelector('.markdown, .prose, [class*="text-message"]');
                const content = markdown ? markdown.textContent.trim() : article.textContent.trim();
                if (content) {
                    messages.push({ role: role, content: content });
                }
            });
        }

        return messages;
    }

    // ---- Scroll loading ----
    function getScrollContainer() {
        const main = document.querySelector('main');
        if (main && main.scrollHeight > main.clientHeight) return main;
        const scrollables = Array.from(document.querySelectorAll('div')).filter(el => {
            const style = window.getComputedStyle(el);
            return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10;
        });
        scrollables.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
        return scrollables[0] || document.body;
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
    function getTop(el) { return (el === document.body || el === document.documentElement) ? window.scrollY : el.scrollTop; }
    function getCH(el) { return (el === document.body || el === document.documentElement) ? window.innerHeight : el.clientHeight; }
    function getSH(el) { return (el === document.body || el === document.documentElement) ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) : el.scrollHeight; }
    function setTop(el, v) { if (el === document.body || el === document.documentElement) { window.scrollTo(0, v); return; } el.scrollTop = v; }

    function dedupe(existing, incoming) {
        const sigs = new Set(existing.map(m => m.role + '::' + m.content.substring(0, 100)));
        const result = existing.slice();
        incoming.forEach(m => {
            const sig = m.role + '::' + m.content.substring(0, 100);
            if (!sigs.has(sig)) { result.push(m); sigs.add(sig); }
        });
        return result;
    }

    async function collectAllMessages() {
        const container = getScrollContainer();
        if (!container) return { title: getChatGPTTitle(), messages: extractChatGPTMessages() };

        const origTop = getTop(container);
        const timeoutMs = 60000;
        let messages = [];
        let lastLen = 0;
        let idlePasses = 0;

        let shouldStop = false;
        const stopBtn = document.createElement('div');
        stopBtn.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:1000001;background:#e74c3c;color:#fff;border:none;border-radius:20px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif';
        stopBtn.textContent = '⏹ 停止';
        stopBtn.onclick = function() { shouldStop = true; };
        document.body.appendChild(stopBtn);

        try {
            setTop(container, 0);
            await delay(800);

            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline && !shouldStop) {
                const snap = extractChatGPTMessages();
                messages = dedupe(messages, snap);
                updateOverlay((_getMessage('exportingProcessing') || 'Processing…') + ' ' + messages.length);

                const top = getTop(container);
                const ch = getCH(container);
                const sh = getSH(container);
                const atBottom = top + ch >= sh - 4;

                if (atBottom) {
                    if (messages.length === lastLen) { idlePasses++; } else { idlePasses = 0; lastLen = messages.length; }
                    if (idlePasses >= 10) break;
                }

                setTop(container, Math.min(sh - ch, top + ch * 0.8));
                await delay(700);
            }

            if (stopBtn.parentNode) stopBtn.remove();
            if (messages.length === 0) messages = extractChatGPTMessages();
            return { title: getChatGPTTitle(), messages };
        } finally {
            try { setTop(container, origTop); } catch(e) {}
            try { if (stopBtn.parentNode) stopBtn.remove(); } catch(e) {}
        }
    }

    // ---- Overlay ----
    function showExportingOverlay(msg) {
        if (document.getElementById('gpt-export-loading')) return;
        const overlay = document.createElement('div');
        overlay.id = 'gpt-export-loading';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px)';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:14px;padding:28px 36px;display:flex;flex-direction:column;align-items:center;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:220px';
        const spin = document.createElement('div');
        spin.style.cssText = 'width:36px;height:36px;border:3px solid #e0e0e0;border-top-color:#10a37f;border-radius:50%;animation:gpt-spin 0.8s linear infinite';
        const txt = document.createElement('div');
        txt.id = 'gpt-export-loading-text';
        txt.style.cssText = 'font-size:14px;font-family:-apple-system,sans-serif;color:#333';
        txt.textContent = msg || 'Preparing export…';
        if (!document.getElementById('gpt-spin-style')) {
            const s = document.createElement('style');
            s.id = 'gpt-spin-style';
            s.textContent = '@keyframes gpt-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
        box.appendChild(spin); box.appendChild(txt);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }
    function updateOverlay(msg) { const e = document.getElementById('gpt-export-loading-text'); if (e) e.textContent = msg; }
    function hideOverlay() { const e = document.getElementById('gpt-export-loading'); if (e) e.remove(); }

    // ---- Settings ----
    function getSettings() {
        return new Promise(resolve => {
            try {
                const raw = localStorage.getItem('gpt_exporter_settings');
                const parsed = raw ? JSON.parse(raw) : {};
                resolve({ ...SETTINGS_DEFAULTS, ...parsed });
            } catch(e) { resolve({ ...SETTINGS_DEFAULTS }); }
        });
    }

    function filterMessages(msgs, settings) {
        if (!Array.isArray(msgs)) return msgs;
        const includeUser = !!(settings && settings.includeUserQuestions);
        const onlyReply = !!(settings && settings.onlyReplyContent);
        if (includeUser && !onlyReply) return msgs;
        let filtered = msgs;
        if (onlyReply) filtered = filtered.filter(m => m.role === 'assistant');
        else if (!includeUser) filtered = filtered.filter(m => m.role !== 'user');
        return filtered;
    }

    function sanitizeFilename(name) {
        return name.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 200);
    }

    // ---- Format converters ----
    function toMarkdown(data) {
        let md = '# ' + (data.title || 'ChatGPT Chat') + '\n\n';
        md += '_' + (data.date || new Date().toISOString()) + '_ | ';
        md += '_' + (data.url || '') + '_\n\n---\n\n';
        data.messages.forEach(msg => {
            if (msg.role === 'user') md += '### 🧑 You\n\n' + msg.content + '\n\n';
            else md += '### 🤖 ChatGPT\n\n' + msg.content + '\n\n';
        });
        return md;
    }

    function toText(data) {
        let txt = '=== ' + (data.title || 'ChatGPT Chat') + ' ===\n\n';
        data.messages.forEach(msg => {
            txt += (msg.role === 'user' ? '[You]' : '[ChatGPT]') + '\n' + msg.content + '\n\n---\n\n';
        });
        return txt;
    }

    function toHTML(data) {
        let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (data.title||'ChatGPT Chat') + '</title>';
        html += '<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#fafafa;color:#333}.user{background:#fff;border-left:4px solid #10a37f;padding:12px 16px;margin:12px 0;border-radius:0 8px 8px 0}.assistant{background:#fff;border-left:4px solid #6366f1;padding:12px 16px;margin:12px 0;border-radius:0 8px 8px 0}.role{font-weight:600;margin-bottom:4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px}pre{background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:6px;overflow-x:auto}</style></head><body>';
        html += '<h1>' + (data.title||'ChatGPT Chat') + '</h1>';
        html += '<p><small>' + data.date + ' | ' + data.url + '</small></p><hr>';
        data.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : 'ChatGPT';
            const cls = msg.role === 'user' ? 'user' : 'assistant';
            html += '<div class="' + cls + '"><div class="role">' + role + '</div><div>' + msg.content.replace(/\n/g,'<br>') + '</div></div>';
        });
        html += '</body></html>';
        return html;
    }

    function download(data, format, settings) {
        try {
            const filtered = filterMessages(data.messages, settings);
            const exportData = { ...data, messages: filtered };
            let blob, filename;
            const safe = sanitizeFilename(data.title || 'ChatGPT Chat');

            if (format === 'markdown') { blob = new Blob([toMarkdown(exportData)], {type:'text/markdown;charset=utf-8'}); filename = safe+'.md'; }
            else if (format === 'text') { blob = new Blob([toText(exportData)], {type:'text/plain;charset=utf-8'}); filename = safe+'.txt'; }
            else if (format === 'html') { blob = new Blob([toHTML(exportData)], {type:'text/html;charset=utf-8'}); filename = safe+'.html'; }
            else { blob = new Blob([JSON.stringify(exportData,null,2)], {type:'application/json;charset=utf-8'}); filename = safe+'.json'; }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 50);
            const btn = document.getElementById('gpt-export-btn');
            if (btn) { btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 300); }
        } catch(e) { alert('导出失败: ' + (e.message || e)); }
    }

    async function exportChat(format) {
        showExportingOverlay(_getMessage('exportingScrolling') || 'Loading messages…');
        try {
            const settings = await getSettings();
            const result = await collectAllMessages();
            hideOverlay();
            if (!Array.isArray(result.messages) || result.messages.length === 0) {
                alert(_getMessage('noMessagesFound'));
                return;
            }
            download({ title: result.title||getChatGPTTitle(), url: window.location.href, date: new Date().toISOString(), messages: result.messages }, format, settings);
        } catch(e) { hideOverlay(); alert('导出失败: ' + (e.message || e)); }
    }

    // ---- UI ----
    function injectButton() {
        if (document.getElementById('gpt-export-btn')) return;

        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:8px;right:180px;z-index:999999';

        const btn = document.createElement('button');
        btn.id = 'gpt-export-btn';
        btn.style.cssText = 'background:transparent;color:#333;border:1.5px solid rgba(0,0,0,0.12);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:500;cursor:pointer;opacity:0.75;transition:all 0.2s;font-family:-apple-system,sans-serif;display:flex;align-items:center;gap:6px;backdrop-filter:blur(6px)';
        btn.innerHTML = '<span>导出对话</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 15.5L7 10.5L8.41 9.09L12 12.67L15.59 9.09L17 10.5L12 15.5Z" fill="currentColor"/></svg>';
        btn.onmouseenter = function() { this.style.opacity='1'; this.style.background='rgba(0,0,0,0.06)'; };
        btn.onmouseleave = function() { this.style.opacity='0.75'; this.style.background='transparent'; };

        const dropdown = document.createElement('div');
        dropdown.id = 'gpt-export-dropdown';
        dropdown.style.cssText = 'display:none;position:absolute;top:100%;right:0;margin-top:4px;background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);border-radius:8px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.1);overflow:hidden;width:220px;z-index:999999';

        function opt(icon, text, cb) {
            const d = document.createElement('div');
            d.style.cssText = 'padding:10px 15px;font-size:14px;color:#333;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:-apple-system,sans-serif;transition:background 0.15s';
            d.innerHTML = '<span style="font-size:16px">'+icon+'</span><span>'+text+'</span>';
            d.onmouseenter = function() { this.style.background='rgba(0,0,0,0.05)'; };
            d.onmouseleave = function() { this.style.background='transparent'; };
            d.onclick = function(e) { e.stopPropagation(); dropdown.style.display='none'; cb(); };
            return d;
        }

        dropdown.appendChild(opt('📄', _getMessage('exportAsJSON'), () => exportChat('json')));
        dropdown.appendChild(opt('📝', _getMessage('exportAsMarkdown'), () => exportChat('markdown')));
        dropdown.appendChild(opt('📃', _getMessage('exportAsText'), () => exportChat('text')));
        dropdown.appendChild(opt('🌐', _getMessage('exportAsHTML'), () => exportChat('html')));

        const sep = document.createElement('div'); sep.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
        dropdown.appendChild(sep);

        const hdr = document.createElement('div');
        hdr.style.cssText = 'padding:6px 15px 2px;font-size:11px;color:#888;font-weight:600';
        hdr.textContent = _getMessage('filterSectionTitle');
        dropdown.appendChild(hdr);

        function chkbox(labelKey, settingKey) {
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 15px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;font-family:-apple-system,sans-serif';
            const box = document.createElement('span');
            box.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:2px solid #999;border-radius:3px;flex-shrink:0;font-size:12px';
            const label = document.createElement('span'); label.textContent = _getMessage(labelKey);

            function getVal() { try { const r = localStorage.getItem('gpt_exporter_settings'); const p = r?JSON.parse(r):{}; return p[settingKey]!==undefined?p[settingKey]:SETTINGS_DEFAULTS[settingKey]; } catch(e) { return SETTINGS_DEFAULTS[settingKey]; } }
            function setVal(v) { try { const r = localStorage.getItem('gpt_exporter_settings'); const s = r?JSON.parse(r):{}; s[settingKey]=v; localStorage.setItem('gpt_exporter_settings',JSON.stringify(s)); } catch(e) {} }
            function getOnlyReply() { try { const r = localStorage.getItem('gpt_exporter_settings'); return r?(JSON.parse(r)||{}).onlyReplyContent===true:false; } catch(e) { return false; } }
            function ui() {
                const v = getVal(); const or = getOnlyReply();
                if (v) { box.textContent='✓'; box.style.background='#10a37f'; box.style.borderColor='#10a37f'; box.style.color='#fff'; }
                else { box.textContent=''; box.style.background='transparent'; box.style.borderColor='#999'; }
                if (settingKey!=='onlyReplyContent' && or) { row.style.opacity='0.45'; row.style.pointerEvents='none'; }
                else { row.style.opacity='1'; row.style.pointerEvents='auto'; }
            }
            ui();
            row.onclick = function(e) {
                e.stopPropagation();
                const cur = getVal(); setVal(!cur);
                if (settingKey==='onlyReplyContent') {
                    ['includeUserQuestions','includeThinkingProcess'].forEach(k => {
                        try { const r = JSON.parse(localStorage.getItem('gpt_exporter_settings')||'{}'); r[k]=cur; localStorage.setItem('gpt_exporter_settings',JSON.stringify(r)); } catch(e) {}
                    });
                }
                row.parentElement.querySelectorAll('[data-fr]').forEach(r => r._ui && r._ui());
            };
            row._ui = ui; row.setAttribute('data-fr','1');
            row.appendChild(box); row.appendChild(label);
            return row;
        }

        dropdown.appendChild(chkbox('includeUserQuestions','includeUserQuestions'));
        dropdown.appendChild(chkbox('includeThinkingProcess','includeThinkingProcess'));
        dropdown.appendChild(chkbox('onlyReplyContent','onlyReplyContent'));

        const sep2 = document.createElement('div'); sep2.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
        dropdown.appendChild(sep2);
        dropdown.appendChild(opt('💬','反馈建议', () => window.open('https://github.com/LHT-balabala/ai-chat-exporter/issues','_blank')));
        dropdown.appendChild(opt('💰','赞赏支持', () => showDonatePopup()));

        btn.onclick = function(e) {
            e.stopPropagation();
            const vis = dropdown.style.display==='block';
            dropdown.style.display = vis?'none':'block';
            btn.querySelector('svg').style.transform = vis?'rotate(0)':'rotate(180deg)';
        };
        dropdown.onclick = function(e) { e.stopPropagation(); };
        document.addEventListener('click', () => { dropdown.style.display='none'; btn.querySelector('svg').style.transform='rotate(0)'; });

        container.appendChild(btn); container.appendChild(dropdown);
        document.body.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}} .pulse{animation:pulse 0.5s ease-in-out}
            @media(prefers-color-scheme:dark){
                #gpt-export-btn{color:#ddd;border-color:rgba(255,255,255,0.15)}
                #gpt-export-btn:hover{background:rgba(255,255,255,0.08)}
                #gpt-export-dropdown{background:rgba(30,30,40,0.92);border-color:rgba(255,255,255,0.1)}
                #gpt-export-dropdown>div{color:#ddd}
                #gpt-export-dropdown>div:hover{background:rgba(255,255,255,0.06)}
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        if (!/chatgpt\.com|chat\.openai\.com/.test(window.location.hostname)) return;
        try { injectButton(); } catch(e) { console.error('Error:', e); }
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
    else init();
})();
