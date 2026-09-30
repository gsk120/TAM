# Working agreement for Codex contributors

## Commands

- Install: `npm ci`
- Local development: `npm run dev`
- Full validation: `npm run check`
- Production build: `npm run build`

Use Node 20 as specified in `.nvmrc`. On Windows PowerShell, use `npm.cmd` when execution policy prevents `npm` from running.

## Architecture and data rules

- The Vite client calls the Express API through `/api`; preserve this contract when changing frontend or backend routes.
- PostgreSQL access is centralized in `server/db.js`. All database queries must remain parameterized and scoped to the authenticated `user_id`.
- Treat `syncFullDatabase` as destructive replacement logic. Do not alter it without tests and a migration/backward-compatibility plan.
- Do not add secrets, real spreadsheets, database backups, or user transaction data to Git.
- Keep user-visible Korean text UTF-8 encoded. Do not use an editor or script that changes source-file encoding.

## Change expectations

- Add or update focused tests for finance calculations, import parsing, authentication, or database behavior that changes.
- Run `npm run check` before proposing a commit.
- Keep Cloud Run runtime configuration in environment variables/Secret Manager, not in source code.
- Use a feature branch and pull request for production-affecting changes unless the user explicitly requests a direct main-branch change.
