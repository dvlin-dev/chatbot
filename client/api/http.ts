import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosHeaders,
} from 'axios'
import { ApiResponse } from './types'
import { API_BASE_URL } from '.'

// 默认配置
const defaultConfig = {
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
}

// 自定义配置接口
export interface CustomConfig extends AxiosRequestConfig {
  interceptors?: {
    request?: (
      config: InternalAxiosRequestConfig
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
    response?: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>
  }
  originalInstance?: boolean
}

// 是否正在刷新令牌
let isRefreshing = false
// 等待令牌刷新的请求队列
let refreshSubscribers: Array<(token: string) => void> = []

// 将请求添加到队列
const subscribeTokenRefresh = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback)
}

// 执行队列中的请求
const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

// 刷新令牌
const refreshToken = async (client: AxiosInstance): Promise<string | null> => {
  try {
    if (!refreshToken) {
      return null
    }

    const response = await client.post('/auth/refresh-token', {
      refreshToken,
    })

    const { accessToken, refreshToken: newRefreshToken } = response.data.data

    // 保存新的令牌

    return accessToken
  } catch (error) {
    // 刷新令牌失败，清除所有令牌
    return null
  }
}

// 全局请求拦截器
const globalRequestInterceptor = async (config: InternalAxiosRequestConfig) => {
  return config
}

// 请求中断控制器拦截器
const requestAbortControllerInterceptor = (config: InternalAxiosRequestConfig) => {
  return config
}

// 全局响应拦截器
const globalResponseInterceptor = (response: AxiosResponse) => {
  return response.data
}

// 响应中断控制器拦截器
const responseAbortControllerInterceptor = (response: AxiosResponse) => {
  return response
}

// 响应中断控制器错误拦截器
const responseAbortControllerErrorInterceptor = (error: AxiosError) => {
  return Promise.reject(error)
}

// 全局错误处理拦截器
const globalErrorHandlerInterceptor = async (error: AxiosError) => {
  const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
  const requestUrl = originalRequest?.url || '未知地址'

  if (error.response) {
    // 服务器返回错误
    const status = error.response.status

    // 处理 401 未授权错误 (token 过期或无效)
    if (status === 401 && !originalRequest._retry) {
      // 排除包含 signin 的请求路径
      const url = originalRequest.url || ''
      if (url.includes('signin')) {
        return Promise.reject({
          code: 401,
          message: (error.response?.data as any)?.message || '未授权',
          data: null,
        })
      }

      if (isRefreshing) {
        // 如果正在刷新令牌，将请求添加到队列
        try {
          const newToken = await new Promise<string>((resolve) => {
            subscribeTokenRefresh((token: string) => {
              resolve(token)
            })
          })

          // 使用新令牌重试请求
          if (!originalRequest.headers) {
            originalRequest.headers = new AxiosHeaders()
          }
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`)
          return axios(originalRequest)
        } catch (err) {
          return Promise.reject(err)
        }
      }

      // 标记正在刷新令牌
      isRefreshing = true
      // 标记请求已重试
      originalRequest._retry = true

      try {
        // 刷新令牌
        const newToken = await refreshToken(axios.create({ baseURL: originalRequest.baseURL }))

        if (newToken) {
          // 通知队列中的请求
          onRefreshed(newToken)

          // 使用新令牌重试原始请求
          if (!originalRequest.headers) {
            originalRequest.headers = new AxiosHeaders()
          }
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`)
          return axios(originalRequest)
        } else {
          // 刷新令牌失败，清除本地存储的令牌
          // 这里可以添加重定向到登录页面的逻辑
          return Promise.reject({
            code: 401,
            message: '登录已过期，请重新登录',
            data: null,
          })
        }
      } catch (refreshError) {
        return Promise.reject({
          code: 401,
          message: '登录已过期，请重新登录',
          data: null,
        })
      } finally {
        isRefreshing = false
      }
    }

    // 返回服务器的错误信息
    return Promise.reject({
      code: status,
      message: (error.response.data as any)?.message || `请求失败 [${API_BASE_URL}${requestUrl}]`,
      data: null,
    })
  } else if (error.request) {
    // 请求发出但没有收到响应
    return Promise.reject({
      code: -1,
      message: `网络连接失败，请检查您的网络 [${API_BASE_URL}${requestUrl}]`,
      data: null,
    })
  } else {
    // 请求配置出错
    return Promise.reject({
      code: -2,
      message: '请求配置错误',
      data: null,
    })
  }
}

// 定义 ResponseData 类型
export type ResponseData<T, IsDefined = true> = IsDefined extends true
  ? ApiResponse<T>
  : ApiResponse<T> | undefined

// 定义 IsDefined 类型
export type IsDefined<T> = T extends undefined ? false : true

// 自定义请求类
class CustomRequest {
  instance: AxiosInstance

  constructor(config: CustomConfig) {
    const { interceptors, originalInstance } = config
    this.instance = axios.create({ ...defaultConfig, ...config })

    if (originalInstance) {
      return
    }

    this.instance.interceptors.request.use(globalRequestInterceptor)
    this.instance.interceptors.request.use(requestAbortControllerInterceptor)
    interceptors?.request && this.instance.interceptors.request.use(interceptors.request)

    this.instance.interceptors.response.use(
      responseAbortControllerInterceptor,
      responseAbortControllerErrorInterceptor
    )
    this.instance.interceptors.response.use(
      globalResponseInterceptor,
      globalErrorHandlerInterceptor
    )
    interceptors?.response && this.instance.interceptors.response.use(interceptors.response)
  }

  post<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.post<T, R, D>(url, data, config)
  }

  get<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(url: string, config?: CustomConfig) {
    return this.instance.get<T, R, D>(url, config)
  }

  patch<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.patch<T, R, D>(url, data, config)
  }

  delete<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(url: string, config?: CustomConfig) {
    return this.instance.delete<T, R, D>(url, config)
  }

  put<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.put<T, R, D>(url, data, config)
  }

  postForm<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.postForm<T, R, D>(url, data, config)
  }

  putForm<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.putForm<T, R, D>(url, data, config)
  }

  patchForm<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(
    url: string,
    data?: D,
    config?: CustomConfig
  ) {
    return this.instance.patchForm<T, R, D>(url, data, config)
  }

  head<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(url: string, config?: CustomConfig) {
    return this.instance.head<T, R, D>(url, config)
  }

  options<T = any, R = ResponseData<T, IsDefined<T>>, D = any>(url: string, config?: CustomConfig) {
    return this.instance.options<T, R, D>(url, config)
  }
}

export default CustomRequest
