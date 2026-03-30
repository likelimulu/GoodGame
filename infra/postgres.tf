resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${var.app_name}-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.postgres_admin_username
  administrator_password = var.postgres_admin_password

  # Burstable B1ms: cheapest option (~$12-15/month), fine for a class project
  sku_name   = var.postgres_sku
  storage_mb = 32768  # 32 GB minimum

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  # No VNet integration — Container Apps connect via public endpoint with SSL
  # For higher security, add private networking in a future iteration.

  tags = {
    project     = var.app_name
    environment = var.environment
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.postgres_db_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Allow all Azure services to connect (needed for Container Apps without VNet)
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
