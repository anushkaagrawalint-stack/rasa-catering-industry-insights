# PROMPT FOR CLAUDE CODE — RASA Weekly "Dials, Targeting & Demand" Dashboard + Admin Upload

You are a senior full-stack engineer and data-viz developer at Kutlerri (an AI agent and analytics company serving restaurant clients). Build a production web app for the client **RASA Indian Kitchen** (fast-casual Indian restaurants in the DC area; catering is sold by a team of outbound sales agents who cold-call a prospect database, "the TAM").

The app has two sides:

1. **Public dashboard** — a weekly "Dials, Targeting & Demand" view that compares *where catering orders come from (by industry, YTD)* with *who the sales team dialled this week (by industry, persona, store)*.
2. **Admin side** — password-protected. Every week I upload ONE Excel workbook. The app parses it, validates it, shows a preview, and on "Publish" the dashboard numbers update automatically. Previous weeks stay available.

This dashboard is a **weekly re-creation of an existing period dashboard** ("RASA P9 — Dials, Targeting & Demand", a single self-contained HTML/Chart.js page). Everything in that dashboard must exist here, with these systematic changes:

| Original (period) | New (weekly) |
|---|---|
| "P9" = dials/orders in a 5-week period (Aug 24 – Sep 28) | **"This week"** = Monday–Sunday of the uploaded week (e.g. Oct 5 – Oct 11, 2026) |
| "P1–P9" = all orders in the period range | **"YTD"** = Jan 1 of that year through the Sunday ending the uploaded week |
| Data baked into the HTML as JSON constants | Data comes from the uploaded workbook, stored per week in a database |
| One snapshot | **Week selector** (latest week by default, history of all published weeks) |

Do not add features that are not described here. Do not redesign the look — copy the design system in section 8.

---

## 0. FILES YOU ARE GIVEN WITH THIS PROMPT

1. **`RASA_P9_Dashboard_Reference.html`** — the original period dashboard (single HTML file, Chart.js, data baked in as JSON constants). It is the **source of truth for layout, colours, chart configurations and interaction logic**. Replace its baked-in data with the weekly pipeline below. If this prompt and the HTML disagree on visuals or interactions, follow the HTML; on data definitions, follow this prompt (adapted from period to week).
2. **`rasa industry catering.xlsx`** — a sample weekly upload (Week of Oct 5, 2026) to develop and test against.

---

## 1. TECH STACK (use this unless you have a strong reason not to; tell me if you deviate)

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**.
- **Chart.js 4** (via `react-chartjs-2` or direct canvas) — the original uses Chart.js bar, horizontal bar, stacked bar, doughnut, and bar+line combo charts. Keep Chart.js.
- **SheetJS (`xlsx`)** for parsing the upload on the server (route handler, Node runtime).
- **Postgres** (Neon / Vercel Postgres) for storage. One table `weekly_snapshots` (id, week_start date, week_end date, version int, status `published|archived`, uploaded_at, uploaded_by, source_filename, `data` JSONB containing the normalized rows described in section 4, `warnings` JSONB). Store the original `.xlsx` in Vercel Blob for audit. A `config` table (key, JSONB value) holds the editable rules in section 7.5.
- **Auth**: admin = single password from env `ADMIN_PASSWORD`, signed HttpOnly session cookie (use `jose` or NextAuth credentials). Optional viewer passcode from env `VIEWER_PASSCODE` (if set, the dashboard requires it; if empty, the dashboard is open). The footer must say "Prepared by Kutlerri for RASA | Confidential".
- Fonts: **Poppins** (500/600/700, Google Fonts) for h1/h2/KPI values/brand/drawer title; **Arial** for everything else.
- All aggregation for the dashboard is computed **client-side from the row-level data** of the selected week (just like the original), so agent filtering and drill-downs are instant. Do not precompute aggregates per filter.

---

## 2. THE UPLOAD WORKBOOK (data contract)

Each week I upload one `.xlsx` named like `rasa industry catering.xlsx` with these six tabs. Tab names are exact (case-sensitive, trim whitespace). Tab 6's name changes every week (`Week of Oct 5(JC)`, `Week of Oct 12(JC)`, …) — detect it as the tab whose name starts with `Week of`.

### Tabs 1–3: prepared by Kutlerri (the app's primary inputs)

**`Industry_Summary`** — informational only. Columns: Week Of, YTD Through, Industry, Type, YTD Orders, Share of Orders, Dials This Week, Share of Dials (+ a small Metric/Value block in J:K). Use it for exactly two things: (a) read **Week Of** and **YTD Through** from the first data row to determine the week; (b) a reconciliation check (see 4.6). Its Share columns follow the same definitions as section 5, but the app must still compute its own shares from the row data and must not read them.

