# RASA Weekly Dashboard

Next.js 16 dashboard that reads the weekly workbook(s) straight from this repository. There is no database and no upload page.

## Updating the data
1. Put the weekly `.xlsx` workbook in the `data/` folder (one file per week; the week is detected from the file's contents, so any filename works).
2. Commit and push to GitHub. Vercel redeploys automatically and the new week appears in the Week selector.

Files that fail validation are skipped and the reason is logged. The workbook must contain the `YTD_Orders` and `Calls_This_Week` tabs. Note that anything in `data/` is visible to anyone with access to the repository.

## Environment variables
| Name | Purpose |
|---|---|
| `APP_USERS` | Sign-in accounts as one-line JSON: `[{"email":"…","password":"…","role":"admin"}]`. Roles `admin` and `viewer` both just see the dashboard. |
| `SESSION_SECRET` | At least 32 random characters; signs the session cookie. |

Locally, put them in `.env.local` (git-ignored). On Vercel, add them under Settings → Environment Variables.

## Develop
```
npm install
npm run dev        # http://localhost:3000
npm test
```

## Deploy to Vercel
Import the repo at vercel.com/new, add the two environment variables, and deploy. No storage is needed.

Login rate limiting (5 failures per 15 minutes per IP) is kept in memory, so it is per server instance.
