import { foundryClient } from '@/lib/foundry';
import { VECTOR_STORE_ID } from '@/lib/model';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Empties the vector store: detaches every file from the store and deletes the
// underlying file objects. The store itself (VECTOR_STORE_ID) is kept — it is
// platform-provisioned, so the app keeps working against an empty knowledge base.
export async function POST() {
  try {
    const client = await foundryClient();

    const ids: string[] = [];
    for await (const f of client.vectorStores.files.list(VECTOR_STORE_ID)) {
      ids.push(f.id);
    }

    let removed = 0;
    for (const id of ids) {
      await client.vectorStores.files.delete(id, { vector_store_id: VECTOR_STORE_ID });
      removed++;
      // best-effort cleanup of the underlying file object
      await client.files.delete(id).catch(() => {});
    }

    return Response.json({ removed });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return Response.json(
      { error: `${err.name ?? 'Error'}: ${err.message ?? String(e)}` },
      { status: 500 },
    );
  }
}