**`YTD_Orders`** — one row per catering order in the YTD window. Columns:
`Order #` | `Order Date` | `Status` | `Company` | `Industry` | `Type`
- `Order Date` is the **date the order was placed (Toast `created_date`)**, already corrected. Always use this column for any date logic.
- `Industry` is a LinkedIn-style industry name (e.g. "Nonprofit Organization Management", "Higher Education"), or the special values `Personal / Individual` or `Unclassifiable`.
- `Type` is one of `Industry` (identified organisation), `Personal` (individual / no company), `Unclassifiable`.
- This tab is already filtered (CLOSED/CONFIRMED, test orders removed). **Trust it — do not re-filter.** Dedupe by `Order #` (keep first) and warn if duplicates existed.

**`Calls_This_Week`** — one row per outbound dial made this week on RASA phone lines. Columns:
`Call Date` | `Call Time` | `Agent` | `RASA Line` | `Contact Number` | `Company` | `Industry` | `Status` | `Duration (sec)`
plus four more (all 13 columns are required):
`Disposition` | `Job Title` | `Store Location` | `Persona`
- `Industry` is the TAM industry of the dialled number's company, title-cased (e.g. "Information Technology & Services"), or the literal `Unmapped` when the number is not in the TAM (or the TAM has no industry for it). `Company` is blank when Unmapped.
- `Contact Number` is a text string of digits (11 digits with leading 1). Read it as text; never as a number.
- `Disposition` = the JustCall disposition for the call, taken from the weekly JC tab and already cleaned (no `Dispositions:` prefix), e.g. `Not Interested`, `MQL`, `Call Back Later`. **A dial with no JustCall disposition is stored as `No Answer`.** If the app ever meets a blank, it must treat it as `No Answer`.
- `Job Title` = the contact's title from the TAM (blank only when the TAM has no title, or the dial is Unmapped).
- `Store Location` = the contact's TAM store tag(s). Raw values look like `RASA Mount Vernon Triangle(20001) / RASA Navy Yard / Ballpark (20003)`, `RASA Arlington (22202)`, `RASA Rockville (20852)`, `RASA Fairfax (22031)`. A contact with more than one store tag has them separated by `;` (e.g. `RASA Arlington (22202); RASA Rockville (20852)`). Blank if none, or if the dial is Unmapped.
- `Persona` = the contact's persona, **assigned in the sheet** (Kutlerri prepares it every week from `Job Title`). Allowed values, exactly: `Events`, `Executive Assistant`, `Office Manager / Admin`, `Admin Support`, `Chief of Staff`, `HR / People Ops`, `Facilities / Operations`, `Leadership / Director`, `Other`, `No title on file`, `Not in database`. **The app reads this column as-is and does not classify job titles itself.**

### Tabs 4–6: raw source tabs pasted weekly (supporting data)

**`Phone Number`** — which sales rep/customer/phone number per week (header rows: row 1 = "Week of …" labels, row 2 = column titles). Not used for the dashboard numbers. Store it untouched in the audit file only.

**`Toast`** — every catering order for RASA (76 columns). The app uses only: `order number`, `total`, `location_name`. **Join to `YTD_Orders` on `order number` = `Order #`** (case-insensitive, trimmed; both look like `order #001919`).
- ⚠️ **Never use any Toast date column.** Many Toast date cells have day and month swapped or are text. The only trusted date is `YTD_Orders.Order Date`.
- Some Toast cells begin with `=` and are text, not formulas. Read all cells as raw values/strings; do not evaluate formulas.
- `total` is the **order value ($)** used everywhere the dashboard shows dollars. If missing/non-numeric, use 0 and add a warning.
- `location_name` values: `Mt Vernon Triangle`, `Ballpark`, `Rockville`, `National Landing`, `Mosaic District`.

**`Week of … (JC)`** — the raw JustCall export for all clients. Not used for dashboard numbers (the disposition has already been carried into `Calls_This_Week`). Keep it untouched in the audit file only.

---

## 3. VALIDATION (runs on upload, before anything is published)

### 3.1 Hard errors (block publishing; show tab + column + first 10 offending row numbers)
- A required tab is missing, or `YTD_Orders` / `Calls_This_Week` are empty.
- A required column is missing in `YTD_Orders` (6 columns) or `Calls_This_Week` (all 13 columns listed above).
- `Order Date` / `Call Date` cannot be parsed in more than 2% of rows.
- `Toast` tab present but missing `order number` or `total` or `location_name`.
- Week cannot be determined (no `Week Of` and call dates span more than 7 days).

