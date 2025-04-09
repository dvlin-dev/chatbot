import {
  type Message,
  convertToCoreMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  experimental_createMCPClient
} from 'ai';

import { customModel } from '@/lib/ai';
import { models } from '@/lib/ai/models';
import { regularPrompt } from '@/lib/ai/prompts';
import { generateUUID, getMostRecentUserMessage } from '@/lib/utils';

export async function POST(request: Request) {
  const {
    messages,
    modelId,
  }: { messages: Array<Message>; modelId: string } =
  await request.json();

  const model = models.find((model) => model.id === modelId);

  if (!model) {
    return new Response('Model not found', { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const sseClient = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'https://search.mcp.dvlin.com/sse',
    },
  });

  const toolSetSSE = await sseClient.tools();
  const tools = {
    ...toolSetSSE,
  };

  const userMessageId = generateUUID();

  return createDataStreamResponse({
    execute: (dataStream) => {
      dataStream.writeData({
        type: 'user-message-id',
        content: userMessageId,
      });

      const result = streamText({
        model: customModel(model.apiIdentifier),
        system: regularPrompt,
        messages: coreMessages,
        maxSteps: 5,
        experimental_transform: smoothStream({ chunking: 'word' }),
        tools,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        }
      });
      result.mergeIntoDataStream(dataStream);
    },
  });
}
