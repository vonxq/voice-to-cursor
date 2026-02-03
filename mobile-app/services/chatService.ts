import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_STORAGE_KEY = 'voice_to_cursor_chat_history';
const MAX_MESSAGES = 100; // 最多保存100条消息

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  summary?: string; // AI回复的摘要
  timestamp: number;
  images?: string[]; // 用户消息可能包含图片路径
}

class ChatService {
  private messages: ChatMessage[] = [];
  private listeners: Set<(messages: ChatMessage[]) => void> = new Set();

  /**
   * 初始化，从存储加载历史记录
   */
  async init(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        this.messages = JSON.parse(saved);
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
      this.messages = [];
    }
  }

  /**
   * 获取所有消息
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * 添加用户消息
   */
  async addUserMessage(content: string, images?: string[]): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: Date.now(),
      images,
    };
    
    this.messages.push(message);
    await this.save();
    this.notifyListeners();
    
    return message;
  }

  /**
   * 添加AI回复消息
   */
  async addAssistantMessage(summary: string, fullContent?: string): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `assistant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'assistant',
      content: fullContent || summary,
      summary,
      timestamp: Date.now(),
    };
    
    this.messages.push(message);
    await this.save();
    this.notifyListeners();
    
    return message;
  }

  /**
   * 清空聊天记录
   */
  async clearHistory(): Promise<void> {
    this.messages = [];
    await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
    this.notifyListeners();
  }

  /**
   * 保存到存储
   */
  private async save(): Promise<void> {
    try {
      // 只保留最近的消息
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES);
      }
      await AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.messages));
    } catch (error) {
      console.error('保存聊天记录失败:', error);
    }
  }

  /**
   * 订阅消息变化
   */
  subscribe(listener: (messages: ChatMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有订阅者
   */
  private notifyListeners(): void {
    const messages = this.getMessages();
    this.listeners.forEach(listener => listener(messages));
  }
}

export const chatService = new ChatService();
