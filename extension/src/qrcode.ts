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
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 30px;
      font-size: 14px;
    }
    .qr-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      display: inline-block;
    }
    .url-info {
      margin-top: 20px;
      padding: 15px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      word-break: break-all;
      font-family: monospace;
      font-size: 12px;
      color: var(--vscode-input-foreground);
    }
    .status {
      margin-top: 20px;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
    }
    .status.waiting {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .status.connected {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-inputValidation-infoForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 Voice to Cursor</h1>
    <p class="subtitle">使用手机 App 扫描二维码连接</p>
    
    <div class="qr-container">
      ${qrCodeSvg}
    </div>
    
    <div class="url-info">
      <strong>WebSocket 地址：</strong><br>
      ${wsUrl}
    </div>
    
    <div class="status waiting" id="status">
      ⏳ 等待连接...
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    // 监听来自扩展的消息
    window.addEventListener('message', event => {
      const message = event.data;
      const statusEl = document.getElementById('status');
      
      if (message.type === 'connection') {
        if (message.connected) {
          statusEl.textContent = '✅ 已连接';
          statusEl.className = 'status connected';
        } else {
          statusEl.textContent = '⏳ 等待连接...';
          statusEl.className = 'status waiting';
        }
      }
    });
  </script>
</body>
</html>`;
}
