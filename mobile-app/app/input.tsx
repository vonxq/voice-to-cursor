import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  AppState,
  AppStateStatus,
  InteractionManager,
  FlatList,
  ActionSheetIOS,
  Clipboard,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { wsService } from '../services/websocket';
import { chatService, ChatMessage } from '../services/chatService';
import { theme } from '../constants/theme';

const STORAGE_KEY_TEXT = 'voice_to_cursor_draft_text';
const STORAGE_KEY_IMAGES = 'voice_to_cursor_draft_images';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ImageData {
  id: string;
  uri: string;
  base64: string;
  mimeType: string;
}

export default function InputScreen() {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isReady, setIsReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fetchingClipboard, setFetchingClipboard] = useState(false);
  
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef(text);
  const imagesRef = useRef(images);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    const init = async () => {
      try {
        await chatService.init();
        setMessages(chatService.getMessages());
        
        const [savedText, savedImages] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TEXT),
          AsyncStorage.getItem(STORAGE_KEY_IMAGES),
        ]);
        
        if (savedText) setText(savedText);
        if (savedImages) {
          const parsed = JSON.parse(savedImages);
          if (Array.isArray(parsed)) setImages(parsed);
        }
      } catch (error) {
        console.log('初始化失败:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
    
    const unsubscribe = chatService.subscribe(setMessages);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY_TEXT, text).catch(console.log);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const saveImages = async () => {
      try {
        const toSave = images.map(img => ({
          id: img.id,
          uri: img.uri,
          mimeType: img.mimeType,
        }));
        await AsyncStorage.setItem(STORAGE_KEY_IMAGES, JSON.stringify(toSave));
      } catch (error) {
        console.log('保存图片草稿失败:', error);
      }
    };
    saveImages();
  }, [images]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      setIsReady(true);
      InteractionManager.runAfterInteractions(async () => {
        const isConn = wsService.isConnected();
        setConnected(isConn);
        if (!isConn) {
          const success = await wsService.tryAutoConnect();
          if (success) {
            setConnected(true);
            if (textRef.current) wsService.syncText(textRef.current);
            for (const img of imagesRef.current) {
              wsService.syncImageAdd(img.id, img.base64, img.mimeType);
            }
          }
        }
      });
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      setIsReady(true);
      setConnected(wsService.isConnected());

      wsService.onOpen(() => setConnected(true));
      wsService.onClose(() => setConnected(false));

      wsService.onMessage(async (data) => {
        if (data.type === 'ack') {
          if (data.action === 'submit') {
            setText('');
            setImages([]);
            setSending(false);
            AsyncStorage.multiRemove([STORAGE_KEY_TEXT, STORAGE_KEY_IMAGES]).catch(console.log);
          } else if (data.action === 'paste_only' || data.action === 'replace_line') {
            setSending(false);
            setText('');
            setImages([]);
            AsyncStorage.multiRemove([STORAGE_KEY_TEXT, STORAGE_KEY_IMAGES]).catch(console.log);
          }
        } else if (data.type === 'error') {
          setSending(false);
          Alert.alert('错误', data.message || '操作失败');
        } else if (data.type === 'ai_reply') {
          await chatService.addAssistantMessage(data.summary, data.content);
          scrollToBottom();
        } else if (data.type === 'clipboard_content') {
          setFetchingClipboard(false);
          if (data.content) {
            setText(data.content);
            if (wsService.isConnected()) {
              wsService.syncText(data.content);
            }
          } else {
            Alert.alert('提示', '电脑剪贴板为空');
          }
        } else if (data.type === 'current_line_content') {
          if (data.content) {
            setText(data.content);
            if (wsService.isConnected()) {
              wsService.syncText(data.content);
            }
          } else {
            Alert.alert('提示', '当前行为空');
          }
        }
      });
      
      return () => {};
    }, [])
  );

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    if (connected && wsService.isConnected()) {
      wsService.syncText(newText);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相册权限', '请在设置中允许访问相册');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets) {
      const newImages: ImageData[] = result.assets.map((asset) => ({
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        uri: asset.uri,
        base64: asset.base64 || '',
        mimeType: asset.mimeType || 'image/jpeg',
      }));

      setImages(prev => [...prev, ...newImages]);

      if (connected && wsService.isConnected()) {
        for (const img of newImages) {
          wsService.syncImageAdd(img.id, img.base64, img.mimeType);
        }
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相机权限', '请在设置中允许访问相机');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const newImage: ImageData = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        uri: asset.uri,
        base64: asset.base64 || '',
        mimeType: asset.mimeType || 'image/jpeg',
      };

      setImages(prev => [...prev, newImage]);

      if (connected && wsService.isConnected()) {
        wsService.syncImageAdd(newImage.id, newImage.base64, newImage.mimeType);
      }
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (connected && wsService.isConnected()) {
      wsService.syncImageRemove(id);
    }
  };

  const fetchClipboardFromPC = () => {
    if (!connected) {
      Alert.alert('提示', '请先连接电脑');
      return;
    }
    setFetchingClipboard(true);
    wsService.getClipboard();
    setTimeout(() => setFetchingClipboard(false), 3000);
  };

  const fetchCurrentLine = () => {
    if (!connected) {
      Alert.alert('提示', '请先连接电脑');
      return;
    }
    wsService.getCurrentLine();
  };

  const replaceCurrentLine = () => {
    if (!connected) {
      Alert.alert('提示', '请先连接电脑');
      return;
    }
    if (!text.trim()) {
      Alert.alert('提示', '请先输入内容');
      return;
    }
    wsService.replaceLine();
  };

  const handlePasteOnly = async () => {
    if (!connected) return;
    if (!text.trim() && images.length === 0) {
      Alert.alert('提示', '请先输入内容');
      return;
    }
    setSending(true);
    
    const imageUris = images.map(img => img.uri);
    await chatService.addUserMessage(text || '[图片]', imageUris.length > 0 ? imageUris : undefined);
    scrollToBottom();
    
    wsService.pasteOnly();
  };

  const handleSubmit = async () => {
    if (!connected) return;
    if (!text.trim() && images.length === 0) {
      Alert.alert('提示', '请先输入内容');
      return;
    }
    setSending(true);
    
    const imageUris = images.map(img => img.uri);
    await chatService.addUserMessage(text || '[图片]', imageUris.length > 0 ? imageUris : undefined);
    scrollToBottom();
    
    wsService.submit();
  };

  const goBack = () => {
    // @ts-ignore
    navigation.navigate('Home');
  };

  const clearChat = () => {
    Alert.alert('清空聊天记录', '确定要清空所有聊天记录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => chatService.clearHistory() },
    ]);
  };

  const handleMessageLongPress = (item: ChatMessage) => {
    const content = item.type === 'user' ? item.content : (item.summary || item.content);
    
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['取消', '复制', '填入输入框'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            Clipboard.setString(content);
          } else if (buttonIndex === 2) {
            setText(content);
            if (connected && wsService.isConnected()) {
              wsService.syncText(content);
            }
          }
        }
      );
    } else {
      Alert.alert('消息操作', '', [
        { text: '取消', style: 'cancel' },
        { text: '复制', onPress: () => Clipboard.setString(content) },
        { text: '填入输入框', onPress: () => {
          setText(content);
          if (connected && wsService.isConnected()) {
            wsService.syncText(content);
          }
        }},
      ]);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.type === 'user';
    return (
      <TouchableOpacity 
        style={[styles.msgItem, isUser && styles.msgItemUser]}
        onLongPress={() => handleMessageLongPress(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.msgText} numberOfLines={2}>
          {isUser ? item.content : (item.summary || item.content)}
        </Text>
        <Text style={styles.msgTime}>
          {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </TouchableOpacity>
    );
  };

  if (!isReady || isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  const hasContent = text.trim() || images.length > 0;

  return (
    <View style={styles.container}>
      {/* 顶部状态栏 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, connected && styles.statusOnline]} />
          <Text style={styles.headerTitle}>{connected ? '已连接' : '未连接'}</Text>
        </View>
        <View style={styles.headerRight}>
          {!connected && (
            <TouchableOpacity style={styles.headerBtn} onPress={goBack}>
              <Text style={styles.headerBtnText}>连接</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearChat}>
            <Text style={styles.clearText}>清空记录</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 功能按钮区域 */}
      <ScrollView style={styles.actionSection} showsVerticalScrollIndicator={false}>
        {/* 获取内容 */}
        <View style={styles.actionGroup}>
          <Text style={styles.groupLabel}>从电脑获取</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionBtn, !connected && styles.btnDisabled]}
              onPress={fetchClipboardFromPC}
              disabled={!connected || fetchingClipboard}
            >
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionText}>剪贴板</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, !connected && styles.btnDisabled]}
              onPress={fetchCurrentLine}
              disabled={!connected}
            >
              <Text style={styles.actionIcon}>📥</Text>
              <Text style={styles.actionText}>当前行</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, !connected && styles.btnDisabled]}
              onPress={pickImage}
              disabled={!connected}
            >
              <Text style={styles.actionIcon}>🖼️</Text>
              <Text style={styles.actionText}>相册</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, !connected && styles.btnDisabled]}
              onPress={takePhoto}
              disabled={!connected}
            >
              <Text style={styles.actionIcon}>📷</Text>
              <Text style={styles.actionText}>拍照</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 聊天记录（精简显示） */}
        {messages.length > 0 && (
          <View style={styles.historyGroup}>
            <Text style={styles.groupLabel}>最近记录（长按可复制）</Text>
            <FlatList
              ref={flatListRef}
              horizontal
              data={[...messages].reverse().slice(0, 10)}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.historyContent}
            />
          </View>
        )}
      </ScrollView>

      {/* 底部输入区域 - 始终可见 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.inputSection}>
          {/* 图片预览 */}
          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreview}>
              {images.map((img) => (
                <View key={img.id} style={styles.previewItem}>
                  <Image source={{ uri: img.uri }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.previewRemove} onPress={() => removeImage(img.id)}>
                    <Text style={styles.previewRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={connected ? "输入内容..." : "请先连接"}
              placeholderTextColor={theme.textSecondary}
              multiline
              value={text}
              onChangeText={handleTextChange}
              editable={connected && !sending}
            />
            
            {/* 发送按钮组 */}
            <View style={styles.inputBtns}>
              <TouchableOpacity 
                style={[styles.inputBtn, styles.btnPaste, (!connected || !hasContent || sending) && styles.btnDisabled]}
                onPress={handlePasteOnly}
                disabled={!connected || !hasContent || sending}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.inputBtnText}>贴</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.inputBtn, styles.btnReplace, (!connected || !hasContent || sending) && styles.btnDisabled]}
                onPress={replaceCurrentLine}
                disabled={!connected || !hasContent || sending}
              >
                <Text style={styles.inputBtnText}>换</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.inputBtn, styles.btnSubmit, (!connected || !hasContent || sending) && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={!connected || !hasContent || sending}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.inputBtnText}>发</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // 顶部
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 12,
    backgroundColor: theme.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.danger,
    marginRight: 8,
  },
  statusOnline: {
    backgroundColor: theme.success,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerBtnText: {
    color: '#fff',
    fontSize: 13,
  },
  clearText: {
    color: theme.textSecondary,
    fontSize: 13,
  },
  
  // 功能按钮区域
  actionSection: {
    flex: 1,
    backgroundColor: theme.background,
  },
  actionGroup: {
    padding: 16,
    paddingBottom: 8,
  },
  historyGroup: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionText: {
    color: theme.text,
    fontSize: 12,
  },
  
  // 历史记录
  historyContent: {
    gap: 8,
  },
  msgItem: {
    backgroundColor: theme.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: SCREEN_WIDTH * 0.6,
  },
  msgItemUser: {
    backgroundColor: theme.primary,
  },
  msgText: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 18,
  },
  msgTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  
  // 底部输入区域
  inputSection: {
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  imagePreview: {
    marginBottom: 10,
  },
  previewItem: {
    marginRight: 8,
    position: 'relative',
  },
  previewImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.surfaceLight,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.text,
    maxHeight: 100,
    minHeight: 40,
  },
  inputBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  inputBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPaste: {
    backgroundColor: theme.secondary,
  },
  btnReplace: {
    backgroundColor: theme.warning,
  },
  btnSubmit: {
    backgroundColor: theme.success,
  },
  inputBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
