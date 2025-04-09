import { create } from 'zustand';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

interface MCPState {
  tools: ChatCompletionTool[];
  setTools: (tools: ChatCompletionTool[]) => void;
}

export const useMCPStore = create<MCPState>((set) => ({
  tools: [],
  setTools: (tools) => set({ tools }),
})); 