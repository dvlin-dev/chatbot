import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ChatCompletionTool } from "openai/resources/chat/completions";

// MCP客户端类
export class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport | null = null;
  private tools: ChatCompletionTool[] = [];

  constructor() {
    this.mcp = new Client({ 
      name: "mcp-client-api", 
      version: "1.0.0",
      capabilities: {
        resources: {},
        tools: {},
      }
    });
  }
  
  async connectToServer(url: string) {
    try {
      this.transport = new SSEClientTransport(
        new URL(url)
      );
      await this.mcp.connect(this.transport);
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          }
        } as ChatCompletionTool;
      });
      return this.tools;
    } catch (e) {
      console.error("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async callTool(toolName: string, toolArgs: any) {
    return await this.mcp.callTool({
      name: toolName,
      arguments: toolArgs,
    });
  }

  async close() {
    await this.mcp.close();
  }

  getTools() {
    return this.tools;
  }
}

