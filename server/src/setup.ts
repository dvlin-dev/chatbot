import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { AllExceptionFilter } from './filters/all-exception.filter'
import { HttpAdapterHost } from '@nestjs/core'
import { TransformInterceptor } from './interceptors/transform.interceptor'
import { getServerConfig } from './utils'

export const setupApp = (app: INestApplication) => {
  const config = getServerConfig()

  const flag: boolean = config['LOG_ON'] === 'true'
  flag && app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))

  const httpAdapter = app.get(HttpAdapterHost)
  const logger = new Logger()
  app.useGlobalFilters(new AllExceptionFilter(logger, httpAdapter))
  app.useGlobalInterceptors(new TransformInterceptor())
  // 全局拦截器
  app.useGlobalPipes(
    new ValidationPipe({
      // 去除在类上不存在的字段
      whitelist: true,
    })
  )

  // helmet头部安全
  app.use(helmet())

  // 限制请求速率
  app.use(
    rateLimit({
      windowMs: 10 * 60 * 1000, // 10分钟
      max: 1000, // 限制10分钟内最多1000个请求
      standardHeaders: true, // 返回标准的RateLimit头部信息
      legacyHeaders: false, // 禁用 `X-RateLimit-*` 头部
    })
  )

  app.enableCors()
}
