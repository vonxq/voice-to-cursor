import * as os from 'os';

/**
 * 获取本机局域网 IP 地址
 */
export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  
  // 优先查找 IPv4 地址，排除内部地址
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    
    for (const net of nets) {
      // 跳过内部（127.0.0.1）和非 IPv4 地址
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  // 如果没找到，返回 localhost（开发环境）
  return '127.0.0.1';
}
