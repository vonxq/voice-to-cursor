import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { wsService } from '../services/websocket';
import { theme } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const navigation = useNavigation();

  // 加载上次连接地址
  useEffect(() => {
    const loadLastUrl = async () => {
      const url = await wsService.getLastUrl();
      if (url) {
        setLastUrl(url);
        setManualUrl(url.replace('ws://', ''));
      }
    };
    loadLastUrl();
  }, []);

  // 检查连接状态
  useFocusEffect(
    React.useCallback(() => {
      setConnected(wsService.isConnected());
      
      wsService.onOpen(() => {
        setConnected(true);
        setConnecting(false);
      });
      
      wsService.onClose(() => {
        setConnected(false);
        setConnecting(false);
      });
      
      wsService.onError(() => {
        setConnected(false);
        setConnecting(false);
      });
    }, [])
  );

  // 手动连接
  const handleManualConnect = async () => {
    if (!manualUrl.trim()) {
      Alert.alert('提示', '请输入连接地址');
      return;
    }

    let url = manualUrl.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = `ws://${url}`;
    }

    setConnecting(true);
    setShowModal(false);

    try {
      await wsService.connect(url);
      // @ts-ignore
      navigation.navigate('Input');
    } catch (error) {
      Alert.alert('连接失败', '无法连接到服务器，请检查地址是否正确');
    } finally {
      setConnecting(false);
    }
  };

  // 快速重连
  const handleQuickConnect = async () => {
    if (!lastUrl) return;
    
    setConnecting(true);
    try {
      await wsService.connect(lastUrl);
      // @ts-ignore
      navigation.navigate('Input');
    } catch (error) {
      Alert.alert('连接失败', '无法连接，请重新扫码或手动输入');
    } finally {
      setConnecting(false);
    }
  };

  // 断开连接
  const handleDisconnect = () => {
    wsService.disconnect();
    setConnected(false);
  };

  return (
    <View style={styles.container}>
      {/* Logo 区域 */}
      <View style={styles.logoSection}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoEmoji}>📱</Text>
        </View>
        <Text style={styles.title}>Voice to Cursor</Text>
        <Text style={styles.subtitle}>手机输入，Cursor 同步</Text>
      </View>

      {/* 状态显示 */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, connected ? styles.statusOnline : styles.statusOffline]} />
          <Text style={styles.statusText}>
            {connected ? '已连接' : '未连接'}
          </Text>
        </View>
        {connected && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>断开</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 操作按钮 */}
      <View style={styles.actionSection}>
        {connected ? (
          <TouchableOpacity
            style={styles.primaryButton}
            // @ts-ignore
            onPress={() => navigation.navigate('Input')}
          >
            <Text style={styles.primaryButtonText}>进入输入页面</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* 扫码连接 */}
            <TouchableOpacity
              style={styles.primaryButton}
              // @ts-ignore
              onPress={() => navigation.navigate('Scanner')}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonIcon}>📷</Text>
                  <Text style={styles.primaryButtonText}>扫码连接</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 手动输入 */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowModal(true)}
              disabled={connecting}
            >
              <Text style={styles.buttonIcon}>⌨️</Text>
              <Text style={styles.secondaryButtonText}>手动输入地址</Text>
            </TouchableOpacity>

            {/* 快速重连 */}
            {lastUrl && (
              <TouchableOpacity
                style={styles.quickConnectButton}
                onPress={handleQuickConnect}
                disabled={connecting}
              >
                <Text style={styles.quickConnectText}>
                  快速重连: {lastUrl.replace('ws://', '')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* 使用说明 */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>使用步骤</Text>
        <View style={styles.helpItem}>
          <Text style={styles.helpNumber}>1</Text>
          <Text style={styles.helpText}>在 Cursor 中启动 Voice to Cursor 服务</Text>
        </View>
        <View style={styles.helpItem}>
          <Text style={styles.helpNumber}>2</Text>
          <Text style={styles.helpText}>扫描二维码或手动输入地址连接</Text>
        </View>
        <View style={styles.helpItem}>
          <Text style={styles.helpNumber}>3</Text>
          <Text style={styles.helpText}>在手机上输入，内容实时同步到 Cursor</Text>
        </View>
      </View>

      {/* 手动输入弹窗 */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>输入连接地址</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="192.168.x.x:9527"
              placeholderTextColor={theme.textSecondary}
              value={manualUrl}
              onChangeText={setManualUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleManualConnect}
              >
                <Text style={styles.modalConfirmText}>连接</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 20,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  statusCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusOnline: {
    backgroundColor: theme.success,
  },
  statusOffline: {
    backgroundColor: theme.textSecondary,
  },
  statusText: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '500',
  },
  disconnectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.surfaceLight,
  },
  disconnectText: {
    color: theme.danger,
    fontWeight: '500',
  },
  actionSection: {
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 56,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 56,
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '600',
  },
  buttonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  quickConnectButton: {
    backgroundColor: theme.surfaceLight,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  quickConnectText: {
    color: theme.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  helpSection: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 16,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  helpNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.primary,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: 12,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 22,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width - 48,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: theme.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.text,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
  },
  modalCancelText: {
    color: theme.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
