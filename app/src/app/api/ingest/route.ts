import { foundryClient } from '@/lib/foundry';
import { VECTOR_STORE_ID } from '@/lib/model';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Accepts multipart form data with one or more `files`, uploads each to Foundry,
// attaches them to the vector store as a batch, and waits until indexed. Foundry
// auto-chunks and embeds (text-embedding-3-large) — no embedding model involved.
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: 'No files provided.' }, { status: 400 });
  }

  try {
    const client = await foundryClient();

    const uploaded = await Promise.all(
      files.map((file) => client.files.create({ file, purpose: 'assistants' })),
    );

    const batch = await client.vectorStores.fileBatches.createAndPoll(VECTOR_STORE_ID, {
      file_ids: uploaded.map((f) => f.id),
    });

    return Response.json({
      status: batch.status,
      counts: batch.file_counts,
      files: uploaded.map((f) => ({ id: f.id, filename: f.filename, bytes: f.bytes })),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return Response.json(
      { error: `${err.name ?? 'Error'}: ${err.message ?? String(e)}` },
      { status: 500 },
    );
  }
}
