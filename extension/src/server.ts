import { WebSocketServer, WebSocket } from 'ws';
import * as vscode from 'vscode';
import { 
  Message, 
  insertContent, 
  handleSyncText, 
  handleSyncImageAdd, 
  handleSyncImageRemove, 
  handlePasteOnly,
  handleSubmit,
  clearState 
} from './inputHandler';

export class VoiceToCursorServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private panel: vscode.WebviewPanel | null = null;
  private static instance: VoiceToCursorServer | null = null;
  
  constructor(private port: number = 9527) {
    VoiceToCursorServer.instance = this;
  }
  
  /**
   * 获取单例实例
   */
  static getInstance(): VoiceToCursorServer | null {
    return VoiceToCursorServer.instance;
  }
  
  /**
   * 发送 AI 回复到手机端
   */
  sendAIReply(summary: string, fullContent?: string): void {
    const message = JSON.stringify({
      type: 'ai_reply',
      summary,
      content: fullContent || summary,
      timestamp: Date.now()
    });
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  /**
   * 启动 WebSocket 服务器
   */
  start(panel: vscode.WebviewPanel): void {
    if (this.wss) {
      vscode.window.showWarningMessage('服务器已在运行中');
      return;
    }
    
    this.panel = panel;
    
    this.wss = new WebSocketServer({ port: this.port });
    
    this.wss.on('listening', () => {
      vscode.window.showInformationMessage(`Voice to Cursor 服务已启动，端口: ${this.port}`);
    });
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      this.updateConnectionStatus(true);
      vscode.window.showInformationMessage('手机已连接');
      
      // 清空之前的状态
      clearState();
      
      ws.on('message', async (data: Buffer) => {
        try {
          const rawData = data.toString();
          console.log('[Voice to Cursor] 收到消息:', rawData);
          const message: Message = JSON.parse(rawData);
          console.log('[Voice to Cursor] 消息类型:', message.type);
          
          // 根据消息类型处理
          switch (message.type) {
            case 'sync_text':
              this.sendLog('received', 'sync_text', (message as any).content?.substring(0, 50) + ((message as any).content?.length > 50 ? '...' : ''));
              await handleSyncText(message);
              ws.send(JSON.stringify({ type: 'ack', action: 'sync_text' }));
              this.sendLog('sent', 'ack', 'sync_text');
              break;
              
            case 'sync_image_add':
              this.sendLog('received', 'sync_image_add', `图片ID: ${(message as any).id}`);
              await handleSyncImageAdd(message);
              ws.send(JSON.stringify({ type: 'ack', action: 'sync_image_add', id: message.id }));
              this.sendLog('sent', 'ack', 'sync_image_add');
              break;
              
            case 'sync_image_remove':
              this.sendLog('received', 'sync_image_remove', `图片ID: ${(message as any).id}`);
              await handleSyncImageRemove(message);
              ws.send(JSON.stringify({ type: 'ack', action: 'sync_image_remove', id: message.id }));
              this.sendLog('sent', 'ack', 'sync_image_remove');
              break;
              
            case 'paste_only':
              this.sendLog('received', 'paste_only', '仅粘贴');
              await handlePasteOnly();
              ws.send(JSON.stringify({ type: 'ack', action: 'paste_only' }));
              this.sendLog('sent', 'ack', 'paste_only');
              break;
              
            case 'submit':
              this.sendLog('received', 'submit', '提交发送');
              await handleSubmit();
              ws.send(JSON.stringify({ type: 'ack', action: 'submit' }));
              this.sendLog('sent', 'ack', 'submit');
              break;
              
            case 'get_clipboard':
              this.sendLog('received', 'get_clipboard', '获取剪贴板');
              // 获取电脑剪贴板内容发送到手机端
              const clipboardContent = await vscode.env.clipboard.readText();
              ws.send(JSON.stringify({ 
                type: 'clipboard_content', 
                content: clipboardContent,
                timestamp: Date.now()
              }));
              this.sendLog('sent', 'clipboard_content', clipboardContent.substring(0, 50) + (clipboardContent.length > 50 ? '...' : ''));
              break;
              
            // 兼容旧协议
            case 'text':
            case 'image':
              this.sendLog('received', message.type, '旧协议');
              await insertContent(message);
              ws.send(JSON.stringify({ type: 'ack', timestamp: Date.now() }));
              this.sendLog('sent', 'ack', '旧协议');
              break;
              
            default:
              const unknownType = (message as any).type;
              console.log('[Voice to Cursor] 未知消息类型:', unknownType);
              this.sendLog('error', '未知消息类型', unknownType);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: `无效的消息格式: ${unknownType}` 
              }));
          }
          
        } catch (error) {
          console.error('处理消息失败:', error);
          const errorMsg = error instanceof Error ? error.message : '处理消息失败';
          this.sendLog('error', '处理失败', errorMsg);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: errorMsg
          }));
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(ws);
        if (this.clients.size === 0) {
          this.updateConnectionStatus(false);
          vscode.window.showInformationMessage('手机已断开连接');
          clearState();
        }
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
        this.clients.delete(ws);
        if (this.clients.size === 0) {
          this.updateConnectionStatus(false);
        }
      });
    });
    
    this.wss.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        vscode.window.showErrorMessage(`端口 ${this.port} 已被占用，请先停止服务或更换端口`);
      } else {
        vscode.window.showErrorMessage(`服务器启动失败: ${error.message}`);
      }
    });
  }
  
  /**
   * 停止 WebSocket 服务器
   */
  stop(): void {
    if (this.wss) {
      // 关闭所有客户端连接
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();
      
      // 关闭服务器
      this.wss.close(() => {
        vscode.window.showInformationMessage('Voice to Cursor 服务已停止');
      });
      
      this.wss = null;
      this.updateConnectionStatus(false);
      clearState();
    }
  }
  
  /**
   * 更新连接状态显示
   */
  private updateConnectionStatus(connected: boolean): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'connection',
        connected
      });
    }
  }
  
  /**
   * 发送日志到面板
   */
  private sendLog(logType: 'received' | 'sent' | 'error', content: string, details?: string): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'log',
        logType,
        content,
        details
      });
    }
  }
  
  /**
   * 检查服务器是否运行中
   */
  isRunning(): boolean {
    return this.wss !== null;
  }
  
  /**
   * 获取当前连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
