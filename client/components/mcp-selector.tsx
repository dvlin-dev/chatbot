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
import { getTools } from '@/api/conversation';
import { transformToolsFormat } from '@/lib/ai/handleHttpClient';

export function MCPSelector({
  className,
}: React.ComponentProps<typeof Button>) {
  const { tools, setTools } = useMCPStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTools = async () => {
      setLoading(true);
      try {
        const toolsData = await getTools();
        // 转换工具格式为ChatCompletionTool格式
        const transformedTools = transformToolsFormat(toolsData);
        setTools(transformedTools);
        
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
        {/* @ts-ignore */}
        <Button variant="outline" className="md:px-2 md:h-[34px]">
          {loading ? 'Mcp Loading...' : 'MCP List'}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {tools.map((tool) => (
          <DropdownMenuItem
            key={tool.function.name}
            className="gap-4 group/item flex flex-row justify-between items-center"
            data-active={true}
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
