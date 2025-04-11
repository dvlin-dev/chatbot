import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import helmet from 'helmet'
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

  app.enableCors()
}
