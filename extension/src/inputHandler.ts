import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 消息类型定义
 */
export interface SyncTextMessage {
  type: 'sync_text';
  content: string;
  timestamp?: number;
}

export interface SyncImageAddMessage {
  type: 'sync_image_add';
  id: string;
  base64: string;
  mimeType: string;
  timestamp?: number;
}

export interface SyncImageRemoveMessage {
  type: 'sync_image_remove';
  id: string;
  timestamp?: number;
}

export interface SubmitMessage {
  type: 'submit';
  needAiReply?: boolean;
  timestamp?: number;
}

export interface PasteOnlyMessage {
  type: 'paste_only';
  needAiReply?: boolean;
  timestamp?: number;
}

export interface GetClipboardMessage {
  type: 'get_clipboard';
  timestamp?: number;
}

// 兼容旧协议
export interface TextMessage {
  type: 'text';
  content: string;
  timestamp?: number;
}

export interface ImageMessage {
  type: 'image';
  base64: string;
  mimeType: string;
  timestamp?: number;
}

export type Message = SyncTextMessage | SyncImageAddMessage | SyncImageRemoveMessage | SubmitMessage | PasteOnlyMessage | GetClipboardMessage | TextMessage | ImageMessage;

// 当前同步状态
let currentText = '';
let currentImages: Map<string, string> = new Map(); // id -> 文件路径
let isFirstSync = true; // 是否是首次同步
let syncDebounceTimer: NodeJS.Timeout | null = null;

// Prompt 包装模板 - 要求 AI 先完成任务，然后返回简短摘要
const SUMMARY_PROMPT_SUFFIX = `

【重要：请先完成上述任务。完成后，在回复的最后一行用以下格式返回一句话摘要（不超过50字），方便我在手机端查看：
[摘要: 简要描述你完成了什么]】`;

/**
 * 处理实时文字同步
 */
export async function handleSyncText(message: SyncTextMessage): Promise<void> {
  currentText = message.content;
  
  // 实时同步到输入框
  await syncToInput();
}

/**
 * 处理添加图片
 */
export async function handleSyncImageAdd(message: SyncImageAddMessage): Promise<void> {
  const ext = message.mimeType === 'image/png' ? 'png' : 'jpg';
  const imagePath = await saveImageToFile(message.base64, ext, message.id);
  currentImages.set(message.id, imagePath);
  
  // 实时同步到输入框
  await syncToInput();
}

/**
 * 处理删除图片
 */
export async function handleSyncImageRemove(message: SyncImageRemoveMessage): Promise<void> {
  const imagePath = currentImages.get(message.id);
  if (imagePath) {
    // 删除文件
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const fullPath = path.join(workspaceFolders[0].uri.fsPath, imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    currentImages.delete(message.id);
  }
  
  // 实时同步到输入框
  await syncToInput();
}

/**
 * 处理仅粘贴（不提交）
 */
export async function handlePasteOnly(needAiReply: boolean = false): Promise<void> {
  // 如果需要 AI 回复，替换内容为包装后的 prompt
  if (needAiReply && currentText.trim()) {
    const wrappedContent = wrapPromptWithSummaryRequest(currentText);
    let content = wrappedContent;
    
    // 添加图片引用
    if (currentImages.size > 0) {
      const imageRefs = Array.from(currentImages.values())
        .map(p => `![image](${p})`)
        .join('\n');
      content = content + '\n' + imageRefs;
    }
    
    // 写入剪贴板并替换输入框内容
    await vscode.env.clipboard.writeText(content);
    
    if (process.platform === 'darwin') {
      try {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "a" using command down'`);
        await new Promise(resolve => setTimeout(resolve, 30));
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
      } catch (error) {
        console.error('替换内容失败:', error);
      }
    }
  }
  
  vscode.window.showInformationMessage(needAiReply ? '已粘贴（含AI回复请求）' : '已粘贴到输入框');
}

/**
 * 处理提交/发送
 */
export async function handleSubmit(needAiReply: boolean = false): Promise<void> {
  console.log('[Voice to Cursor] handleSubmit - needAiReply:', needAiReply, 'currentText:', currentText.substring(0, 50));
  
  // 如果需要 AI 回复，在提交前用包装后的 prompt 替换当前内容
  if (needAiReply && currentText.trim()) {
    const wrappedContent = wrapPromptWithSummaryRequest(currentText);
    console.log('[Voice to Cursor] 包装后的内容:', wrappedContent.substring(0, 100));
    let content = wrappedContent;
    
    // 添加图片引用
    if (currentImages.size > 0) {
      const imageRefs = Array.from(currentImages.values())
        .map(p => `![image](${p})`)
        .join('\n');
      content = content + '\n' + imageRefs;
    }
    
    // 写入剪贴板
    await vscode.env.clipboard.writeText(content);
    
    // 全选 + 粘贴（替换为包装后的内容）
    if (process.platform === 'darwin') {
      try {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "a" using command down'`);
        await new Promise(resolve => setTimeout(resolve, 30));
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error('替换内容失败:', error);
      }
    }
  }
  
  // 模拟回车发送
  if (process.platform === 'darwin') {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke return'`);
  }
  
  // 清空当前状态
  currentText = '';
  currentImages.clear();
  isFirstSync = true;
  
  vscode.window.showInformationMessage(needAiReply ? '已发送（等待AI回复）' : '已发送');
}

/**
 * 包装 prompt，添加摘要请求（放在末尾，不影响原始指令）
 */
function wrapPromptWithSummaryRequest(text: string): string {
  return text + SUMMARY_PROMPT_SUFFIX;
}

/**
 * 实时同步内容到输入框
 * 使用防抖避免过于频繁的操作
 */
async function syncToInput(): Promise<void> {
  // 清除之前的定时器
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  
  // 防抖 50ms
  syncDebounceTimer = setTimeout(async () => {
    await doSyncToInput();
  }, 50);
}

/**
 * 执行同步到输入框
 */
async function doSyncToInput(): Promise<void> {
  let content = currentText;
  
  // 添加图片引用
  if (currentImages.size > 0) {
    const imageRefs = Array.from(currentImages.values())
      .map(p => `![image](${p})`)
      .join('\n');
    
    if (content) {
      content = content + '\n' + imageRefs;
    } else {
      content = imageRefs;
    }
  }
  
  // 写入剪贴板
  await vscode.env.clipboard.writeText(content);
  
  if (process.platform === 'darwin') {
    try {
      if (isFirstSync) {
        // 首次同步，直接粘贴
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
        isFirstSync = false;
      } else {
        // 后续同步：全选 + 粘贴（替换内容）
        // 先全选
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "a" using command down'`);
        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 30));
        // 再粘贴
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
      }
    } catch (error) {
      console.error('同步到输入框失败:', error);
    }
  }
}

