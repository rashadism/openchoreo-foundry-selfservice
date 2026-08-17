import { MODEL, VECTOR_STORE_ID } from '@/lib/model';
import { getStore, listStoreFiles } from '@/lib/foundry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Feeds the header badges + knowledge-base panel; also polled after an ingest.
export async function GET() {
  try {
    const [store, files] = await Promise.all([getStore(), listStoreFiles()]);
    return Response.json({ model: MODEL, vectorStoreId: VECTOR_STORE_ID, store, files });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return Response.json({
      model: MODEL,
      vectorStoreId: VECTOR_STORE_ID,
      store: null,
      files: [],
      error: `${err.name ?? 'Error'}: ${err.message ?? String(e)}`,
    });
  }
}
