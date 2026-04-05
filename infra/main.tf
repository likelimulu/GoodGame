terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 3.117.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.8.1"
    }
  }

  # Remote state stored in Azure Blob Storage.
  # Bootstrap this storage account manually ONCE before running terraform init:
  #   az group create --name goodgame-tfstate-rg --location eastus
  #   az storage account create --name <UNIQUE_NAME> --resource-group goodgame-tfstate-rg --sku Standard_LRS
  #   az storage container create --name tfstate --account-name <UNIQUE_NAME>
  # Then run: terraform init -backend-config="storage_account_name=<UNIQUE_NAME>"
  backend "azurerm" {
    resource_group_name = "goodgame-tfstate-rg"
    container_name      = "tfstate"
    key                 = "goodgame.terraform.tfstate"
    # storage_account_name is passed via -backend-config at init time
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
}

# ── Resource Group ────────────────────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = "${var.app_name}-rg"
  location = var.location

  tags = {
    project     = var.app_name
    environment = var.environment
  }
}

# Data source: current Azure client (used for Key Vault access policies)
data "azurerm_client_config" "current" {}
