import { Injectable } from '@nestjs/common'
import { getKeyConfigurationFromEnvironment } from 'src/utils/llm/configuration'
import { CompletionsDto } from './dto/chat.dto'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { ModelType } from 'src/types/chat'
import { Response } from 'express'
import { HttpStreamClient } from 'src/utils/HttpStreamClient'
import { ChatCompletionMessageParam } from 'openai/resources'

@Injectable()
export class ConversationService {
  private openai: OpenAI
  private GET_TOOLS_METHOD = 'tools/list'
  private GET_TOOLS_CALL_METHOD = 'tools/call'
  private MCP_URL = 'https://search-http.mcp.dvlin.com/mcp'

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
 
    const systemPrompt = {
      role: "system",
      content: `你是一个智能助手，应当主动识别用户需求并使用合适的工具解决问题。
当用户的问题可以通过工具解决时，请优先使用提供的工具而不是自己回答。
分析用户的意图，确定何时应该：
1. 直接回答简单问题
2. 使用工具获取信息或执行操作
3. 根据工具返回的结果提供综合解答

记住，工具可以帮助你提供更准确、更有帮助的回答。不要等待用户明确要求你使用工具。`
    }

    const openaiMessages = [
      systemPrompt,
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      }))
    ]

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
      
      const httpStreamClient = new HttpStreamClient(this.MCP_URL);
      await httpStreamClient.initialize();
      console.log('handleToolCalls', toolName, toolArgs);
      
      const data = await httpStreamClient.sendRequest(this.GET_TOOLS_CALL_METHOD, { name: toolName, arguments: toolArgs });
      const content = data[0].result.content[0].text;
      
      httpStreamClient.terminate();

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content,
      }
    }
  }

 async getTools() {
    try {
      const httpStreamClient = new HttpStreamClient(this.MCP_URL)
      await httpStreamClient.initialize();
      const tools = await httpStreamClient.sendRequest(this.GET_TOOLS_METHOD)
      httpStreamClient.terminate();
      return tools
    } catch (error) {
      console.error('Error getting tools:', error)
      return []
    }
    
  }
}
