'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message as AIMessage, CreateMessage } from 'ai';

import { ChatHeader } from '@/components/chat-header';
import { Messages } from './messages';
import { MultimodalInput } from './multimodal-input';
import { useHydrateMCPStore, useMCPStore } from '@/lib/store/mcpStore';
import { completionsStream, Message as ApiMessage, MessageRole } from '@/api/conversation';
import { textToSpeechStream } from '@/api/tts';

// 创建适配器函数，用于转换ApiMessage和AIMessage类型
const adaptApiToAIMessage = (apiMsg: ApiMessage): AIMessage => {
  return {
    id: apiMsg.id,
    content: apiMsg.content,
    role: apiMsg.role === MessageRole.user 
      ? 'user' 
      : apiMsg.role === MessageRole.assistant 
        ? 'assistant' 
        : 'system',
    createdAt: new Date()
  };
};

const adaptAIToApiMessage = (aiMsg: AIMessage): ApiMessage => {
  return {
    id: aiMsg.id,
    content: typeof aiMsg.content === 'string' ? aiMsg.content : JSON.stringify(aiMsg.content),
    role: aiMsg.role === 'user' 
      ? MessageRole.user 
      : aiMsg.role === 'assistant' 
        ? MessageRole.assistant 
        : MessageRole.system,
  };
};

// 音频队列项接口
interface AudioQueueItem {
  audio: HTMLAudioElement;
  blob: Blob;
}

