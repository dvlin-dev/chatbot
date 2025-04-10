import { create } from 'zustand';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { useEffect } from 'react';

interface MCPState {
  tools: ChatCompletionTool[];
  setTools: (tools: ChatCompletionTool[]) => void;
  hydrated: boolean;
  setHydrated: (state: boolean) => void;
}

export const useMCPStore = create<MCPState>((set) => ({
  tools: [],
  setTools: (tools) => {
    set({ tools });
  },
  hydrated: false,
  setHydrated: (state) => set({ hydrated: state }),
}));

// 处理从sessionStorage加载和保存数据
export function useHydrateMCPStore() {
  const { tools, setTools, hydrated, setHydrated } = useMCPStore();
  
  // 仅在客户端执行一次，从sessionStorage恢复数据
  useEffect(() => {
    if (!hydrated) {
      try {
        const storedTools = sessionStorage.getItem('mcp-tools');
        if (storedTools) {
          setTools(JSON.parse(storedTools));
        }
      } catch (error) {
        console.error('Failed to hydrate MCP store:', error);
      }
      setHydrated(true);
    }
  }, [hydrated, setHydrated, setTools]);
  
  // 监听tools变化，保存到sessionStorage
  useEffect(() => {
    if (hydrated) {
      try {
        sessionStorage.setItem('mcp-tools', JSON.stringify(tools));
      } catch (error) {
        console.error('Failed to persist MCP tools:', error);
      }
    }
  }, [tools, hydrated]);
} 