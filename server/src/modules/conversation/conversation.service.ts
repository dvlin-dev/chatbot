import { Injectable } from '@nestjs/common'
import { getKeyConfigurationFromEnvironment } from 'src/utils/llm/configuration'
import { CompletionsDto, MessageDto } from './dto/chat.dto'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'
import { ModelType } from 'src/types/chat'
import { Response } from 'express'
import { HttpStreamClient } from 'src/utils/HttpStreamClient'
import { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionChunk } from 'openai/resources'

@Injectable()
export class ConversationService {
  private openai: OpenAI
  private GET_TOOLS_METHOD = 'tools/list'
  private GET_TOOLS_CALL_METHOD = 'tools/call'
  private MCP_LIST = [
    'https://search.mcp.dvlin.com/mcp',
    'https://image-gen.mcp.dvlin.com/mcp'
  ]
  private MCP_TOOLS_LIST: Record<string, string> = {}
  
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
 
    // 检查MCP_TOOLS_LIST是否已初始化
    if (Object.keys(this.MCP_TOOLS_LIST).length !== this.MCP_LIST.length) {
      // to redis
      await this.initMcpToolsMap();
    }

    // 设置文本流的响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const systemPrompt = {
      role: "system",
      content: `你是一个智能助手，应当主动识别用户需求并使用合适的工具解决问题。
当用户的问题可以通过工具解决时，请优先使用提供的工具而不是自己回答。
分析用户的意图，确定何时应该：
1. 直接回答简单问题，且不需要提起你有什么工具。
2. 使用工具获取信息或执行操作
3. 根据工具返回的结果提供综合解答
4. 图片链接请用 markdown 格式输出

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
      let hasToolCalls = false // 跟踪是否触发了工具调用

      // 处理流式响应
      for await (const chunk of stream) {
        try {
          const content = chunk.choices[0]?.delta?.content || ''
          const toolCalls = chunk.choices[0]?.delta?.tool_calls

          if (toolCalls && toolCalls.length > 0) {
            hasToolCalls = true
            const result = await this.handleToolCalls(toolCalls, res)
            this.completionsStream({
              messages: [...messages, ...result] as MessageDto [],
            }, res)
            break // 退出当前流处理，由新的流处理接管
          }
          if (content) {
            // 累加完整响应
            fullResponse += content
            // 发送文本流
            res.write(`data: ${JSON.stringify({ content })}\n\n`)
          }
        } catch (error) {
          console.error('Error processing stream data:', error)
          res.write(`data: ${JSON.stringify({ content: error.message })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
      }

      // 如果没有触发工具调用，发送完成标记
      if (!hasToolCalls) {
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

  async handleToolCalls(toolCalls: ChatCompletionChunk.Choice.Delta.ToolCall[], res: Response) {
    // 创建并行处理所有工具调用的Promise
    const toolCallPromises = toolCalls.map(async (toolCall) => {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      res.write(`data: ${JSON.stringify({ content: `\n \n tool_call: ${toolName} . . . \n \n ` })}\n\n`);
      
      // 根据工具名称找到对应的MCP URL
      const mcpUrl = this.findMcpUrlForTool(toolName);
      if (!mcpUrl) {
        console.error(`No MCP URL found for tool: ${toolName}`);
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: Tool not available"
        };
      }
      
      const httpStreamClient = new HttpStreamClient(mcpUrl);
      await httpStreamClient.initialize();
      console.log('handleToolCalls', toolName, toolArgs);
      
      try {
        const data = await httpStreamClient.sendRequest(this.GET_TOOLS_CALL_METHOD, { name: toolName, arguments: toolArgs })
        const content = data[0].result.content[0].text;

        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content,
        };
      } catch (error) {
        console.error(`Error calling tool ${toolName}:`, error);
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error calling tool ${toolName}: ${error.message}`,
        };
      } finally {
        httpStreamClient.terminate();
      }
    });
    
    // 等待所有工具调用完成
    const results = await Promise.all(toolCallPromises);
    return results
  }

  async getTools(): Promise<ChatCompletionTool[]> {
    try {
      const toolPromises = this.MCP_LIST.map(async (mcpUrl) => {
        const httpStreamClient = new HttpStreamClient(mcpUrl)
        await httpStreamClient.initialize();
        const tool = (await httpStreamClient.sendRequest(this.GET_TOOLS_METHOD))[0].result.tools;
        httpStreamClient.terminate();
        return tool;
      });
      
      const toolResults = await Promise.all(toolPromises);
      const tools = toolResults.flat();
      return tools;

    } catch (error) {
      console.error('Error getting tools:', error)
      return []
    }
  }

  /**
   * 初始化MCP工具映射表
   */
  async initMcpToolsMap() {
    try {
      // 清空当前映射
      this.MCP_TOOLS_LIST = {};
      
      // 并行获取每个MCP的工具并建立映射
      const mappingPromises = this.MCP_LIST.map(async (mcpUrl, index) => {
        const httpStreamClient = new HttpStreamClient(mcpUrl);
        await httpStreamClient.initialize();
        
        try {
          const response = await httpStreamClient.sendRequest(this.GET_TOOLS_METHOD);
          const tools = response[0].result.tools;
          
          // 为每个工具创建映射到对应的MCP URL
          for (const tool of tools) {
            this.MCP_TOOLS_LIST[tool.name] = mcpUrl;
          }
          
        } catch (error) {
          console.error(`Error getting tools from ${mcpUrl}:`, error);
        } finally {
          httpStreamClient.terminate();
        }
      });
      
      await Promise.all(mappingPromises);
      
      return this.MCP_TOOLS_LIST;
    } catch (error) {
      console.error('Error initializing MCP tools map:', error);
      return this.MCP_TOOLS_LIST;
    }
  }
  
  /**
   * 根据工具名称找到对应的MCP URL
   */
  findMcpUrlForTool(toolName: string): string | undefined {
    // 如果映射表中存在该工具，返回对应URL
    if (this.MCP_TOOLS_LIST[toolName]) {
      return this.MCP_TOOLS_LIST[toolName];
    }
    
    // 如果映射表为空或找不到工具，尝试重新初始化
    if (Object.keys(this.MCP_TOOLS_LIST).length === 0) {
      console.log(`Tool ${toolName} not found in mapping, using default MCP URL`);
    }
    
    return;
  }
}
