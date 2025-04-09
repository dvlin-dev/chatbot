'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message as AIMessage, CreateMessage } from 'ai';

import { ChatHeader } from '@/components/chat-header';
import { Messages } from './messages';
import { MultimodalInput } from './multimodal-input';
import { useMCPStore } from '@/lib/store/mcpStore';
import { completionsStream, Message as ApiMessage, MessageRole } from '@/api/conversation';

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

export function Chat({
  id,
  selectedModelId,
}: {
  id: string;
  selectedModelId: string;
}) {
  const { tools } = useMCPStore();
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);

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
    if (isLoading) return null;
    if (apiMessages.length === 0) return null;

    console.log('重新加载聊天，当前消息数:', apiMessages.length);
    
    // 找到最后一条用户消息
    const lastUserMessageIndex = [...apiMessages].reverse().findIndex(
      msg => msg.role === MessageRole.user
    );
    
    if (lastUserMessageIndex === -1) {
      console.log('未找到用户消息，无法重新生成');
      return null;
    }
    
    // 移除最后一条助手消息（如果存在）
    let newMessages = [...apiMessages];
    const lastMessage = newMessages[newMessages.length - 1];
    if (lastMessage.role === MessageRole.assistant) {
      newMessages = newMessages.slice(0, -1);
      setApiMessages(newMessages);
      console.log('移除了最后一条助手消息，准备重新生成');
    }

    console.log('开始重新生成，消息数量:', newMessages.length);
    
    // 开始流式请求
    await startCompletionStream(newMessages);
    return "";
  }, [apiMessages, isLoading]);

  // 添加消息
  const append = useCallback(async (message: AIMessage | CreateMessage, chatRequestOptions?: any) => {
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
      await startCompletionStream(newMessages);
    }
    
    return apiMessage.id;
  }, [apiMessages]);

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

  // 启动流式完成
  const startCompletionStream = useCallback(async (currentMessages: ApiMessage[]) => {
    if (isLoading) return;
    
    // 确保消息数组不为空
    if (!currentMessages || currentMessages.length === 0) {
      console.error('消息数组为空，无法发送请求');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const controller = await completionsStream(
        { 
          messages: currentMessages.map(msg => ({
            content: msg.content, 
            role: msg.role
          }))
        },
        (message: string) => {
          try {
            // 检查是否是[DONE]消息
            if (message === '[DONE]') {
              console.log('收到结束标记 [DONE]，完成响应');
              return;
            }
            
            const data = JSON.parse(message);
            const content = data.content || '';
            
            if (content) {
              setApiMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                
                if (lastMessage && lastMessage.role === MessageRole.assistant) {
                  // 创建新的内容对象而不是追加，避免重复
                  const updatedMessage = {
                    ...lastMessage,
                    content: lastMessage.content + content
                  };
                  newMessages[newMessages.length - 1] = updatedMessage;
                  return [...newMessages];
                } else {
                  // 创建新的助手消息
                  return [...newMessages, {
                    id: uuidv4(),
                    content: content,
                    role: MessageRole.assistant
                  }];
                }
              });
            }
          } catch (error) {
            console.error('解析流消息失败:', error, message);
            
            // 检查是否是[DONE]消息
            if (message === '[DONE]') {
              console.log('收到结束标记 [DONE]，完成响应');
              return;
            }
            
            // 如果不是JSON，直接使用消息
            setApiMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              
              if (lastMessage && lastMessage.role === MessageRole.assistant) {
                // 创建新的内容对象而不是追加，避免重复
                const updatedMessage = {
                  ...lastMessage,
                  content: lastMessage.content + message
                };
                newMessages[newMessages.length - 1] = updatedMessage;
                return [...newMessages];
              } else {
                // 创建新的助手消息
                return [...newMessages, {
                  id: uuidv4(),
                  content: message,
                  role: MessageRole.assistant
                }];
              }
            });
          }
        },
        (error: any) => {
          console.error('流式请求错误:', error);
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      );
      
      abortControllerRef.current = controller;
    } catch (error) {
      console.error('启动流式请求失败:', error);
      setIsLoading(false);
    }
  }, [id, isLoading]);

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader selectedModelId={selectedModelId} />

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
        />
      </form>
    </div>
  );
}
