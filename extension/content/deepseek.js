
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

    function _saveSettings(settings) {
        try { localStorage.setItem('deepseek_exporter_settings', JSON.stringify(settings)); } catch(e) {}
    }

    function showImagePopup(title, imgSrc) {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(3px)";
      overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
      const box = document.createElement("div");
      box.style.cssText = "background:#fff;border-radius:16px;padding:0;max-width:92vw;max-height:92vh;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.25);position:relative;text-align:center";
      const closeBtn = document.createElement("button");
      closeBtn.innerHTML = "✕";
      closeBtn.style.cssText = "position:absolute;top:8px;right:12px;border:none;background:rgba(0,0,0,0.5);color:#fff;width:28px;height:28px;border-radius:14px;font-size:16px;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center";
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
      box.style.cssText = "background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.25);max-width:360px";
      const title = document.createElement("h3");
      title.textContent = "赞赏支持";
      title.style.cssText = "margin:0 0 8px;font-size:18px;color:#333";
      const desc = document.createElement("p");
      desc.textContent = "如果这个工具对你有帮助，欢迎扫码赞赏";
      desc.style.cssText = "margin:0 0 16px;font-size:13px;color:#666";
      const closeBtn = document.createElement("button");
      closeBtn.innerHTML = "✕";
      closeBtn.style.cssText = "position:absolute;top:8px;right:12px;border:none;background:rgba(0,0,0,0.5);color:#fff;width:28px;height:28px;border-radius:14px;font-size:16px;cursor:pointer";
      closeBtn.onclick = function() { overlay.remove(); };
      box.appendChild(closeBtn);
      box.appendChild(title);
      box.appendChild(desc);
      const img = document.createElement("img");
      img.src = "https://raw.githubusercontent.com/LHT-balabala/ai-chat-exporter/main/assets/donate-qr.png";
      img.style.cssText = "display:block;max-width:260px;width:100%;height:auto;margin:0 auto;border-radius:8px";
      box.appendChild(img);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    // ---- IndexedDB: read DeepSeek chat data directly (no DOM scrolling needed) ----
    function getChatIdFromURL() {
        try {
            const hash = window.location.hash;
            const m = hash.match(/[/]chat[/]([a-f0-9-]+)/i);
            if (m) return m[1];
            const parts = window.location.href.split('/');
            return parts[parts.length - 1] || '';
        } catch(e) { return ''; }
    }

    function readDeepSeekDB(chatId) {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open('deepseek-chat');
                req.onerror = () => reject(new Error('无法打开数据库: ' + (req.error?.message || '未知错误')));
                req.onsuccess = () => {
                    const db = req.result;
                    try {
                        const tx = db.transaction('history-message', 'readonly');
                        const store = tx.objectStore('history-message');
                        const getReq = store.get(chatId);
                        getReq.onsuccess = () => {
                            const data = getReq.result;
                            db.close();
                            if (!data) {
                                reject(new Error('数据库无此聊天记录: ' + chatId));
                                return;
                            }
                            resolve(data);
                        };
                        getReq.onerror = () => { db.close(); reject(new Error('读取数据失败')); };
                    } catch(e) { db.close(); reject(e); }
                };
                req.onupgradeneeded = () => reject(new Error('数据库需要升级'));
            } catch(e) { reject(e); }
        });
    }

    function parseDeepSeekDBData(data, title) {
        const messages = [];
        try {
            const raw = data.chat?.data?.chat_messages || data.chat_messages || data.messages || [];
            raw.forEach(v => {
                const content = v.fragments?.[0]?.content || v.content || v.text || '';
                const role = v.role || 'user';
                if (content && content.trim()) {
                    messages.push({ role: role, content: content.trim(), sig: content.substring(0, 80) });
                }
            });
        } catch(e) { console.error('Parse error:', e); }
        return { messages, title: title || data.title || document.title || data.chat?.title || '' };
    }

    async function fetchFromDeepSeekDB() {
        const chatId = getChatIdFromURL();
        if (!chatId) throw new Error('无法从URL获取聊天ID');
        if (!indexedDB) throw new Error('浏览器不支持IndexedDB');
        const data = await readDeepSeekDB(chatId);
        return parseDeepSeekDBData(data);
    }

/**
 * DeepSeek Chat Exporter - Content Script
 *
 * This script monitors the DeepSeek chat interface, extracts messages,
 * and provides functionality to export conversations as JSON.
 */

/**
 * Check if the current page is a DeepSeek chat page
 * @returns {boolean} True if the page is a DeepSeek chat page
 */
function isDeepSeekChatPage() {
  const url = window.location.href;
  const domain = new URL(url).hostname;
  return domain === 'chat.deepseek.com';
}

const SETTINGS_DEFAULTS = {
  autoExport: false,
  notifyNewMessages: true,
  exportWebReferences: false,
  includeUserQuestions: true,
  includeThinkingProcess: true,
  onlyReplyContent: false
};

/**
 * Initialize the extension
 */
function init() {
    // 检查是否是DeepSeek聊天页面
    if (!isDeepSeekChatPage()) {
      return;
    }
    // 注入导出按钮
    try {
      injectExportButton();
    } catch (error) {
      console.error('Error injecting export button:', error);
    }
}

/**
 * Inject the export button with dropdown menu into the page
 */
function injectExportButton() {
  // Check if button already exists
  if (document.getElementById('deepseek-export-btn')) {
    return;
  }

  // Create container for the button and dropdown
  const container = document.createElement('div');
  container.id = 'deepseek-export-container';
  container.className = 'deepseek-export-container';

  // Create the main export button
  const exportButton = document.createElement('button');
  exportButton.id = 'deepseek-export-btn';
  exportButton.className = 'deepseek-export-btn';

  // 添加文本和箭头图标
  const buttonText = document.createElement('span');
  buttonText.textContent = _getMessage('exportButtonText') || 'Export Chat';

  // 创建 SVG 箭头图标 - 使用用户提供的SVG
  const arrowIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrowIcon.classList.add('arrow-icon');
  arrowIcon.setAttribute('viewBox', '0 0 24 24');
  arrowIcon.setAttribute('fill', 'none');
  arrowIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 15.5L7 10.5L8.41 9.09L12 12.67L15.59 9.09L17 10.5L12 15.5Z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('stroke-linejoin', 'round');

  arrowIcon.appendChild(path);

  // 将文本和图标添加到按钮
  exportButton.appendChild(buttonText);
  exportButton.appendChild(arrowIcon);

  // Create the dropdown menu
  const dropdownMenu = document.createElement('div');
  dropdownMenu.id = 'deepseek-export-dropdown';
  dropdownMenu.className = 'deepseek-export-dropdown';
  dropdownMenu.style.display = 'none';

  // Create export as JSON option
  const jsonOption = document.createElement('div');
  jsonOption.className = 'deepseek-export-option';

  // 添加JSON选项的emoji图标和文本容器
  const jsonIconSpan = document.createElement('span');
  jsonIconSpan.className = 'option-icon';
  jsonIconSpan.textContent = '📄 ';

  const jsonTextSpan = document.createElement('span');
  jsonTextSpan.className = 'option-text';
  jsonTextSpan.textContent = _getMessage('exportAsJSON') || 'Export as JSON';

  jsonOption.appendChild(jsonIconSpan);
  jsonOption.appendChild(jsonTextSpan);

  jsonOption.addEventListener('click', (e) => {
    e.stopPropagation();
    exportChat('json');
    dropdownMenu.style.display = 'none';
  });

  // Create export as Markdown option
  const markdownOption = document.createElement('div');
  markdownOption.className = 'deepseek-export-option';

  const markdownIconSpan = document.createElement('span');
  markdownIconSpan.className = 'option-icon';
  markdownIconSpan.textContent = '📝 ';

  const markdownTextSpan = document.createElement('span');
  markdownTextSpan.className = 'option-text';
  markdownTextSpan.textContent = _getMessage('exportAsMarkdown') || 'Export as Markdown';

  markdownOption.appendChild(markdownIconSpan);
  markdownOption.appendChild(markdownTextSpan);

  markdownOption.addEventListener('click', (e) => {
    e.stopPropagation();
    exportChat('markdown');
    dropdownMenu.style.display = 'none';
  });

  // Create export as Text option
  const textOption = document.createElement('div');
  textOption.className = 'deepseek-export-option';

  const textIconSpan = document.createElement('span');
  textIconSpan.className = 'option-icon';
  textIconSpan.textContent = '📃 ';

  const textTextSpan = document.createElement('span');
  textTextSpan.className = 'option-text';
  textTextSpan.textContent = _getMessage('exportAsText') || 'Export as Plain Text';

  textOption.appendChild(textIconSpan);
  textOption.appendChild(textTextSpan);

  textOption.addEventListener('click', (e) => {
    e.stopPropagation();
    exportChat('text');
    dropdownMenu.style.display = 'none';
  });

  // Create export as HTML option
  const htmlOption = document.createElement('div');
  htmlOption.className = 'deepseek-export-option';

  const htmlIconSpan = document.createElement('span');
  htmlIconSpan.className = 'option-icon';
  htmlIconSpan.textContent = '🌐 ';

  const htmlTextSpan = document.createElement('span');
  htmlTextSpan.className = 'option-text';
  htmlTextSpan.textContent = _getMessage('exportAsHTML') || 'Export as HTML';

  htmlOption.appendChild(htmlIconSpan);
  htmlOption.appendChild(htmlTextSpan);

    htmlOption.addEventListener('click', (e) => {
    e.stopPropagation();
    exportChat('html');
    dropdownMenu.style.display = 'none';
  });

  // Add options to dropdown menu
  dropdownMenu.appendChild(jsonOption);
  dropdownMenu.appendChild(markdownOption);
  dropdownMenu.appendChild(textOption);
  dropdownMenu.appendChild(htmlOption);

  // ----  MOD: Filter Options Section ----
  const filterSep = document.createElement('div');
  filterSep.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
  dropdownMenu.appendChild(filterSep);

  // Filter section title
  const filterHeader = document.createElement('div');
  filterHeader.style.cssText = 'padding:6px 15px 2px;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px';
  filterHeader.textContent = _getMessage('filterSectionTitle');
  dropdownMenu.appendChild(filterHeader);

  // Helper: create a checkbox option row
  function createFilterCheckbox(labelKey, settingKey) {
    const row = document.createElement('div');
    row.className = 'deepseek-export-option';
    row.style.cssText = 'padding:6px 15px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px';

    const box = document.createElement('span');
    box.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:2px solid #999;border-radius:3px;flex-shrink:0;font-size:12px;transition:all 0.15s';

    const label = document.createElement('span');
    label.textContent = _getMessage(labelKey);
    label.style.cssText = 'flex-grow:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

    row.appendChild(box);
    row.appendChild(label);

    // Read initial state
    function getState() {
      try {
        const raw = localStorage.getItem('deepseek_exporter_settings');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed[settingKey] !== undefined ? parsed[settingKey] : SETTINGS_DEFAULTS[settingKey];
      } catch(e) { return SETTINGS_DEFAULTS[settingKey]; }
    }

    function setState(val) {
      try {
        const raw = localStorage.getItem('deepseek_exporter_settings');
        const settings = raw ? JSON.parse(raw) : {};
        settings[settingKey] = val;
        localStorage.setItem('deepseek_exporter_settings', JSON.stringify(settings));
      } catch(e) {}
    }

    function updateUI() {
      const v = getState();
      if (v) {
        box.textContent = '✓';
        box.style.backgroundColor = '#4285f4';
        box.style.borderColor = '#4285f4';
        box.style.color = '#fff';
      } else {
        box.textContent = '';
        box.style.backgroundColor = 'transparent';
        box.style.borderColor = '#999';
        box.style.color = 'transparent';
      }
      // Handle disabled state for onlyReplyContent interaction
      if (settingKey !== 'onlyReplyContent') {
        const onlyReply = getOnlyReplyState();
        if (onlyReply) {
          row.style.opacity = '0.45';
          row.style.pointerEvents = 'none';
          box.style.borderColor = '#ccc';
        } else {
          row.style.opacity = '1';
          row.style.pointerEvents = 'auto';
        }
      }
    }

    function getOnlyReplyState() {
      try {
        const raw = localStorage.getItem('deepseek_exporter_settings');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed['onlyReplyContent'] === true;
      } catch(e) { return false; }
    }

    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = getState();
      setState(!current);
      updateUI();

      // If "onlyReplyContent" was toggled ON, disable userQuestions and thinkingProcess
      if (settingKey === 'onlyReplyContent' && !current) {
        setStateForOther('includeUserQuestions', false);
        setStateForOther('includeThinkingProcess', false);
      }
      // If "onlyReplyContent" was toggled OFF, re-enable them
      if (settingKey === 'onlyReplyContent' && current) {
        setStateForOther('includeUserQuestions', true);
        setStateForOther('includeThinkingProcess', true);
      }
      // Refresh all checkbox UIs
      refreshAllFilterCheckboxes();
    });

    function setStateForOther(key, val) {
      try {
        const raw = localStorage.getItem('deepseek_exporter_settings');
        const settings = raw ? JSON.parse(raw) : {};
        settings[key] = val;
        localStorage.setItem('deepseek_exporter_settings', JSON.stringify(settings));
      } catch(e) {}
    }

    // Store reference for global refresh
    row._filterUpdateUI = updateUI;
    row._filterSettingKey = settingKey;
    _filterCheckboxRows.push(row);

    updateUI();
    return row;
  }

  // Global registry for filter checkbox rows
  if (!window.__deepseek_filter_rows) {
    window.__deepseek_filter_rows = [];
  }
  var _filterCheckboxRows = window.__deepseek_filter_rows;
  _filterCheckboxRows.length = 0;

  window.refreshAllFilterCheckboxes = function() {
    _filterCheckboxRows.forEach(function(r) {
      if (r._filterUpdateUI) r._filterUpdateUI();
    });
  };

  dropdownMenu.appendChild(createFilterCheckbox('includeUserQuestions', 'includeUserQuestions'));
  dropdownMenu.appendChild(createFilterCheckbox('includeThinkingProcess', 'includeThinkingProcess'));
  dropdownMenu.appendChild(createFilterCheckbox('onlyReplyContent', 'onlyReplyContent'));

  // ---- END MOD: Filter Options ----

  // Separator
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0';
  dropdownMenu.appendChild(sep);

  // Feedback button
  const fbOption = document.createElement('div');
  fbOption.className = 'deepseek-export-option';
  const fbIcon = document.createElement('span');
  fbIcon.className = 'option-icon';
  fbIcon.textContent = '💬 ';
  const fbText = document.createElement('span');
  fbText.className = 'option-text';
  fbText.textContent = '反馈建议';
  fbOption.appendChild(fbIcon);
  fbOption.appendChild(fbText);
  fbOption.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.style.display = 'none';
    window.open('https://github.com/LHT-balabala/ai-chat-exporter/issues', '_blank');
  });

  // Donate button - shows QR code popup
  const dnOption = document.createElement('div');
  dnOption.className = 'deepseek-export-option';
  const dnIcon = document.createElement('span');
  dnIcon.className = 'option-icon';
  dnIcon.textContent = '💰 ';
  const dnText = document.createElement('span');
  dnText.className = 'option-text';
  dnText.textContent = '赞赏支持';
  dnOption.appendChild(dnIcon);
  dnOption.appendChild(dnText);
  dnOption.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdownMenu.style.display = 'none';
    showDonatePopup();
  });

  dropdownMenu.appendChild(fbOption);
  dropdownMenu.appendChild(dnOption);


  // Toggle dropdown menu when clicking the export button
  exportButton.addEventListener('click', (event) => {
    event.stopPropagation(); // 阻止事件冒泡
    const isVisible = dropdownMenu.style.display === 'block';
    dropdownMenu.style.display = isVisible ? 'none' : 'block';

    const arrowIcon = exportButton.querySelector('.arrow-icon');
    if (arrowIcon) {
      arrowIcon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    }
    // Refresh filter checkboxes on open
    if (!isVisible && window.refreshAllFilterCheckboxes) {
      window.refreshAllFilterCheckboxes();
    }
  });

  // Prevent dropdown clicks from closing the dropdown
  dropdownMenu.addEventListener('click', (event) => {
    event.stopPropagation(); // 阻止事件冒泡
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    if (dropdownMenu.style.display === 'block') {
      dropdownMenu.style.display = 'none';

      // 恢复箭头图标方向
      const arrowIcon = exportButton.querySelector('.arrow-icon');
      if (arrowIcon) {
        arrowIcon.style.transform = 'rotate(0deg)';
      }

    }
  });

  // Add button and dropdown to container
  container.appendChild(exportButton);
  container.appendChild(dropdownMenu);

  // Remove any existing containers with the same ID to avoid conflicts
  const existingContainer = document.getElementById('deepseek-export-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Add container to page
  document.body.appendChild(container);

  // Add CSS styles for the dropdown
  addExportStyles();
}

