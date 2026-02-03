#!/usr/bin/env node
/**
 * Voice to Cursor - 独立版服务器
 * 可以在任何应用中使用，不依赖 Cursor
 * 
 * 使用方法：
 *   node server.js
 *   或者
 *   chmod +x server.js && ./server.js
 */

const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const qrcode = require('qrcode-terminal');

const execAsync = promisify(exec);
const PORT = 9527;

// 当前同步的文本内容
let currentText = '';
let isFirstSync = true;

// 获取本机 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// 写入剪贴板
async function writeClipboard(text) {
  // macOS
  if (process.platform === 'darwin') {
    await execAsync(`echo ${JSON.stringify(text)} | pbcopy`);
  }
  // Windows
  else if (process.platform === 'win32') {
    await execAsync(`echo ${text} | clip`);
  }
  // Linux
  else {
    await execAsync(`echo ${JSON.stringify(text)} | xclip -selection clipboard`);
  }
}

// 读取剪贴板
async function readClipboard() {
  if (process.platform === 'darwin') {
    const { stdout } = await execAsync('pbpaste');
    return stdout;
  } else if (process.platform === 'win32') {
    const { stdout } = await execAsync('powershell Get-Clipboard');
    return stdout.trim();
  } else {
    const { stdout } = await execAsync('xclip -selection clipboard -o');
    return stdout;
  }
}

// 模拟粘贴
async function simulatePaste() {
  if (process.platform === 'darwin') {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
  }
}

// 模拟全选
async function simulateSelectAll() {
  if (process.platform === 'darwin') {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "a" using command down'`);
  }
}

// 模拟回车
async function simulateEnter() {
  if (process.platform === 'darwin') {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke return'`);
  }
}

// 同步文本到当前应用
async function syncToInput() {
  if (!currentText) return;
  
  await writeClipboard(currentText);
  
  if (process.platform === 'darwin') {
    try {
      if (isFirstSync) {
        await simulatePaste();
        isFirstSync = false;
      } else {
        await simulateSelectAll();
        await new Promise(resolve => setTimeout(resolve, 30));
        await simulatePaste();
      }
    } catch (error) {
      console.error('同步失败:', error.message);
    }
  }
}

// 处理消息
async function handleMessage(ws, data) {
  try {
    const message = JSON.parse(data.toString());
    const time = new Date().toLocaleTimeString('zh-CN');
    
    switch (message.type) {
      case 'sync_text':
        currentText = message.content || '';
        console.log(`[${time}] 📝 同步文本: ${currentText.substring(0, 50)}${currentText.length > 50 ? '...' : ''}`);
        await syncToInput();
        ws.send(JSON.stringify({ type: 'ack', action: 'sync_text' }));
        break;
        
      case 'paste_only':
        console.log(`[${time}] 📋 仅粘贴`);
        ws.send(JSON.stringify({ type: 'ack', action: 'paste_only' }));
        break;
        
      case 'submit':
        console.log(`[${time}] 🚀 提交发送`);
        await simulateEnter();
        currentText = '';
        isFirstSync = true;
        ws.send(JSON.stringify({ type: 'ack', action: 'submit' }));
        break;
        
      case 'get_clipboard':
        console.log(`[${time}] 📋 获取剪贴板`);
        const clipboardContent = await readClipboard();
        ws.send(JSON.stringify({ 
          type: 'clipboard_content', 
          content: clipboardContent,
          timestamp: Date.now()
        }));
        console.log(`[${time}] → 发送剪贴板内容: ${clipboardContent.substring(0, 30)}...`);
        break;
        
      case 'sync_image_add':
      case 'sync_image_remove':
        // 独立版暂不支持图片
        console.log(`[${time}] ⚠️ 独立版暂不支持图片`);
        ws.send(JSON.stringify({ type: 'ack', action: message.type }));
        break;
        
      default:
        console.log(`[${time}] ❓ 未知消息类型: ${message.type}`);
        ws.send(JSON.stringify({ type: 'error', message: `未知消息类型: ${message.type}` }));
    }
  } catch (error) {
    console.error('处理消息失败:', error.message);
    ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

// 启动服务器
function startServer() {
  const ip = getLocalIP();
  const wsUrl = `ws://${ip}:${PORT}`;
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         📱 Voice to Cursor - 独立版               ║');
  console.log('║         可在任何应用中使用                        ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  WebSocket: ${wsUrl.padEnd(37)}║`);
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('\n📱 用手机 App 扫描下方二维码连接:\n');
  
  // 显示二维码
  qrcode.generate(wsUrl, { small: true });
  
  console.log('\n⏳ 等待手机连接...\n');
  console.log('提示: 连接后，在任意输入框中使用');
  console.log('按 Ctrl+C 停止服务\n');
  console.log('─'.repeat(50));
  
  const wss = new WebSocketServer({ port: PORT });
  
  wss.on('connection', (ws) => {
    console.log('\n✅ 手机已连接!\n');
    currentText = '';
    isFirstSync = true;
    
    ws.on('message', (data) => handleMessage(ws, data));
    
    ws.on('close', () => {
      console.log('\n❌ 手机已断开\n');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket 错误:', error.message);
    });
  });
  
  wss.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ 端口 ${PORT} 已被占用，请先关闭其他服务\n`);
    } else {
      console.error('服务器错误:', error.message);
    }
    process.exit(1);
  });
}

// 检查依赖
try {
  require('ws');
  require('qrcode-terminal');
} catch (e) {
  console.log('正在安装依赖...');
  const { execSync } = require('child_process');
  execSync('npm install ws qrcode-terminal', { stdio: 'inherit', cwd: __dirname });
  console.log('依赖安装完成，请重新运行\n');
  process.exit(0);
}

startServer();