### 3.2 Warnings (show in the preview, allow publish)
- % of `YTD_Orders` rows not found in `Toast` (value/location will be 0 / "Unknown").
- % of dials with `Industry = Unmapped`.
- Count + list of `Unclassifiable` order companies (so I can fix them in the sheet).
- `Persona` values outside the allowed list (treat them as `Other` on the dashboard and list them), and the top 25 job titles with persona `Other` (by dials), for my review.
- `Disposition` values not present in the connected/not-connected mapping (list them).
- Duplicate `Order #`; call dates outside the week window; orders dated after the week end.
- Reconciliation (4.6) mismatches.

### 3.3 Blank values
Blank `Disposition` → `No Answer`. Blank `Persona` → derive from the row: Unmapped dial → `Not in database`, otherwise blank title → `No title on file`, otherwise `Other`. Blank `Store Location` on a matched dial → `No store on file`. None of these is an error.

---

## 4. NORMALISATION PIPELINE (server-side, on publish) — exact definitions

### 4.1 Week definition
- `week_start` = Monday of the week (from `Industry_Summary.Week Of`, else the Monday of the earliest `Call Date`). `week_end` = week_start + 6 days (Sunday). The admin can override `week_start` in the preview.
- `ytd_start` = Jan 1 of week_start's year. `ytd_end` = week_end.
- Week title used in the UI: `Week of Oct 5 – Oct 11, 2026`.

### 4.2 Order records (one per `YTD_Orders` row)
```
{ company, industry, value, thisWeek, location, month }
```
- `company`: `Company` as-is; if `Type = Personal`, set to the constant `(individual / no company)`.
- `industry`: lowercase + trimmed `Industry`; **empty string** if `Type` is `Personal` or `Unclassifiable` (the app, like the original, treats "no industry" as empty).
- `value`: Toast `total` (number) by joined order; else 0.
- `thisWeek`: `Order Date` is between week_start and week_end inclusive.
- `month`: `YYYY-MM` of `Order Date`.
- `location`: map Toast `location_name`:
  - `Mt Vernon Triangle` and `Ballpark` → **Mount Vernon Triangle** (Ballpark is folded into MVT)
  - `Rockville` → **Rockville**
  - `National Landing` → **National Landing / Arlington**
  - `Mosaic District` → **Mosaic District / Fairfax**
  - anything else / not joined → **Unknown**
- Also keep `type` (Industry/Personal/Unclassifiable).

### 4.3 Dial records (one per `Calls_This_Week` row)
```
{ agent, matched, conv90, connected, industry, persona, stores[], contactId, duration, titleIdx, companyIdx }
```
- `agent`: `Agent` (distinct agents form the Agent filter list, sorted alphabetically).
- `matched`: 1 if `Industry ≠ Unmapped` else 0 ("not in database").
- `industry`: lowercase `Industry`; empty if Unmapped.
- `duration`: `Duration (sec)` numeric (blank → 0). `conv90` = `duration > 90` (a "conversation").
- `connected`: from `Disposition` using the editable mapping (7.5-b). **Defaults:**
  - Connected = `MQL`, `MQL Follow-Up`, `Meeting Set`, `Interested/FUP`, `Interested But Follow Up Needed`, `Call Back Later`, `Not Interested`, `Wrong Number`, `Do Not Call Again`
  - Not connected = `Left Voicemail`, `No Answer`, `Bad Number`
  - **`No Answer` (and any blank, which means no disposition was logged) = not connected** — the dial still counts in Total dials. Show in the preview how many dials are `No Answer`.
- `contactId`: index of the distinct `Contact Number` (all dials, mapped or not). Unique contacts = number of distinct `Contact Number` values. Repeat attempts = dials − unique contacts.
- `titleIdx`: index into a de-duplicated array of `Job Title` strings (−1 if blank/unmapped).
- `companyIdx`: index into a de-duplicated array of `Company` strings (−1 if Unmapped; drill-downs label −1 as `(not in database)`).
- `stores[]`: normalised from `Store Location` (split on `;`, then keyword-match each part, case-insensitive; de-duplicate):
  - contains `Mount Vernon`, `Navy Yard` or `Ballpark` → **Mount Vernon Triangle**
  - contains `Arlington` or `National Landing` → **National Landing / Arlington**
  - contains `Rockville` → **Rockville**
  - contains `Mosaic` or `Fairfax` → **Mosaic District / Fairfax**
  - if the cell is blank and the dial is matched → `["No store on file"]`
  - if the dial is not matched → `["Not in database"]`
  - A dial tagged with two stores is counted under **each** store (so store rows can sum above the total — the dashboard says so in its hint).
- `persona`: read from the `Persona` column (see 3.3 for the blank fallback). Do not run any keyword classification in the app.