/**
 * 保存图片到文件
 */
async function saveImageToFile(base64: string, ext: string, id: string): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('没有打开的工作区');
  }
  
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const voiceDir = path.join(workspaceRoot, '.cursor', 'voice-images');
  
  // 确保目录存在
  if (!fs.existsSync(voiceDir)) {
    fs.mkdirSync(voiceDir, { recursive: true });
  }
  
  // 使用 id 作为文件名
  const filename = `img_${id}.${ext}`;
  const filePath = path.join(voiceDir, filename);
  
  // 解码 Base64 并保存
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);
  
  // 返回相对路径
  return `.cursor/voice-images/${filename}`;
}

/**
 * 获取当前同步状态
 */
export function getCurrentState(): { text: string; imageCount: number } {
  return {
    text: currentText,
    imageCount: currentImages.size
  };
}

/**
 * 清空当前状态
 */
export function clearState(): void {
  currentText = '';
  currentImages.clear();
  isFirstSync = true;
}

// ============ 兼容旧协议 ============

/**
 * 插入内容到 Cursor 对话框（三层降级方案）- 旧协议
 */
export async function insertContent(message: TextMessage | ImageMessage): Promise<void> {
  let content: string;
  
  if (message.type === 'text') {
    content = message.content;
  } else {
    // 图片消息：转换为 Markdown 格式
    const ext = message.mimeType === 'image/png' ? 'png' : 'jpg';
    const imagePath = await saveImageToFile(message.base64, ext, Date.now().toString());
    content = `![image](${imagePath})`;
  }
  
  // 方案1：剪贴板 + 自动粘贴
  try {
    await vscode.env.clipboard.writeText(content);
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    vscode.window.showInformationMessage('内容已插入');
    return;
  } catch (error) {
    console.log('方案1失败，尝试方案2:', error);
  }
  
  // 方案2：系统级模拟输入（macOS）
  if (process.platform === 'darwin') {
    try {
      await vscode.env.clipboard.writeText(content);
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
      vscode.window.showInformationMessage('内容已插入（系统粘贴）');
      return;
    } catch (error) {
      console.log('方案2失败，尝试方案3:', error);
    }
  }
  
  // 方案3：写入文件（兜底方案）
  await writeToFile(content);
  vscode.window.showInformationMessage('内容已写入 .cursor/voice-input.md，可使用 @ 引用');
}

/**
 * 写入内容到文件（方案3）
 */
async function writeToFile(content: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error('没有打开的工作区');
  }
  
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const cursorDir = path.join(workspaceRoot, '.cursor');
  const filePath = path.join(cursorDir, 'voice-input.md');
  
  // 确保目录存在
  if (!fs.existsSync(cursorDir)) {
    fs.mkdirSync(cursorDir, { recursive: true });
  }
  
  // 格式化时间戳
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // 追加内容到文件
  const entry = `\n<!-- Voice Input - ${timestamp} -->\n${content}\n`;
  fs.appendFileSync(filePath, entry);
}