/**
 * Add CSS styles for the export button and dropdown
 */
function addExportStyles() {
  if (document.getElementById('deepseek-export-styles')) return;
  const style = document.createElement('style');
  style.id = 'deepseek-export-styles';
  style.textContent = `/**
 * DeepSeek Chat Exporter - Styles
 */

/* SVG 箭头图标样式 */
.arrow-icon {
  width: 16px;
  height: 16px;
  margin-left: 6px;
  transition: transform 0.2s ease;
  vertical-align: middle;
  transform: rotate(0deg); /* 默认朝下 */
}

/* 按钮样式 — 透明背景，贴合 DeepSeek 界面 */
#deepseek-export-btn {
  position: relative;
  background: transparent;
  color: #333;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 6px 12px;
  margin-top: 4px;
  margin-right: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: none;
  transition: all 0.2s ease;
  opacity: 0.75;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  z-index: 9999999;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

#deepseek-export-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  opacity: 1;
  transform: translateY(0);
}

#deepseek-export-btn:active {
  background: rgba(0, 0, 0, 0.1);
  transform: translateY(0);
}

/* Dropdown menu — 半透明毛玻璃效果 */
#deepseek-export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 9999999;
  overflow: hidden;
  width: 220px;
}

.deepseek-export-option {
  padding: 10px 15px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: background-color 0.15s;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
}

.option-icon {
  display: inline-block;
  margin-right: 8px;
  font-size: 16px;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.option-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-grow: 1;
}

.deepseek-export-option:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

/* Container — 贴近顶部 */
.deepseek-export-container {
  position: fixed;
  top: 4px;
  right: 56px;
  z-index: 9999999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin: 0;
  padding: 0;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.pulse {
  animation: pulse 0.5s ease-in-out;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  #deepseek-export-btn {
    color: #ddd;
    border-color: rgba(255, 255, 255, 0.15);
  }

  #deepseek-export-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  #deepseek-export-btn:active {
    background: rgba(255, 255, 255, 0.12);
  }

  #deepseek-export-dropdown {
    background: rgba(24, 24, 32, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .deepseek-export-option {
    color: #ddd;
  }

  .deepseek-export-option:hover {
    background-color: rgba(255, 255, 255, 0.06);
  }
}

/* Export loading overlay */
#deepseek-export-loading {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.deepseek-export-loading-box {
  background: #fff;
  border-radius: 14px;
  padding: 28px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  min-width: 220px;
}

@media (prefers-color-scheme: dark) {
  .deepseek-export-loading-box {
    background: #1e1e2e;
    color: #cdd6f4;
  }
}

.deepseek-export-loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #4285f4;
  border-radius: 50%;
  animation: deepseek-spin 0.8s linear infinite;
}

@keyframes deepseek-spin {
  to { transform: rotate(360deg); }
}

.deepseek-export-loading-text {
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #333;
  text-align: center;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .deepseek-export-loading-text {
    color: #cdd6f4;
  }
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  #deepseek-export-btn {
    padding: 5px 10px;
    font-size: 12px;
  }

  .deepseek-export-container {
    top: 2px;
    right: 52px;
  }

  #deepseek-export-dropdown {
    width: 180px;
  }

  .arrow-icon {
    width: 14px;
    height: 14px;
    margin-left: 4px;
  }

  .option-icon {
    font-size: 14px;
    margin-right: 6px;
  }
}
`;
  document.head.appendChild(style);
}

/**
 * Find the main scrollable container for the chat
 * @returns {Element|null}
 */
function getChatScrollContainer() {
  const candidates = [
    document.querySelector('.dad65929'),
    document.querySelector('.e1f93b07'),
    document.querySelector('._6d215eb.ds-scroll-area'),
    document.querySelector('._3586175.ds-scroll-area'),
    document.querySelector('.ds-scroll-area'),
    document.querySelector('main'),
    document.querySelector('[class*="chat"][class*="container"]'),
    document.querySelector('[class*="conversation"]'),
    document.querySelector('[class*="message-list"]'),
  ];
  for (const el of candidates) {
    if (el && el.scrollHeight > el.clientHeight) return el;
  }
  // Walk up from messages to find scroll container (mobile virtual scroll)
  // Virtual scroll containers may not have scrollHeight > clientHeight
  const msgSelector = '.ds-message, .fbb737a4, [class*="ds-message"]';
  const firstMsg = document.querySelector(msgSelector);
  if (firstMsg) {
    let node = firstMsg.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return node;
      }
      node = node.parentElement;
    }
  }
  // Fallback: try all scrollable divs
  const fallbackScrollables = Array.from(document.querySelectorAll('main, section, div')).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
    if (el.scrollHeight > el.clientHeight + 10) return true;
    // Also include if it contains messages (virtual scroll case)
    return el.querySelector('.ds-message, .fbb737a4, .ds-markdown') !== null;
  });
  fallbackScrollables.sort((a, b) => {
    const aScore = a.querySelectorAll('.ds-message, .fbb737a4, .ds-markdown').length;
    const bScore = b.querySelectorAll('.ds-message, .fbb737a4, .ds-markdown').length;
    if (bScore !== aScore) return bScore - aScore;
    return (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth);
  });
  if (fallbackScrollables[0]) {
    return fallbackScrollables[0];
  }
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
    return document.documentElement;
  }
  return document.body;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDocumentScrollContainer(container) {
  return container === document.body || container === document.documentElement;
}

function getContainerScrollTop(container) {
  if (!container) return 0;
  if (isDocumentScrollContainer(container)) {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }
  return container.scrollTop;
}

function getContainerClientHeight(container) {
  if (!container) return 0;
  if (isDocumentScrollContainer(container)) {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }
  return container.clientHeight;
}

function getContainerScrollHeight(container) {
  if (!container) return 0;
  if (isDocumentScrollContainer(container)) {
    return Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    );
  }
  return container.scrollHeight;
}

function setContainerScrollTop(container, value) {
  const nextValue = Math.max(0, Number(value) || 0);
  if (isDocumentScrollContainer(container)) {
    window.scrollTo(0, nextValue);
    return;
  }
  container.scrollTop = nextValue;
}

async function waitForScrollSettle(container, previousTop, timeoutMs = 600) {
  const start = Date.now();
  let stableTicks = 0;
  let lastTop = getContainerScrollTop(container);
  while (Date.now() - start < timeoutMs) {
    await delay(80);
    const currentTop = getContainerScrollTop(container);
    const currentHeight = getContainerScrollHeight(container);
    if (Math.abs(currentTop - lastTop) <= 1) {
      stableTicks += 1;
    } else {
      stableTicks = 0;
      lastTop = currentTop;
    }
    if (stableTicks >= 2 && Math.abs(currentTop - previousTop) > 1) {
      break;
    }
    if (stableTicks >= 3 && currentHeight > 0) {
      break;
    }
  }
  await delay(80);
}

async function scrollToTopForCollection(container, timeoutMs = 15000) {
  // Jump directly to the top
  container.scrollTop = 0;
  await delay(500);
  // If React overrode our scroll, keep trying
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const top = container.scrollTop;
    if (top <= 2) return;
    container.scrollTop = 0;
    await delay(200);
  }
}

