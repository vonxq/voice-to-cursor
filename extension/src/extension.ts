import * as vscode from 'vscode';
import { getLocalIP } from './utils';
import { showQRCodePanel } from './qrcode';
import { VoiceToCursorServer } from './server';

let server: VoiceToCursorServer | null = null;
let qrPanel: vscode.WebviewPanel | null = null;

/**
 * 插件激活函数
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Voice to Cursor 插件已激活');
  
  // 注册启动服务命令
  const startCommand = vscode.commands.registerCommand(
    'voiceToCursor.start',
    async () => {
      if (server && server.isRunning()) {
        vscode.window.showWarningMessage('服务已在运行中');
        return;
      }
      
      try {
        // 获取本机 IP
        const ip = getLocalIP();
        const port = 9527;
        const wsUrl = `ws://${ip}:${port}`;
        
        // 显示二维码面板
        qrPanel = await showQRCodePanel(wsUrl);
        
        // 启动 WebSocket 服务器
        server = new VoiceToCursorServer(port);
        server.start(qrPanel);
        
        // 面板关闭时停止服务
        qrPanel.onDidDispose(() => {
          if (server) {
            server.stop();
            server = null;
          }
          qrPanel = null;
        });
        
      } catch (error) {
        vscode.window.showErrorMessage(
          `启动服务失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
  
  // 注册停止服务命令
  const stopCommand = vscode.commands.registerCommand(
    'voiceToCursor.stop',
    () => {
      if (!server || !server.isRunning()) {
        vscode.window.showWarningMessage('服务未运行');
        return;
      }
      
      server.stop();
      server = null;
      
      if (qrPanel) {
        qrPanel.dispose();
        qrPanel = null;
      }
    }
  );
  
  // 注册发送AI回复到手机端的命令
  const sendReplyCommand = vscode.commands.registerCommand(
    'voiceToCursor.sendReply',
    async () => {
      if (!server || !server.isRunning()) {
        vscode.window.showWarningMessage('服务未运行，请先启动 Voice to Cursor');
        return;
      }
      
      // 获取当前选中的文本
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const selectedText = editor?.document.getText(selection);
      
      if (!selectedText || selectedText.trim().length === 0) {
        // 如果没有选中文本，弹出输入框让用户输入
        const input = await vscode.window.showInputBox({
          prompt: '输入要发送到手机端的 AI 回复摘要',
          placeHolder: '请输入摘要内容...'
        });
        
        if (input && input.trim()) {
          server.sendAIReply(input.trim());
          vscode.window.showInformationMessage('已发送回复到手机端');
        }
        return;
      }
      
      // 尝试从文本中提取摘要（如果 AI 按格式返回了的话）
      const summaryMatch = selectedText.match(/\[摘要[：:]\s*(.+?)\]/);
      const summary = summaryMatch ? summaryMatch[1].trim() : selectedText.substring(0, 100);
      
      server.sendAIReply(summary, selectedText);
      vscode.window.showInformationMessage('已发送回复到手机端');
    }
  );
  
  // 注册到上下文
  context.subscriptions.push(startCommand, stopCommand, sendReplyCommand);
  
  // 插件停用时清理资源
  context.subscriptions.push({
    dispose: () => {
      if (server) {
        server.stop();
      }
      if (qrPanel) {
        qrPanel.dispose();
      }
    }
  });
}

/**
 * 插件停用函数
 */
export function deactivate() {
  if (server) {
    server.stop();
    server = null;
  }
  if (qrPanel) {
    qrPanel.dispose();
    qrPanel = null;
  }
}
