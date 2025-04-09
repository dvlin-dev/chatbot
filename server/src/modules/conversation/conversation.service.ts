import { Injectable } from '@nestjs/common'
import { getKeyConfigurationFromEnvironment } from 'src/utils/llm/configuration'
import { CompletionsDto } from './dto/chat.dto'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { ModelType } from 'src/types/chat'
import { Response } from 'express'
import { MCPClient } from 'src/utils/mcpClient'
import { ChatCompletionMessageParam } from 'openai/resources'

@Injectable()
export class ConversationService {
  private openai: OpenAI

  constructor(private configService: ConfigService) {
    const keyConfiguration = getKeyConfigurationFromEnvironment(this.configService)

    // 初始化 OpenAI 客户端
    if (keyConfiguration.apiType === ModelType.AZURE_OPENAI) {
      this.openai = new OpenAI({
        apiKey: keyConfiguration.azureApiKey,
        baseURL: `https://${keyConfiguration.azureInstanceName}.openai.azure.com/openai/deployments/${keyConfiguration.azureDeploymentName}`,
        defaultHeaders: {
          'api-key': keyConfiguration.azureApiKey,
        },
        defaultQuery: {
          'api-version': keyConfiguration.azureApiVersion,
        },
      })
    } else {
      // 确保 apiKey 存在
      if (!keyConfiguration.apiKey) {
        console.error(
          'Missing OpenAI API key, please check the environment variable OPENAI_API_KEY'
        )
      }

      // 创建配置对象
      const config: Record<string, any> = {
        apiKey: keyConfiguration.apiKey,
      }

      // 只有当 basePath 存在时才设置
      if (keyConfiguration.basePath) {
        config.baseURL = keyConfiguration.basePath
      }

      this.openai = new OpenAI(config)
    }

    // 验证 API 密钥是否设置正确
    console.log('OpenAI configuration:', {
      apiType: keyConfiguration.apiType,
      hasApiKey: !!keyConfiguration.apiKey,
      apiModel: keyConfiguration.apiModel,
      basePath: keyConfiguration.basePath,
    })
  }

  async completionsStream(completionsDto: CompletionsDto, res: Response) {
    const { messages, tools } = completionsDto
 
    const openaiMessages = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    try {
      // 使用 OpenAI API 发送流式请求
      const stream = await this.openai.chat.completions.create(
        {
          model: this.configService.get('OPENAI_API_MODEL') || 'gpt-4o',
          messages: openaiMessages as ChatCompletionMessageParam[],
          temperature: 0.6,
          stream: true,
          ...(tools && { tools }),
        }
      )

      // 存储完整的响应
      let fullResponse = ''
      let lastSentContent = '' // 跟踪最后发送的内容
      let hasToolCalls = false // 跟踪是否触发了工具调用

      // 处理流式响应
      for await (const chunk of stream) {
        try {
          const content = chunk.choices[0]?.delta?.content || ''
          const toolCalls = chunk.choices[0]?.delta?.tool_calls

          if (toolCalls && toolCalls.length > 0) {
            hasToolCalls = true
            const result = await this.handleToolCalls(toolCalls, messages, res)
            this.completionsStream({
              messages: [...messages, result] as any,
            }, res)
            break // 退出当前流处理，由新的流处理接管
          }
          if (content) {
            // 仅发送新增的内容，而不是完整响应
            fullResponse += content

            // 发送到客户端
            res.write(`data: ${JSON.stringify({ content })}\n\n`)
            lastSentContent = content
          }
        } catch (error) {
          console.error('Error processing stream data:', error)
          res.write(`data: ${JSON.stringify({ content: error.message })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        }
      }

      // 只有在没有触发工具调用时才发送完成标记
      if (!hasToolCalls) {
        // 发送完成标记
        res.write('data: [DONE]\n\n')
        res.end()
      }
    } catch (error) {
      console.error('OpenAI API stream response error:', error)

      // 发送错误信息给客户端
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()

      throw error
    }
  }


  async handleToolCalls(toolCalls: any[], messages: any[], res: Response) {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      res.write(`data: ${JSON.stringify({ content: `\n \n tool_call: ${toolName} . . . \n \n ` })}\n\n`)
      const mcpClient = new MCPClient();
      await mcpClient.connectToServer('https://search.mcp.dvlin.com/sse');
      console.log('connectToServer', toolName, toolArgs)
      const result = await mcpClient.callTool({
        toolName,
        toolArgs,
      });

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content as string,
      }
    }
  }
}
