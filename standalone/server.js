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

// Prompt 包装模板 - 要求 AI 先完成任务，然后返回简短摘要
const SUMMARY_PROMPT_SUFFIX = `【重要：请先完成上述任务。完成后，在回复的最后一行用以下格式返回一句话摘要（不超过50字），方便我在手机端查看：[摘要: 简要描述你完成了什么]】`;

// 包装 prompt，添加摘要请求
function wrapPromptWithSummaryRequest(text) {
  return text + SUMMARY_PROMPT_SUFFIX;
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

// 执行粘贴到当前应用
async function doPaste() {
  if (!currentText) return;
  
  await writeClipboard(currentText);
  
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
        // 只同步到剪贴板，不自动粘贴
        await writeClipboard(currentText);
        console.log(`[${time}] 📝 已同步到剪贴板: ${currentText.substring(0, 50)}${currentText.length > 50 ? '...' : ''}`);
        ws.send(JSON.stringify({ type: 'ack', action: 'sync_text' }));
        break;
        
      case 'paste_only':
        const pasteNeedAiReply = message.needAiReply === true;
        console.log(`[${time}] 📋 执行粘贴${pasteNeedAiReply ? '（需AI回复）' : ''}`);
        console.log(`[${time}] 📋 当前 currentText: "${currentText.substring(0, 50)}..."`);
        
        // 如果需要 AI 回复，先包装 prompt 再写入剪贴板
        if (pasteNeedAiReply && currentText.trim()) {
          const wrappedContent = wrapPromptWithSummaryRequest(currentText);
          console.log(`[${time}] 📝 准备写入剪贴板，长度: ${wrappedContent.length}`);
          await writeClipboard(wrappedContent);
          await new Promise(resolve => setTimeout(resolve, 150)); // 等待剪贴板写入完成
          // 验证剪贴板内容
          const verify = await readClipboard();
          console.log(`[${time}] 📝 验证剪贴板，长度: ${verify.length}，是否包含prompt: ${verify.includes('【重要')}`);
        }
        
        await doPaste();
        ws.send(JSON.stringify({ type: 'ack', action: 'paste_only' }));
        break;
        
      case 'submit':
        const submitNeedAiReply = message.needAiReply === true;
        console.log(`[${time}] 🚀 粘贴并发送${submitNeedAiReply ? '（需AI回复）' : ''}`);
        
        // 如果需要 AI 回复，先包装 prompt 再写入剪贴板
        if (submitNeedAiReply && currentText.trim()) {
          const wrappedContent = wrapPromptWithSummaryRequest(currentText);
          await writeClipboard(wrappedContent);
          await new Promise(resolve => setTimeout(resolve, 100)); // 等待剪贴板写入完成
          console.log(`[${time}] 📝 已包装 prompt`);
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
