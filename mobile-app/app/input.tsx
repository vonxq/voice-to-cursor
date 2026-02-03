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
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
  InteractionManager,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { wsService } from '../services/websocket';
import { chatService, ChatMessage } from '../services/chatService';
import { theme } from '../constants/theme';

const STORAGE_KEY_TEXT = 'voice_to_cursor_draft_text';
const STORAGE_KEY_IMAGES = 'voice_to_cursor_draft_images';

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
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [fetchingClipboard, setFetchingClipboard] = useState(false);
  
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef(text);
  const imagesRef = useRef(images);
  const flatListRef = useRef<FlatList>(null);

  // 保持引用最新
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 初始化聊天服务和加载草稿
  useEffect(() => {
    const init = async () => {
      try {
        // 初始化聊天服务
        await chatService.init();
        setMessages(chatService.getMessages());
        
        // 加载草稿
        const [savedText, savedImages] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_TEXT),
          AsyncStorage.getItem(STORAGE_KEY_IMAGES),
        ]);
        
        if (savedText) {
          setText(savedText);
        }
        if (savedImages) {
          const parsed = JSON.parse(savedImages);
          if (Array.isArray(parsed)) {
            setImages(parsed);
          }
        }
      } catch (error) {
        console.log('初始化失败:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
    
    // 订阅消息变化
    const unsubscribe = chatService.subscribe(setMessages);
    return () => unsubscribe();
  }, []);

  // 保存文字草稿（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY_TEXT, text).catch(console.log);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  // 保存图片草稿
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

  // 监听 App 状态变化
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
          } else if (data.action === 'paste_only') {
            setSending(false);
          }
        } else if (data.type === 'error') {
          setSending(false);
          Alert.alert('错误', data.message || '操作失败');
        } else if (data.type === 'ai_reply') {
          // 接收AI回复摘要
          await chatService.addAssistantMessage(data.summary, data.content);
          scrollToBottom();
        } else if (data.type === 'clipboard_content') {
          // 接收电脑剪贴板内容
          setFetchingClipboard(false);
          if (data.content) {
            const newText = textRef.current + data.content;
            setText(newText);
            if (wsService.isConnected()) {
              wsService.syncText(newText);
            }
          } else {
            Alert.alert('提示', '电脑剪贴板为空');
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
    setShowImagePicker(false);
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
    setShowImagePicker(false);
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

  const handlePasteOnly = async () => {
    if (!connected) return;
    if (!text.trim() && images.length === 0) {
      Alert.alert('提示', '请先输入内容');
      return;
    }
    setSending(true);
    
    // 添加到聊天记录
    const imageUris = images.map(img => img.uri);
    await chatService.addUserMessage(text || '[图片]', imageUris.length > 0 ? imageUris : undefined);
    scrollToBottom();
    
    // 发送仅粘贴命令
    wsService.pasteOnly();
    
    // 清空输入
    setText('');
    setImages([]);
    AsyncStorage.multiRemove([STORAGE_KEY_TEXT, STORAGE_KEY_IMAGES]).catch(console.log);
    
    setTimeout(() => setSending(false), 500);
  };

  const handleSubmit = async () => {
    if (!connected) return;
    if (!text.trim() && images.length === 0) {
      Alert.alert('提示', '请先输入内容');
      return;
    }
    setSending(true);
    
    // 添加到聊天记录
    const imageUris = images.map(img => img.uri);
    await chatService.addUserMessage(text || '[图片]', imageUris.length > 0 ? imageUris : undefined);
    scrollToBottom();
    
    // 发送提交命令
    wsService.submit();
  };

  const goBack = () => {
    // @ts-ignore
    navigation.navigate('Home');
  };

  const clearChat = () => {
    Alert.alert(
      '清空聊天记录',
      '确定要清空所有聊天记录吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '清空', 
          style: 'destructive',
          onPress: () => chatService.clearHistory()
        },
      ]
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.type === 'user';
    
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
        {!isUser && <View style={styles.avatarAssistant}><Text style={styles.avatarText}>AI</Text></View>}
        <View style={[styles.messageBubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.messageText, isUser ? styles.textUser : styles.textAssistant]}>
            {isUser ? item.content : (item.summary || item.content)}
          </Text>
          {item.images && item.images.length > 0 && (
            <View style={styles.messageImages}>
              {item.images.slice(0, 3).map((uri, index) => (
                <Image key={index} source={{ uri }} style={styles.messageImage} />
              ))}
              {item.images.length > 3 && (
                <Text style={styles.moreImages}>+{item.images.length - 3}</Text>
              )}
            </View>
          )}
          <Text style={styles.messageTime}>
            {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isUser && <View style={styles.avatarUser}><Text style={styles.avatarText}>我</Text></View>}
      </View>
    );
  };

  // 加载中
  if (!isReady || isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* 顶部状态栏 */}
      <View style={styles.header}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, connected ? styles.online : styles.offline]} />
          <Text style={styles.statusText}>
            {connected ? '已连接' : '未连接'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {!connected && (
            <TouchableOpacity style={styles.reconnectBtn} onPress={goBack}>
              <Text style={styles.reconnectText}>连接</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.clearBtn} onPress={clearChat}>
            <Text style={styles.clearText}>清空</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 聊天消息列表 */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>开始对话吧</Text>
            <Text style={styles.emptySubtext}>输入内容会实时同步到 Cursor</Text>
          </View>
        }
      />

      {/* 已选图片预览 */}
      {images.length > 0 && (
        <View style={styles.imagePreviewBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {images.map((img) => (
              <View key={img.id} style={styles.previewImageWrapper}>
                <Image source={{ uri: img.uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.previewRemoveBtn}
                  onPress={() => removeImage(img.id)}
                >
                  <Text style={styles.previewRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 功能菜单弹出 */}
      {showImagePicker && (
        <View style={styles.imagePickerPopup}>
          <TouchableOpacity style={styles.pickerOption} onPress={pickImage}>
            <Text style={styles.pickerIcon}>🖼️</Text>
            <Text style={styles.pickerText}>相册</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerOption} onPress={takePhoto}>
            <Text style={styles.pickerIcon}>📷</Text>
            <Text style={styles.pickerText}>拍照</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.pickerOption} 
            onPress={() => {
              setShowImagePicker(false);
              fetchClipboardFromPC();
            }}
            disabled={fetchingClipboard}
          >
            <Text style={styles.pickerIcon}>📋</Text>
            <Text style={styles.pickerText}>
              {fetchingClipboard ? '获取中...' : '粘贴电脑内容'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.pickerOption, styles.pickerCancel]} 
            onPress={() => setShowImagePicker(false)}
          >
            <Text style={styles.pickerCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 底部输入区域 */}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowImagePicker(!showImagePicker)}
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
        
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          placeholder="输入消息..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={5000}
          value={text}
          onChangeText={handleTextChange}
          editable={connected && !sending}
        />
        
        <View style={styles.sendBtns}>
          <TouchableOpacity
            style={[styles.pasteOnlyBtn, (!connected || sending) && styles.btnDisabledBg]}
            onPress={handlePasteOnly}
            disabled={!connected || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.pasteOnlyText}>仅粘贴</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.sendBtn, (!connected || sending) && styles.btnDisabledBg]}
            onPress={handleSubmit}
            disabled={!connected || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>发送</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  loadingText: {
    marginTop: 12,
    color: theme.textSecondary,
    fontSize: 14,
  },
  
  // 顶部
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  online: {
    backgroundColor: theme.success,
  },
  offline: {
    backgroundColor: theme.danger,
  },
  statusText: {
    color: theme.text,
    fontSize: 15,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  reconnectBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reconnectText: {
    color: '#fff',
    fontSize: 14,
  },
  clearBtn: {
    backgroundColor: theme.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearText: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  
  // 消息列表
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: theme.textSecondary,
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: theme.textSecondary,
    fontSize: 13,
    opacity: 0.7,
  },
  
  // 消息行
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  
  // 头像
  avatarUser: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  avatarAssistant: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // 消息气泡
  messageBubble: {
    maxWidth: '70%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: theme.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: theme.surface,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  textUser: {
    color: '#fff',
  },
  textAssistant: {
    color: theme.text,
  },
  messageImages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 4,
  },
  messageImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  moreImages: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 60,
    fontSize: 14,
    overflow: 'hidden',
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  
  // 图片预览条
  imagePreviewBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  previewImageWrapper: {
    marginRight: 8,
    position: 'relative',
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  previewRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewRemoveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  
  // 图片选择器弹窗
  imagePickerPopup: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  pickerText: {
    color: theme.text,
    fontSize: 15,
  },
  pickerCancel: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 4,
    paddingTop: 12,
  },
  pickerCancelText: {
    color: theme.textSecondary,
    fontSize: 15,
  },
  
  // 底部输入栏
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 8,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: theme.text,
    fontSize: 24,
    lineHeight: 28,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.surfaceLight,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.text,
    maxHeight: 100,
    minHeight: 36,
  },
  sendBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  pasteOnlyBtn: {
    backgroundColor: theme.secondary,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pasteOnlyText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sendBtn: {
    backgroundColor: theme.success,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabledBg: {
    opacity: 0.5,
  },
});
