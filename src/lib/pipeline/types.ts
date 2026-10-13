export type OrderType = 'Industry' | 'Personal' | 'Unclassifiable';

/**
 * One YTD order (spec 4.2), positional to keep the payload compact.
 * [company, industry, value, thisWeek, location, month, type, locRawIdx, date]
 */
export type OrderRow = [
  company: string,
  industry: string,
  value: number,
  thisWeek: 0 | 1,
  location: string,
  month: string,
  type: OrderType,
  locRawIdx: number,
  date: string,
];

/**
 * One dial (spec 4.3). Positions 0–10 match the reference dashboard's records;
 * 11–12 keep the raw disposition / store strings so settings changes can recompute 3 and 6.
 * [agentIdx, matched, conv90, connected, industry, persona, stores, contactId, duration, titleIdx, companyIdx, dispIdx, storeRawIdx]
 */
export type DialRow = [
  agentIdx: number,
  matched: 0 | 1,
  conv90: 0 | 1,
  connected: 0 | 1,
  industry: string,
  persona: string,
  stores: string[],
  contactId: number,
  duration: number,
  titleIdx: number,
  companyIdx: number,
  dispIdx: number,
  storeRawIdx: number,
];

export interface SnapshotCounts {
  ytdOrders: number;
  identified: number;
  personal: number;
  unclassifiable: number;
  weekOrders: number;
  weekValue: number;
  dials: number;
  uniqueContacts: number;
  unmapped: number;
  connected: number;
  conv90: number;
  noAnswer: number;
}

export interface SnapshotMeta {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // weekStart + 6
  ytdStart: string; // Jan 1 of weekStart's year
  ytdEnd: string; // = weekEnd
  detectedWeekStart: string; // what the workbook said, before any admin override
  callDates: Record<string, number>; // dials per Call Date (for the out-of-window check)
  counts: SnapshotCounts;
}

export interface SnapshotData {
  v: 1;
  meta: SnapshotMeta;
  agents: string[];
  titles: string[];
  companies: string[];
  dispositions: string[];
  storeRaw: string[];
  locRaw: string[];
  orders: OrderRow[];
  dials: DialRow[];
}

export interface Issue {
  code: string;
  title: string;
  message: string;
  tab?: string;
  column?: string;
  /** Excel row numbers (first 10) */
  rows?: number[];
  /** Offending values, for the expandable list */
  items?: string[];
}
