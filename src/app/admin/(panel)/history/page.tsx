import { HistoryClient } from '@/components/admin/HistoryClient';
import { listHistory } from '@/lib/store';

export default async function HistoryPage() {
  return <HistoryClient rows={await listHistory()} />;
}
