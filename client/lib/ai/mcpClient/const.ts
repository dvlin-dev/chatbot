export interface ToolCallParams {
  toolCall: {
    function: {
      name: string;
      arguments: string;
    }
  };
  toolCallId: string;
  onChange: (params: {toolCallId: string, content: string}) => void;
}