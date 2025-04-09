import { ApiResponse } from './types'
import { httpRequest } from './index'

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
// 完成请求
export interface CompletionsDto {
  userId?: string
  conversationId: string
}

// 完成请求
export async function completions(data: CompletionsDto): Promise<ApiResponse<string>> {
  return httpRequest.post<string>('/conversation/completions', data)
}

// 完成请求（流式接口）- 返回EventSource实例
export async function completionsStream(data: CompletionsDto): Promise<EventSource> {
  // 构建完整的URL
  const baseURL = httpRequest.instance.defaults.baseURL || ''
  let fullUrl = baseURL.endsWith('/')
    ? `${baseURL}conversation/completions`
    : `${baseURL}/conversation/completions`

  // 确保URL是一个完整的URL（包含http://或https://）
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `http://${fullUrl.replace(/^\/\//, '')}`
  }

  console.log('SSE连接URL:', fullUrl)

  try {
    // 正确地异步获取token

    // 创建基本配置
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }


    // 创建EventSource对象
    console.log('SSE创建连接111')
    const eventSource = new EventSource(fullUrl, {
      headers:{},
      method: 'POST',
      body: JSON.stringify(data),
      pollingInterval: 0, // 禁用自动重连
    })

    // 调试
    eventSource.addEventListener('open', () => {
      console.log('SSE连接已打开')
    })

    return eventSource
  } catch (error) {
    console.error('创建SSE连接失败:', error)
    throw error
  }
}
