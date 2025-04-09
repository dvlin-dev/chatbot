import { API_BASE_URL } from './const'
import CustomRequest from './http'

// 创建统一的 HTTP 请求实例
export const httpRequest = new CustomRequest({
  baseURL: API_BASE_URL,
})

export * from './types'
export { API_BASE_URL } from './const'
