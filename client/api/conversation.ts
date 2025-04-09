import { ApiResponse } from './types'
import { httpRequest } from './index'
import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { ChatCompletionTool } from 'openai/resources/index.mjs'

// 消息角色枚举
export enum MessageRole {
  system = 'system',
  assistant = 'assistant',
  user = 'user',
}

// 消息类型
export interface Message {
  id: string
  content: string
  role: MessageRole
}

// 发送到后端的消息DTO
export interface MessageDto {
  content: string
  role: MessageRole
}

// 完成请求
export interface CompletionsDto {
  messages: MessageDto[]
  tools?: ChatCompletionTool[]
}

// 完成请求
export async function completions(data: CompletionsDto): Promise<ApiResponse<string>> {
  return httpRequest.post<string>('/conversation/completions', data)
}

export async function completionsStream(
  data: CompletionsDto,
  onMessage: (message: string) => void,
  onError: (error: any) => void,
  onClose: () => void,
): Promise<{ abort: () => void }> {
  // 检查messages数组是否为空
  if (!data.messages || data.messages.length === 0) {
    const error = new Error('消息数组不能为空');
    onError(error);
    return { abort: () => {} };
  }

  // 构建完整的URL
  const baseURL = httpRequest.instance.defaults.baseURL || '';
  let fullUrl = `${baseURL}/conversation/completions`
  
  
  const abortController = new AbortController();

  try {
    await fetchEventSource(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(data),
      signal: abortController.signal,

      onopen: async (response: Response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
          const errorText = await response.text();
          const errorMsg = `SSE 连接失败: ${response.status} ${response.statusText} - ${errorText}`;
          console.error('completionsStream:', errorMsg);
          onError(new Error(errorMsg));
          return;
        }
      },
      
      onmessage: (event: EventSourceMessage) => {
        // 只处理非[DONE]消息
        if (event.data) {
          if (event.data === '[DONE]') {
            onClose();
          } else {
            onMessage(event.data);
          }
        }
      },
      
      onclose: () => {
        onClose();
      },
      
      onerror: (err: any) => {
        console.error('completionsStream: 发生错误', err);
        onError(err);
      },
    });

    return { abort: () => abortController.abort() };

  } catch (error) {
    console.error('completionsStream: 捕获到异常', error);
    onError(error);
    return { abort: () => {} };
  }
}