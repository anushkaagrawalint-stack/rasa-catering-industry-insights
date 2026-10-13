# RASA Weekly — Dials, Targeting & Demand

A weekly version of the RASA P9 period dashboard, built by Kutlerri for RASA Indian Kitchen.

- **`/`** is the dashboard and the main page. Everyone signs in at `/login`. It opens on the latest published week; `/?week=2026-10-05` opens a specific week.
- **`/admin`** is only for accounts with the `admin` role. They reach it from the **Admin** button on the dashboard; other accounts never see that button and are sent back to the dashboard if they open `/admin`. Upload the weekly workbook, review the validation, then publish. Previous weeks stay available.

Stack: Next.js 16 (App Router, TypeScript) · Chart.js 4 · SheetJS · Postgres (Neon / Vercel Postgres) · Vercel Blob · jose sessions.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | on Vercel | Postgres connection string (Neon / Vercel Postgres; include `sslmode=require`). **If unset, an embedded PGlite database in `./.data/pglite` is used**, which is intended for local development and tests only. |
| `BLOB_READ_WRITE_TOKEN` | on Vercel | Vercel Blob store that keeps the original uploads (private access). **If unset, uploads are stored in `./.data/blob`**. |
| `APP_USERS` | yes | Sign-in accounts as a JSON array: `[{"email":"…","password":"…","role":"admin"}, …]`. Role `admin` can see and use the admin area; role `viewer` sees the dashboard only. Kept in the environment so passwords never go into the repo. |
| `SESSION_SECRET` | yes | 32+ random characters; signs the session cookies. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |

The database schema is created automatically on first connection (`src/lib/schema.ts`, `create table if not exists`). There is no separate migration step.

## Local run

```bash
npm install
cp .env.example .env.local      # set APP_USERS and SESSION_SECRET; leave DATABASE_URL / BLOB_READ_WRITE_TOKEN empty
npm run dev                     # http://localhost:3000  → /admin to upload
```

Tests:

```bash
npm test                        # Vitest: pipeline unit tests + the spec section 10 numbers on the sample workbook
npx playwright install chromium # once
npm run test:e2e                # Playwright smoke test: upload → publish → dashboard numbers (isolated DB in .data/e2e)
E2E_PROD=1 npm run test:e2e     # same, against a production build
```

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; defaults are fine).
2. **Storage → Create → Neon Postgres** and connect it to the project. This sets `DATABASE_URL`.
3. **Storage → Create → Blob** and connect it. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Settings → Environment Variables**: add `APP_USERS` (the same JSON as in `.env.local`, on one line) and `SESSION_SECRET`.
5. Deploy. The tables are created on the first request. The parse route uses `maxDuration = 60` (the sample workbook parses in about 1 s).

## Weekly runbook

