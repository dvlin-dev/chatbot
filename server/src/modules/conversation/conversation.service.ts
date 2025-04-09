import { Injectable } from '@nestjs/common'
import { getKeyConfigurationFromEnvironment } from 'src/utils/llm/configuration'
import { CompletionsDto } from './dto/chat.dto'
import { ConfigService } from '@nestjs/config'
import { Configuration, OpenAIApi } from 'openai'
import { ModelType } from 'src/types/chat'
import { Response } from 'express'
import { Readable } from 'stream'

@Injectable()
export class ConversationService {
  private openai: OpenAIApi

  constructor(private configService: ConfigService) {
    const keyConfiguration = getKeyConfigurationFromEnvironment(this.configService)

    // 初始化 OpenAI 客户端
    let configuration: Configuration

    if (keyConfiguration.apiType === ModelType.AZURE_OPENAI) {
      configuration = new Configuration({
        apiKey: keyConfiguration.azureApiKey,
        basePath: `https://${keyConfiguration.azureInstanceName}.openai.azure.com/openai/deployments/${keyConfiguration.azureDeploymentName}`,
        baseOptions: {
          headers: {
            'api-key': keyConfiguration.azureApiKey,
          },
          params: {
            'api-version': keyConfiguration.azureApiVersion,
          },
        },
      })
    } else {
      // 确保 apiKey 存在
      if (!keyConfiguration.apiKey) {
        console.error(
          'Missing OpenAI API key, please check the environment variable OPENAI_API_KEY'
        )
      }

      configuration = new Configuration({
        apiKey: keyConfiguration.apiKey,
      })

      // 只有当 basePath 存在时才设置
      if (keyConfiguration.basePath) {
        configuration.basePath = keyConfiguration.basePath
      }
    }

    this.openai = new OpenAIApi(configuration)

    // 验证 API 密钥是否设置正确
    console.log('OpenAI configuration:', {
      apiType: keyConfiguration.apiType,
      hasApiKey: !!keyConfiguration.apiKey,
      apiModel: keyConfiguration.apiModel,
      basePath: keyConfiguration.basePath,
    })
  }

  async completionsStream(completionsDto: CompletionsDto, res: Response) {
    const { messages } = completionsDto

    // 将消息格式转换为 OpenAI 格式
    const openaiMessages = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    try {
      // 使用 OpenAI API 发送流式请求
      const response = await this.openai.createChatCompletion(
        {
          model: this.configService.get('OPENAI_API_MODEL') || 'gpt-4o',
          messages: openaiMessages,
          temperature: 0.6,
          max_tokens: 2000,
          stream: true,
        },
        { responseType: 'stream' }
      )

      // 存储完整的响应
      let fullResponse = ''

      // 处理流式响应
      const stream = response.data as unknown as Readable

      // 为流设置编码
      stream.setEncoding('utf8')

      // 监听数据事件
      stream.on('data', (chunk: string) => {
        try {
          const lines = chunk
            .toString()
            .split('\n')
            .filter((line) => line.trim() !== '' && line.trim() !== 'data: [DONE]')

          for (const line of lines) {
            const message = line.replace(/^data: /, '').trim()

            // 跳过空消息
            if (!message) continue

            try {
              // 解析消息
              const data = JSON.parse(message)
              const content = data.choices[0]?.delta?.content || ''

              if (content) {
                // 更新完整响应
                fullResponse += content

                // 发送到客户端
                res.write(`data: ${JSON.stringify({ content })}\n\n`)
              }
            } catch (e) {
              console.error('Error parsing OpenAI response block:', e)
            }
          }
        } catch (error) {
          console.error('Error processing stream data:', error)
        }
      })

      // 监听完成事件
      stream.on('end', async () => {
        // 发送完成标记
        res.write('data: [DONE]\n\n')
        res.end()
        
      })

      // 监听错误
      stream.on('error', (error) => {
        console.error('Stream error:', error)
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      })
    } catch (error) {
      console.error('OpenAI API stream response error:', error)

      // 发送错误信息给客户端
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()

      throw error
    }
  }
}