### 4.4 Industry key and display name
- Industry keys are always **lowercase, trimmed** strings, so order-side and dial-side industries join on equality (e.g. "Higher Education" from orders and "higher education" from dials are the same key).
- Display name `disp(key)`: use this abbreviation map, otherwise Title Case each word (`replace(/\b\w/g, c => c.toUpperCase())`):
```
'information technology & services' → 'IT & Services'
'nonprofit organization management' → 'Nonprofit Org Management'
'civic & social organization'       → 'Civic & Social Org'
'primary/secondary education'       → 'Primary/Secondary Education'
'health, wellness & fitness'        → 'Health, Wellness & Fitness'
'defense & space'                   → 'Defense & Space'
'renewables & environment'          → 'Renewables & Environment'
```
The abbreviation map is editable in admin (7.5-c).

### 4.5 What is stored
Store per week: `orders[]` (4.2), `dials[]` (4.3, as compact arrays), the `titles[]` and `companies[]` lookup arrays, `agents[]`, and meta (week_start, week_end, ytd window, counts). The row arrays should be compact (positional arrays like the original) — a week is ~3,000 dials and ~520 orders, so the payload should stay well under 1 MB gzipped.

### 4.6 Reconciliation (warning only)
Recompute YTD orders per industry and dials per industry from the row data and compare with `Industry_Summary` columns `YTD Orders` and `Dials This Week` (match on lowercase industry). List any industry where the numbers differ.

---

## 5. METRIC DEFINITIONS (used by the dashboard)

All dial-side metrics respect the **Agent filter**; all order-side metrics ignore it.

- **Total dials** = number of dial records (after agent filter).
- **Unique contacts dialled** = distinct `contactId` among those dials. Note line: `{dials − unique} repeat attempts`.
- **Connected** = dials with `connected = 1`. Note: `{connected/dials}% of dials`.
- **Conversations (>90 sec)** = dials with `conv90 = 1`. Note: `{conv90/connected}% of connected calls` (0 if no connected).
- **Matched / in database** = `matched = 1`.
- **Dial industry denominator (dTot)** = dials with `matched = 1` and a non-empty industry.
- **Order industry denominator (identified)** = YTD orders with `type = Industry`.
- **Order share (industry)** = YTD orders in industry ÷ identified. (Example: 48 ÷ 374 = 12.8%.)
- **Dial share (industry)** = dials in industry ÷ dTot.
- **Gap (pp)** = dial share − order share, one decimal, with sign.
- **Avg duration** (persona table) = mean of `duration` over *all* dials in the persona, formatted `m:ss`.
- **Conv. rate** (store table) = connected ÷ dials in that store.
- Number formats: counts with thousands separators; dollars `$` + rounded integer with separators; percentages one decimal.

---

## 6. DASHBOARD PAGE — SECTIONS IN ORDER (replicate exactly; wording adapted for weekly)

Page container: max-width 1180px, centred, padding `26px 18px 60px`.

### 6.0 Header
- Brand text `KUTLERRI` (Poppins 700, 12px, letter-spacing .16em, accent colour).
- `<h1>`: **`RASA Weekly — Dials, Targeting & Demand`** (Poppins 700, clamp(20px, 3.2vw, 29px), accent colour). Under the header row: a bottom border 3px solid accent.
- Subtitle (13px, secondary ink, max-width 72ch): *"{Week of Oct 5 – Oct 11, 2026} dials against YTD catering demand (Jan 1 – Oct 11, 2026). Order shares are fixed; the dial side follows the agent filter. Click any bar, slice or table row to open the company-wise breakdown on the right. Connected = MQL, Interested/FUP, Call Back Later, Not Interested, Wrong Number, Do Not Call Again; not connected = Left Voicemail, No Answer, Bad Number."*
- Controls (right side): **Week** select (published weeks, newest first, label `Week of Oct 5`), **Agent** select (`All agents` + each agent), and a **theme toggle** button `◐` (light/dark; default follows `prefers-color-scheme`; toggling re-renders charts so their colours update).

### 6.1 KPI row (4 cards) — follows Agent filter
1. **Total dials** — note `across N agents` (or `1 agent` when filtered; singular when N=1)
2. **Unique contacts dialled** — note `{n} repeat attempts`
3. **Conversations (>90 sec)** — note `{x}% of connected calls`
4. **Connected** — note `{x}% of dials`

KPI card: white card, 1px border, radius 12, padding `15px 17px`; value Poppins 26px 700; label 12.5px secondary; note 11.5px secondary. Grid `repeat(auto-fit, minmax(176px, 1fr))`, gap 13px.

