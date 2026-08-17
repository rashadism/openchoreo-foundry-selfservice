import OpenAI from 'openai';
import { PROJECT_ENDPOINT, VECTOR_STORE_ID, assertConfigured, getFoundryToken } from './model';

// The OpenAI Node SDK takes a static apiKey per client, so build a fresh client per
// request. getFoundryToken only hits the network when the cached token is near expiry.
export async function foundryClient(): Promise<OpenAI> {
  assertConfigured();
  return new OpenAI({
    baseURL: `${PROJECT_ENDPOINT}/openai/v1`,
    apiKey: await getFoundryToken(),
  });
}

export type StoreInfo = {
  id: string;
  name: string;
  status: string;
  counts: { total: number; completed: number; inProgress: number; failed: number };
};

export type StoreFile = {
  id: string;
  filename: string;
  bytes: number;
  createdAt: number;
  status: string;
};

export async function getStore(): Promise<StoreInfo> {
  const client = await foundryClient();
  const vs = await client.vectorStores.retrieve(VECTOR_STORE_ID);
  const c = vs.file_counts;
  return {
    id: vs.id,
    name: vs.name ?? VECTOR_STORE_ID,
    status: vs.status,
    counts: {
      total: c?.total ?? 0,
      completed: c?.completed ?? 0,
      inProgress: c?.in_progress ?? 0,
      failed: c?.failed ?? 0,
    },
  };
}

export async function listStoreFiles(): Promise<StoreFile[]> {
  const client = await foundryClient();
  const page = await client.vectorStores.files.list(VECTOR_STORE_ID);
  const out: StoreFile[] = [];
  for (const vf of page.data) {
    let filename = vf.id;
    let bytes = 0;
    let createdAt = vf.created_at;
    // Vector-store file objects carry only the id; resolve the display name lazily.
    try {
      const meta = await client.files.retrieve(vf.id);
      filename = meta.filename ?? vf.id;
      bytes = meta.bytes ?? 0;
      createdAt = meta.created_at ?? vf.created_at;
    } catch {
      // fall back to the file id if metadata is unavailable
    }
    out.push({ id: vf.id, filename, bytes, createdAt, status: vf.status });
  }
  return out;
}
