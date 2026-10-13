import { UploadClient } from '@/components/admin/UploadClient';
import { blobMode } from '@/lib/blob';
import { abbrevMap } from '@/lib/config';
import { parseDateCell } from '@/lib/pipeline/dates';
import { buildPreview } from '@/lib/preview';
import { getConfig, getLatestDraft, publishedVersionFor } from '@/lib/store';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ reupload?: string }> }) {
  const { reupload } = await searchParams;
  // ?reupload=YYYY-MM-DD (from History): start a fresh upload for that week instead of showing a pending draft.
  const reuploadWeek = reupload && /^\d{4}-\d{2}-\d{2}$/.test(reupload) ? parseDateCell(reupload) : null;
  const [draft, cfg] = await Promise.all([reuploadWeek ? null : getLatestDraft(), getConfig()]);
  const preview = draft
    ? buildPreview(draft.id, draft.source_filename, draft.data, draft.warnings, await publishedVersionFor(draft.week_start))
    : null;
  return <UploadClient mode={blobMode()} initialPreview={preview} abbrev={abbrevMap(cfg)} reuploadWeek={reuploadWeek} />;
}
