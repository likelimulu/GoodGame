resource "azurerm_container_registry" "main" {
  name                = "${replace(var.app_name, "-", "")}registry"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.registry_sku

  # Enable admin user so we can use username/password in GitHub Actions
  admin_enabled = true

  tags = {
    project     = var.app_name
    environment = var.environment
  }
}
