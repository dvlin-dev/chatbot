import { Global, Logger, LoggerService, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import * as dotenv from 'dotenv'
import * as Joi from 'joi'
import { RedisModule } from '@nestjs-modules/ioredis'
// import { StatusModule } from './modules/status/status.module'
import { ConversationModule } from './modules/conversation/conversation.module'

const envFilePath = `.env.${process.env.NODE_ENV || `development`}`
const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  LOG_ON: Joi.boolean(),
  LOG_LEVEL: Joi.string(),
})

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      load: [
        () => {
          const values = dotenv.config({ path: '.env' })
          const { error } = schema.validate(values?.parsed, {
            // 允许未知的环境变量
            allowUnknown: true,
            // 如果有错误，不要立即停止，而是收集所有错误
            abortEarly: false,
          })
          if (error) {
            throw new Error(
              `Validation failed - Is there an environment variable missing?
        ${error.message}`
            )
          }
          return values
        },
      ],
      validationSchema: schema,
    }),
    ConversationModule,
  ],
  controllers: [],
  providers: [Logger],
  exports: [Logger],
})
export class AppModule {}