### 6.2 "This week's orders" panel (accent top border 3px) — ignores Agent filter
- Title (16px): **`This week's orders only · Oct 5 – Oct 11, 2026`**
- Hint: *"Catering orders placed this week — the same week as the dials above (independent of the agent filter)."*
- KPI row (2 cards):
  - `{n}` label **Orders this week**, note `{k} companies` (k = distinct companies excluding `(individual / no company)`)
  - `$ {sum}` label **Order value**, note `avg $ {sum/n}`
- Two-column grid:
  - **Left panel — "This week's order value by industry"** (hint: *"By $ · click a bar for the company breakdown · $0 orders ignored in the Individuals bar"*). Horizontal bar chart, tall (400px). Value = sum of order `value`. Items: top 9 industries by $ (brand colour), then one **`All other industries (N)`** bar (muted) summing the remaining industries, then **`Individuals (no company)`** (secondary-ink colour; only orders with `value ≥ 1` that are individuals). Orders with `type = Unclassifiable` are not drawn. X axis ticks as `$1.2k` style; tooltip shows full `$` value. Click behaviour: industry bar → company-wise drawer (6.12); "All other" → company-wise for all remaining industries; Individuals → drawer "By location" table (Location, Orders, Value + Total) with sub *"Orders from individuals / personal email, by location · $0 orders ignored"*.
  - **Right panel — "This week's orders by location"** (hint: *"Order value by store area (Ballpark folded into MVT)"*). Vertical bar chart (320px), accent-3 colour (`--c3`), y ticks `$1k`; click a bar → company-wise drawer for that location.
- Full-width panel (no shadow): **"This week's accounts"** (hint: *"Companies that ordered this week, by value"*). Table: Account | Industry (display name) | Orders | Value; top 12 by value; individuals shown as `(individual / no company)` with industry `—`.

### 6.3 "Targeting vs demand" panel — Agent filter affects the dial side only
- Hint (dynamic): *"{total} orders YTD: {identified} from identified organisations, {personal} personal/individual, {unclassifiable} unclassifiable. Dial side = dials."*
- **Paired horizontal bar chart** (height 430px). Categories = **top 15 industries by YTD identified order count** (Y axis, display names, no auto-skip, 11px). Two bars per industry:
  - **`Share of catering orders (YTD)`** — accent colour, value = order share %
  - **`Share of this week's dials`** — teal `#2BA5B5`, value = dial share %
  - X axis ticks `0%, 2%, 4%…`; tooltip `"{label}: {x.x}%"`; legend at top. Click a category → industry drawer (6.12 TvD).
- **Table** below the chart (same 15 rows): Industry | Orders | Order share | Dials | Dial share | Gap (pp). Gap cell green (`--pos`, 600) with leading `+` if ≥ 0, red (`--neg`, 600) if < 0. Rows are clickable (hover bg `--chip`) → same drawer.
- Note: *"Gap = dial share − order share. Positive (green) = dialling this industry more than its share of catering demand; negative (red) = under-dialled vs demand."*

### 6.4 Two doughnuts (grid of 2) — follow Agent filter
- **Persona mix** (hint: *"Grouped from job title · unmatched numbers in grey"*): doughnut, cutout 60%, legend right. Slice order and colours:
  `Events` PAL[0], `Executive Assistant` teal, `Office Manager / Admin` PAL[2], `Admin Support` PAL[3], `Chief of Staff` `#4C6EDB`, `HR / People Ops` PAL[7], `Facilities / Operations` PAL[5], `Leadership / Director` PAL[4], `Other` PAL[6], `No title on file` `--muted`, `Not in database` `--ink-2`. Fixed order for the legend: Events, Executive Assistant, Office Manager / Admin, Admin Support, Chief of Staff, HR / People Ops, Facilities / Operations, Leadership / Director, Other, No title on file, Not in database. Click → persona drawer.
- **Industry mix** (hint: *"Matched contacts with an industry · top 8, rest grouped"*): matched dials with an industry; top 8 industries by dials, plus `All other`, plus `Unknown` (matched dials without an industry; omitted when 0). Colours: PAL by index; `All other` = `--ink-2`; `Unknown` = `--muted`. Click → company drawer (special handling for All other / Unknown).

### 6.5 Two bar charts (grid of 2) — follow Agent filter
- **Top job titles** (hint: *"Exact title as stored · top 12 · matched with a title"*): horizontal bar, PAL[0], by dials (exact title string); click → company drawer for that title.
- **Top industries** (hint: *"Top 12 · matched contacts with an industry"*): horizontal bar, brand colour; click → company drawer.