function getMessageSignature(message) {
  if (!message) return '';
  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  if (message.role === 'assistant') {
    const contentText = message.content instanceof HTMLElement
      ? normalize(message.content.textContent)
      : normalize(message.content);
    const cotText = message.chain_of_thought instanceof HTMLElement
      ? normalize(message.chain_of_thought.textContent)
      : normalize(message.chain_of_thought);
    return `${message.role}::${contentText}::${cotText}`;
  }
  const attachmentText = Array.isArray(message.attachments)
    ? message.attachments.map(item => `${item.name || ''}:${item.size || ''}:${item.type || ''}`).join('|')
    : '';
  return `${message.role}::${normalize(message.content)}::${attachmentText}`;
}

function mergeMessageSnapshots(existingMessages, existingSignatures, incomingMessages) {
  const base = Array.isArray(existingMessages) ? existingMessages.slice() : [];
  const baseSignatures = Array.isArray(existingSignatures) ? existingSignatures.slice() : base.map(getMessageSignature);
  const next = Array.isArray(incomingMessages) ? incomingMessages : [];
  const nextSignatures = next.map(getMessageSignature);
  if (base.length === 0) {
    return {
      messages: next.slice(),
      signatures: nextSignatures
    };
  }
  if (next.length === 0) {
    return {
      messages: base,
      signatures: baseSignatures
    };
  }

  const maxOverlap = Math.min(base.length, next.length, 120);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matched = true;
    for (let index = 0; index < overlap; index += 1) {
      if (baseSignatures[base.length - overlap + index] !== nextSignatures[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return {
        messages: base.concat(next.slice(overlap)),
        signatures: baseSignatures.concat(nextSignatures.slice(overlap))
      };
    }
  }

  const tailWindow = baseSignatures.slice(-80);
  let anchorIndex = -1;
  for (let index = nextSignatures.length - 1; index >= 0; index -= 1) {
    if (tailWindow.includes(nextSignatures[index])) {
      anchorIndex = index;
      break;
    }
  }

  if (anchorIndex >= 0) {
    return {
      messages: base.concat(next.slice(anchorIndex + 1)),
      signatures: baseSignatures.concat(nextSignatures.slice(anchorIndex + 1))
    };
  }

  const baseSignatureSet = new Set(baseSignatures.slice(-200));
  const pending = [];
  const pendingSignatures = [];
  next.forEach((message, index) => {
    const signature = nextSignatures[index];
    if (!baseSignatureSet.has(signature) || pending.length > 0) {
      pending.push(message);
      pendingSignatures.push(signature);
    }
  });

  return {
    messages: base.concat(pending),
    signatures: baseSignatures.concat(pendingSignatures)
  };
}

function buildSnapshotFingerprint(signatures) {
  const list = Array.isArray(signatures) ? signatures : [];
  if (list.length === 0) return '0';
  const head = list.slice(0, 2).join('||');
  const tail = list.slice(-2).join('||');
  return `${list.length}::${head}::${tail}`;
}

async function prepareVisibleMessages() {
  await waitForDiagramBlocksReady(1200);
  await prepareDiagramCodeBlocks();
}

async function collectAllMessagesFromChat() {
  // Try IndexedDB first (instant, complete, no scrolling)
  try {
    const dbResult = await fetchFromDeepSeekDB();
    if (dbResult.messages && dbResult.messages.length > 0) {
      console.log('IndexedDB: found', dbResult.messages.length, 'messages');
      return { title: dbResult.title || getConversationTitle(), messages: dbResult.messages };
    }
  } catch(e) {
    console.log('IndexedDB failed, DOM fallback:', e.message);
  }
  const container = getChatScrollContainer();
  if (!container) {
    return extractAllMessagesFromPage();
  }

  const originalTop = getContainerScrollTop(container);
  const startedAt = Date.now();
  const timeoutMs = 60000;
  let title = '';
  let messages = [];
  let messageSignatures = [];

  // Add stop button
  let shouldStop = false;
  const stopBtn = document.createElement('div');
  stopBtn.id = 'ds-export-stop';
  stopBtn.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:1000001;background:#e74c3c;color:#fff;border:none;border-radius:20px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,sans-serif';
  stopBtn.textContent = '\u23F9 \u505C\u6B62';
  stopBtn.onclick = function() { shouldStop = true; stopBtn.textContent = '\u6B63\u5728\u5BFC\u51FA...'; };
  document.body.appendChild(stopBtn);

  try {
    await scrollToTopForCollection(container);

    let idlePasses = 0;
    let lastLength = 0;
    let lastFingerprint = '';
    let stagnantPasses = 0;

    while (Date.now() - startedAt < timeoutMs && !shouldStop) {
      await prepareVisibleMessages();
      const snapshot = extractAllMessagesFromPage(document, { cloneDomNodes: true });
      const snapshotMessages = snapshot.messages || [];
      const snapshotSignatures = snapshotMessages.map(getMessageSignature);
      if (snapshot.title && !title) {
        title = snapshot.title;
      }

      const previousLength = messages.length;
      const merged = mergeMessageSnapshots(messages, messageSignatures, snapshotMessages);
      messages = merged.messages;
      messageSignatures = merged.signatures;
      const addedCount = messages.length - previousLength;
      const fingerprint = buildSnapshotFingerprint(snapshotSignatures);
      if (fingerprint === lastFingerprint) {
        stagnantPasses += 1;
      } else {
        stagnantPasses = 0;
        lastFingerprint = fingerprint;
      }

      updateExportingOverlay((_getMessage('exportingProcessing') || 'Processing\u2026') + ` ${messages.length}`);

      const currentTop = getContainerScrollTop(container);
      const clientHeight = getContainerClientHeight(container);
      const scrollHeight = getContainerScrollHeight(container);
      const atBottom = currentTop + clientHeight >= scrollHeight - 4;

      if (atBottom) {
        if (messages.length === lastLength) {
          idlePasses += 1;
        } else {
          idlePasses = 0;
          lastLength = messages.length;
        }
        if (idlePasses >= 12) break;
      }

      if (stagnantPasses >= 10 && addedCount === 0) {
        break;
      }

      const stepRatio = stagnantPasses > 0 ? 0.95 : 0.8;
      const step = Math.max(420, clientHeight * stepRatio);
      const nextTop = Math.min(scrollHeight - clientHeight, currentTop + step);

      setContainerScrollTop(container, nextTop);
      await waitForScrollSettle(container, currentTop);
    }

    if (stopBtn.parentNode) stopBtn.parentNode.removeChild(stopBtn);

    if (messages.length === 0) {
      await prepareVisibleMessages();
      return extractAllMessagesFromPage(document, { cloneDomNodes: true });
    }

    return {
      title: title || getConversationTitle(),
      messages
    };
  } finally {
    try { setContainerScrollTop(container, originalTop); } catch(e) {}
    try { if (stopBtn.parentNode) stopBtn.parentNode.removeChild(stopBtn); } catch(e) {}
  }
}

function showExportingOverlay(message) {
  if (document.getElementById('deepseek-export-loading')) return;
  const overlay = document.createElement('div');
  overlay.id = 'deepseek-export-loading';
  const box = document.createElement('div');
  box.className = 'deepseek-export-loading-box';
  const spinner = document.createElement('div');
  spinner.className = 'deepseek-export-loading-spinner';
  const text = document.createElement('div');
  text.className = 'deepseek-export-loading-text';
  text.id = 'deepseek-export-loading-text';
  text.textContent = message || _getMessage('exportingLoading') || 'Preparing export\u2026';
  box.appendChild(spinner);
  box.appendChild(text);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function updateExportingOverlay(message) {
  const el = document.getElementById('deepseek-export-loading-text');
  if (el) el.textContent = message;
}

function hideExportingOverlay() {
  const el = document.getElementById('deepseek-export-loading');
  if (el) el.remove();
}

/**
 * Export the chat to a file in the specified format
 * @param {string} format - The format to export ('json', 'markdown', or 'text')
 */
async function exportChat(format) {
  showExportingOverlay(_getMessage('exportingScrolling') || 'Loading all messages\u2026');
  try {
    const settings = await getSettings();
    const {title, messages} = await collectAllMessagesFromChat();
    hideExportingOverlay();
    if (!Array.isArray(messages) || messages.length === 0) {
      alert(_getMessage('noMessagesFound') + ' (DOM\u4E2D\u672A\u627E\u5230\u6D88\u606F\u5143\u7D20)');
      console.log('DOM state:', document.querySelectorAll('.fbb737a4').length, 'users,', document.querySelectorAll('.ds-markdown').length, 'markdowns');
      return;
    }

    const exportData = {
      title: title,
      url: window.location.href,
      date: new Date().toISOString(),
      messages: messages
    };
    downloadChat(exportData, format, settings);
  } catch (error) {
    hideExportingOverlay();
    console.error('Export error:', error);
    alert('\u5BFC\u51FA\u5931\u8D25: ' + (error.message || error));
  }
}

function getSettings() {
  return new Promise((resolve) => {
    (() => {
      try {
        const raw = localStorage.getItem('deepseek_exporter_settings');
        const result = raw ? JSON.parse(raw) : {};
        const settings = result || {};
        const exportWebReferences = typeof settings.exportWebReferences === 'boolean'
          ? settings.exportWebReferences
          : !!settings.exportMarkdownReferences;
        resolve({
          ...SETTINGS_DEFAULTS,
          ...settings,
          exportWebReferences
        });
      } catch(e) {
        resolve({ ...SETTINGS_DEFAULTS });
      }
    })();
  });
}

function removeReferenceMarkers(text) {
  return String(text ?? '').replace(/\[\^\d+\]/g, '');
}

function waitForBlockCodeReady(block, timeoutMs = 2500) {
  const getPreText = () => (block.querySelector('pre')?.textContent || '').trim();
  if (getPreText()) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let observer = null;
    let timerId = null;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (observer) observer.disconnect();
      resolve(ok);
    };
    observer = new MutationObserver(() => {
      if (getPreText()) done(true);
    });
    observer.observe(block, { childList: true, subtree: true, characterData: true });
    timerId = window.setTimeout(() => done(!!getPreText()), timeoutMs);
  });
}

function triggerTab(tab) {
  if (!tab) return;
  try {
    tab.click();
  } catch (e) {}
  const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];
  events.forEach(type => {
    try {
      tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    } catch (e) {}
  });
}

function waitForBlockChartReady(block, timeoutMs = 2500) {
  const hasChart = () => !!block.querySelector('svg.mermaid-svg, .mermaid-svg');
  if (hasChart()) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let observer = null;
    let timerId = null;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (observer) observer.disconnect();
      resolve(ok);
    };
    observer = new MutationObserver(() => {
      if (hasChart()) done(true);
    });
    observer.observe(block, { childList: true, subtree: true, characterData: true });
    timerId = window.setTimeout(() => done(hasChart()), timeoutMs);
  });
}

async function prepareDiagramCodeBlocks() {
  const blocks = Array.from(document.querySelectorAll('.md-code-block')).filter(isDiagramCodeBlock);
  const tasks = blocks.map(async (block) => {
    const tabs = Array.from(block.querySelectorAll('[role="tab"]'));
    const selectedTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('ds-segmented-button--selected')) || null;
    const selectedText = (selectedTab?.textContent || '').trim();
    const chartTab = tabs.find(tab => /\u56FE\u8868|diagram/i.test((tab.textContent || '').trim()));
    const codeTab = tabs.find(tab => /\u4EE3\u7801|code/i.test((tab.textContent || '').trim()));
    let preText = (block.querySelector('pre')?.textContent || '').trim();
    const chartWasSelected = /\u56FE\u8868|diagram/i.test(selectedText);

    if (!preText && codeTab) {
      const selected = codeTab.getAttribute('aria-selected') === 'true' || codeTab.classList.contains('ds-segmented-button--selected');
      if (!selected) {
        triggerTab(codeTab);
      }
      await waitForBlockCodeReady(block);
      preText = (block.querySelector('pre')?.textContent || '').trim();
    }

    if (preText) {
      block.setAttribute('data-export-code', preText);
      const langText = (block.querySelector('.d813de27')?.textContent || '').trim();
      if (langText) {
        block.setAttribute('data-export-lang', langText);
      }
    }

    if (chartTab && chartWasSelected) {
      triggerTab(chartTab);
      await waitForBlockChartReady(block);
    } else if (selectedTab) {
      triggerTab(selectedTab);
    }
  });
  await Promise.all(tasks);
}

