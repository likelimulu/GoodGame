# GoodGame Infrastructure (Terraform)

Manages all Azure resources for the GoodGame app.

## Prerequisites

```bash
# Install tools (macOS)
brew install azure-cli terraform

# Authenticate
az login
```

## One-time Bootstrap (run once per team)

Create the storage account that holds Terraform remote state. This must exist
before `terraform init` can run:

```bash
az group create --name goodgame-tfstate-rg --location eastus
az storage account create \
  --name goodgametfstate<UNIQUE_SUFFIX> \
  --resource-group goodgame-tfstate-rg \
  --sku Standard_LRS
az storage container create \
  --name tfstate \
  --account-name goodgametfstate<UNIQUE_SUFFIX>
```

Replace `<UNIQUE_SUFFIX>` with any short unique string (e.g. your initials + 3 digits).

## Initialize

```bash
cd infra/
terraform init \
  -backend-config="storage_account_name=goodgametfstate<UNIQUE_SUFFIX>"
```

## Set Terraform Inputs

```bash
export TF_VAR_postgres_admin_password="<strong-password>"
export TF_VAR_django_secret_key="<long-random-string>"
export TF_VAR_email_host_user="<smtp-username-or-sender>"
export TF_VAR_email_host_password="<smtp-password-or-app-password>"
export TF_VAR_frontend_url="https://<static-web-app-hostname>"
export TF_VAR_github_repo_url="https://github.com/<org-or-user>/<repo>"
export TF_VAR_github_token="<github-pat-with-repo-scope>"
```

Generate a Django secret key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Keep secret values in environment variables or an ignored `*.secret.tfvars` file passed with `-var-file=...`. Non-secret values such as `location`, `postgres_location`, `github_repo_url`, `frontend_url`, and `cors_allowed_origins` can live in `terraform.tfvars`. For the first apply, `frontend_url` can be a temporary URL; update it to the Static Web App URL after the frontend deploys.

## Plan and Apply

```bash
# Dry-run — shows what will be created/changed
terraform plan

# Create all resources (~3-5 minutes)
terraform apply
```

## After First Apply

1. **Retrieve outputs** needed for deployment and GitHub Actions:
   ```bash
   terraform output container_app_url
   terraform output static_web_app_url
   terraform output container_registry_login_server
   terraform output -raw container_registry_admin_username
   terraform output -raw container_registry_admin_password
   terraform output -raw static_web_app_api_key
   terraform output postgres_server_fqdn
   terraform output storage_account_name
   ```

2. **Add GitHub Actions secrets** (Settings → Secrets → Actions):
   - `AZURE_CREDENTIALS` — service principal JSON (see below)
   - `ACR_LOGIN_SERVER` — from `container_registry_login_server`
   - `ACR_USERNAME` — from `container_registry_admin_username`
   - `ACR_PASSWORD` — from `container_registry_admin_password`
   - `AZURE_STATIC_WEB_APPS_API_TOKEN` — from `static_web_app_api_key`
   - `VITE_API_URL` — from `container_app_url`, without a trailing `/api`

3. **Create service principal** for GitHub Actions:
   ```bash
   az ad sp create-for-rbac \
     --name "goodgame-github-actions" \
     --role contributor \
     --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/goodgame-rg \
     --sdk-auth
   ```
   Copy the JSON output and save as `AZURE_CREDENTIALS` secret.

4. **Update frontend and CORS URLs** — after the Static Web App deploys, copy its hostname and add the full `https://...` origin to `frontend_url` and `cors_allowed_origins`, then run `terraform apply`.

## Teardown (end of semester)

```bash
terraform destroy
```
This removes every Azure resource and stops all billing. Run after the semester ends.
