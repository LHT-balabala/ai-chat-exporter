
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

    // ---- Claude Chat ID extraction ----
    function getClaudeChatId() {
        try {
            const url = window.location.href;
            const m = url.match(/\/chat\/([a-zA-Z0-9_-]+)/);
            if (m) return m[1];
            const m2 = url.match(/\/project\/[^/]+\/chat\/([a-zA-Z0-9_-]+)/);
            if (m2) return m2[1];
            return '';
        } catch(e) { return ''; }
    }

    function getClaudeConversationTitle() {
        // Try to find the conversation title in the sidebar or header
        const titleEl = document.querySelector('[data-testid="chat-header-title"]');
        if (titleEl) return titleEl.textContent.trim();
        const sidebarTitle = document.querySelector('[data-testid="conversation-title"]');
        if (sidebarTitle) return sidebarTitle.textContent.trim();
        // Fallback: any h1 or prominent text
        const h1 = document.querySelector('h1');
        if (h1) return h1.textContent.trim();
        return getClaudeChatId() || 'Claude Chat';
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

    // ---- Message extraction ----
    function extractClaudeMessages() {
        const messages = [];

        // Claude uses specific data attributes and structure
        // Try multiple selector strategies to find messages

        // Strategy 1: data-testid attributes
        const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
        const assistantMsgs = document.querySelectorAll('[data-testid="assistant-message"]');

        // Strategy 2: font- classes (Claude's internal class naming)
        const allMsgElements = document.querySelectorAll('.font-user-message, .font-claude-message, [class*="message"]');

        // Strategy 3: role-based approach - look for structured message pairs
        if (userMsgs.length > 0 || assistantMsgs.length > 0) {
            // Collect all messages in order by DOM position
            const allNodes = [];
            document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]').forEach(el => {
                allNodes.push(el);
            });

            allNodes.forEach(el => {
                const isUser = el.getAttribute('data-testid') === 'user-message';
                const content = extractMessageContent(el);
                if (content && content.trim()) {
                    messages.push({
                        role: isUser ? 'user' : 'assistant',
                        content: content.trim()
                    });
                }
            });
            return messages;
        }

        // Strategy 4: Claude's React-based structure
        // Look for the main chat content area and parse its children
        const chatContainer = document.querySelector('[data-testid="chat-view"]') ||
                              document.querySelector('.chat-view') ||
                              document.querySelector('main') ||
                              document.querySelector('[class*="chat"]');

        if (chatContainer) {
            // Try to find message blocks by looking for role indicators
            const proseBlocks = chatContainer.querySelectorAll('.prose, [class*="prose"]');
            proseBlocks.forEach(block => {
                const parent = block.closest('[class*="group"]') || block.parentElement;
                if (!parent) return;

                // Determine role by checking for user-specific classes
                const isUserBlock = parent.querySelector('[data-testid="user-message"]') !== null ||
                                    parent.classList.contains('font-user-message') ||
                                    parent.innerHTML.includes('user-message');

                const content = block.textContent.trim();
                if (content) {
                    messages.push({
                        role: isUserBlock ? 'user' : 'assistant',
                        content: content
                    });
                }
            });
        }

        // Strategy 5: Generic fallback
        if (messages.length === 0) {
            const mainArea = document.querySelector('main');
            if (mainArea) {
                const textBlocks = mainArea.querySelectorAll('p, div[class*="text"], div[class*="content"]');
                let currentRole = 'user';
                textBlocks.forEach(block => {
                    const text = block.textContent.trim();
                    if (text.length > 1 && !text.match(/^(Send|Copy|Retry|Edit|Thumbs)/)) {
                        messages.push({ role: currentRole, content: text });
                        currentRole = currentRole === 'user' ? 'assistant' : 'user';
                    }
                });
            }
        }

        return messages;
    }

    function extractMessageContent(el) {
        // For Claude, the actual content is usually in a prose div
        const prose = el.querySelector('.prose');
        if (prose) return prose.textContent.trim();

        // Check for markdown content
        const mdContent = el.querySelector('[class*="markdown"]');
        if (mdContent) return mdContent.textContent.trim();

        // Fallback to full text content
        return el.textContent.trim();
    }

    function extractClaudeMessagesWithDOM() {
        const messages = [];
        const mainArea = document.querySelector('main');
        if (!mainArea) return messages;

        // Claude's message groups - each group typically has a role
        const groups = mainArea.querySelectorAll('[class*="group"], [data-testid$="-message"]');
        if (groups.length > 0) {
            groups.forEach(group => {
                const isUser = group.getAttribute('data-testid') === 'user-message' ||
                               group.querySelector('[data-testid="user-message"]') !== null;
                const prose = group.querySelector('.prose, [class*="markdown"], [class*="text-content"]');
                const content = prose ? prose.textContent.trim() : group.textContent.trim();

                // Skip control buttons text
                if (content && content.length > 2 && !/^(Copy|Retry|Edit|Like|Dislike)$/i.test(content)) {
                    messages.push({
                        role: isUser ? 'user' : 'assistant',
                        content: content
                    });
                }
            });
        }

        return messages;
    }

    // ---- Scroll collection ----
    function getChatScrollContainer() {
        const main = document.querySelector('main');
        if (main && main.scrollHeight > main.clientHeight) return main;

        const scrollables = Array.from(document.querySelectorAll('div')).filter(el => {
            const style = window.getComputedStyle(el);
            return (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                   el.scrollHeight > el.clientHeight + 10;
        });
        scrollables.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
        return scrollables[0] || document.body;
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function getScrollTop(el) {
        if (el === document.body || el === document.documentElement) return window.scrollY;
        return el.scrollTop;
    }
    function getClientHeight(el) {
        if (el === document.body || el === document.documentElement) return window.innerHeight;
        return el.clientHeight;
    }
    function getScrollHeight(el) {
        if (el === document.body || el === document.documentElement) return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        return el.scrollHeight;
    }
    function setScrollTop(el, v) {
        if (el === document.body || el === document.documentElement) { window.scrollTo(0, v); return; }
        el.scrollTop = v;
    }

    async function collectAllMessagesFromChat() {
        const container = getChatScrollContainer();
        if (!container) {
            return { title: getClaudeConversationTitle(), messages: extractClaudeMessagesWithDOM() };
        }

        const originalTop = getScrollTop(container);
        const startedAt = Date.now();
        const timeoutMs = 45000;
        let messages = [];
        let messageSignatures = [];

        // Stop button
        let shouldStop = false;
        const stopBtn = document.createElement('div');
        stopBtn.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:1000001;background:#e74c3c;color:#fff;border:none;border-radius:20px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif';
        stopBtn.textContent = '⏹ 停止';
        stopBtn.onclick = function() { shouldStop = true; stopBtn.textContent = '正在停止...'; };
        document.body.appendChild(stopBtn);

        try {
            setScrollTop(container, 0);
            await delay(500);

            let lastLength = 0;
            let idlePasses = 0;

            while (Date.now() - startedAt < timeoutMs && !shouldStop) {
                const snapshot = extractClaudeMessagesWithDOM();
                const snapshotSignatures = snapshot.map(m => m.role + '::' + m.content.substring(0, 80));

                // Merge deduplication
                const existSet = new Set(messageSignatures);
                snapshot.forEach((msg, i) => {
                    if (!existSet.has(snapshotSignatures[i])) {
                        messages.push(msg);
                        messageSignatures.push(snapshotSignatures[i]);
                    }
                });

                updateExportingOverlay((_getMessage('exportingProcessing') || 'Processing…') + ' ' + messages.length);

                const currentTop = getScrollTop(container);
                const clientHeight = getClientHeight(container);
                const scrollHeight = getScrollHeight(container);
                const atBottom = currentTop + clientHeight >= scrollHeight - 4;

                if (atBottom) {
                    if (messages.length === lastLength) {
                        idlePasses++;
                    } else {
                        idlePasses = 0;
                        lastLength = messages.length;
                    }
                    if (idlePasses >= 8) break;
                }

                const step = clientHeight * 0.85;
                const nextTop = Math.min(scrollHeight - clientHeight, currentTop + step);
                setScrollTop(container, nextTop);
                await delay(600);
            }

            if (stopBtn.parentNode) stopBtn.parentNode.removeChild(stopBtn);

            if (messages.length === 0) {
                return { title: getClaudeConversationTitle(), messages: extractClaudeMessagesWithDOM() };
            }

            return { title: getClaudeConversationTitle(), messages };
        } finally {
            try { setScrollTop(container, originalTop); } catch(e) {}
            try { if (stopBtn.parentNode) stopBtn.parentNode.removeChild(stopBtn); } catch(e) {}
        }
    }

    // ---- Export overlay ----
    function showExportingOverlay(message) {
        if (document.getElementById('claude-export-loading')) return;
        const overlay = document.createElement('div');
        overlay.id = 'claude-export-loading';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px)';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:14px;padding:28px 36px;display:flex;flex-direction:column;align-items:center;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:220px';
        const spinner = document.createElement('div');
        spinner.style.cssText = 'width:36px;height:36px;border:3px solid #e0e0e0;border-top-color:#d97706;border-radius:50%;animation:claude-spin 0.8s linear infinite';
        const text = document.createElement('div');
        text.id = 'claude-export-loading-text';
        text.style.cssText = 'font-size:14px;font-family:-apple-system,sans-serif;color:#333;text-align:center';
        text.textContent = message || (_getMessage('exportingLoading') || 'Preparing export…');
        // Add keyframe
        if (!document.getElementById('claude-spin-style')) {
            const s = document.createElement('style');
            s.id = 'claude-spin-style';
            s.textContent = '@keyframes claude-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
        box.appendChild(spinner);
        box.appendChild(text);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function updateExportingOverlay(message) {
        const el = document.getElementById('claude-export-loading-text');
        if (el) el.textContent = message;
    }

    function hideExportingOverlay() {
        const el = document.getElementById('claude-export-loading');
        if (el) el.remove();
    }

    // ---- Settings ----
    function getSettings() {
        return new Promise(resolve => {
            try {
                const raw = localStorage.getItem('claude_exporter_settings');
                const parsed = raw ? JSON.parse(raw) : {};
                resolve({ ...SETTINGS_DEFAULTS, ...parsed });
            } catch(e) {
                resolve({ ...SETTINGS_DEFAULTS });
            }
        });
    }

    // ---- Message filtering ----
    function filterMessages(messages, settings) {
        if (!Array.isArray(messages)) return messages;
        const includeUser = !!(settings && settings.includeUserQuestions);
        const includeThink = !!(settings && settings.includeThinkingProcess);
        const onlyReply = !!(settings && settings.onlyReplyContent);

        if (includeUser && includeThink && !onlyReply) return messages;

        let filtered = messages;
        if (onlyReply) {
            filtered = filtered.filter(m => m.role === 'assistant');
        } else if (!includeUser) {
            filtered = filtered.filter(m => m.role !== 'user');
        }
        // includeThinkingProcess is less relevant for Claude but kept for consistency
        return filtered;
    }

    // ---- File download ----
    function sanitizeFilename(name) {
        return name.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 200);
    }

    function convertToMarkdown(data) {
        let md = '# ' + (data.title || 'Claude Chat') + '\n\n';
        md += '_' + (data.date || new Date().toISOString()) + '_  \n';
        md += '_' + (data.url || '') + '_\n\n---\n\n';

        data.messages.forEach(msg => {
            if (msg.role === 'user') {
                md += '### 🧑 用户\n\n' + msg.content + '\n\n';
            } else {
                md += '### 🤖 Claude\n\n' + msg.content + '\n\n';
            }
        });
        return md;
    }

    function convertToPlainText(data) {
        let txt = '=== ' + (data.title || 'Claude Chat') + ' ===\n\n';
        data.messages.forEach(msg => {
            txt += (msg.role === 'user' ? '[用户]' : '[Claude]') + '\n' + msg.content + '\n\n---\n\n';
        });
        return txt;
    }

    function convertToHTML(data) {
        let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (data.title || 'Claude Chat') + '</title>';
        html += '<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#fafafa;color:#333}.user{background:#fff;border-left:4px solid #d97706;padding:12px 16px;margin:12px 0;border-radius:0 8px 8px 0}.assistant{background:#fff;border-left:4px solid #2563eb;padding:12px 16px;margin:12px 0;border-radius:0 8px 8px 0}.role{font-weight:600;margin-bottom:4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px}pre{background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:6px;overflow-x:auto}</style></head><body>';
        html += '<h1>' + (data.title || 'Claude Chat') + '</h1>';
        html += '<p><small>' + data.date + ' | ' + data.url + '</small></p><hr>';

        data.messages.forEach(msg => {
            const role = msg.role === 'user' ? '用户' : 'Claude';
            const cls = msg.role === 'user' ? 'user' : 'assistant';
            html += '<div class="' + cls + '"><div class="role">' + role + '</div><div>' + msg.content.replace(/\n/g, '<br>') + '</div></div>';
        });
        html += '</body></html>';
        return html;
    }

    function downloadChat(exportData, format, settings) {
        try {
            const filteredMessages = filterMessages(exportData.messages, settings);
            const data = { ...exportData, messages: filteredMessages };
            let blob, filename;
            const safeTitle = sanitizeFilename(data.title || 'Claude Chat');

            if (format === 'markdown') {
                blob = new Blob([convertToMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
                filename = safeTitle + '.md';
            } else if (format === 'text') {
                blob = new Blob([convertToPlainText(data)], { type: 'text/plain;charset=utf-8' });
                filename = safeTitle + '.txt';
            } else if (format === 'html') {
                blob = new Blob([convertToHTML(data)], { type: 'text/html;charset=utf-8' });
                filename = safeTitle + '.html';
            } else {
                blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
                filename = safeTitle + '.json';
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 50);

            const btn = document.getElementById('claude-export-btn');
            if (btn) { btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 300); }
        } catch(error) {
            console.error('Export error:', error);
            alert('导出失败: ' + (error.message || error));
        }
    }

    async function exportChat(format) {
        showExportingOverlay(_getMessage('exportingScrolling') || 'Loading all messages…');
        try {
            const settings = await getSettings();
            const result = await collectAllMessagesFromChat();
            hideExportingOverlay();

            if (!Array.isArray(result.messages) || result.messages.length === 0) {
                alert(_getMessage('noMessagesFound') + ' (未找到消息)');
                return;
            }

            downloadChat({
                title: result.title || getClaudeConversationTitle(),
                url: window.location.href,
                date: new Date().toISOString(),
                messages: result.messages
            }, format, settings);
        } catch(error) {
            hideExportingOverlay();
            console.error('Export error:', error);
            alert('导出失败: ' + (error.message || error));
        }
    }

    // ---- UI Injection ----
    function injectExportButton() {
        if (document.getElementById('claude-export-btn')) return;

        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:8px;right:120px;z-index:999999';

        const exportButton = document.createElement('button');
        exportButton.id = 'claude-export-btn';
        exportButton.style.cssText = 'background:transparent;color:#333;border:1.5px solid rgba(0,0,0,0.12);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:500;cursor:pointer;opacity:0.75;transition:all 0.2s;font-family:-apple-system,sans-serif;display:flex;align-items:center;gap:6px;backdrop-filter:blur(6px)';
        exportButton.innerHTML = '<span>导出对话</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 15.5L7 10.5L8.41 9.09L12 12.67L15.59 9.09L17 10.5L12 15.5Z" fill="currentColor"/></svg>';

        exportButton.onmouseenter = function() { this.style.opacity = '1'; this.style.background = 'rgba(0,0,0,0.06)'; };
        exportButton.onmouseleave = function() { this.style.opacity = '0.75'; this.style.background = 'transparent'; };

        const dropdown = document.createElement('div');
        dropdown.id = 'claude-export-dropdown';
        dropdown.style.cssText = 'display:none;position:absolute;top:100%;right:0;margin-top:4px;background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);border-radius:8px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.1);overflow:hidden;width:220px;z-index:999999';

        function createOption(icon, text, onClick) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:10px 15px;font-size:14px;color:#333;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:-apple-system,sans-serif;transition:background 0.15s';
            div.innerHTML = '<span style="font-size:16px">' + icon + '</span><span>' + text + '</span>';
            div.onmouseenter = function() { this.style.background = 'rgba(0,0,0,0.05)'; };
            div.onmouseleave = function() { this.style.background = 'transparent'; };
            div.onclick = function(e) { e.stopPropagation(); dropdown.style.display = 'none'; onClick(); };
            return div;
        }

        dropdown.appendChild(createOption('📄', _getMessage('exportAsJSON'), () => exportChat('json')));
        dropdown.appendChild(createOption('📝', _getMessage('exportAsMarkdown'), () => exportChat('markdown')));
        dropdown.appendChild(createOption('📃', _getMessage('exportAsText'), () => exportChat('text')));
        dropdown.appendChild(createOption('🌐', _getMessage('exportAsHTML'), () => exportChat('html')));

        // Separator
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
        dropdown.appendChild(sep);

        // Filter section
        const filterHeader = document.createElement('div');
        filterHeader.style.cssText = 'padding:6px 15px 2px;font-size:11px;color:#888;font-weight:600';
        filterHeader.textContent = _getMessage('filterSectionTitle');
        dropdown.appendChild(filterHeader);

        function createCheckbox(labelKey, settingKey) {
            const row = document.createElement('div');
            row.style.cssText = 'padding:6px 15px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;font-family:-apple-system,sans-serif';
            const box = document.createElement('span');
            box.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:2px solid #999;border-radius:3px;flex-shrink:0;font-size:12px;transition:all 0.15s';

            function getState() {
                try {
                    const raw = localStorage.getItem('claude_exporter_settings');
                    const parsed = raw ? JSON.parse(raw) : {};
                    return parsed[settingKey] !== undefined ? parsed[settingKey] : SETTINGS_DEFAULTS[settingKey];
                } catch(e) { return SETTINGS_DEFAULTS[settingKey]; }
            }
            function setState(val) {
                try {
                    const raw = localStorage.getItem('claude_exporter_settings');
                    const settings = raw ? JSON.parse(raw) : {};
                    settings[settingKey] = val;
                    localStorage.setItem('claude_exporter_settings', JSON.stringify(settings));
                } catch(e) {}
            }
            function getOnlyReply() {
                try {
                    const raw = localStorage.getItem('claude_exporter_settings');
                    return raw ? (JSON.parse(raw) || {}).onlyReplyContent === true : false;
                } catch(e) { return false; }
            }
            function updateUI() {
                const v = getState();
                const onlyReply = getOnlyReply();
                if (v) {
                    box.textContent = '✓';
                    box.style.background = '#d97706'; box.style.borderColor = '#d97706'; box.style.color = '#fff';
                } else {
                    box.textContent = ''; box.style.background = 'transparent'; box.style.borderColor = '#999';
                }
                if (settingKey !== 'onlyReplyContent' && onlyReply) {
                    row.style.opacity = '0.45'; row.style.pointerEvents = 'none';
                } else {
                    row.style.opacity = '1'; row.style.pointerEvents = 'auto';
                }
            }
            updateUI();

            row.onclick = function(e) {
                e.stopPropagation();
                const current = getState();
                setState(!current);
                if (settingKey === 'onlyReplyContent') {
                    if (!current) {
                        ['includeUserQuestions','includeThinkingProcess'].forEach(k => { try { const r = JSON.parse(localStorage.getItem('claude_exporter_settings')||'{}'); r[k] = false; localStorage.setItem('claude_exporter_settings', JSON.stringify(r)); } catch(e) {} });
                    } else {
                        ['includeUserQuestions','includeThinkingProcess'].forEach(k => { try { const r = JSON.parse(localStorage.getItem('claude_exporter_settings')||'{}'); r[k] = true; localStorage.setItem('claude_exporter_settings', JSON.stringify(r)); } catch(e) {} });
                    }
                }
                // Refresh all checkboxes
                row.parentElement.querySelectorAll('[data-filter-row]').forEach(r => r._updateUI && r._updateUI());
            };
            row._updateUI = updateUI;
            row.setAttribute('data-filter-row', '1');

            const label = document.createElement('span');
            label.textContent = _getMessage(labelKey);
            row.appendChild(box);
            row.appendChild(label);
            return row;
        }

        dropdown.appendChild(createCheckbox('includeUserQuestions', 'includeUserQuestions'));
        dropdown.appendChild(createCheckbox('includeThinkingProcess', 'includeThinkingProcess'));
        dropdown.appendChild(createCheckbox('onlyReplyContent', 'onlyReplyContent'));

        const sep2 = document.createElement('div');
        sep2.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
        dropdown.appendChild(sep2);

        dropdown.appendChild(createOption('💬', '反馈建议', () => window.open('https://github.com/LHT-balabala/ai-chat-exporter/issues', '_blank')));
        dropdown.appendChild(createOption('💰', '赞赏支持', () => showDonatePopup()));

        exportButton.onclick = function(e) {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            const arrow = exportButton.querySelector('svg');
            if (arrow) arrow.style.transform = isVisible ? 'rotate(0)' : 'rotate(180deg)';
        };

        dropdown.onclick = function(e) { e.stopPropagation(); };
        document.addEventListener('click', () => { dropdown.style.display = 'none'; exportButton.querySelector('svg').style.transform = 'rotate(0)'; });

        container.appendChild(exportButton);
        container.appendChild(dropdown);
        document.body.appendChild(container);

        // Add dark mode styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
            .pulse{animation:pulse 0.5s ease-in-out}
            @media(prefers-color-scheme:dark){
                #claude-export-btn{color:#ddd;border-color:rgba(255,255,255,0.15)}
                #claude-export-btn:hover{background:rgba(255,255,255,0.08)}
                #claude-export-dropdown{background:rgba(30,30,40,0.92);border-color:rgba(255,255,255,0.1)}
                #claude-export-dropdown>div{color:#ddd}
                #claude-export-dropdown>div:hover{background:rgba(255,255,255,0.06)}
            }
        `;
        document.head.appendChild(style);
    }

    // ---- Init ----
    function init() {
        if (!window.location.hostname.includes('claude.ai')) return;
        try { injectExportButton(); } catch(e) { console.error('Error injecting export button:', e); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