function isDiagramCodeBlock(block) {
  if (!(block instanceof HTMLElement)) return false;
  const tabText = (block.querySelector('[role="tablist"]')?.textContent || '').trim();
  if (/\u56FE\u8868|diagram|mermaid/i.test(tabText)) return true;
  if (block.querySelector('svg.mermaid-svg, .mermaid-svg')) return true;
  const preText = (block.querySelector('pre')?.textContent || '').trim();
  if (/(^|\n)\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph)\b/i.test(preText)) {
    return true;
  }
  return false;
}

function isDiagramCodeBlockReady(block) {
  if (block.querySelector('.ds-loading')) return false;
  const preText = (block.querySelector('pre')?.textContent || '').trim();
  if (preText) return true;
  if (block.querySelector('svg.mermaid-svg, .mermaid-svg')) return true;
  return false;
}

function getDiagramBlockStatus() {
  const allBlocks = Array.from(document.querySelectorAll('.md-code-block'));
  const diagramBlocks = allBlocks.filter(isDiagramCodeBlock);
  const readyCount = diagramBlocks.filter(isDiagramCodeBlockReady).length;
  return {
    total: diagramBlocks.length,
    readyCount,
    ready: diagramBlocks.length === 0 || readyCount === diagramBlocks.length
  };
}

function waitForDiagramBlocksReady(timeoutMs = 3000) {
  const initialStatus = getDiagramBlockStatus();
  if (initialStatus.ready) {
    return Promise.resolve(initialStatus);
  }
  return new Promise((resolve) => {
    let settled = false;
    let observer = null;
    let timerId = null;
    const finalize = (status) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (observer) observer.disconnect();
      resolve(status);
    };

    const check = () => {
      const status = getDiagramBlockStatus();
      if (status.ready) {
        finalize(status);
      }
    };

    observer = new MutationObserver(() => {
      check();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    timerId = window.setTimeout(() => {
      const status = getDiagramBlockStatus();
      status.timedOut = true;
      finalize(status);
    }, timeoutMs);
  });
}

// ======================== MOD: filterMessages ========================
/**
 * Filter messages array based on export settings
 * @param {Array} messages - Original messages array
 * @param {Object} settings - Export settings with filter flags
 * @returns {Array} Filtered messages array
 */
function filterMessages(messages, settings) {
  if (!Array.isArray(messages)) return messages;

  const includeUser = !!(settings && settings.includeUserQuestions);
  const includeThink = !!(settings && settings.includeThinkingProcess);
  const onlyReply = !!(settings && settings.onlyReplyContent);

  // If all filters are at default (include everything), no filtering needed
  if (includeUser && includeThink && !onlyReply) {
    return messages;
  }

  let filtered = messages;

  // onlyReplyContent overrides other filters
  if (onlyReply) {
    // Keep only assistant messages, strip chain_of_thought
    filtered = filtered
      .filter(function(msg) { return msg.role === 'assistant'; })
      .map(function(msg) {
        var m = Object.assign({}, msg);
        delete m.chain_of_thought;
        return m;
      });
  } else {
    // Apply individual filters
    if (!includeUser) {
      filtered = filtered.filter(function(msg) { return msg.role !== 'user'; });
    }
    if (!includeThink) {
      filtered = filtered.map(function(msg) {
        if (msg.role === 'assistant' && msg.chain_of_thought) {
          var m = Object.assign({}, msg);
          delete m.chain_of_thought;
          return m;
        }
        return msg;
      });
    }
  }

  return filtered;
}
// ====================================================================

/**
 * Download chat data as a file in the specified format
 * @param {Object} exportData - The data to export
 * @param {string} format - The format to export ('json', 'markdown', 'text', or 'html')
 */
function downloadChat(exportData, format, settings) {
  try {
    // MOD: Filter messages before formatting
    const filteredMessages = filterMessages(exportData.messages, settings);

    const formattedData = {
      title: exportData.title,
      url: exportData.url,
      date: exportData.date,
      messages: filteredMessages.map(msg => {
        const formattedMsg = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.role === 'user' && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          formattedMsg.attachments = msg.attachments;
        }
        if (msg.role === 'assistant' && msg.chain_of_thought) {
          formattedMsg.chain_of_thought = msg.chain_of_thought;
        }
        return formattedMsg;
      })
    };

    let blob, filename;
    const rawTitle = (formattedData.title || '').trim() || getDefaultConversationTitle();
    const safeTitle = typeof sanitizeFilename === 'function'
      ? sanitizeFilename(rawTitle)
      : rawTitle.replace(/[/\\?%*:|"<>]/g, '-');

    // MOD: Pass onlyReplyContent flag through settings
    const enhancedSettings = Object.assign({}, settings, {
      onlyReplyContent: !!(settings && settings.onlyReplyContent)
    });

    if (format === 'markdown') {
      const markdownContent = convertToMarkdown(formattedData, enhancedSettings);
      blob = new Blob([markdownContent], { type: 'text/markdown; charset=utf-8' });
      filename = `${safeTitle}.md`;
    } else if (format === 'text') {
      const textContent = convertToPlainText(formattedData, enhancedSettings);
      blob = new Blob([textContent], { type: 'text/plain; charset=utf-8' });
      filename = `${safeTitle}.txt`;
    } else if (format === 'html') {
      const htmlContent = convertToHTML(formattedData, enhancedSettings);
      blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
      filename = `${safeTitle}.html`;
    } else {
      const jsonContent = convertToJSON(formattedData, enhancedSettings);
      blob = new Blob([JSON.stringify(jsonContent, null, 2)], { type: 'application/json; charset=utf-8' });
      filename = `${safeTitle}.json`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 50);

    const exportButton = document.getElementById('deepseek-export-btn');
    if (exportButton) {
      exportButton.classList.add('pulse');
      setTimeout(() => exportButton.classList.remove('pulse'), 300);
    }


  } catch (error) {
    console.error('Error exporting chat:', error);
    alert('\u5BFC\u51FA\u5931\u8D25: ' + (error.message || error));
  }
}

/**
 * \u4ECE KaTeX \u6E32\u67D3\u7684 DOM \u4E2D\u63D0\u53D6 TeX \u6E90\u7801\u5E76\u8F6C\u6362\u4E3A Markdown
 * @param {NodeListOf<Element> | Element[]} domElements - TeX\u6CE8\u91CA\u8282\u70B9\u96C6\u5408
 * @param {HTMLElement} katexElement - KaTeX DOM\u5143\u7D20\uFF0C\u7528\u4E8E\u5224\u65AD\u662F\u5757\u7EA7\u8FD8\u662F\u884C\u5185
 * @returns {string} \u8F6C\u6362\u540E\u7684 Markdown \u6587\u672C
 */
function texToMarkdown(domElements, katexElement) {
  let content = '';

  domElements.forEach(node => {
    const tex = node.textContent.trim();
    // \u628A\u5305\u542B\u8BE5 annotation \u7684\u6700\u5916\u5C42 KaTeX \u8282\u70B9\u66FF\u6362\u4E3A TeX
    const katexSpan = node.closest('span.katex') || node.parentElement;
    if (katexSpan) {
      content += tex;
    }
  });

  if (!content) {
    return '';
  }

  // \u5224\u65AD\u662F\u5757\u7EA7\u8FD8\u662F\u884C\u5185\u6570\u5B66\u516C\u5F0F
  let isBlock = false;
  if (katexElement) {
    try {
      // \u9996\u5148\u68C0\u67E5\u662F\u5426\u5728\u884C\u5185\u4E0A\u4E0B\u6587\u4E2D\uFF08\u6807\u9898\u3001\u94FE\u63A5\u3001\u5F3A\u8C03\u7B49\uFF09
      let isInlineContext = false;
      let current = katexElement.parentElement;
      while (current) {
        const tagName = current.tagName.toLowerCase();
        // \u5982\u679C\u5728\u6807\u9898\u3001\u94FE\u63A5\u3001\u5F3A\u8C03\u3001\u4EE3\u7801\u7B49\u884C\u5185\u5143\u7D20\u4E2D\uFF0C\u5F3A\u5236\u4F7F\u7528\u884C\u5185\u6570\u5B66
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'strong', 'b', 'em', 'i', 'code'].includes(tagName)) {
          isInlineContext = true;
          break;
        }
        current = current.parentElement;
      }

      if (isInlineContext) {
        isBlock = false;
      } else {
        const tagName = katexElement.tagName.toLowerCase();
        const computedStyle = window.getComputedStyle(katexElement);
        const display = computedStyle.display;

        // \u5982\u679C\u4E0D\u662Fspan\uFF0C\u6216\u8005display\u662Fblock\uFF0C\u5219\u4E3A\u5757\u7EA7
        if (tagName !== 'span' || display === 'block') {
          isBlock = true;
        } else {
          // \u68C0\u67E5\u7236\u5143\u7D20\u4E0A\u4E0B\u6587
          const parent = katexElement.parentElement;
          if (parent) {
            const parentTag = parent.tagName.toLowerCase();
            // \u5982\u679C\u7236\u5143\u7D20\u662F\u6BB5\u843D(p)\uFF0C\u901A\u5E38\u662F\u884C\u5185
            // \u5982\u679C\u7236\u5143\u7D20\u662Fdiv\u6216\u5176\u4ED6\u5757\u7EA7\u5143\u7D20\uFF0C\u4E14KaTeX\u662F\u4E3B\u8981\u5185\u5BB9\uFF0C\u53EF\u80FD\u662F\u5757\u7EA7
            if (parentTag !== 'p') {
              // \u68C0\u67E5\u662F\u5426\u6709\u5176\u4ED6\u975E\u7A7A\u6587\u672C\u5144\u5F1F\u8282\u70B9
              const siblings = Array.from(parent.childNodes);
              const hasOtherContent = siblings.some(node =>
                node !== katexElement &&
                node.nodeType === Node.TEXT_NODE &&
                node.textContent.trim()
              );
              // \u5982\u679C\u6CA1\u6709\u5176\u4ED6\u6587\u672C\u5185\u5BB9\uFF0C\u53EF\u80FD\u662F\u5757\u7EA7\u6570\u5B66\u516C\u5F0F
              if (!hasOtherContent) {
                isBlock = true;
              }
            }
          }
        }
      }
    } catch (e) {
      // \u5982\u679C\u65E0\u6CD5\u83B7\u53D6\u6837\u5F0F\uFF0C\u9ED8\u8BA4\u4F7F\u7528\u884C\u5185
      console.warn('Could not determine math display type:', e);
    }
  }

  if (isBlock) {
    return `$$${content}$$\n\n`;
  } else {
    // \u884C\u5185\u6570\u5B66\u516C\u5F0F\u4F7F\u7528 $...$
    return `$${content}$`;
  }
}

/**
 * \u4ECEMarkdown\u8F6C\u6362\u7684HTML\u4EE3\u7801\u5757\u4E2D\u63D0\u53D6\u8BED\u8A00\u548C\u5185\u5BB9
 * @param {HTMLElement} domElement - \u4EE3\u7801\u5757\u7684DOM\u5143\u7D20
 * @returns {Object} \u5305\u542Blanguage\u548Ccontent\u7684\u5BF9\u8C61\uFF0C\u5982\u679C\u63D0\u53D6\u5931\u8D25\u5219\u8FD4\u56DEnull
 */
