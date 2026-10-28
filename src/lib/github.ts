import 'server-only';

const REPO = process.env.GITHUB_REPO || 'anushkaagrawalint-stack/rasa-catering-industry-insights';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

async function gh(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set on the server.');
  return fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
  });
}

/** Creates or replaces a file on the deploy branch; the commit triggers a Vercel redeploy. */
export async function commitFile(filePath: string, content: Buffer, message: string): Promise<void> {
  const existing = await gh(`${filePath}?ref=${BRANCH}`);
  if (existing.status !== 404 && !existing.ok) throw new Error(`GitHub lookup failed (${existing.status}).`);
  const sha = existing.ok ? ((await existing.json()) as { sha: string }).sha : undefined;
  const res = await gh(filePath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: content.toString('base64'), branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? '';
    throw new Error(`GitHub rejected the commit (${res.status}) ${detail}`.trim());
  }
}

/** Removes a file from the deploy branch; the commit triggers a Vercel redeploy. Returns false if it was not there. */
export async function deleteFile(filePath: string, message: string): Promise<boolean> {
  const existing = await gh(`${filePath}?ref=${BRANCH}`);
  if (existing.status === 404) return false;
  if (!existing.ok) throw new Error(`GitHub lookup failed (${existing.status}).`);
  const { sha } = (await existing.json()) as { sha: string };
  const res = await gh(filePath, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? '';
    throw new Error(`GitHub rejected the delete (${res.status}) ${detail}`.trim());
  }
  return true;
}
