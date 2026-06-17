# AI Chat Exporter

一键导出 AI 聊天对话记录，支持 DeepSeek / Claude / ChatGPT，支持 JSON / Markdown / TXT / HTML 四种格式。

> Tampermonkey 用户脚本 + Chrome 扩展，开箱即用。

## 功能特性

- **多平台支持**：DeepSeek、Claude、ChatGPT
- **四种导出格式**：JSON、Markdown、纯文本、HTML
- **内容过滤**：可选择是否包含用户问题、思考过程、仅保留回复
- **IndexedDB 直读**（DeepSeek）：秒级导出完整对话，无需滚动加载
- **完整格式保留**：代码块、Mermaid 图表、KaTeX 数学公式
- **深色模式适配**：毛玻璃 UI，完美融入各平台
- **纯本地运行**：所有数据在浏览器本地处理，不经过任何服务器

## 安装方式

### 方式一：Tampermonkey 用户脚本（推荐个人用户）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击下方链接一键安装：

| 平台 | GitHub 直装 | ScriptCat |
|------|------------|-----------|
| DeepSeek | [安装](https://github.com/LHT-balabala/ai-chat-exporter/raw/master/scripts/deepseek-chat-exporter.user.js) | [查看](https://scriptcat.org/zh-CN/script-show-page/6696) |
| Claude | [安装](https://github.com/LHT-balabala/ai-chat-exporter/raw/master/scripts/claude-chat-exporter.user.js) | [查看](https://scriptcat.org/zh-CN/script-show-page/6697) |
| ChatGPT | [安装](https://github.com/LHT-balabala/ai-chat-exporter/raw/master/scripts/chatgpt-chat-exporter.user.js) | [查看](https://scriptcat.org/zh-CN/script-show-page/6698) |

### 方式二：Chrome 扩展（一键安装全部）

1. 下载 `extension` 文件夹
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择 `extension` 文件夹

## 使用方式

1. 打开对应 AI 聊天页面
2. 点击右上角的「导出对话」按钮
3. 选择导出格式（JSON / Markdown / TXT / HTML）
4. 文件自动下载到本地

### 内容筛选

点击导出按钮后，可在下拉菜单中配置：
- ✅ 保留用户问题（默认开启）
- ✅ 保留思考过程（默认开启）
- ⬜ 只保留回复信息（开启后仅导出 AI 回复）

---

## 赞赏支持

如果这个工具对你有帮助，欢迎赞赏支持开发者 ☕

<p align="center">
  <img src="assets/donate-qr.png" width="260" alt="赞赏码">
</p>

---

## 开源协议

MIT License

## 反馈与建议

- [GitHub Issues](https://github.com/LHT-balabala/ai-chat-exporter/issues)