function extractMarkdownCodeInfo(domElement) {
  try {
    const cachedCode = (domElement.getAttribute('data-export-code') || '').trim();
    const cachedLang = (domElement.getAttribute('data-export-lang') || '').trim();
    if (cachedCode) {
      return {
        language: cachedLang || (/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph)\b/i.test(cachedCode) ? 'mermaid' : ''),
        content: cachedCode
      };
    }

    const infoStringElement =
      domElement.querySelector('.d813de27') ||
      domElement.querySelector('[data-language]') ||
      domElement.querySelector('.md-code-block-banner-wrap [class*="language"]');
    let language = infoStringElement
      ? (infoStringElement.getAttribute('data-language') || infoStringElement.textContent || '').trim()
      : '';
    if (!language) {
      const bannerText = (domElement.querySelector('.md-code-block-banner-wrap')?.textContent || '').trim();
      if (bannerText && !/^(\u4EE3\u7801|code|\u56FE\u8868|diagram)$/i.test(bannerText)) {
        language = bannerText.split(/\s+/)[0];
      }
    }
    const selectedTabText = (domElement.querySelector('[role="tab"][aria-selected="true"]')?.textContent || '').trim();
    const codeTabSelected = /\u4EE3\u7801|code/i.test(selectedTabText);
    const preElement = domElement.querySelector('pre');
    const preText = preElement ? (preElement.textContent || '').replace(/\u00A0/g, ' ').trim() : '';
    const mermaidSyntaxPattern = /(^|\n)\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph)\b/i;

    if (preText) {
      if (!language && mermaidSyntaxPattern.test(preText)) {
        language = 'mermaid';
      }
      if (codeTabSelected || mermaidSyntaxPattern.test(preText)) {
        return {
          language: language || '',
          content: preText
        };
      }
    }

    const candidates = [];
    const addCandidate = (value) => {
      if (typeof value !== 'string') return;
      const normalized = value.replace(/\u00A0/g, ' ').trim();
      if (!normalized) return;
      candidates.push(normalized);
    };

    domElement.querySelectorAll('pre, code, textarea').forEach(el => {
      addCandidate(el.textContent || '');
      if (typeof el.value === 'string') {
        addCandidate(el.value);
      }
    });

    const maybeSource = domElement.querySelector('.mermaid');
    if (maybeSource) {
      addCandidate(maybeSource.textContent || '');
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    const hasMermaidSvg = !!domElement.querySelector('svg.mermaid-svg, .mermaid-svg');
    const tabText = (domElement.querySelector('[role="tablist"]')?.textContent || '').trim();
    const preferMermaid = hasMermaidSvg || /\u56FE\u8868|diagram|mermaid/i.test(tabText);
    const scoreCandidate = (value) => {
      let score = 0;
      if (value.includes('\n')) score += 10;
      if (/[{};]|-->|==>|subgraph|\bend\b/i.test(value)) score += 10;
      if (mermaidSyntaxPattern.test(value)) score += preferMermaid ? 80 : 30;
      if (/^<svg[\s>]/i.test(value) || /#mermaid-svg-|\.edgePath|flowchart-link/.test(value)) score -= 60;
      if (/diagram content unavailable/i.test(value)) score -= 100;
      score += Math.min(value.length, 400) / 20;
      return score;
    };

    uniqueCandidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    let content = uniqueCandidates.length > 0 ? uniqueCandidates[0] : '';

    if (!content) {
      const svgTexts = Array.from(domElement.querySelectorAll('svg text, svg foreignObject, svg .nodeLabel, svg .edgeLabel'))
        .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const uniqueSvgTexts = Array.from(new Set(svgTexts)).slice(0, 80);
      if (uniqueSvgTexts.length > 0) {
        if (preferMermaid) {
          content = `%% Mermaid source unavailable in DOM\n%% Diagram labels: ${uniqueSvgTexts.join(' | ')}`;
          if (!language) language = 'mermaid';
        } else {
          content = `[diagram]\n${uniqueSvgTexts.join(' ')}`;
          if (!language) language = 'diagram';
        }
      }
    }

    if (!content) {
      content = preferMermaid ? '%% Mermaid source unavailable in DOM' : '[diagram content unavailable]';
      if (!language) language = preferMermaid ? 'mermaid' : 'diagram';
    }

    if (!language && /(?:graph|flowchart|sequencediagram|classdiagram|statediagram|erdiagram|gantt|pie|mindmap|timeline|quadrantchart|gitgraph)/i.test(content)) {
      language = 'mermaid';
    }

    return {
      language,
      content
    };
  } catch (error) {
    console.error('Error extracting code block info:', error);
    return null;
  }
}

/**
 * \u5C06\u8BED\u8A00\u548C\u5185\u5BB9\u8F6C\u6362\u4E3AMarkdown\u683C\u5F0F\u7684\u4EE3\u7801\u5757
 * @param {string} language - \u4EE3\u7801\u8BED\u8A00
 * @param {string} content - \u4EE3\u7801\u5185\u5BB9
 * @returns {string} Markdown\u683C\u5F0F\u7684\u4EE3\u7801\u5757
 */
function generateMarkdownCode(language, content) {
  // \u65E9\u671F\u8FD4\u56DE\uFF1A\u68C0\u67E5\u8F93\u5165\u662F\u5426\u4E3A\u5B57\u7B26\u4E32
  if (typeof language !== 'string' || typeof content !== 'string') {
    console.error('Language and content must be strings');
    return '';
  }

  // \u751F\u6210Markdown\u683C\u5F0F\u7684\u4EE3\u7801\u5757
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

/**
 * \u5C06HTML\u8868\u683C\u8F6C\u6362\u4E3AMarkdown\u683C\u5F0F
 * @param {HTMLElement} tableElement - \u8868\u683CDOM\u5143\u7D20
 * @returns {string} \u8F6C\u6362\u540E\u7684Markdown\u8868\u683C\u6587\u672C
 */
function convertTableToMarkdown(tableElement) {
  if (!tableElement || tableElement.nodeName.toLowerCase() !== 'table') {
    return '';
  }

  // \u63D0\u53D6\u8868\u5934
  let headers = [];
  let skipFirstRow = false;
  const thead = tableElement.querySelector('thead');

  if (thead) {
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
      const thElements = headerRow.querySelectorAll('th, td');
      headers = Array.from(thElements).map(cell => {
        let content = '';
        for (const child of cell.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            content += domToMarkdown(child);
          } else if (child.nodeType === Node.TEXT_NODE) {
            content += child.textContent;
          }
        }
        // \u5904\u7406\u7BA1\u9053\u7B26\u548C\u6362\u884C\u7B26
        return content.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
      });
    }
  } else {
    // \u5982\u679C\u6CA1\u6709thead\uFF0C\u67E5\u627E\u7B2C\u4E00\u4E2Atr\u4F5C\u4E3A\u8868\u5934
    const tbody = tableElement.querySelector('tbody');
    const firstRow = tbody ? tbody.querySelector('tr') : tableElement.querySelector('tr');

    if (firstRow) {
      skipFirstRow = true;
      const thElements = firstRow.querySelectorAll('th');
      if (thElements.length > 0) {
        headers = Array.from(thElements).map(cell => {
          let content = '';
          for (const child of cell.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              content += domToMarkdown(child);
            } else if (child.nodeType === Node.TEXT_NODE) {
              content += child.textContent;
            }
          }
          return content.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
        });
      } else {
        // \u5982\u679C\u7B2C\u4E00\u884C\u6CA1\u6709th\uFF0C\u4F7F\u7528td\u4F5C\u4E3A\u8868\u5934
        const tdElements = firstRow.querySelectorAll('td');
        headers = Array.from(tdElements).map(cell => {
          let content = '';
          for (const child of cell.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              content += domToMarkdown(child);
            } else if (child.nodeType === Node.TEXT_NODE) {
              content += child.textContent;
            }
          }
          return content.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
        });
      }
    }
  }

  if (headers.length === 0) {
    return '';
  }

  // \u63D0\u53D6\u6570\u636E\u884C
  const rows = [];
  const tbody = tableElement.querySelector('tbody');
  const rowElements = tbody ? tbody.querySelectorAll('tr') : tableElement.querySelectorAll('tr');

  Array.from(rowElements).forEach((row, index) => {
    // \u5982\u679C\u7B2C\u4E00\u884C\u88AB\u7528\u4F5C\u8868\u5934\uFF0C\u8DF3\u8FC7\u5B83
    if (skipFirstRow && index === 0) {
      return;
    }

    const cells = row.querySelectorAll('td, th');
    const rowData = Array.from(cells).map(cell => {
      let content = '';
      for (const child of cell.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      // \u5904\u7406\u7BA1\u9053\u7B26\u548C\u6362\u884C\u7B26
      return content.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });

    // \u786E\u4FDD\u884C\u6570\u636E\u957F\u5EA6\u4E0E\u8868\u5934\u4E00\u81F4
    while (rowData.length < headers.length) {
      rowData.push('');
    }
    if (rowData.length > 0) {
      rows.push(rowData.slice(0, headers.length));
    }
  });

  // \u751F\u6210Markdown\u8868\u683C
  let markdown = '';

  // \u8868\u5934\u884C
  markdown += '| ' + headers.join(' | ') + ' |\n';

  // \u5206\u9694\u884C
  markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

  // \u6570\u636E\u884C
  rows.forEach(row => {
    markdown += '| ' + row.join(' | ') + ' |\n';
  });

  return markdown + '\n';
}

/**
 * \u5C06DOM\u5143\u7D20\u8F6C\u6362\u4E3AMarkdown\u683C\u5F0F
 * @param {HTMLElement} domElement - \u8981\u8F6C\u6362\u7684DOM\u5143\u7D20
 * @returns {string} \u8F6C\u6362\u540E\u7684Markdown\u6587\u672C
 */
