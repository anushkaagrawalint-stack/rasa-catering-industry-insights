import { SettingsClient } from '@/components/admin/SettingsClient';
import { getConfig, listForSettings, storedDispositions } from '@/lib/store';

export default async function SettingsPage() {
  const [config, weeks, disp] = await Promise.all([getConfig(), listForSettings(), storedDispositions()]);
  return <SettingsClient initial={config} weeks={weeks} seenDispositions={[...disp.keys()]} />;
}
