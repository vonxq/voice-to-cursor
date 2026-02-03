import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'voice_to_cursor_ws_url';

/**
 * WebSocket 服务类 - 支持实时同步和自动重连
 */
export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000;
  
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (error: Event) => void;
  private onMessageCallback?: (data: any) => void;
  
  /**
   * 获取上次保存的连接地址
   */
  async getLastUrl(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.error('读取保存的地址失败:', error);
      return null;
    }
  }
  
  /**
   * 保存连接地址
   */
  async saveUrl(url: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, url);
    } catch (error) {
      console.error('保存地址失败:', error);
    }
  }
  
  /**
   * 连接到 WebSocket 服务器
   */
  connect(url: string, autoSave: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      this.url = url;
      
      // 设置连接超时
      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
        reject(new Error('连接超时'));
      }, 5000);
      
      this.ws = new WebSocket(url);
      
      this.ws.onopen = async () => {
        clearTimeout(timeout);
        console.log('WebSocket 连接成功');
        this.reconnectAttempts = 0;
        
        // 保存成功连接的地址
        if (autoSave) {
          await this.saveUrl(url);
        }
        
        this.onOpenCallback?.();
        resolve();
      };
      
      this.ws.onclose = () => {
        clearTimeout(timeout);
        console.log('WebSocket 连接关闭');
        this.onCloseCallback?.();
        this.ws = null;
      };
      
      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket 错误:', error);
        this.onErrorCallback?.(error);
        reject(error);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onMessageCallback?.(data);
        } catch (error) {
          console.error('解析消息失败:', error);
        }
      };
    });
  }
  
  /**
   * 尝试自动连接上次的地址
   */
  async tryAutoConnect(): Promise<boolean> {
    const lastUrl = await this.getLastUrl();
    if (!lastUrl) {
      return false;
    }
    
    try {
      await this.connect(lastUrl, false);
      return true;
    } catch (error) {
      console.log('自动连接失败:', error);
      return false;
    }
  }
  
  /**
   * 实时同步文字内容
   */
  syncText(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 未连接，无法同步文字');
      return;
    }
    
    const message = {
      type: 'sync_text',
      content,
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 同步添加图片
   */
  syncImageAdd(id: string, base64: string, mimeType: string = 'image/jpeg'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 未连接，无法同步图片');
      return;
    }
    
    const message = {
      type: 'sync_image_add',
      id,
      base64,
      mimeType,
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 同步删除图片
   */
  syncImageRemove(id: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 未连接，无法删除图片');
      return;
    }
    
    const message = {
      type: 'sync_image_remove',
      id,
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 仅粘贴（不提交）
   */
  pasteOnly(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    const message = {
      type: 'paste_only',
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 提交/发送
   */
  submit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    const message = {
      type: 'submit',
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 获取电脑剪贴板内容
   */
  getClipboard(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    const message = {
      type: 'get_clipboard',
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  // ============ 兼容旧方法 ============
  
  /**
   * 发送文字消息（旧协议）
   */
  sendText(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    const message = {
      type: 'text',
      content,
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 发送图片消息（旧协议）
   */
  sendImage(base64: string, mimeType: string = 'image/jpeg'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }
    
    const message = {
      type: 'image',
      base64,
      mimeType,
      timestamp: Date.now()
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  
  /**
   * 设置事件回调
   */
  onOpen(callback: () => void): void {
    this.onOpenCallback = callback;
  }
  
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }
  
  onError(callback: (error: Event) => void): void {
    this.onErrorCallback = callback;
  }
  
  onMessage(callback: (data: any) => void): void {
    this.onMessageCallback = callback;
  }
}

// 单例实例
export const wsService = new WebSocketService();
