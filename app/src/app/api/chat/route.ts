import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { assertConfigured, chatModel, foundry, VECTOR_STORE_ID } from '@/lib/model';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  assertConfigured();
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: chatModel,
    messages: modelMessages,
    tools: {
      // Server-executed retrieval over the OpenChoreo-provisioned vector store.
      file_search: foundry.tools.fileSearch({
        vectorStoreIds: [VECTOR_STORE_ID],
        maxNumResults: 20,
      }),
    },
    // Populate the retrieved chunks/citations (null otherwise) — mirrors the Python
    // include=["file_search_call.results"].
    providerOptions: { openai: { include: ['file_search_call.results'] } },
  });

  return result.toUIMessageStreamResponse({ sendSources: true });
}