### 6.6 Two stacked bars (grid of 2) — follow Agent filter
Y axis = the 4 stores (`Mount Vernon Triangle`, `National Landing / Arlington`, `Rockville`, `Mosaic District / Fairfax`); stacked horizontal bars of dials.
- **Dials by store — persona mix** (hint: *"Store-tagged contacts · dual-tagged counted under each store"*). Categories & colours: `Events` PAL[0], `Office Manager / Admin` PAL[2], `Executive Assistant` PAL[1], `Chief of Staff` `#4C6EDB`, `Admin Support` PAL[3], `All other personas` PAL[5], `No title on file` `--muted`.
- **Dials by store — industry mix** (hint: *"Store-tagged contacts · top 6 industries, rest grouped"*). Top 6 industries (among store-tagged, industry-known dials) + `All other` + `Unknown`; colours PAL[1], PAL[2], PAL[3], `#4C6EDB`, PAL[4], PAL[5], `--ink-2`, `--muted`.
- Click a segment → company drawer titled `{store} · {category}`.

### 6.7 Store detail (full-width panel)
Hint: *"Which store each dial supports (contact's Store Location tag). Dual-tagged contacts count under each store, so rows can sum above the filtered total."* Table columns: Store | Dials | Unique contacts | Share of dials | Calls >90s | Conv. rate. Row order: Mount Vernon Triangle, National Landing / Arlington, Rockville, Mosaic District / Fairfax, No store on file, Not in database (omit rows with no dials). Rows clickable → company drawer.

### 6.8 Persona detail (full-width panel)
Hint: *"Personas grouped from the exact job title."* Columns: Persona | Dials | Unique contacts | Share | Calls >90s | Avg duration (m:ss). Rows in the fixed persona order (omit empty). Rows clickable → persona drawer.

### 6.9 "YTD orders — full insight" panel (accent top border) — ignores Agent filter
- Title (16px): **`YTD orders — full insight · Jan 1 – Oct 11, 2026`**
- Hint: *"All catering orders YTD (independent of the dial filters). Dials exist for the selected week only, so this side is orders alone."*
- KPI row (2): `{n}` **Orders (YTD)**, note `{k} companies`; `$ {sum}` **Order value**, note `avg $ {avg}`.
- Two-column grid:
  - **Orders by month** (hint: *"Value (bars) and order count (line)"*): combo chart — bars = value (brand colour, left axis `$12k` ticks), line = order count (teal, tension .3, right axis, no grid). X = months `YYYY-MM` sorted ascending, rotation up to 60°. Click a month → company drawer `Orders in {YYYY-MM}`.
  - **Order value by industry** (hint: *"Top 10 industries · by $"*): same chart as 6.2-left but over all YTD orders, tag `YTD`.
- Full-width: **"Top accounts (YTD)"** table: Account | Industry | Orders | Value, top 12 by value.

### 6.10 Footer notes
- Note (11.5px): *"Not in database = dialled number not matched to the TAM (or the TAM has no industry for it). Industry excludes unmatched dials. Avg duration is over all dials in the persona. Snapshot of the uploaded week."*
- Footer (centred, italic, 11.5px): **Prepared by Kutlerri for RASA | Confidential**

### 6.11 Reusable behaviours
- Every chart/table that is "clickable" shows a pointer cursor on hover.
- `Esc` and the `×` button close the drawer. Opening the drawer scrolls its body to top.
- Changing Agent, Week or Theme re-renders everything (destroy and rebuild charts).

### 6.12 The right-hand drawer (company-wise breakdowns)
Fixed right side panel: width `min(440px, 100vw)`, full height, slides in with `transform: translateX(105%) → none` (0.22s ease), top border 3px accent, left border 1px line, shadow `-10px 0 28px rgba(0,0,0,.14)`, z-index 50. Header: title (Poppins 15px 700) + sub (12px secondary) + `×` button. Body scrolls; each section has an uppercase brand-colour `h4` (12.5px, letter-spacing .03em) followed by a compact table (12.5px) with an optional bold **Total** row (top border 2px).
Drawer types:
1. **Order companies** (`showOrders`): columns Company | Industry | Orders | Value, sorted by value desc, Total row. Section title `"{n} companies"`. Individuals appear as `(individual / no company)`.
2. **Dial companies** (`showCalls`): columns Company | Industry | Dials | Connected | >90s, sorted by dials desc, Total row. Section title `"{n} companies dialled"`. Unmapped dials are grouped under `(not in database)`. Industry shown = first non-empty industry for that company.
3. **TvD drawer** (industry click): title `"{Industry} — orders vs dials"`, sub *"Orders: YTD · Dials: this week (agent filter applies)"*; section 1 `Companies that ordered (YTD) · {n}` (order-companies table filtered to that industry), section 2 `Companies dialled (this week) · {n}` (dial-companies table for matched dials with that industry).
4. **Persona drawer**: title `"{Persona} — who we dialled"`, sub *"This week's dials · agent filter applies"*; first section **Top job titles** (Title | Dials | Connected, top 12, titles with a title only), then the dial-companies section.
5. **Store / industry / title / stacked-segment drawers**: dial-companies table with an appropriate title (`"{Store} — companies dialled"`, `"{Industry} — companies dialled"`, `"{Title} — companies dialled"`, `"{Store} · {Category}"`), sub *"This week's dials · agent filter applies"*.
6. **Individuals drawer**: By location table (Location | Orders | Value + Total).

