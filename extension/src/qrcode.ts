import * as vscode from 'vscode';
import * as QRCode from 'qrcode';

/**
 * 显示二维码面板
 */
export async function showQRCodePanel(wsUrl: string): Promise<vscode.WebviewPanel> {
  // 生成二维码 SVG
  const qrCodeSvg = await QRCode.toString(wsUrl, {
    type: 'svg',
    width: 300,
    margin: 2
  });
  
  // 创建 WebView 面板
  const panel = vscode.window.createWebviewPanel(
    'voiceToCursorQR',
    'Voice to Cursor - 扫码连接',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  
  // 设置 WebView 内容
  panel.webview.html = getWebviewContent(wsUrl, qrCodeSvg);
  
  return panel;
}

/**
 * 生成 WebView HTML 内容
 */
function getWebviewContent(wsUrl: string, qrCodeSvg: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voice to Cursor</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      margin: 0;
    }
    .main {
      display: flex;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .left-panel {
      flex: 0 0 320px;
      text-align: center;
    }
    .right-panel {
      flex: 1;
      min-width: 0;
    }
    h1 {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      font-size: 13px;
    }
    .qr-container {
      background: white;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
      display: inline-block;
    }
    .qr-container svg {
      width: 200px;
      height: 200px;
    }
    .url-info {
      padding: 12px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      word-break: break-all;
      font-family: monospace;
      font-size: 11px;
      color: var(--vscode-input-foreground);
    }
    .status {
      margin-top: 16px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      display: inline-block;
    }
    .status.waiting {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .status.connected {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-inputValidation-infoForeground);
    }
    
    /* 日志区域 */
    .log-section {
      background: var(--vscode-input-background);
      border-radius: 8px;
      padding: 16px;
      height: calc(100vh - 80px);
      display: flex;
      flex-direction: column;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-input-border);
    }
    .log-title {
      font-size: 14px;
      font-weight: 600;
    }
    .clear-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .clear-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .log-container {
      flex: 1;
      overflow-y: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .log-item {
      padding: 6px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      word-break: break-all;
    }
    .log-item.received {
      background: rgba(0, 150, 255, 0.1);
      border-left: 3px solid #0096ff;
    }
    .log-item.sent {
      background: rgba(0, 200, 100, 0.1);
      border-left: 3px solid #00c864;
    }
    .log-item.error {
      background: rgba(255, 80, 80, 0.1);
      border-left: 3px solid #ff5050;
    }
    .log-time {
      color: var(--vscode-descriptionForeground);
      margin-right: 8px;
    }
    .log-type {
      font-weight: 600;
      margin-right: 8px;
    }
    .log-type.received { color: #0096ff; }
    .log-type.sent { color: #00c864; }
    .log-type.error { color: #ff5050; }
    .log-content {
      color: var(--vscode-editor-foreground);
    }
    .log-content code {
      background: rgba(255,255,255,0.1);
      padding: 1px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="main">
    <div class="left-panel">
      <h1>📱 Voice to Cursor</h1>
      <p class="subtitle">使用手机 App 扫码连接</p>
      
      <div class="qr-container">
        ${qrCodeSvg}
      </div>
      
      <div class="url-info">
        <strong>WebSocket：</strong> ${wsUrl}
      </div>
      
      <div class="status waiting" id="status">
        ⏳ 等待连接...
      </div>
    </div>
    
    <div class="right-panel">
      <div class="log-section">
        <div class="log-header">
          <span class="log-title">📋 实时消息日志</span>
          <button class="clear-btn" onclick="clearLogs()">清空</button>
        </div>
        <div class="log-container" id="logContainer">
          <div class="log-item" style="color: var(--vscode-descriptionForeground);">
            等待消息...
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    const logContainer = document.getElementById('logContainer');
    let hasMessages = false;
    
    function getTime() {
      const now = new Date();
      return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function addLog(type, content, details) {
      if (!hasMessages) {
        logContainer.innerHTML = '';
        hasMessages = true;
      }
      
      const typeLabels = {
        received: '← 收到',
        sent: '→ 发送',
        error: '✗ 错误'
      };
      
      const item = document.createElement('div');
      item.className = 'log-item ' + type;
      
      let html = '<span class="log-time">' + getTime() + '</span>';
      html += '<span class="log-type ' + type + '">' + typeLabels[type] + '</span>';
      html += '<span class="log-content">' + escapeHtml(content);
      if (details) {
        html += ' <code>' + escapeHtml(details) + '</code>';
      }
      html += '</span>';
      
      item.innerHTML = html;
      logContainer.appendChild(item);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    function clearLogs() {
      logContainer.innerHTML = '<div class="log-item" style="color: var(--vscode-descriptionForeground);">日志已清空</div>';
      hasMessages = false;
    }
    
    // 监听来自扩展的消息
    window.addEventListener('message', event => {
      const message = event.data;
      const statusEl = document.getElementById('status');
      
      if (message.type === 'connection') {
        if (message.connected) {
          statusEl.textContent = '✅ 已连接';
          statusEl.className = 'status connected';
          addLog('received', '手机已连接');
        } else {
          statusEl.textContent = '⏳ 等待连接...';
          statusEl.className = 'status waiting';
          addLog('received', '手机已断开');
        }
      } else if (message.type === 'log') {
        addLog(message.logType, message.content, message.details);
      }
    });
  </script>
</body>
</html>`;
}
