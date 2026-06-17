// Popup script for AI Chat Exporter

(function() {
  'use strict';

  // Detect current platform
  async function detectPlatform() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;

    const url = tabs[0].url || '';
    const statusEl = document.getElementById('platformStatus');
    const nameEl = document.getElementById('platformName');

    if (!statusEl || !nameEl) return;

    let platformName = '';
    let isActive = false;

    if (url.includes('chat.deepseek.com')) {
      platformName = 'DeepSeek Chat · 已激活导出功能';
      isActive = true;
    } else if (url.includes('claude.ai')) {
      platformName = 'Claude · 已激活导出功能';
      isActive = true;
    } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      platformName = 'ChatGPT · 已激活导出功能';
      isActive = true;
    } else {
      platformName = '当前页面不支持 · 请打开支持的 AI 聊天页面';
      isActive = false;
    }

    nameEl.textContent = platformName;
    statusEl.className = 'platform-status ' + (isActive ? 'active' : 'inactive');
  }

  detectPlatform();
})();