export function Chat({
  id,
  selectedModelId,
}: {
  id: string;
  selectedModelId: string;
}) {
  useHydrateMCPStore();
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [accumulatedTtsText, setAccumulatedTtsText] = useState('');
  const [isProcessingTTS, setIsProcessingTTS] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState<Blob[]>([]);
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ttsQueueRef = useRef<string>('');
  const ttsCollectionTimer = useRef<NodeJS.Timeout | null>(null);
  const audioQueue = useRef<AudioQueueItem[]>([]);
  const isPlayingAudio = useRef<boolean>(false);
  const processedTextRef = useRef<string>('');

  // 转换为AI Message类型供UI使用
  const messages = apiMessages.map(adaptApiToAIMessage);
  
  // 设置消息的处理函数，接受AI Message类型
  const setMessages = useCallback((value: AIMessage[] | ((prev: AIMessage[]) => AIMessage[])) => {
    if (typeof value === 'function') {
      setApiMessages(prev => {
        const newAIMessages = value(prev.map(adaptApiToAIMessage));
        return newAIMessages.map(adaptAIToApiMessage);
      });
    } else {
      setApiMessages(value.map(adaptAIToApiMessage));
    }
  }, []);

  // 播放队列中的下一个音频
  const playNextAudio = useCallback(() => {
    if (audioQueue.current.length === 0) {
      isPlayingAudio.current = false;
      return;
    }
    
    isPlayingAudio.current = true;
    const nextItem = audioQueue.current.shift();
    if (!nextItem) return;
    
    const { audio, blob } = nextItem;
    audioRef.current = audio;
    
    // 播放结束后自动播放下一个
    audio.onended = () => {
      playNextAudio();
    };
    
    // 播放错误处理
    audio.onerror = (e) => {
      console.error('音频播放错误:', e);
      playNextAudio(); // 跳到下一个
    };
    
    // 开始播放
    audio.play().catch(err => {
      console.error('播放失败:', err);
      playNextAudio(); // 跳到下一个
    });
  }, []);

  // 向队列添加音频并开始播放（如果队列为空）
  const addToAudioQueue = useCallback((item: AudioQueueItem) => {
    // 添加到队列
    audioQueue.current.push(item);
    setAudioBlobs(prev => [...prev, item.blob]);
    
    // 如果没有在播放，开始播放
    if (!isPlayingAudio.current) {
      playNextAudio();
    }
  }, [playNextAudio]);

  // 处理TTS请求
  const handleTTS = useCallback(async (text: string) => {
    if (!text || text.trim() === '') return;
    
    // 检查文本不为空
    console.log('处理TTS请求，文本长度:', text.length);
    
    // 标记TTS处理开始
    setIsProcessingTTS(true);
    
    try {
      // 获取新的音频
      const response = await textToSpeechStream(text);
      
      // 将音频添加到播放队列
      addToAudioQueue(response);
      
      // TTS请求已完成
      setIsProcessingTTS(false);
      
      // 立即检查队列中是否有待处理文本
      if (ttsQueueRef.current.length > 0) {
        const queuedText = ttsQueueRef.current;
        ttsQueueRef.current = ''; // 清空队列
        // 使用setTimeout避免调用栈溢出
        setTimeout(() => handleTTS(queuedText), 10);
      }
    } catch (error) {
      console.error('TTS获取失败:', error);
      setIsProcessingTTS(false); // 出错时也标记为处理完成
      
      // 处理队列中的文本
      if (ttsQueueRef.current.length > 0) {
        const queuedText = ttsQueueRef.current;
        ttsQueueRef.current = '';
        // 错误情况下延迟一点再重试
        setTimeout(() => handleTTS(queuedText), 500);
      }
    }
  }, [addToAudioQueue]);

  // 拼接所有音频文件
  const concatenateAudios = useCallback(() => {
    if (audioBlobs.length === 0) return;
    
    console.log(`准备拼接 ${audioBlobs.length} 个音频文件`);
    
    // 创建一个组合的Blob
    const combinedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
    
    // 创建下载链接
    const url = URL.createObjectURL(combinedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conversation-${id}-${new Date().toISOString()}.mp3`;
    document.body.appendChild(link);
    link.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    
    // TODO: 将合并的音频文件上传到OSS存储
    console.log('TODO: 将合并的音频文件上传到OSS存储');
  }, [audioBlobs, id]);

  // 更新或添加助手消息
  const updateAssistantMessage = useCallback((content: string) => {
    setApiMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      
      if (lastMessage && lastMessage.role === MessageRole.assistant) {
        // 更新现有消息
        return [
          ...newMessages.slice(0, -1),
          { ...lastMessage, content: lastMessage.content + content }
        ];
      } else {
        // 添加新消息
        return [
          ...newMessages,
          { id: uuidv4(), content, role: MessageRole.assistant }
        ];
      }
    });

    // 如果TTS启用，处理文本到语音
    if (ttsEnabled) {
      // 清除之前的定时器
      if (ttsCollectionTimer.current) {
        clearTimeout(ttsCollectionTimer.current);
        ttsCollectionTimer.current = null;
      }
      
      // 使用函数式更新确保拿到最新的状态
      setAccumulatedTtsText(prev => {
        // 新的累积文本
        const newText = prev + content;
        
        // 检查是否需要处理TTS
        const shouldProcessTTS = () => {
          // 如果包含换行符，按换行符分割处理
          if (newText.includes('\n')) {
            const segments = newText.split('\n');
            // 处理除最后一段外的所有段落
            for (let i = 0; i < segments.length - 1; i++) {
              const segment = segments[i].trim();
              if (segment) {
                if (processedTextRef.current !== segment) {
                  processedTextRef.current = segment;
                  setTimeout(() => {
                    if (!isProcessingTTS) {
                      handleTTS(segment);
                    } else {
                      ttsQueueRef.current += segment;
                    }
                    if (processedTextRef.current === segment) {
                      processedTextRef.current = '';
                    }
                  }, 0);
                }
              }
            }
            // 返回最后一段（可能未完成）
            return segments[segments.length - 1];
          }
          
          // 如果没有换行符且长度超过300，直接处理
          if (newText.length >= 300) {
            if (processedTextRef.current !== newText) {
              processedTextRef.current = newText;
              setTimeout(() => {
                if (!isProcessingTTS) {
                  handleTTS(newText);
                } else {
                  ttsQueueRef.current += newText;
                }
                if (processedTextRef.current === newText) {
                  processedTextRef.current = '';
                }
              }, 0);
            }
            return '';
          }
          
          // 继续累积
          return newText;
        };
        
        // 处理并返回新的累积文本
        return shouldProcessTTS();
      });
    }
  }, [ttsEnabled, handleTTS, isProcessingTTS]);

  // 清理音频资源
  const cleanupAudio = useCallback(() => {
    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // 清空队列
    audioQueue.current = [];
    isPlayingAudio.current = false;
    
    // 清理定时器
    if (ttsTimeoutRef.current) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }
    
    if (ttsCollectionTimer.current) {
      clearTimeout(ttsCollectionTimer.current);
      ttsCollectionTimer.current = null;
    }
    
    setAccumulatedTtsText('');
    ttsQueueRef.current = '';
    processedTextRef.current = ''; // 重置已处理文本标记
    setIsProcessingTTS(false);
  }, []);

  // 切换TTS开关
  const toggleTTS = useCallback(() => {
    setTtsEnabled(prev => !prev);
    
    // 关闭TTS时清理资源
    if (ttsEnabled) {
      cleanupAudio();
      
      // 如果有收集的音频，提示可以下载
      if (audioBlobs.length > 0) {
        concatenateAudios();
      }
    }
  }, [ttsEnabled, audioBlobs, concatenateAudios, cleanupAudio]);

  // 停止生成
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // 重新加载/重新生成
  const reload = useCallback(async () => {
    if (isLoading || apiMessages.length === 0) return null;
    
    // 找到最后一条用户消息
    const lastUserMessageIndex = [...apiMessages].reverse().findIndex(
      msg => msg.role === MessageRole.user
    );
    
    if (lastUserMessageIndex === -1) return null;
    
    // 移除最后一条助手消息（如果存在）
    let newMessages = [...apiMessages];
    const lastMessage = newMessages[newMessages.length - 1];
    if (lastMessage.role === MessageRole.assistant) {
      newMessages = newMessages.slice(0, -1);
      setApiMessages(newMessages);
    }
    
    // 开始流式请求
    await startCompletionStream(newMessages);
    return "";
  }, [apiMessages, isLoading]);

  // 添加消息
  const append = async (message: AIMessage | CreateMessage, chatRequestOptions?: any) => {
    const apiMessage: ApiMessage = {
      id: (message as AIMessage).id || uuidv4(),
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      role: message.role === 'user' 
        ? MessageRole.user 
        : message.role === 'assistant' 
          ? MessageRole.assistant 
          : MessageRole.system,
    };
    
    const newMessages = [...apiMessages, apiMessage];
    setApiMessages(newMessages);
    
    if (apiMessage.role === MessageRole.user) {
        startCompletionStream(newMessages);
    }
    return apiMessage.id;
  };

  // 处理提交
  const handleSubmit = useCallback((event?: { preventDefault?: () => void }) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (isLoading) return;
    if (!input.trim()) return;
    
    const userMessage: CreateMessage = {
      role: 'user',
      content: input.trim()
    };
    
    setInput('');
    append(userMessage);
  }, [input, isLoading, append]);

  // 处理流式消息
  const handleStreamMessage = useCallback((message: string) => {
    try {
      // 检查是否是[DONE]消息
      if (message === '[DONE]') return;
      
      try {
        const data = JSON.parse(message);
        const content = data.content || '';
        
        if (content) {
          updateAssistantMessage(content);
        }
      } catch (error) {
        // 如果不是JSON，直接使用消息
        updateAssistantMessage(message);
      }
    } catch (error) {
      console.error('处理流消息失败:', error);
    }
  }, [updateAssistantMessage]);

  // 启动流式完成
  const startCompletionStream = async (currentMessages: ApiMessage[]) => {
    console.log("isLoading:", isLoading);
    
    if (isLoading || !currentMessages?.length) {
      return;
    }
    
    const tools = useMCPStore.getState().tools;
    setIsLoading(true);
    
    // 如果开启了TTS，重置TTS相关状态
    if (ttsEnabled) {
      cleanupAudio();
    }
    
    try {
      const controller = await completionsStream(
        { 
          messages: currentMessages.map(msg => ({
            content: msg.content, 
            role: msg.role
          })),
          tools: tools
        },
        (message) => {
          handleStreamMessage(message);
        },
        (error: any) => {
          console.error('流式请求错误:', error);
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
          abortControllerRef.current = null;
          
          // 当消息完成时，处理任何剩余的TTS文本
          if (ttsEnabled && accumulatedTtsText && accumulatedTtsText.length > 0) {
            console.log('消息流完成，处理剩余TTS文本，长度:', accumulatedTtsText.length);
            
            // 清除任何挂起的定时器
            if (ttsCollectionTimer.current) {
              clearTimeout(ttsCollectionTimer.current);
              ttsCollectionTimer.current = null;
            }
            
            // 获取当前文本
            const finalText = accumulatedTtsText.trim();
            
            // 清空累积的文本
            setAccumulatedTtsText('');
            
            // 处理最后一段文本
            if (finalText) {
              // 如果文本包含换行符，按段落处理
              if (finalText.includes('\n')) {
                const segments = finalText.split('\n');
                segments.forEach(segment => {
                  const trimmedSegment = segment.trim();
                  if (trimmedSegment) {
                    if (processedTextRef.current !== trimmedSegment) {
                      processedTextRef.current = trimmedSegment;
                      setTimeout(() => {
                        handleTTS(trimmedSegment);
                        if (processedTextRef.current === trimmedSegment) {
                          processedTextRef.current = '';
                        }
                      }, 10);
                    }
                  }
                });
              } else {
                // 没有换行符，直接处理整个文本
                if (processedTextRef.current !== finalText) {
                  processedTextRef.current = finalText;
                  setTimeout(() => {
                    handleTTS(finalText);
                    if (processedTextRef.current === finalText) {
                      processedTextRef.current = '';
                    }
                  }, 10);
                }
              }
            }
          }
        }
      );
      
      abortControllerRef.current = controller;
    } catch (error) {
      console.error('启动流式请求失败:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader 
        selectedModelId={selectedModelId} 
      />

      <Messages
        chatId={id}
        isLoading={isLoading}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
      />

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput
          chatId={id}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          stop={stop}
          messages={messages}
          setMessages={setMessages}
          append={append}
          ttsEnabled={ttsEnabled}
          toggleTTS={toggleTTS}
        />
      </form>
    </div>
  );
}
