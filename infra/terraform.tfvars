# Non-secret variable values — safe to commit.
# Secrets (postgres_admin_password, django_secret_key, github_token) must be
# passed via environment variables or a separate .auto.tfvars file that is
# listed in .gitignore:
#
#   export TF_VAR_postgres_admin_password="..."
#   export TF_VAR_django_secret_key="..."
#   export TF_VAR_github_token="..."

app_name    = "goodgame"
location    = "centralus"
environment = "prod"

postgres_admin_username = "goodgameadmin"
postgres_db_name        = "goodgame"
postgres_sku            = "B_Standard_B1ms"
postgres_location       = "centralus"

registry_sku = "Basic"

github_repo_url = "https://github.com/likelimulu/GoodGame"
github_branch   = "main"

# Update cors_allowed_origins after first Static Web Apps deploy
# (Azure assigns the URL automatically):
cors_allowed_origins = ""