---

## 7. ADMIN SIDE (`/admin`)

### 7.1 Pages
1. **Login** — password field; on success set the session cookie. Failed attempts rate-limited.
2. **Upload** — drag-and-drop or file picker for `.xlsx` (max 30 MB). On drop: upload → parse → validate → show **Preview** (7.2). Nothing is public until "Publish".
3. **History** — table of all weeks: Week, Version, Uploaded at, Source file, Orders YTD, Dials, Status. Actions: **Open on dashboard**, **Download original**, **Archive/Delete**, **Re-publish** an archived version. Uploading a workbook for an already-published week asks "Replace Week of Oct 5? The current version will be archived." and creates version n+1.
4. **Settings** — the editable rules in 7.5.

### 7.2 Preview (what I see before publishing)
- Detected week (editable week-start date), YTD window, source filename.
- Count cards: YTD orders (and identified / personal / unclassifiable), this-week orders and $ value, dials, unique contacts, % Unmapped, connected %, agents list.
- Validation results: hard errors (red, block Publish) and warnings (amber) per section 3, each expandable to show the offending rows/values.
- A compact preview of the Targeting-vs-demand table (top 15) so I can sanity-check before publishing.
- Buttons: **Publish** (disabled while hard errors exist) and **Discard**.

### 7.3 Publish
Writes the snapshot, sets it as the latest published week, and revalidates the dashboard. The public dashboard (`/`) always opens the latest published week; `/?week=2026-10-05` opens a specific week. Dashboard numbers update automatically after publish with no redeploy.

### 7.4 Audit
Keep the original upload in Blob and log uploader, time, and the validation warnings with each snapshot.

### 7.5 Settings — editable rules (stored in `config`, with these defaults)
**(a) Persona** — not configurable in the app. Personas are assigned in the weekly sheet (`Calls_This_Week.Persona`), so any correction is made in the workbook and re-uploaded.
**(b) Disposition mapping** — a table of disposition value → `connected` / `not connected`; unknown values found in uploads are listed for me to classify.
**(c) Industry display abbreviations** (the map in 4.4).
**(d) Location mapping** (Toast `location_name` → dashboard store label, 4.2) and **store keyword mapping** (4.3).
Changing a setting recomputes the stored snapshots' derived fields (connected, stores) for the selected week(s) — keep the raw per-dial fields in the snapshot (disposition string, store string) so this is possible.

---

## 8. DESIGN SYSTEM (copy exactly)

CSS variables (define on `:root`; dark values apply for `prefers-color-scheme: dark` unless `data-theme="light"`, and always when `data-theme="dark"`):

```
Light: --bg:#F6F4FA; --card:#FFFFFF; --ink:#1A1523; --ink-2:#6B6478; --line:#E7E2F0;
       --accent:#7B2FE0; --brand:#9333EA; --chip:#F1EDF8; --shadow:0 1px 2px rgba(60,30,110,.07);
       --pos:#2F9E6E; --neg:#D64545; --muted:#C9C3D6; --grid:#E7E2F0;
       --c1:#7B2FE0; --c2:#2BA5B5; --c3:#F2A93B; --c4:#3FA37A; --c5:#C026D3; --c6:#B07A52; --c7:#6B7280; --c8:#EC4899
Dark:  --bg:#14111C; --card:#1D1928; --ink:#EDE9F5; --ink-2:#A59DB8; --line:#2F2940;
       --accent:#A66BFF; --brand:#B57CFF; --chip:#272236; --shadow:0 1px 2px rgba(0,0,0,.4);
       --muted:#3B3450; --grid:#2F2940; --pos:#5FC79A; --neg:#F0706A; --c1:#A66BFF
       (--c2…--c8 unchanged)
```
`PAL = [--c1 … --c8]` (PAL[0] = c1, … PAL[7] = c8). `BRAND = --brand`, `TEAL = #2BA5B5`, `PBLUE = #4C6EDB`.

