import { STORE_MOSAIC, STORE_MVT, STORE_NL, STORE_ROCK } from './constants';

/** Editable rules (spec 7.5). Persona is intentionally not configurable. */
export interface AppConfig {
  /** (b) JustCall disposition → connected? */
  dispositions: { value: string; connected: boolean }[];
  /** (c) industry key (lowercase) → display label */
  industryAbbrev: { key: string; label: string }[];
  /** (d) Toast location_name → dashboard store label */
  locationMap: { source: string; label: string }[];
  /** (d) Store Location keyword (case-insensitive substring) → store label */
  storeKeywords: { keyword: string; label: string }[];
}

export type ConfigKey = keyof AppConfig;
export const CONFIG_KEYS: ConfigKey[] = ['dispositions', 'industryAbbrev', 'locationMap', 'storeKeywords'];

export const DEFAULT_CONFIG: AppConfig = {
  dispositions: [
    // Connected = a live conversation: exactly these dispositions (plus their spelling variants). Everything else is not connected.
    ...['MQL', 'MQL Follow-Up', 'Interested/FUP', 'Interested – Follow Up', 'Interested, FUP Needed', 'Interested But Follow Up Needed',
      'Call Back Later', 'Not Interested', 'Wrong Number', 'Wrong / Bad Number', 'Do Not Call Again'].map(value => ({ value, connected: true })),
    ...['Left Voicemail', 'No Answer', 'Bad Number', 'No Disposition', 'Redial', 'Send an Email', 'Wrong Contact', 'Hung Up Midway',
      'Cooldown Needed', 'Connected', 'No Events', 'Gave Referral', 'Will Revert', 'Meeting Set'].map(value => ({ value, connected: false })),
  ],

  industryAbbrev: [
    { key: 'information technology & services', label: 'IT & Services' },
    { key: 'nonprofit organization management', label: 'Nonprofit Org Management' },
    { key: 'civic & social organization', label: 'Civic & Social Org' },
    { key: 'primary/secondary education', label: 'Primary/Secondary Education' },
    { key: 'health, wellness & fitness', label: 'Health, Wellness & Fitness' },
    { key: 'defense & space', label: 'Defense & Space' },
    { key: 'renewables & environment', label: 'Renewables & Environment' },
  ],
  locationMap: [
    { source: 'Mt Vernon Triangle', label: STORE_MVT },
    { source: 'Ballpark', label: STORE_MVT },
    { source: 'Ballpark (Navy Yard)', label: STORE_MVT },
    { source: 'Rockville', label: STORE_ROCK },
    { source: 'National Landing', label: STORE_NL },
    { source: 'Mosaic District', label: STORE_MOSAIC },
  ],
  storeKeywords: [
    { keyword: 'Mount Vernon', label: STORE_MVT },
    { keyword: 'Mt Vernon', label: STORE_MVT },
    { keyword: 'Navy Yard', label: STORE_MVT },
    { keyword: 'Ballpark', label: STORE_MVT },
    { keyword: 'Arlington', label: STORE_NL },
    { keyword: 'National Landing', label: STORE_NL },
    { keyword: 'Rockville', label: STORE_ROCK },
    { keyword: 'Mosaic', label: STORE_MOSAIC },
    { keyword: 'Fairfax', label: STORE_MOSAIC },
  ],
};

export const LOCATION_LABELS = [STORE_MVT, STORE_NL, STORE_ROCK, STORE_MOSAIC, 'Unknown'];
export const STORE_LABELS = [STORE_MVT, STORE_NL, STORE_ROCK, STORE_MOSAIC];

/** Validate + clean an edited config: trims, drops blank rows, de-duplicates keys (last wins). */
export function cleanConfig(input: unknown): { config?: AppConfig; error?: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as Record<string, unknown>[]) : null);
  const s = (v: unknown) => String(v ?? '').trim();
  const dedupe = <T,>(rows: T[], key: (r: T) => string) => [...new Map(rows.map(r => [key(r), r])).values()];
  const d = arr('dispositions'), a = arr('industryAbbrev'), l = arr('locationMap'), k = arr('storeKeywords');
  if (!d || !a || !l || !k) return { error: 'Malformed settings.' };
  const config: AppConfig = {
    dispositions: dedupe(d.map(r => ({ value: s(r.value), connected: r.connected === true })).filter(r => r.value), r => r.value.toLowerCase()),
    industryAbbrev: dedupe(a.map(r => ({ key: s(r.key).toLowerCase(), label: s(r.label) })).filter(r => r.key && r.label), r => r.key),
    locationMap: dedupe(l.map(r => ({ source: s(r.source), label: s(r.label) })).filter(r => r.source), r => r.source.toLowerCase()),
    storeKeywords: dedupe(k.map(r => ({ keyword: s(r.keyword), label: s(r.label) })).filter(r => r.keyword), r => r.keyword.toLowerCase()),
  };
  const badLoc = config.locationMap.find(r => !LOCATION_LABELS.includes(r.label));
  if (badLoc) return { error: `Unknown location label "${badLoc.label}".` };
  const badStore = config.storeKeywords.find(r => !STORE_LABELS.includes(r.label));
  if (badStore) return { error: `Unknown store label "${badStore.label}".` };
  return { config };
}

export function abbrevMap(cfg: Pick<AppConfig, 'industryAbbrev'>): Record<string, string> {
  return Object.fromEntries(cfg.industryAbbrev.map(r => [r.key.trim().toLowerCase(), r.label]));
}
