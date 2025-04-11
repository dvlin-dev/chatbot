// TODO 清洗方法
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * MCP工具的接口定义
 */
interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties: Record<string, any>;
  };
}

/**
 * 将MCP返回的工具格式转换为OpenAI的ChatCompletionTool格式
 */
export function transformToolsFormat(response: any): ChatCompletionTool[] {
  // 检查新的数据结构
  if (!response?.data) {
    return [];
  }

  const sourceTools = response.data as MCPTool[];
  
  return sourceTools.map((tool: MCPTool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }
  })) as ChatCompletionTool[];
}