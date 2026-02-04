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

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const qrcode = require('qrcode-terminal');

const execAsync = promisify(exec);

// 端口配置：命令行参数 > 环境变量 > 自动查找
function getPreferredPort() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--port=')) {
      return parseInt(args[i].split('=')[1], 10);
    }
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      return parseInt(args[i + 1], 10);
    }
  }
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }
  return 9527; // 默认首选端口
}

// 实际使用的端口（服务器启动后更新）
let PORT = getPreferredPort();

// 当前同步的文本内容
let currentText = '';

// 获取 AI 回复的 prompt 后缀
function getSummaryPromptSuffix() {
  const portArg = PORT !== 9527 ? ` --port=${PORT}` : '';
  return `

【重要：完成任务后，请执行以下命令将回复发送到我的手机：
cd ${__dirname} && node send-reply.js "你的简短回复摘要（不超过50字）"${portArg}
】`;
}

// 包装 prompt，添加摘要请求
function wrapPromptWithSummaryRequest(text) {
  return text + getSummaryPromptSuffix();
}

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

// 写入剪贴板（支持多行文本）
async function writeClipboard(text) {
  const fs = require('fs');
  const path = require('path');
  const tmpFile = path.join(os.tmpdir(), `clipboard_${Date.now()}.txt`);
  
  try {
    console.log("writeClipboard", text)
    // 写入临时文件
    fs.writeFileSync(tmpFile, text, 'utf8');
    
    // 从文件读取到剪贴板
    if (process.platform === 'darwin') {
      await execAsync(`cat "${tmpFile}" | pbcopy`);
    } else if (process.platform === 'win32') {
      await execAsync(`type "${tmpFile}" | clip`);
    } else {
      await execAsync(`cat "${tmpFile}" | xclip -selection clipboard`);
    }
  } finally {
    // 清理临时文件
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {}
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

// 模拟 Ctrl+U（删除当前行，终端常用）
async function simulateClearLine() {
  if (process.platform === 'darwin') {
    // Ctrl+A 移到行首，Ctrl+K 删除到行尾
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "a" using control down'`);
    await new Promise(resolve => setTimeout(resolve, 20));
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "k" using control down'`);
  }
}

// 复制当前行（终端）
async function simulateCopyLine() {
  if (process.platform === 'darwin') {
    // 方法：Ctrl+A 到行首，Ctrl+E 到行尾，然后 Shift+Ctrl+A 选中整行，Cmd+C 复制
    // 或者更简单：Ctrl+A 行首，Ctrl+K 删除到行尾，Ctrl+Y 恢复，然后内容在 kill ring
    // 最可靠的方法：使用双击+拖拽或三击选中行
    
    // 尝试方法1：全选当前输入
    try {
      await execAsync(`osascript -e 'tell application "System Events"
        -- 移到行首
        keystroke "a" using control down
        delay 0.05
        -- 选中到行尾
        keystroke "e" using {shift down, control down}
        delay 0.05
        -- 复制
        keystroke "c" using command down
        delay 0.05
        -- 取消选中（按右箭头）
        key code 124
      end tell'`);
    } catch (e) {
      console.error('复制当前行失败:', e.message);
    }
  }
}

// 执行粘贴到当前应用（只模拟粘贴，不写入剪贴板）
async function doPaste() {
  if (process.platform === 'darwin') {
    try {
      await simulatePaste();
    } catch (error) {
      console.error('粘贴失败:', error.message);
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
        // 只保存文本，不写入剪贴板（避免与 paste_only/submit 的剪贴板操作冲突）
        console.log(`[${time}] 📝 已同步文本: ${currentText.substring(0, 50)}${currentText.length > 50 ? '...' : ''}`);
        ws.send(JSON.stringify({ type: 'ack', action: 'sync_text' }));
        break;
        
      case 'paste_only':
        const pasteNeedAiReply = message.needAiReply === true;
        console.log(`[${time}] 📋 执行粘贴${pasteNeedAiReply ? '（需AI回复）' : ''}`);
        
        // 根据是否需要 AI 回复，决定写入的内容
        if (currentText.trim()) {
          const contentToWrite = pasteNeedAiReply 
            ? wrapPromptWithSummaryRequest(currentText) 
            : currentText;
          await writeClipboard(contentToWrite);
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`[${time}] 📝 已写入剪贴板${pasteNeedAiReply ? '（含prompt）' : ''}`);
        }
        
        await doPaste();
        ws.send(JSON.stringify({ type: 'ack', action: 'paste_only' }));
        break;
        
      case 'submit':
        const submitNeedAiReply = message.needAiReply === true;
        console.log(`[${time}] 🚀 粘贴并发送${submitNeedAiReply ? '（需AI回复）' : ''}`);
        
        // 根据是否需要 AI 回复，决定写入的内容
        if (currentText.trim()) {
          const contentToWrite = submitNeedAiReply 
            ? wrapPromptWithSummaryRequest(currentText) 
            : currentText;
          await writeClipboard(contentToWrite);
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`[${time}] 📝 已写入剪贴板${submitNeedAiReply ? '（含prompt）' : ''}`);
        }
        
        await doPaste();
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateEnter();
        currentText = '';
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
        

        case 'get_current_line':
        // 获取当前行内容（复制当前行到剪贴板）
        console.log(`[${time}] 📋 获取当前行`);
        await simulateCopyLine();
        await new Promise(resolve => setTimeout(resolve, 100));
        const lineContent = await readClipboard();
        ws.send(JSON.stringify({ 
          type: 'current_line_content', 
          content: lineContent.trim(),
          timestamp: Date.now()
        }));
        console.log(`[${time}] → 当前行内容: ${lineContent.trim().substring(0, 50)}...`);
        break;
        
      case 'replace_line':
        // 替换当前行（清除当前行 + 粘贴新内容）
        console.log(`[${time}] 🔄 替换当前行`);
        await simulateClearLine();
        await new Promise(resolve => setTimeout(resolve, 50));
        await doPaste();
        ws.send(JSON.stringify({ type: 'ack', action: 'replace_line' }));
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

// 所有连接的客户端
let clients = new Set();

// 广播消息给所有客户端
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  });
}

