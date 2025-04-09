'use client';

import {  useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { MCPClient } from '@/lib/ai/mcpClient';
import { useMCPStore } from '@/lib/store/mcpStore';

export function MCPSelector({
  className,
}: React.ComponentProps<typeof Button>) {
  const { tools, setTools } = useMCPStore();
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTools = async () => {
      setLoading(true);
      try {
        const mcpClient = new MCPClient();
        const tools = await mcpClient.connectToServer('http://0.0.0.0:5101/sse');
        console.log('tools:', tools);
        setTools(tools);
        
        if (tools.length > 0) {
          setSelectedTool(tools[0].function.name);
        }
      } catch (error) {
        console.error('Failed to connect to MCP server:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTools();
  }, [setTools]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button variant="outline" className="md:px-2 md:h-[34px]">
          {loading ? 'Loading...' : selectedTool || 'MCP 工具'}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {tools.map((tool) => (
          <DropdownMenuItem
            key={tool.function.name}
            onSelect={() => {
              setOpen(false);
              setSelectedTool(tool.function.name);
            }}
            className="gap-4 group/item flex flex-row justify-between items-center"
            data-active={tool.function.name === selectedTool}
          >
            <div className="flex flex-col gap-1 items-start">
              {tool.function.name}
              {tool.function.description && (
                <div className="text-xs text-muted-foreground">
                  {tool.function.description}
                </div>
              )}
            </div>
            <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
              <CheckCircleFillIcon />
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
