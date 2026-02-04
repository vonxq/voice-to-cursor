# Voice to Cursor

📱 用手机语音/文字输入，实时同步到电脑的 Cursor AI 对话框。

## 📥 快速安装

### 手机 App

| 平台 | 下载方式 |
|------|----------|
| **Android** | [下载 APK](https://github.com/vonxq/voice-to-cursor/releases) 直接安装 |
| **iOS** | 需自行构建（见下方说明）|

### 电脑端

#### 方式一：独立版（推荐，任何应用都能用）

```bash
# 下载项目
git clone https://github.com/vonxq/voice-to-cursor.git
cd voice-to-cursor/standalone

# 安装依赖并启动
npm install
npm start
```

启动后会显示两个二维码：
- **Web 版二维码**：用手机浏览器扫描，无需安装 App（推荐）
- **App 版二维码**：用手机 App 扫码连接

> 💡 **Web 版最轻量**：直接用手机浏览器扫码访问 `http://电脑IP:9527` 即可使用，无需安装任何 App！

#### 方式二：Cursor 插件

1. 在 Cursor 扩展商店搜索 "Voice to Cursor" 安装
2. 按 `Cmd+Shift+P`，运行 "Voice to Cursor: 启动服务"
3. 用手机扫码连接

## ✨ 功能特性

- 📝 **实时同步**：手机输入实时同步到电脑
- 🎤 **语音输入**：配合手机输入法的语音功能
- 🖼️ **图片支持**：选择相册图片或拍照发送
- 📋 **剪贴板互通**：获取电脑剪贴板内容到手机
- 🔄 **替换当前行**：支持替换终端当前行内容
- 🤖 **AI 回复**：开启后 AI 回复自动发送到手机
- 💬 **聊天记录**：手机端保存聊天历史

## 📱 手机 App 操作说明

| 按钮 | 功能 |
|------|------|
| 📋 剪贴板 | 获取电脑剪贴板内容 |
| 📥 当前行 | 获取终端当前行内容 |
| 🖼️ 相册 | 选择图片发送 |
| 📷 拍照 | 拍照发送 |
| 🗑️ 清空 | 清空输入框 |
| 📋 粘贴 | 仅粘贴到电脑 |
| 🔄 替换 | 替换终端当前行 |
| 🚀 发送 | 粘贴并回车发送 |
| 🤖 ON/OFF | AI 回复开关 |

## 🔧 自行构建

### iOS 构建（需要 Mac + Apple 开发者账号）

```bash
cd mobile-app
npm install

# 连接 iPhone 后运行
npx expo run:ios --device
```

### Android 构建

```bash
cd mobile-app
npm install

# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 构建 APK
eas build --platform android --profile preview
```

## ⚙️ 配置

### 端口

服务器会自动查找可用端口（默认从 `9527` 开始），无需手动配置。

如需指定端口：
```bash
node server.js --port=8080
```

### 网络要求
- 手机和电脑必须在同一局域网
- 确保端口未被防火墙阻止

## 📁 项目结构

```
voice-to-cursor/
├── extension/      # Cursor/VSCode 插件
├── standalone/     # 独立版服务器
└── mobile-app/     # React Native 手机 App
```

## 🛠️ 开发

```bash
# 插件开发
cd extension && npm run watch

# 独立版开发
cd standalone && node server.js

# 手机 App 开发
cd mobile-app && npx expo start
```

## 📝 更新日志

### v1.0.0
- ✅ 实时文字同步
- ✅ 图片发送
- ✅ 扫码连接
- ✅ 独立版（系统级使用）
- ✅ 剪贴板互通
- ✅ AI 回复功能
- ✅ 聊天记录持久化

## 📄 许可证

MIT
