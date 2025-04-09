import CustomRequest from './http'

// 从环境变量获取 API 基础 URL
// export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3100/api'
export const API_BASE_URL = 'http://localhost:3100/api'

// 创建统一的 HTTP 请求实例
export const httpRequest = new CustomRequest({
  baseURL: API_BASE_URL,
})

export * from './types'
export * from './http'
