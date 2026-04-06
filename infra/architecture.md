# GoodGame — Azure Infrastructure Architecture

```mermaid
flowchart TD
    subgraph GitHub["GitHub (likelimulu/GoodGame)"]
        PR[Pull Request / Push]
        GHA_API[GH Actions: build-push-api]
        GHA_FE[GH Actions: deploy-frontend]
    end

    subgraph Azure["Azure (centralus, except Postgres)"]
        subgraph RG["Resource Group: goodgame-rg"]
            ACR["Azure Container Registry\ngoodgameregistry\n(Basic SKU)"]

            subgraph CAEnv["Container App Environment\ngoodgame-env"]
                CA["Container App\ngoodgame-api\n(Django + Gunicorn)"]
            end

            SWA["Static Web App\ngoodgame-frontend\n(Free tier — React)"]

            PG["PostgreSQL Flexible Server\ngoodgame-postgres\n(westeurope, B1ms, v16)"]
            PGDb["Database: goodgame"]
            PGFw["Firewall Rule:\nallow-azure-services\n0.0.0.0 → 0.0.0.0"]

            SA["Storage Account\ngoodgame{suffix}\n(Standard LRS)"]
            SAMedia["Blob Container: media\n(public read)"]
            SAStatic["Blob Container: static\n(public read)"]

            KV["Key Vault\ngoodgame-kv\n(Standard)"]
            KVS1["Secret: django-secret-key"]
            KVS2["Secret: postgres-password"]
            KVS3["Secret: storage-account-key"]

            LA["Log Analytics Workspace\ngoodgame-logs\n(PerGB2018, 30d)"]
        end
    end

    %% GitHub Actions → ACR
    PR -->|"triggers"| GHA_API
    PR -->|"triggers"| GHA_FE
    GHA_API -->|"docker push\nACR_USERNAME / ACR_PASSWORD"| ACR

    %% GitHub Actions → Static Web Apps
    GHA_FE -->|"AZURE_STATIC_WEB_APPS_API_TOKEN"| SWA

    %% ACR → Container App (image pull)
    ACR -->|"image pull\n(registry secret)"| CA

    %% Container App → backends
    CA -->|"POSTGRES_HOST\nport 5432 / SSL"| PG
    CA -->|"AZURE_STORAGE_ACCOUNT_NAME\n+ KEY"| SA
    CA -->|"managed identity\nGet/List secrets"| KV

    %% Container App → Log Analytics (via environment)
    CAEnv -->|"stdout / stderr logs"| LA

    %% PostgreSQL structure
    PG --> PGDb
    PG --> PGFw

    %% Storage structure
    SA --> SAMedia
    SA --> SAStatic

    %% Key Vault structure
    KV --> KVS1
    KV --> KVS2
    KV --> KVS3
    SA -->|"primary_access_key"| KVS3
```

## Resource summary

| Resource | Type | Region | Notes |
|---|---|---|---|
| goodgame-rg | Resource Group | centralus | Parent for all resources |
| goodgame-logs | Log Analytics Workspace | centralus | 30-day retention |
| goodgame-env | Container App Environment | centralus | Linked to Log Analytics |
| goodgame-api | Container App | centralus | Django API, scale-to-zero |
| goodgameregistry | Container Registry | centralus | Basic SKU, admin enabled |
| goodgame-frontend | Static Web App | centralus | Free tier, React SPA |
| goodgame-postgres | PostgreSQL Flexible Server | **westeurope** | B1ms, v16 (free-trial workaround) |
| goodgame (DB) | PostgreSQL Database | westeurope | UTF8, en_US.utf8 |
| goodgame{suffix} | Storage Account | centralus | Standard LRS |
| media | Blob Container | centralus | Public blob read |
| static | Blob Container | centralus | Public blob read |
| goodgame-kv | Key Vault | centralus | Standard SKU |

## GitHub Actions secrets required

| Secret | Source |
|---|---|
| `AZURE_CREDENTIALS` | Service principal JSON (`az ad sp create-for-rbac`) |
| `ACR_LOGIN_SERVER` | `terraform output container_registry_login_server` |
| `ACR_USERNAME` | `terraform output -raw container_registry_admin_username` |
| `ACR_PASSWORD` | `terraform output -raw container_registry_admin_password` |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `terraform output -raw static_web_app_api_key` |
| `DJANGO_SECRET_KEY` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD` | Same value as `TF_VAR_postgres_admin_password` |
| `AZURE_STORAGE_ACCOUNT_KEY` | `terraform output` → storage account primary key |
