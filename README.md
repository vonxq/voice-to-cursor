# Voice to Cursor

一个跨平台工具，包含 Cursor/VSCode 插件和手机 App，通过扫码建立连接后，手机端输入的文字和图片可以实时同步到 Cursor 对话框。

## 功能特性

- 📱 **手机端输入**：支持文字输入和图片选择
- 🔗 **扫码连接**：通过二维码快速建立连接
- 📋 **实时同步**：内容自动同步到 Cursor 对话框
- 🖼️ **图片支持**：支持选择相册图片或拍照发送
- 🔄 **自动重连**：网络断开后自动尝试重连

## 项目结构

```
voice-to-cursor/
├── extension/          # Cursor/VSCode 插件
│   ├── src/
│   │   ├── extension.ts      # 插件入口
│   │   ├── server.ts         # WebSocket 服务器
│   │   ├── qrcode.ts         # 二维码生成
│   │   ├── inputHandler.ts   # 输入框内容插入
│   │   └── utils.ts          # 工具函数
│   └── package.json
│
└── mobile-app/         # React Native App
    ├── app/
    │   ├── scanner.tsx       # 扫码页面
    │   └── input.tsx         # 输入页面
    ├── services/
    │   └── websocket.ts       # WebSocket 客户端
    └── package.json
```

## 安装和使用

### 1. Cursor 插件

1. 进入 `extension` 目录：
   ```bash
   cd extension
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 编译 TypeScript：
   ```bash
   npm run compile
   ```

4. 在 Cursor/VSCode 中：
   - 按 `F5` 打开扩展开发宿主窗口
   - 或使用命令面板运行 "Voice to Cursor: 启动服务"

5. 启动服务后，会显示一个包含二维码的面板

### 2. 手机 App

1. 进入 `mobile-app` 目录：
   ```bash
   cd mobile-app
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm start
   ```

4. 使用 Expo Go App：
   - iOS: 在 App Store 下载 Expo Go
   - Android: 在 Google Play 下载 Expo Go
   - 扫描终端显示的二维码

5. 或者构建独立应用：
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```

## 使用流程

1. **启动插件服务**
   - 在 Cursor 中运行 "Voice to Cursor: 启动服务" 命令
   - 会显示包含二维码和 WebSocket 地址的面板

2. **手机端连接**
   - 打开手机 App
   - 扫描二维码或手动输入 WebSocket 地址
   - 连接成功后自动跳转到输入页面

3. **发送内容**
   - 在输入页面输入文字或选择图片
   - 点击"发送到 Cursor"按钮
   - 内容会自动插入到 Cursor 对话框

## 内容插入策略

插件采用三层降级方案确保内容能够成功插入：

1. **方案1**：剪贴板 + 自动粘贴（优先）
2. **方案2**：系统级模拟输入（macOS）
3. **方案3**：写入文件（兜底方案）
   - 内容写入 `.cursor/voice-input.md`
   - 可在 Cursor 中使用 `@voice-input.md` 引用

## 技术栈

### 插件端
- TypeScript
- VSCode Extension API
- WebSocket (ws)
- QRCode

### 手机端
- React Native
- Expo
- Expo Camera
- Expo Image Picker
- React Navigation

## 注意事项

1. **网络环境**：手机和电脑必须在同一局域网
2. **防火墙**：确保端口 9527 未被防火墙阻止
3. **权限**：手机 App 需要相机和相册权限
4. **图片大小**：大图片会自动压缩后传输

## 开发

### 插件开发

```bash
cd extension
npm run watch  # 监听模式编译
```

### 手机 App 开发

```bash
cd mobile-app
npm start      # 启动 Expo 开发服务器
```

## 许可证

MIT
