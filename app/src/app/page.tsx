import { MODEL, VECTOR_STORE_ID } from '@/lib/model';
import { getStore, listStoreFiles, type StoreFile, type StoreInfo } from '@/lib/foundry';
import Workbench from '@/components/Workbench';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let store: StoreInfo | null = null;
  let files: StoreFile[] = [];
  let error: string | null = null;

  try {
    [store, files] = await Promise.all([getStore(), listStoreFiles()]);
  } catch (e) {
    const err = e as { name?: string; message?: string };
    error = `${err.name ?? 'Error'}: ${err.message ?? String(e)}`;
  }

  return (
    <Workbench
      model={MODEL}
      vectorStoreId={VECTOR_STORE_ID}
      initialStore={store}
      initialFiles={files}
      initialError={error}
    />
  );
}
