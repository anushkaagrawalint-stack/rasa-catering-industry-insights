import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Original uploads are kept for audit: Vercel Blob (private) when configured, else ./.data/blob. */
export const blobMode = (): 'vercel' | 'local' => (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel' : 'local');

const LOCAL_PREFIX = 'local:';
const localDir = () => process.env.LOCAL_BLOB_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'blob');
// Local-only fallback store; the ignore hint stops Vercel's file tracing from bundling the whole project.
const localPath = (name: string) => path.join(/*turbopackIgnore: true*/ localDir(), path.basename(name));

export async function putLocal(filename: string, buf: Buffer): Promise<string> {
  const name = `${Date.now()}-${filename.replace(/[^\w.() -]/g, '_')}`;
  await mkdir(localDir(), { recursive: true });
  await writeFile(localPath(name), buf);
  return LOCAL_PREFIX + name;
}

export async function readBlob(url: string): Promise<Buffer> {
  if (url.startsWith(LOCAL_PREFIX)) return readFile(localPath(url.slice(LOCAL_PREFIX.length)));
  const { get } = await import('@vercel/blob');
  const res = await get(url, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) throw new Error('Upload not found in Blob storage');
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export async function deleteBlob(url: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX)) {
    await rm(localPath(url.slice(LOCAL_PREFIX.length)), { force: true });
    return;
  }
  const { del } = await import('@vercel/blob');
  await del(url);
}

/** Only accept Blob URLs from this project's own store (the store id is embedded in the token). */
export function isOwnBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split('_')[3];
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com') && (!storeId || u.hostname.toLowerCase().startsWith(storeId.toLowerCase() + '.'));
  } catch {
    return false;
  }
}
