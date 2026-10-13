export const NOCO = '(individual / no company)';
export const NOT_IN_DB_COMPANY = '(not in database)';
export const NO_COMPANY_NAME = '(no company name)';

export const PERSONAS = [
  'Events',
  'Executive Assistant',
  'Office Manager / Admin',
  'Admin Support',
  'Chief of Staff',
  'HR / People Ops',
  'Facilities / Operations',
  'Leadership / Director',
  'Other',
  'No title on file',
  'Not in database',
] as const;

export const STORE_MVT = 'Mount Vernon Triangle';
export const STORE_NL = 'National Landing / Arlington';
export const STORE_ROCK = 'Rockville';
export const STORE_MOSAIC = 'Mosaic District / Fairfax';
export const STORES = [STORE_MVT, STORE_NL, STORE_ROCK, STORE_MOSAIC] as const;
export const NO_STORE = 'No store on file';
export const NOT_IN_DB = 'Not in database';
export const UNKNOWN_LOCATION = 'Unknown';
export const STORE_TABLE_ORDER = [...STORES, NO_STORE, NOT_IN_DB];

export const NO_ANSWER = 'No Answer';
export const UNMAPPED = 'Unmapped';

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