function domToMarkdown(domElement) {
  // \u68C0\u67E5\u8F93\u5165\u662F\u5426\u4E3ADOM\u5143\u7D20
  if (!(domElement instanceof HTMLElement)) {
    return domElement;
  }

  // \u76F4\u63A5\u5904\u7406\u4EE3\u7801\u5757\u5143\u7D20
  if (domElement.classList.contains('md-code-block')) {
    const codeInfo = extractMarkdownCodeInfo(domElement);
    if (codeInfo) {
      return generateMarkdownCode(codeInfo.language, codeInfo.content) + '\n\n';
    }
    return '';
  } else if (domElement.classList.contains('katex')) {
    const annotations = domElement.querySelectorAll('annotation[encoding="application/x-tex"]');
    return texToMarkdown(annotations, domElement);
  }

  const isWordLikeChar = (char) => /[0-9A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(char);

  const getNeighborInfo = (element, direction) => {
    let sibling = direction === 'left' ? element.previousSibling : element.nextSibling;
    while (sibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        const raw = String(sibling.textContent || '');
        if (!raw) {
          sibling = direction === 'left' ? sibling.previousSibling : sibling.nextSibling;
          continue;
        }
        const normalized = raw.replace(/\u00A0/g, ' ');
        const trimmed = normalized.trim();
        if (!trimmed) {
          sibling = direction === 'left' ? sibling.previousSibling : sibling.nextSibling;
          continue;
        }
        const hasBoundarySpace = direction === 'left' ? /\s$/.test(normalized) : /^\s/.test(normalized);
        const char = direction === 'left' ? trimmed.charAt(trimmed.length - 1) : trimmed.charAt(0);
        return { char, hasBoundarySpace, nodeType: Node.TEXT_NODE, tagName: '' };
      }
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const text = String(sibling.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!text) {
          sibling = direction === 'left' ? sibling.previousSibling : sibling.nextSibling;
          continue;
        }
        const char = direction === 'left' ? text.charAt(text.length - 1) : text.charAt(0);
        const tagName = String(sibling.nodeName || '').toLowerCase();
        return { char, hasBoundarySpace: false, nodeType: Node.ELEMENT_NODE, tagName };
      }
      sibling = direction === 'left' ? sibling.previousSibling : sibling.nextSibling;
    }
    return { char: '', hasBoundarySpace: false, nodeType: null, tagName: '' };
  };

  const wrapInlineWithBoundarySpaces = (element, marker, rawText) => {
    const text = String(rawText || '').trim();
    if (!text) return '';
    const left = getNeighborInfo(element, 'left');
    const right = getNeighborInfo(element, 'right');
    const first = text.charAt(0);
    const last = text.charAt(text.length - 1);
    const leftBoundaryLike = isWordLikeChar(first) || /^[([{<（【《「『"']/.test(first);
    const rightBoundaryLike = isWordLikeChar(last) || /[)\]}>）】》」』"'"`]/.test(last);
    const rightWillHandleBoundary =
      right.nodeType === Node.ELEMENT_NODE &&
      /^(strong|b|em|i)$/.test(right.tagName);
    const needsRightSpace =
      !rightWillHandleBoundary &&
      !right.hasBoundarySpace &&
      right.char &&
      rightBoundaryLike &&
      isWordLikeChar(right.char);
    const normalizedNeedsLeftSpace = !left.hasBoundarySpace && left.char && isWordLikeChar(left.char) && leftBoundaryLike;
    return `${normalizedNeedsLeftSpace ? ' ' : ''}${marker}${text}${marker}${needsRightSpace ? ' ' : ''}`;
  };

  // \u5904\u7406\u5404\u79CD\u5143\u7D20\u7C7B\u578B
  switch (domElement.nodeName.toLowerCase()) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = domElement.nodeName.toLowerCase().charAt(1);
      const prefix = '#'.repeat(parseInt(level));
      // \u5904\u7406\u6807\u9898\u5185\u5BB9\uFF0C\u53EF\u80FD\u5305\u542B\u5B50\u5143\u7D20
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      return `${prefix} ${content.trim()}\n\n`;
    }
    case 'p': {
      // \u5904\u7406\u6BB5\u843D\u5185\u5BB9\uFF0C\u5305\u62EC\u5B50\u5143\u7D20
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      return `${content.trim()}\n\n`;
    }
    case 'ul': {
      let result = '';
      for (const li of domElement.children) {
        if (li.nodeName.toLowerCase() === 'li') {
          let content = '';
          for (const child of li.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              content += domToMarkdown(child);
            } else if (child.nodeType === Node.TEXT_NODE) {
              content += child.textContent;
            }
          }
          result += `- ${content.trim()}\n`;
        }
      }
      return result + '\n';
    }
    case 'ol': {
      let result = '';
      // \u68C0\u67E5\u662F\u5426\u6709start\u5C5E\u6027
      let index = 1;
      if (domElement.hasAttribute('start')) {
        index = parseInt(domElement.getAttribute('start')) || 1;
      }

      for (const li of domElement.children) {
        if (li.nodeName.toLowerCase() === 'li') {
          let content = '';
          for (const child of li.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              content += domToMarkdown(child);
            } else if (child.nodeType === Node.TEXT_NODE) {
              content += child.textContent;
            }
          }
          result += `${index}. ${content.trim()}\n`;
          index++;
        }
      }
      return result + '\n';
    }
    case 'blockquote': {
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      const normalized = content
        .replace(/\r\n?/g, '\n')
        .trim();
      if (!normalized) {
        return '> \n\n';
      }
      const quoted = normalized
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
      return `${quoted}\n\n`;
    }
    case 'a': {
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      return `[${content.trim()}](${domElement.getAttribute('href')})`;
    }
    case 'strong':
    case 'b': {
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      return wrapInlineWithBoundarySpaces(domElement, '**', content);
    }
    case 'em':
    case 'i': {
      let content = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          content += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          content += child.textContent;
        }
      }
      return wrapInlineWithBoundarySpaces(domElement, '*', content);
    }
    case 'code': {
      if (!domElement.closest('.md-code-block')) {
        return `\`${domElement.textContent.trim()}\``;
      }
      return domElement.textContent.trim();
    }
    case 'img': {
      return `![${domElement.getAttribute('alt') || ''}](${domElement.getAttribute('src')})`;
    }
    case 'hr': {
      return `---\n\n`;
    }
    case 'br': {
      // Markdown \u786C\u6362\u884C\u9700\u8981\u4E24\u4E2A\u7A7A\u683C\u52A0\u6362\u884C
      return `  \n`;
    }
    case 'table': {
      return convertTableToMarkdown(domElement);
    }
    default: {
      // \u5BF9\u4E8E\u5176\u4ED6\u5143\u7D20\uFF0C\u5904\u7406\u6240\u6709\u5B50\u8282\u70B9
      let result = '';
      for (const child of domElement.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          result += domToMarkdown(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent;
          if (text) {
            result += text;
          }
        }
      }
      return result;
    }
  }
}

function normalizeAssistantContent(domElement) {
  if (!(domElement instanceof HTMLElement)) {
    return {
      element: domElement,
      references: []
    };
  }

  const cloned = domElement.cloneNode(true);
  const references = [];
  const referenceMap = new Map();
  const buildReferenceLabel = (element) => {
    const countTextNode = element ? element.querySelector('._669a677') : null;
    const countText = countTextNode ? (countTextNode.textContent || '').trim() : '';
    const domains = Array.from((element || document).querySelectorAll('img.site_logo_img'))
      .map(img => {
        const src = (img.getAttribute('src') || '').trim();
        if (!src) return '';
        try {
          const pathname = new URL(src, window.location.href).pathname || '';
          return pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
          return '';
        }
      })
      .filter(Boolean);
    const uniqueDomains = Array.from(new Set(domains));
    const labelParts = [];
    if (countText) labelParts.push(countText);
    if (uniqueDomains.length > 0) labelParts.push(uniqueDomains.join(', '));
    return labelParts.join(' - ');
  };
  const ensureReference = (href, label) => {
    const key = `${href || ''}__${label || ''}`;
    let index = referenceMap.get(key);
    if (!index) {
      references.push({ href: href || '', label: label || '' });
      index = references.length;
      referenceMap.set(key, index);
    }
    return index;
  };
  const citeLinks = cloned.querySelectorAll('a');

  citeLinks.forEach(link => {
    const citeNode = link.querySelector('.ds-markdown-cite');
    const sourceNode = link.querySelector('.f93f59e4');
    const hasSiteLogos = link.querySelectorAll('.site_logo_img').length > 0;
    const href = (link.getAttribute('href') || '').trim();
    const isReferenceLink = !!citeNode || !!sourceNode || hasSiteLogos;
    if (!isReferenceLink || !href) return;

    const label = buildReferenceLabel(link);
    const index = ensureReference(href, label);

    const marker = cloned.ownerDocument.createTextNode(`[^${index}]`);
    link.replaceWith(marker);
  });

  const standaloneSources = cloned.querySelectorAll('.f93f59e4');
  standaloneSources.forEach(source => {
    if (source.closest('a')) return;
    const label = buildReferenceLabel(source);
    if (!label) return;
    const index = ensureReference('', label);
    const marker = cloned.ownerDocument.createTextNode(`[^${index}]`);
    source.replaceWith(marker);
  });

  return {
    element: cloned,
    references
  };
}

function assistantElementToMarkdown(domElement) {
  const normalized = normalizeAssistantContent(domElement);
  const base = domToMarkdown(normalized.element).trim();
  return {
    content: base,
    references: normalized.references
  };
}

function referencesToMarkdown(referenceItems, referenceIds) {
  if (!Array.isArray(referenceItems) || referenceItems.length === 0) {
    return '';
  }
  return referenceItems
    .map((item, index) => {
      const refId = Array.isArray(referenceIds) && referenceIds[index]
        ? String(referenceIds[index]).trim()
        : String(index + 1);
      const href = (item && item.href ? item.href : '').trim();
      const label = (item && item.label ? item.label : '').trim();
      if (label && href) return `[^${refId}]: [${label}](${href})`;
      if (href) return `[^${refId}]: ${href}`;
      if (label) return `[^${refId}]: ${label}`;
      return `[^${refId}]: `;
    })
    .join('\n');
}

function referencesToPlainText(referenceItems) {
  if (!Array.isArray(referenceItems) || referenceItems.length === 0) {
    return '';
  }
  return referenceItems
    .map((item, index) => {
      const href = (item && item.href ? item.href : '').trim();
      const label = (item && item.label ? item.label : '').trim();
      if (label && href) return `${index + 1}. ${label} - ${href}`;
      if (href) return `${index + 1}. ${href}`;
      if (label) return `${index + 1}. ${label}`;
      return `${index + 1}.`;
    })
    .join('\n');
}

function renderHtmlReferenceSuperscripts(contentHtml, referenceItems, referencePrefix) {
  if (!contentHtml) return '';
  return String(contentHtml).replace(/\[\^(\d+)\]/g, (match, value) => {
    const localIndex = Number(value);
    if (!Number.isInteger(localIndex) || localIndex < 1) return match;
    const item = Array.isArray(referenceItems) ? referenceItems[localIndex - 1] : null;
    if (!item) return match;
    const label = escapeHtml((item.label || item.href || '').trim());
    const href = (item.href || '').trim();
    const titleAttr = label ? ` title="${label}"` : '';
    if (href) {
      const safeHref = escapeHtml(href);
      return `<sup class="reference-sup"><a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>[${localIndex}]</a></sup>`;
    }
    const targetId = `${referencePrefix}-ref-${localIndex}`;
    return `<sup class="reference-sup"><a href="#${targetId}"${titleAttr}>[${localIndex}]</a></sup>`;
  });
}