// 创建 HTTP 服务器
function createHttpServer() {
  return http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      const htmlPath = path.join(__dirname, 'web', 'index.html');
      fs.readFile(htmlPath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Web 页面未找到');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });
}

// 显示启动信息和二维码
function showStartupInfo(ip, port) {
  const wsUrl = `ws://${ip}:${port}`;
  const webUrl = `http://${ip}:${port}`;
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         📱 Voice to Cursor - 独立版               ║');
  console.log('║         可在任何应用中使用                        ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  WebSocket: ${wsUrl.padEnd(37)}║`);
  console.log(`║  Web 版本: ${webUrl.padEnd(38)}║`);
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('\n📱 方式1: 用手机 App 扫描下方二维码:\n');
  qrcode.generate(wsUrl, { small: true });
  console.log('\n📱 方式2: 用手机浏览器扫描下方二维码 (Web版):\n');
  qrcode.generate(webUrl, { small: true });
  console.log('\n⏳ 等待手机连接...\n');
  console.log('提示: 连接后，在任意输入框中使用');
  console.log(`发送AI回复: node send-reply.js "内容"${port !== 9527 ? ` --port=${port}` : ''}`);
  console.log('按 Ctrl+C 停止服务\n');
  console.log('─'.repeat(50));
}

// 设置 WebSocket 服务器
function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('\n✅ 客户端已连接! (当前连接数:', clients.size, ')\n');
    currentText = '';
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ai_reply') {
          const time = new Date().toLocaleTimeString('zh-CN');
          console.log(`[${time}] 🤖 AI回复: ${msg.summary?.substring(0, 50)}...`);
          broadcast(msg);
        } else {
          handleMessage(ws, data);
        }
      } catch (e) {
        handleMessage(ws, data);
      }
    });
    
    ws.on('close', () => {
      clients.delete(ws);
      console.log('\n❌ 客户端已断开 (当前连接数:', clients.size, ')\n');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket 错误:', error.message);
      clients.delete(ws);
    });
  });
  
  return wss;
}

// 尝试在指定端口启动服务器
function tryListen(server, port, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const tryPort = (currentPort) => {
      attempts++;
      
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && attempts < maxAttempts) {
          // 端口被占用，尝试下一个
          tryPort(currentPort + 1);
        } else if (error.code === 'EADDRINUSE') {
          reject(new Error(`无法找到可用端口（尝试了 ${port} - ${currentPort}）`));
        } else {
          reject(error);
        }
      });
      
      server.once('listening', () => {
        resolve(currentPort);
      });
      
      server.listen(currentPort);
    };
    
    tryPort(port);
  });
}

// 启动服务器
async function startServer() {
  const ip = getLocalIP();
  const server = createHttpServer();
  
  try {
    const actualPort = await tryListen(server, getPreferredPort());
    PORT = actualPort; // 更新全局端口变量
    
    showStartupInfo(ip, actualPort);
    setupWebSocket(server);
  } catch (error) {
    console.error(`\n❌ 启动失败: ${error.message}\n`);
    process.exit(1);
  }
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
