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

  console.log('SSE 连接 URL:', fullUrl)

  const abortController = new AbortController()

  try {
    await fetchEventSource(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(data),
      signal: abortController.signal, // 允许中断请求

      onopen: async (response: Response) => {
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
          console.log('SSE 连接已打开')
        } else {
          const errorText = await response.text();
          console.error('SSE 连接失败详情:', {
            状态: response.status,
            状态文本: response.statusText,
            响应内容: errorText,
            请求数据: JSON.stringify(data)
          });
          throw new Error(`SSE 连接失败: ${response.status} ${response.statusText} - ${errorText}`)
        }
      },
      onmessage: (event: EventSourceMessage) => {
        console.log('SSE 收到消息:', event.data)
        // 过滤掉[DONE]消息，不传递给回调函数
        if (event.data && event.data !== '[DONE]') {
          onMessage(event.data) // 将消息传递给回调函数
        } else {
          console.log('收到结束标记 [DONE]，不处理')
        }
      },
      onclose: () => {
        console.log('SSE 连接已关闭')
        onClose(); // 通知调用者连接已关闭
      },
      onerror: (err: any) => {
        console.error('SSE 连接错误:', err)
        onError(err); // 将错误传递给回调函数
      },
  
    })

     // 返回 AbortController 以便调用者可以中断连接
     return { abort: () => abortController.abort() };

  } catch (error) {
    console.error('发起 SSE 请求失败:', error)
    onError(error); // 确保在初始捕获时也调用 onError
    throw error // 重新抛出错误，让调用者知道启动失败
  }
}