# Cloud Run deployment setup

This repository includes `.github/workflows/deploy-cloud-run.yml`. It deploys only after the one-time configuration below is complete.

## 1. Create Google Cloud secrets

In the target GCP project, create these Secret Manager secrets and add a current version to each:

- `family-asset-database-url`: the Supabase PostgreSQL `DATABASE_URL`
- `family-asset-jwt-secret`: a long random JWT signing secret

The Cloud Run service account needs `Secret Manager Secret Accessor` for both secrets.

## 2. Connect GitHub Actions to Google Cloud

Use GitHub Actions OpenID Connect / Workload Identity Federation (not a downloaded service-account JSON key). Create a dedicated deployer service account and grant it:

- Cloud Run Admin
- Service Account User for the Cloud Run runtime service account
- Artifact Registry Writer, if your project requires it for Cloud Run source deployment
- Secret Manager Secret Accessor only when deployment validation requires it; the runtime service account also needs this role

Create an OIDC provider restricted to this GitHub repository and allow the deployer service account to impersonate it.

## 3. Configure GitHub repository settings

Add these **Actions secrets**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — complete provider resource name
- `GCP_SERVICE_ACCOUNT` — deployer service account email

Add these **Actions variables**:

- `GCP_PROJECT_ID`
- `GCP_REGION` (for example `asia-northeast3`)
- `CLOUD_RUN_SERVICE`
- `DATABASE_URL_SECRET_NAME` (`family-asset-database-url`)
- `JWT_SECRET_NAME` (`family-asset-jwt-secret`)
- `DEPLOY_ENABLED` (`true`, only after a manual workflow test succeeds)

Also create a GitHub Environment named `production` and configure required reviewers if you want an approval gate before each deployment.

## 4. First deployment

1. Push the CI configuration and confirm the CI workflow passes.
2. Add the settings above, leaving `DEPLOY_ENABLED` unset or false.
3. Run **Deploy to Cloud Run** manually after setting `DEPLOY_ENABLED=true`.
4. Confirm `<service-url>/api/health` returns `{ "status": "ok" }` and verify login, Excel import, budget save, and asset save with a non-production test account.

## Rollback

In Cloud Run, route traffic back to the prior revision. Database schema changes should be backward-compatible; take a Supabase backup before any database migration change.
