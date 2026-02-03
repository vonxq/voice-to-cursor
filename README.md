# Voice to Cursor

📱 用手机语音/文字输入，实时同步到电脑的 Cursor AI 对话框。支持 Cursor 插件和独立版（可在任何应用中使用）。

## ✨ 功能特性

- 📝 **实时同步**：手机输入实时同步到电脑
- 🎤 **语音输入**：配合手机输入法的语音功能使用
- 🖼️ **图片支持**：支持选择相册图片或拍照发送
- 📋 **剪贴板互通**：可获取电脑剪贴板内容到手机
- 🔄 **替换当前行**：支持替换终端当前行内容
- 🤖 **AI 回复**：开启后 AI 回复会自动发送到手机
- 💬 **聊天记录**：手机端保存聊天历史，方便查看
- 🔗 **扫码连接**：通过二维码快速建立连接

## 📁 项目结构

```
voice-to-cursor/
├── extension/          # Cursor/VSCode 插件版
├── standalone/         # 独立版（可在任何应用中使用）
└── mobile-app/         # React Native 手机 App
```

## 🚀 快速开始

### 方式一：独立版（推荐，可在任何应用中使用）

1. **启动服务器**
   ```bash
   cd standalone
   npm install
   npm start
   ```

2. **手机连接**
   - 下载 Expo Go App（[iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)）
   - 启动手机 App：
     ```bash
     cd mobile-app
     npm install
     npx expo start
     ```
   - 用 Expo Go 扫描终端二维码
   - 在 App 中扫描服务器显示的二维码连接

3. **开始使用**
   - 手机输入内容，点击「发送」或「仅粘贴」
   - 内容会粘贴到电脑当前光标位置

### 方式二：Cursor 插件版

1. **安装插件**
   ```bash
   cd extension
   npm install
   npm run compile
   ```

2. **在 Cursor 中启动**
   - 按 `F5` 或运行 "Voice to Cursor: 启动服务"
   - 显示二维码面板

3. **手机连接并使用**（同上）

## 📱 手机 App 功能

| 按钮 | 功能 |
|------|------|
| 📋 剪贴板 | 获取电脑剪贴板内容到手机 |
| 📥 当前行 | 获取终端当前行内容 |
| 🖼️ 相册 | 选择图片发送 |
| 📷 拍照 | 拍照发送 |
| 🗑️ 清空 | 清空输入框 |
| 📋 粘贴 | 仅粘贴内容到电脑 |
| 🔄 替换 | 替换终端当前行 |
| 🚀 发送 | 粘贴并回车发送 |
| 🤖 ON/OFF | AI 回复开关 |

### AI 回复功能

打开 🤖 开关后：
- 发送的内容会自动添加 prompt
- AI 完成任务后会调用接口发送回复到手机
- 手机聊天记录中可查看 AI 回复

## ⚙️ 配置说明

### 端口
默认端口 `9527`，可在代码中修改。

### 网络要求
- 手机和电脑必须在同一局域网
- 确保端口未被防火墙阻止

## 🛠️ 开发

### 插件开发
```bash
cd extension
npm run watch  # 监听模式编译
```

### 独立版开发
```bash
cd standalone
node server.js
```

### 手机 App 开发
```bash
cd mobile-app
npx expo start
```

### 发送 AI 回复到手机
```bash
cd standalone
node send-reply.js "你的回复内容"
```

## 📝 更新日志

### v1.0.0
- ✅ 实时文字同步
- ✅ 图片发送支持
- ✅ 扫码快速连接
- ✅ 独立版支持（可在任何应用中使用）
- ✅ 剪贴板互通
- ✅ 替换终端当前行
- ✅ AI 回复开关
- ✅ 聊天记录持久化

## 📄 许可证

MIT
