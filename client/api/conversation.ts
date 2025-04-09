import { ApiResponse } from './types'
import { httpRequest } from './index'
import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'

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
  userId?: string
  messages: MessageDto[]
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
    const error = new Error('消息数组不能为空')
    onError(error)
    throw error
  }

  // 构建完整的URL
  const baseURL = httpRequest.instance.defaults.baseURL || ''
  let fullUrl = baseURL.endsWith('/')
    ? `${baseURL}conversation/completions`
    : `${baseURL}/conversation/completions`

  const abortController = new AbortController()

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
          throw new Error(`SSE 连接失败: ${response.status} ${response.statusText} - ${errorText}`)
        }
      },
      
      onmessage: (event: EventSourceMessage) => {
        // 只处理非[DONE]消息
        if (event.data && event.data !== '[DONE]') {
          onMessage(event.data)
        }
      },
      
      onclose: () => {
        onClose();
      },
      
      onerror: (err: any) => {
        onError(err);
      },
    })

    return { abort: () => abortController.abort() };

  } catch (error) {
    onError(error);
    throw error
  }
}