function buildHtmlReferencesPanel(referenceItems, referencePrefix) {
  if (!Array.isArray(referenceItems) || referenceItems.length === 0) return '';
  const items = referenceItems.map((item, index) => {
    const refNumber = index + 1;
    const refId = `${referencePrefix}-ref-${refNumber}`;
    const label = escapeHtml((item.label || '').trim());
    const href = escapeHtml((item.href || '').trim());
    if (href && label) {
      return `<li id="${refId}"><a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
    }
    if (href) {
      return `<li id="${refId}"><a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a></li>`;
    }
    if (label) {
      return `<li id="${refId}">${label}</li>`;
    }
    return `<li id="${refId}">[${refNumber}]</li>`;
  }).join('');
  return `    <div class="reference-panel">
      <details>
        <summary>References</summary>
        <div class="reference-panel-content references">
          <ol>${items}</ol>
        </div>
      </details>
    </div>`;
}

function getDefaultConversationTitle() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `DeepSeek-Chat-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getConversationTitle() {
  const nodes = [
    document.querySelector('.f8d1e4c0 .afa34042'),
    document.querySelector('.f8d1e4c0')
  ];

  for (const node of nodes) {
    if (!node) continue;
    const text = (node.textContent || '').trim();
    if (text) return text;
  }

  const pageTitle = (document.title || '').trim();
  if (pageTitle) return pageTitle;
  return getDefaultConversationTitle();
}

function extractUserAttachments(messageElement) {
  const container = messageElement.closest('.ds-message') || messageElement.closest('._9663006');
  if (!container) return [];

  const nameNodes = Array.from(container.querySelectorAll('.f3a54b52'));
  const sizeNodes = Array.from(container.querySelectorAll('.dc832104'));
  const attachments = [];
  const seen = new Set();

  nameNodes.forEach((nameNode, index) => {
    const name = (nameNode.textContent || '').trim();
    const size = (sizeNodes[index] && sizeNodes[index].textContent ? sizeNodes[index].textContent : '').trim();
    if (!name) return;

    const key = `${name}__${size}`;
    if (seen.has(key)) return;
    seen.add(key);

    const type = size ? size.split(/\s+/)[0] : '';
    attachments.push({ name, size, type });
  });

  return attachments;
}

function formatUserContent(text, attachments) {
  const normalizedText = (text || '').trim();
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return normalizedText;
  }

  const attachmentLines = attachments
    .map((item, index) => `${index + 1}. ${item.name}${item.size ? ` (${item.size})` : ''}`)
    .join('\n');

  if (!normalizedText) {
    return `Attachments:\n${attachmentLines}`;
  }

  return `${normalizedText}\n\nAttachments:\n${attachmentLines}`;
}

function formatUserMarkdownContent(content) {
  const text = String(content ?? '');
  const maxRunLength = (value, ch) => {
    const pattern = new RegExp(`${ch}+`, 'g');
    let max = 0;
    let match = pattern.exec(value);
    while (match) {
      if (match[0].length > max) {
        max = match[0].length;
      }
      match = pattern.exec(value);
    }
    return max;
  };
  const maxBackticks = maxRunLength(text, '`');
  const maxTildes = maxRunLength(text, '~');
  const useBackticks = maxBackticks <= maxTildes;
  const fenceChar = useBackticks ? '`' : '~';
  const fenceLen = Math.max(3, (useBackticks ? maxBackticks : maxTildes) + 1);
  const fence = fenceChar.repeat(fenceLen);
  return `${fence}text\n${text}\n${fence}`;
}

/**
 * Convert chat data to Markdown format
 * @param {Object} data - The chat data to convert
 * @returns {string} - The Markdown content
 */
function convertToMarkdown(data, settings) {
  const includeReferences = !!(settings && settings.exportWebReferences);
  const onlyReply = !!(settings && settings.onlyReplyContent);
  let markdown = '';

  // MOD: only add header when NOT in only-reply mode
  if (!onlyReply) {
    markdown += `# ${data.title}\n\n`;
    markdown += `- **URL**: ${data.url}\n`;
    markdown += `- **Date**: ${new Date(data.date).toLocaleString()}\n\n`;
    markdown += `---\n\n`;
  }

  let globalReferenceCounter = 0;
  data.messages.forEach((msg, index) => {
    // MOD: Conditionally add role headers
    if (!onlyReply) {
      const roleIcon = msg.role === 'user' ? '\u{1F9D1}' : '\u{1F916}';
      const roleName = msg.role === 'user' ? 'User' : 'DeepSeek AI';
      markdown += `## ${roleIcon} ${roleName}\n\n`;
    }

    if (msg.role === 'assistant' && msg.chain_of_thought) {
      // MOD: only add CoT header when not in only-reply mode
      if (!onlyReply) {
        markdown += `### Chain of Thought\n\n`;
      }
      markdown += `${extractParagraphs(msg.chain_of_thought)}\n\n`;
    }

    if (msg.role === 'assistant') {
      const assistantData = assistantElementToMarkdown(msg.content);
      let assistantContent = assistantData.content;
      if (assistantData.references.length > 0) {
        if (includeReferences) {
          const referenceIds = assistantData.references.map(() => {
            globalReferenceCounter += 1;
            return globalReferenceCounter;
          });
          assistantContent = assistantContent.replace(/\[\^(\d+)\]/g, (match, localIndex) => {
            const mappedId = referenceIds[Number(localIndex) - 1];
            return mappedId ? `[^${mappedId}]` : match;
          });
          assistantContent = assistantContent.replace(/(\[\^\d+\])(?=\[\^\d+\])/g, '$1 ');
          markdown += `${assistantContent}\n\n`;
          markdown += `### References\n\n`;
          markdown += `${referencesToMarkdown(assistantData.references, referenceIds)}\n\n`;
        } else {
          assistantContent = removeReferenceMarkers(assistantContent);
          markdown += `${assistantContent}\n\n`;
        }
      } else {
        markdown += `${assistantContent}\n\n`;
      }
    } else {
      markdown += `${formatUserMarkdownContent(msg.content)}\n\n`;
    }

    // MOD: skip separators in only-reply mode
    if (!onlyReply && index < data.messages.length - 1) {
      markdown += `---\n\n`;
    }
  });

  return markdown;
}

/**
 * Convert chat data to plain text format
 * @param {Object} data - The chat data to convert
 * @returns {string} - The plain text content
 */
function convertToPlainText(data, settings) {
  const includeReferences = !!(settings && settings.exportWebReferences);
  const onlyReply = !!(settings && settings.onlyReplyContent);
  let text = '';

  // MOD: only add header when NOT in only-reply mode
  if (!onlyReply) {
    text += `${data.title}\n\n`;
    text += `URL: ${data.url}\n`;
    text += `Date: ${new Date(data.date).toLocaleString()}\n\n`;
    text += `----------------------------------------\n\n`;
  }

  // Process each message
  data.messages.forEach((msg, index) => {
    // MOD: only add role header when NOT in only-reply mode
    if (!onlyReply) {
      const roleName = msg.role === 'user' ? 'User' : 'DeepSeek AI';
      text += `${roleName}:\n\n`;
    }

    // Add chain of thought first (before content) to match DeepSeek website
    if (msg.role === 'assistant' && msg.chain_of_thought) {
      if (!onlyReply) {
        text += `Thinking process:\n\n`;
      }
      text += `${extractParagraphs(msg.chain_of_thought)}\n\n`;
    }

    if (msg.role === 'user') {
      text += `${msg.content}\n\n`;
    } else {
      const assistantData = assistantElementToMarkdown(msg.content);
      const assistantContent = includeReferences
        ? assistantData.content
        : removeReferenceMarkers(assistantData.content);
      text += `${assistantContent}\n\n`;
      if (includeReferences && assistantData.references.length > 0) {
        text += `References:\n${referencesToPlainText(assistantData.references)}\n\n`;
      }
    }

    // MOD: skip separators in only-reply mode
    if (!onlyReply && index < data.messages.length - 1) {
      text += `----------------------------------------\n\n`;
    }
  });

  return text;
}

/**
 * Extract paragraphs from DOM element
 * @param {HTMLElement} element - The DOM element to process
 * @returns {string} - Text content with preserved paragraphs
 */
function extractParagraphs(element) {
  if (!element) return '';

  const paragraphs = [];
  element.querySelectorAll('p').forEach(p => {
    paragraphs.push(p.textContent.trim());
  });

  return paragraphs.length > 0 ?
    paragraphs.join('\n') :
    element.textContent.trim();
}

/**
 * \u4ECE\u9875\u9762\u4E2D\u63D0\u53D6\u6240\u6709\u6D88\u606F
 * @returns {Array} \u6D88\u606F\u6570\u7EC4
 */
function extractAllMessagesFromPage(root = document, options = {}) {
  try {
    const cloneDomNodes = !!(options && options.cloneDomNodes);
    const userQuestions = root.querySelectorAll('.fbb737a4');
    const aiResponses = root.querySelectorAll('.ds-message .ds-markdown:not(.ds-think-content .ds-markdown)');
    const cotContainers = root.querySelectorAll('.ds-message .ds-think-content');
    const conversationTitle = getConversationTitle();

    if (userQuestions.length === 0 && aiResponses.length === 0 && cotContainers.length === 0) {
      return { };
    }

    const allElements = [];

    userQuestions.forEach(el => {
      allElements.push({
        element: el,
        type: 'user'
      });
    });

    aiResponses.forEach(el => {
      allElements.push({
        element: el,
        type: 'ai'
      });
    });

    cotContainers.forEach(el => {
      allElements.push({
        element: el,
        type: 'cot'
      });
    });

    allElements.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const messages = [];
    let cot = null;
    allElements.forEach((item, index) => {
      const { element, type } = item;
      if (type === 'user') {
        const attachments = extractUserAttachments(element);
        const content = formatUserContent(element.textContent.trim(), attachments);
        const message = {
          role: 'user',
          content,
          element_id: element.id || `user-${index}-${Date.now()}`
        };
        if (attachments.length > 0) {
          message.attachments = attachments;
        }
        messages.push(message);
      }
      else if (type === 'ai') {
        const message = {
          role: 'assistant',
          content: cloneDomNodes ? element.cloneNode(true) : element,
          element_id: element.id || `ai-${index}-${Date.now()}`
        };
        if (cot !== null) {
          message.chain_of_thought = cot;
          cot = null;
        }
        messages.push(message);
      }
      else if (type === 'cot') {
        cot = cloneDomNodes ? element.cloneNode(true) : element;
      }
    });
    return { title: conversationTitle, messages };
  } catch (error) {
    console.error('Error extracting messages from page:', error);
    return { };
  }
}

function cleanCodeBlockDOM(domElement) {
  if (!domElement) return domElement;

  // \u521B\u5EFA\u4E00\u4E2A\u526F\u672C\u4EE5\u907F\u514D\u4FEE\u6539\u539F\u59CBDOM
  const clonedDOM = domElement.cloneNode(true);

  // \u67E5\u627E\u6240\u6709\u4EE3\u7801\u5757
  const codeBlocks = clonedDOM.querySelectorAll('.md-code-block');

  codeBlocks.forEach(codeBlock => {
    // \u5220\u9664banner\u5143\u7D20
    const banners = codeBlock.querySelectorAll('.md-code-block-banner-wrap');
    banners.forEach(banner => banner.remove());

    // \u5220\u9664footer\u5143\u7D20
    const footers = codeBlock.querySelectorAll('.md-code-block-footer');
    footers.forEach(footer => footer.remove());

    const decorativeSvgs = codeBlock.querySelectorAll('svg._9bc997d, svg[class*="_9bc997d"]');
    decorativeSvgs.forEach(svg => svg.remove());
  });

  return clonedDOM;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractCodeLanguageForHtml(codeBlock) {
  if (!(codeBlock instanceof HTMLElement)) return '';
  const fromCodeInfo = extractMarkdownCodeInfo(codeBlock);
  if (fromCodeInfo && fromCodeInfo.language) {
    return String(fromCodeInfo.language).trim().toLowerCase();
  }

  const candidates = [
    codeBlock.querySelector('pre code'),
    codeBlock.querySelector('code'),
    codeBlock.querySelector('pre')
  ].filter(Boolean);

  for (const node of candidates) {
    const dataLang = (node.getAttribute('data-language') || '').trim();
    if (dataLang) return dataLang.toLowerCase();
    const className = node.className || '';
    const match = className.match(/(?:^|\s)(?:language|lang)-([a-z0-9_+#.-]+)/i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  return '';
}

function appendCodeLanguageBadge(codeBlock, language) {
  if (!language) return;
  if (codeBlock.querySelector('[data-export-language-badge="1"]')) return;
  const pre = codeBlock.querySelector('pre');
  if (!pre || !pre.parentNode) return;
  const badge = codeBlock.ownerDocument.createElement('span');
  badge.className = 'language-header';
  badge.setAttribute('data-export-language-badge', '1');
  badge.textContent = String(language).trim().toLowerCase();
  pre.parentNode.insertBefore(badge, pre);
}

let exportCopyTargetId = 0;

function ensureCopyTargetId(pre) {
  if (!pre) return '';
  if (!pre.id) {
    exportCopyTargetId += 1;
    pre.id = `export-code-${exportCopyTargetId}`;
  }
  return pre.id;
}

function appendCopyButtonNearPre(pre) {
  if (!pre || !pre.parentNode) return;
  const targetId = ensureCopyTargetId(pre);
  if (!targetId) return;
  let button = pre.parentNode.querySelector(`button[data-copy-target="${targetId}"]`);
  if (!button) {
    button = pre.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-btn';
    button.setAttribute('data-copy-target', targetId);
    pre.parentNode.insertBefore(button, pre);
  }
  button.textContent = 'Copy';
}

function assistantElementToHtml(domElement) {
  const normalized = normalizeAssistantContent(domElement);
  const sourceCodeBlocks = Array.from(normalized.element.querySelectorAll('.md-code-block'));
  const htmlElement = cleanCodeBlockDOM(normalized.element);
  const codeBlocks = Array.from(htmlElement.querySelectorAll('.md-code-block'));
  codeBlocks.forEach((codeBlock, index) => {
    const sourceCodeBlock = sourceCodeBlocks[index] || codeBlock;
    const language = extractCodeLanguageForHtml(sourceCodeBlock);
    appendCodeLanguageBadge(codeBlock, language);
    appendCopyButtonNearPre(codeBlock.querySelector('pre'));

    const hasMermaidSvg = !!codeBlock.querySelector('svg.mermaid-svg, .mermaid-svg');
    const tabText = (codeBlock.querySelector('[role="tablist"]')?.textContent || '').trim();
    const likelyDiagram = hasMermaidSvg || /\u56FE\u8868|diagram|mermaid/i.test(tabText);
    if (!likelyDiagram) return;

    const codeInfo = extractMarkdownCodeInfo(sourceCodeBlock) || extractMarkdownCodeInfo(codeBlock);
    if (!codeInfo || !codeInfo.content) return;

    const sourceBlock = htmlElement.ownerDocument.createElement('details');
    sourceBlock.className = 'diagram-code-panel';
    const summary = htmlElement.ownerDocument.createElement('summary');
    summary.textContent = 'Diagram Code';
    const pre = htmlElement.ownerDocument.createElement('pre');
    const code = htmlElement.ownerDocument.createElement('code');
    if (codeInfo.language) {
      code.className = `language-${codeInfo.language}`;
    }
    code.textContent = codeInfo.content;
    pre.appendChild(code);
    sourceBlock.appendChild(summary);
    if (codeInfo.language) {
      const badge = htmlElement.ownerDocument.createElement('span');
      badge.className = 'language-header';
      badge.setAttribute('data-export-language-badge', '1');
      badge.textContent = String(codeInfo.language).trim().toLowerCase();
      sourceBlock.appendChild(badge);
    }
    sourceBlock.appendChild(pre);
    codeBlock.insertAdjacentElement('afterend', sourceBlock);
    appendCopyButtonNearPre(pre);
  });
  const htmlBody = htmlElement.innerHTML;

  const items = normalized.references.map((item, index) => {
    const label = escapeHtml((item.label || '').trim());
    const href = escapeHtml((item.href || '').trim());
    if (href && label) {
      return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
    }
    if (href) {
      return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a></li>`;
    }
    if (label) {
      return `<li>${label}</li>`;
    }
    return `<li>[${index + 1}]</li>`;
  }).join('');

  return {
    content_html: htmlBody,
    references_html: items ? `<ol>${items}</ol>` : '',
    references: normalized.references
  };
}

/**
 * Convert chat data to HTML format
 * @param {Object} data - The chat data to convert
 * @returns {string} - The HTML content
 */
function convertToHTML(data, settings) {
  const includeReferences = !!(settings && settings.exportWebReferences);
  const onlyReply = !!(settings && settings.onlyReplyContent);
  const safeTitle = escapeHtml(data.title);
  const safeUrl = escapeHtml(data.url);
  const safeDate = escapeHtml(new Date(data.date).toLocaleString());

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <title>${safeTitle}</title>
  <style>
    :root {
      --primary-bg: #ffffff;
      --secondary-bg: #f8f9fa;
      --user-msg-bg: #f0f7ff;
      --ai-msg-bg: #f0faf4;
      --user-accent: #0366d6;
      --ai-accent: #28a745;
      --border-color: #e1e4e8;
      --text-primary: #24292e;
      --text-secondary: #586069;
      --code-bg: #f6f8fa;
      --code-block-bg: #1e1e1e;
      --code-text: #e6e6e6;
      --chain-bg: #fffbea;
      --chain-border: #f9c513;
      --chain-title: #b08800;
      --shadow: rgba(0, 0, 0, 0.05);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --primary-bg: #0d1117;
        --secondary-bg: #161b22;
        --user-msg-bg: #0d1d30;
        --ai-msg-bg: #0d2a1a;
        --user-accent: #58a6ff;
        --ai-accent: #3fb950;
        --border-color: #30363d;
        --text-primary: #c9d1d9;
        --text-secondary: #8b949e;
        --code-bg: #161b22;
        --code-block-bg: #1e1e1e;
        --code-text: #e6e6e6;
        --chain-bg: #2d261e;
        --chain-border: #d29922;
        --chain-title: #e3b341;
        --shadow: rgba(0, 0, 0, 0.3);
      }
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background-color: var(--primary-bg);
    }

    .chat-header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .chat-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .chat-metadata {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 5px;
    }

    .message-container {
      margin-bottom: 25px;
      padding-bottom: 25px;
      border-bottom: 1px solid var(--border-color);
      animation: fadeIn 0.3s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-header {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }

    .user-message .message-header {
      color: var(--user-accent);
    }

    .ai-message .message-header {
      color: var(--ai-accent);
    }

    .message-role {
      font-weight: 600;
      font-size: 16px;
      margin-left: 8px;
    }

    .message-content {
      background-color: var(--secondary-bg);
      padding: 18px;
      border-radius: 10px;
      box-shadow: 0 2px 8px var(--shadow);
      overflow-wrap: break-word;
    }

    .message-container.ai-message .message-content {
      margin-top: 12px;
    }

    .user-message .message-content {
      background-color: var(--user-msg-bg);
      border-left: 3px solid var(--user-accent);
    }

    .ai-message .message-content {
      background-color: var(--ai-msg-bg);
      border-left: 3px solid var(--ai-accent);
    }

    .chain-of-thought {
      margin-top: 15px;
    }

    .chain-of-thought details {
      background-color: var(--chain-bg);
      border-radius: 8px;
      border-left: 3px solid var(--chain-border);
      overflow: hidden;
    }

    .chain-of-thought summary {
      padding: 12px 15px;
      font-weight: 600;
      cursor: pointer;
      color: var(--chain-title);
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    }

    .chain-of-thought summary::after {
      content: '\u25BC';
      font-size: 10px;
      transition: transform 0.2s ease;
    }

    .chain-of-thought details[open] summary::after {
      transform: rotate(180deg);
    }

    .chain-of-thought-content {
      padding: 15px;
      border-top: 1px solid var(--chain-border);
      color: var(--text-primary);
    }

    pre {
      background-color: var(--code-bg);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 15px 0;
    }

    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
    }

    .code-block {
      background-color: var(--code-block-bg);
      color: var(--code-text);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 15px 0;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
      line-height: 1.5;
      box-shadow: 0 2px 8px var(--shadow);
    }

    .language-header {
      display: inline-block;
      font-size: .78rem;
      color: #475569;
      margin-right: .4rem;
      margin-bottom: .35rem;
      background: #e2e8f0;
      padding: .15rem .45rem;
      border-radius: 999px;
      font-weight: 600;
      text-transform: uppercase;
      vertical-align: middle;
    }

    .code-copy-btn {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      margin-bottom: .35rem;
      padding: .15rem .55rem;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #f3f4f6;
      color: #374151;
      font-size: .75rem;
      font-weight: 600;
      line-height: 1.3;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease;
    }

    .code-copy-btn:hover {
      background: #e5e7eb;
      color: #111827;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }

    h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }

    a {
      color: var(--user-accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .reference-sup {
      margin-left: 1px;
      margin-right: 1px;
    }

    .reference-sup a {
      font-size: 0.78em;
      vertical-align: super;
      text-decoration: none;
      font-weight: 600;
    }

    ul, ol {
      padding-left: 2em;
    }

    li + li {
      margin-top: 0.25em;
    }

    blockquote {
      margin: 1em 0;
      padding: 0 1em;
      color: var(--text-secondary);
      border-left: 0.25em solid var(--border-color);
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }

    table th, table td {
      padding: 8px 12px;
      border: 1px solid var(--border-color);
    }

    table th {
      background-color: var(--secondary-bg);
      font-weight: 600;
    }

    img {
      max-width: 100%;
      border-radius: 6px;
    }

    .references ol {
      margin: 0;
      padding-left: 22px;
    }

    .references li {
      margin: 4px 0;
    }

    .reference-panel {
      margin-top: 15px;
    }

    .reference-panel details {
      background-color: var(--secondary-bg);
      border-radius: 8px;
      border-left: 3px solid var(--border-color);
      overflow: hidden;
    }

    .reference-panel summary {
      padding: 12px 15px;
      font-weight: 600;
      cursor: pointer;
      color: var(--text-secondary);
      user-select: none;
    }

    .reference-panel-content {
      padding: 12px 15px;
      border-top: 1px solid var(--border-color);
    }

    .diagram-code-panel {
      margin-top: 10px;
      border-top: 1px dashed var(--border-color);
      padding-top: 8px;
    }

    .diagram-code-panel summary {
      cursor: pointer;
      color: var(--text-secondary);
      font-weight: 600;
      margin-bottom: 8px;
      user-select: none;
    }

    .katex .katex-mathml {
      clip: rect(1px, 1px, 1px, 1px);
      border: 0;
      width: 100px;
      height: 50px;
      padding: 0;
      position: absolute;
      overflow: hidden;
    }

    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px 0;
    }

    .katex {
      text-rendering: auto;
    }
  </style>
</head>
<body>
`;

  // MOD: only add header when NOT in only-reply mode
  if (!onlyReply) {
    html += `  <div class="chat-header">
    <div class="chat-title">${safeTitle}</div>
    <div class="chat-metadata">URL: ${safeUrl}</div>
    <div class="chat-metadata">Date: ${safeDate}</div>
  </div>
`;
  }

  // \u5904\u7406\u6BCF\u6761\u6D88\u606F
  data.messages.forEach((msg, msgIndex) => {
    const roleClass = msg.role === 'user' ? 'user-message' : 'ai-message';
    const roleIcon = msg.role === 'user' ? '\u{1F9D1}' : '\u{1F916}';
    const roleName = msg.role === 'user' ? 'User' : 'DeepSeek AI';

    // \u5904\u7406\u6D88\u606F\u5185\u5BB9\uFF0C\u5982\u679C\u662F Markdown \u683C\u5F0F\uFF0C\u8F6C\u6362\u4E3A HTML
    let processedContent = msg.content;
    let referencesPanel = '';
    if (msg.role === 'assistant') {
      const assistantHtmlData = assistantElementToHtml(msg.content);
      const referencePrefix = `msg-${msgIndex + 1}`;
      if (includeReferences) {
        processedContent = renderHtmlReferenceSuperscripts(
          assistantHtmlData.content_html,
          assistantHtmlData.references,
          referencePrefix
        );
        referencesPanel = buildHtmlReferencesPanel(assistantHtmlData.references, referencePrefix);
      } else {
        processedContent = removeReferenceMarkers(assistantHtmlData.content_html);
      }
    } else {
      processedContent = escapeHtml(msg.content).replace(/\n/g, '<br>');
    }

    html += `  <div class="message-container ${roleClass}">`;

    // MOD: only add message header when NOT in only-reply mode
    if (!onlyReply) {
      html += `
    <div class="message-header">
      <span>${roleIcon}</span>
      <span class="message-role">${roleName}</span>
    </div>`;
    }

    // Add chain of thought first (before content) to match DeepSeek website
    if (msg.chain_of_thought) {
      if (onlyReply) {
        // In only-reply mode, skip the CoT entirely
        // (messages are pre-filtered, but just in case)
      } else {
        html += `    <div class="chain-of-thought">
      <details>
        <summary>Thinking Process</summary>
        <div class="chain-of-thought-content">
          ${msg.chain_of_thought.innerHTML}
        </div>
      </details>
    </div>`;
      }
    }

    html += `    <div class="message-content">
      ${processedContent}
    </div>
${referencesPanel}
  </div>\n`;
  });

  // \u5173\u95EDHTML\u7ED3\u6784
  html += `<script>
  (function () {
    function fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (e) {}
      document.body.removeChild(textarea);
    }

    async function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch (e) {}
      }
      fallbackCopy(text);
    }

    document.addEventListener('click', async function (event) {
      const button = event.target.closest('.code-copy-btn');
      if (!button) return;
      const targetId = button.getAttribute('data-copy-target');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      const text = target.textContent || '';
      await copyText(text);
      const oldText = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () {
        button.textContent = oldText || 'Copy';
      }, 1200);
    });
  })();
  </script>
</body>
</html>`;

  return html;
}

/**
 * Convert formatted data to JSON format
 * @param {Object} data - The formatted data to convert
 * @returns {Object} - The JSON-ready data
 */
function convertToJSON(formattedData, settings) {
  const includeReferences = !!(settings && settings.exportWebReferences);
  const onlyReply = !!(settings && settings.onlyReplyContent);
  const messages = formattedData.messages.map(msg => {
    if (msg.role === 'assistant') {
      const assistantContent = assistantElementToMarkdown(msg.content);
      const result = {
        role: msg.role,
        content: includeReferences ? assistantContent.content : removeReferenceMarkers(assistantContent.content),
      };
      if (includeReferences) {
        result.references = assistantContent.references;
      }
      // MOD: include chain_of_thought only if not in only-reply mode and it exists
      if (!onlyReply && msg.chain_of_thought) {
        result.chain_of_thought = extractParagraphs(msg.chain_of_thought);
      }
      return result;
    }
    const userMessage = {
      role: msg.role,
      content: String(msg.content ?? ''),
    };
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      userMessage.attachments = msg.attachments;
    }
    return userMessage;
  });

  // MOD: if onlyReply mode, title/url/date become metadata but the focus is on messages
  return {
    title: formattedData.title,
    url: formattedData.url,
    date: formattedData.date,
    messages: messages
  };
}

// Initialize on page load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(init, 1200);
} else {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(init, 1200);
  });
  window.addEventListener('load', function() {
    setTimeout(init, 800);
  });
}

})();
