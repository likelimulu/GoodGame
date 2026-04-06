# ── URLs ──────────────────────────────────────────────────────────────────────

output "container_app_url" {
  description = "Public HTTPS URL of the Django API Container App"
  value       = "https://${azurerm_container_app.django.latest_revision_fqdn}"
}

output "static_web_app_url" {
  description = "Public URL of the React frontend Static Web App"
  value       = azurerm_static_web_app.frontend.default_host_name
}

# ── Database ──────────────────────────────────────────────────────────────────

output "postgres_server_fqdn" {
  description = "Fully-qualified domain name of the PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "postgres_db_name" {
  description = "Name of the application database"
  value       = azurerm_postgresql_flexible_server_database.main.name
}

# ── Storage ───────────────────────────────────────────────────────────────────

output "storage_account_name" {
  description = "Azure Storage account name (used for AZURE_STORAGE_ACCOUNT_NAME)"
  value       = azurerm_storage_account.main.name
}

output "media_container_url" {
  description = "Base URL for media files in Blob Storage"
  value       = "${azurerm_storage_account.main.primary_blob_endpoint}media"
}

# ── Container Registry ────────────────────────────────────────────────────────

output "container_registry_login_server" {
  description = "ACR login server (used in docker push and GitHub Actions)"
  value       = azurerm_container_registry.main.login_server
}

output "container_registry_admin_username" {
  description = "ACR admin username"
  value       = azurerm_container_registry.main.admin_username
  sensitive   = true
}

output "container_registry_admin_password" {
  description = "ACR admin password"
  value       = azurerm_container_registry.main.admin_password
  sensitive   = true
}

# ── Key Vault ─────────────────────────────────────────────────────────────────

output "key_vault_uri" {
  description = "Key Vault URI for referencing secrets"
  value       = azurerm_key_vault.main.vault_uri
}
