# Family Asset Manager

뱅크샐러드에서 내보낸 거래 내역을 기반으로 월별 예산, 수입, 자산과 부채를 관리하는 웹 애플리케이션입니다.

## Architecture

- Client: React 19 + Vite
- API: Express 5
- Database: Supabase PostgreSQL (`pg` 연결)
- Production: Docker image on Google Cloud Run
- CI/CD: GitHub Actions

## Local development

Prerequisites: Node.js 20 (see `.nvmrc`) and a Supabase development database.

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `JWT_SECRET`.
2. Install dependencies with `npm ci`.
3. Start both the API and Vite development server with `npm run dev`.
4. Open the local Vite URL shown in the terminal (normally `http://localhost:5173`). API calls to `/api` are proxied to port 8080.

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run dev
```

## Validation commands

```bash
npm run lint       # static checks
npm run test       # unit tests
npm run build      # production client build
npm run check      # lint + test + build (same as CI)
```

## Secrets and safety

- Never commit `.env`, database backups, or real transaction spreadsheets.
- Use a separate Supabase project or database for local development. The app creates and migrates its tables when the API starts.
- `DATABASE_URL` and `JWT_SECRET` must be injected into Cloud Run from Google Secret Manager; do not place them in GitHub variables or source files.
- Before changing database migration or sync code, create a Supabase backup. `POST /api/db/sync` replaces the authenticated user's stored dataset as one transaction.

## Deployment

The GitHub Actions deployment workflow is deliberately disabled until `DEPLOY_ENABLED=true` is set as a repository variable. See [docs/deployment.md](docs/deployment.md) for the one-time GitHub and GCP configuration.

## Repository map

- `src/`: React UI, state, Excel parsing, finance calculations
- `server/`: Express API and PostgreSQL schema/migration logic
- `test/`: fast unit tests for business logic
- `.github/workflows/`: CI and Cloud Run deployment workflows
- `PRD.md`: product requirements and historical project notes