Layout and component specs:
- `body`: bg `--bg`, colour `--ink`, Arial, line-height 1.45. Safe-area insets on the root (`env(safe-area-inset-top/bottom)`), viewport `viewport-fit=cover`.
- Panel: bg `--card`, 1px `--line` border, radius 12, padding `16px 18px`, `--shadow`, margin-bottom 14. `h2` 14.5px Poppins 700; `.hint` 12px `--ink-2` margin-bottom 12.
- Two-column grid: `1fr 1fr`, gap 14, collapses to 1 column below 820px.
- Charts: `.chart-box` height 320px, `.chart-tall` 400px, TvD chart 430px. Chart.js defaults: font Arial, colour `--ink-2`, grid colour `--grid`, bar `borderRadius` 3–5, doughnut `borderWidth 1` in `--card` colour.
- Tables: width 100%, 13px, `min-width:560px` inside a horizontally scrollable wrapper; `th` left-aligned, 12px bold `--brand` with a 2px `--brand` bottom border; `td` padding `8px 11px` with 1px `--line` bottom border; numeric columns right-aligned with tabular numerals; `tr.click:hover td` background `--chip`.
- Select and theme button: 13px, `--card` bg, 1px `--line` border, radius 8, padding `7px 10px`.
- Responsive and accessible: keyboard-focusable controls, drawer `aria-label` on close, charts have `aria-label`s.

---

## 9. EDGE CASES TO HANDLE

- Agent with zero dials in the selected week → charts show an empty-state message instead of throwing.
- Division by zero everywhere (shares, conversion rates) → show `0.0%`.
- An industry present in the Top-15 order list but with zero dials → show 0 dials, 0.0% share, negative gap.
- Companies with the same name differing in case/whitespace → group case-insensitively, display the first-seen spelling.
- `Contact Number` in the sheet may be stored as a number in Excel: parse as a string of digits without decimals/scientific notation.
- Week with fewer than 7 days of dials (e.g. holiday) is fine; do not warn unless dials = 0.
- Large workbook (~10k JC rows, ~1.5k Toast rows) must parse in under ~15 seconds; do parsing in a route handler with a sensible `maxDuration`.
- The `Toast` and `Week of … (JC)` tabs are large; do not store them in the JSONB snapshot — only the derived values (order value and location).
- Time zone: treat all dates as plain calendar dates (no time-zone conversion).

---

## 10. ACCEPTANCE TESTS (use the sample workbook I will attach: `rasa industry catering.xlsx`, Week of Oct 5, 2026)

After uploading the sample, the dashboard for **Week of Oct 5 – Oct 11, 2026** must show:
- YTD orders **514** = **415** identified + **67** personal/individual + **32** unclassifiable (the hint line under "Targeting vs demand").
- Order-share denominator is **415** (e.g. the top industry's share = its count ÷ 415).
- **Total dials = 2,919**; **unique contacts = 2,530**; `Industry = Unmapped` dials = **872** (these appear as "Not in database" persona and store).
- **Connected = 282** (9.7% of dials) and **Conversations (>90 sec) = 237**; `No Answer` = 2,629 dials.
- Persona counts (all agents): Executive Assistant 690, Office Manager / Admin 673, Admin Support 280, Chief of Staff 168, Events 88, HR / People Ops 68, Other 47, Facilities / Operations 19, Leadership / Director 12, No title on file 2, Not in database 872 (sum = 2,919).
- **Orders this week = 9** (placed Oct 5–11, CLOSED/CONFIRMED), **order value $3,738.43**, two of which are $0 orders.
- The YTD window starts Jan 1, 2026; the Orders-by-month chart shows 2026-01 through 2026-10 (partial).
- Agent filter: selecting one agent changes all dial-side cards/charts/tables and leaves every order-side number unchanged.
- Clicking a Targeting-vs-demand row opens the drawer with two company tables whose Total rows equal the row's Orders and Dials.
- Reconciliation shows no mismatches against `Industry_Summary` for the sample.
- Light and dark themes both render correctly; mobile (≤ 820px) stacks the two-column grids.

Add unit tests for the pipeline (week detection, location mapping, store keyword mapping, disposition mapping, share/gap maths, Toast join) and a Playwright smoke test that uploads the sample and asserts the numbers above.

---

## 11. DELIVERABLES AND WAY OF WORKING

1. Plan first: print the file/folder structure, DB schema and the order you will build in. Then build in this order: pipeline + tests → admin upload/validation/preview/publish → dashboard sections 6.0–6.10 → drawer (6.12) → settings (7.5) → polish.
2. Provide `README.md` with: env vars (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, optional `VIEWER_PASSCODE`), local run, Vercel deploy steps, and a "Weekly runbook" (open /admin → upload workbook → review warnings → Publish).
3. Where the spec is silent, choose the simplest option, keep to the design system, and record the assumption in the README — do not stop to ask unless something is blocking.
4. Do not change anything outside this scope and do not add extra pages, charts or metrics.