1. Sign in with an admin account and press **Admin** on the dashboard. Your email is recorded as the uploader.
2. Drop the week's workbook (for example `rasa industry catering.xlsx`) onto the upload box.
3. Review the **preview**:
   - **Week:** check the detected week. To correct it, change the week-start date and press **Apply week**.
   - **Counts:** check the cards (YTD orders, this week's orders, dials, % Unmapped, connected %, agents).
   - **Red errors** block publishing. Fix the workbook and upload it again.
   - **Amber warnings** allow publishing. Expand each one to see the rows or values, for example Unclassifiable companies or "Other" job titles to fix in next week's sheet.
   - **Top-15 table:** sanity-check the Targeting-vs-demand table.
4. Press **Publish**. If that week is already published, confirm **"Replace Week of …? The current version will be archived."**
5. The dashboard updates immediately; no redeploy is needed.

**History** lets you open a week on the dashboard, **view the uploaded sheet** in the browser (any tab, 100 rows per page), download the original upload, **re-upload** a week (publishing archives the current version), archive or re-publish a version, or **delete** any version (deleting the published one removes that week from the dashboard). **Settings** edits the disposition mapping, industry abbreviations, and location and store-keyword mappings. Saving recomputes the selected stored weeks.

## How it works

- **Pipeline** (`src/lib/pipeline/`): `readWorkbook` reads the tab names first, then parses only `Industry_Summary`, `YTD_Orders`, `Calls_This_Week` and `Toast`. The JustCall and Phone Number tabs are kept only in the stored original file.
  - `process.ts` validates (spec section 3) and normalises (4.1–4.3), and `reconcile` checks against `Industry_Summary` (4.6).
  - `derive.ts` holds the config-driven fields (connected, stores, location) and is reused when settings change.
- **Snapshot** (`weekly_snapshots.data`): compact positional arrays.
  - Dial rows keep the reference dashboard's layout at positions 0–10 and add the raw disposition and store strings at positions 11–12, so a settings change can recompute them.
  - Order rows are `[company, industry, value, thisWeek, location, month, type, locRawIdx, date]`.
  - The sample week is about 370 KB of JSON, or 63 KB gzipped.
- **Dashboard** (`src/components/dashboard/engine.ts`): a typed port of the reference script. All aggregation happens client-side from the selected week's rows, and every chart is destroyed and rebuilt when the Agent, Week or Theme changes. The metric maths (`src/lib/metrics.ts`) is shared with the admin preview and the tests.
- **Security**:
  - `src/proxy.ts` requires a signed-in session for the dashboard and restricts `/admin` and `/api/admin` to the `admin` role (viewers get a redirect or 403). Every admin route handler re-checks the session.
  - Cookies are HttpOnly, SameSite=Lax and signed with HS256.
  - Failed logins are rate-limited in Postgres: 5 failures per 15 minutes per IP.
  - Uploads go browser → private Vercel Blob, because a function request body is capped at about 4.5 MB.

## Assumptions and deviations

These are the choices made where the spec was silent, or where following it literally didn't work.

1. **Unique contacts exclude blank numbers.** One sample dial has no `Contact Number`. It gets `contactId = −1` and is not counted as a unique contact (as in the reference's `uniq()`), which gives the expected **2,530**.
2. **Reconciliation of the special rows.** The `Personal`, `Unclassifiable` and `Unmapped (dials)` rows in `Industry_Summary` are compared with the personal / unclassifiable order counts and the Unmapped dial count, not by industry name. Industries in the data but missing from the summary are also reported.
3. **Draft status.** The `weekly_snapshots.status` column also allows `draft`, which holds a parsed upload until Publish or Discard. Only one draft is kept; a new upload replaces it.
4. **Required tabs.** Only `YTD_Orders` and `Calls_This_Week` are hard requirements. If `Industry_Summary`, `Toast`, `Phone Number` or the `Week of…` tab is missing, you get a warning:
   - Without `Industry_Summary`, the week comes from the call dates.
   - Without `Toast`, order values are $0 and locations "Unknown".
5. **Column matching.** Tab names are matched exactly (after trimming). Column headers are matched trimmed and case-insensitively.
6. **Dates and validation details.**
   - Text dates are accepted as `YYYY-MM-DD`, US `M/D/YYYY`, or `Oct 5, 2026`. Excel serial numbers are also read.
   - Up to 2% unreadable dates are a warning; those rows stay in but are left out of date logic.
   - Unknown `Type` values are treated as Unclassifiable, with a warning.
7. **Unknown dispositions** count as not connected and are listed both in the upload warnings and on Settings.
8. **Store tags that match no keyword** are listed as a warning. A dial whose tags all fail to match counts as "No store on file". This warning is not in the spec; it was added so tags aren't dropped silently.
9. **Week override** snaps to the Monday of the chosen date.
10. **Orders after the week end** stay in the YTD data and raise a warning (the tab is trusted, not re-filtered).
11. **Blank company names** on an order or a matched dial are shown as `(no company name)`. Company names are grouped case- and whitespace-insensitively, using the first-seen spelling.
12. **The `measure` toggle is not built.** The reference had dormant dials/contacts toggle code with no control shown, and the spec doesn't include it.
13. **Chart sizing.** Charts use `maintainAspectRatio: false` so they fill the 320 / 400 / 430 px boxes the spec gives. The reference left Chart.js's default aspect ratio on, which ignores those heights.
14. **Label casing.** Persona, "All other", "Unknown" and job-title labels are shown exactly as written in the spec. The reference ran them through the industry Title-Case function, which produced "No Title On File" and title-cased job titles. Industry names still use `disp()`.
15. **Empty states.** When an agent has no dials in the selected week, each chart shows "No dials for this selection" and each table shows an empty row.
16. **Accounts.** Sign-in is per account (`APP_USERS`), replacing the spec's single `ADMIN_PASSWORD` and optional `VIEWER_PASSCODE`. The signed-in email is stored as `uploaded_by`. Sessions last 12 hours; the dashboard has a **Log out** button.
17. **Header subtitle.** The connected / not-connected sentence in the header is the fixed text from the spec. It does not change when the disposition mapping is edited in Settings.
