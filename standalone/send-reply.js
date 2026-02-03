#!/usr/bin/env node
/**
 * 发送 AI 回复到手机
 * 用法: node send-reply.js "回复内容"
 */

const WebSocket = require('ws');
const os = require('os');

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

const message = process.argv[2];
if (!message) {
  console.error('用法: node send-reply.js "回复内容"');
  process.exit(1);
}

const ip = getLocalIP();
const ws = new WebSocket(`ws://${ip}:9527`);

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'ai_reply',
    summary: message,
    content: message,
    timestamp: Date.now()
  }));
  console.log('✅ 已发送到手机:', message.substring(0, 50) + (message.length > 50 ? '...' : ''));
  ws.close();
});

ws.on('error', (err) => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 连接超时');
  process.exit(1);
}, 3000);
