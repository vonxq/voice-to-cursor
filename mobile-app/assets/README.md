# Assets 目录

此目录用于存放应用资源文件。

## 必需的文件

根据 `app.json` 配置，需要以下文件：

- `icon.png` - 应用图标 (1024x1024)
- `splash.png` - 启动画面 (1242x2436)
- `adaptive-icon.png` - Android 自适应图标 (1024x1024)
- `favicon.png` - Web 图标 (48x48)

## 生成资源文件

可以使用 Expo 工具生成：

```bash
npx expo install expo-asset
```

或者使用在线工具：
- [App Icon Generator](https://www.appicon.co/)
- [Expo Asset Generator](https://docs.expo.dev/guides/app-icons/)

## 临时方案

在开发阶段，可以创建简单的占位图片，或者使用 Expo 的默认资源。
