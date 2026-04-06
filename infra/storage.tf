# Storage account name must be globally unique, 3-24 chars, lowercase alphanumeric only.
# We use a random suffix to avoid collisions.
resource "random_string" "storage_suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_storage_account" "main" {
  name                     = "${replace(var.app_name, "-", "")}${random_string.storage_suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # Allow public blob access (needed for media files served directly to browsers)
  allow_nested_items_to_be_public = true

  tags = {
    project     = var.app_name
    environment = var.environment
  }
}

# Media container — public read access so uploaded images are directly accessible
resource "azurerm_storage_container" "media" {
  name                  = "media"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "blob"
}

# Static assets container (optional, for Django collectstatic)
resource "azurerm_storage_container" "static" {
  name                  = "static"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "blob"
}

