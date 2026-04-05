variable "app_name" {
  description = "Base name used for all Azure resources (e.g. 'goodgame')"
  type        = string
  default     = "goodgame"
}

variable "location" {
  description = "Azure region to deploy all resources"
  type        = string
  default     = "eastus"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# ── PostgreSQL ────────────────────────────────────────────────────────────────

variable "postgres_admin_username" {
  description = "PostgreSQL Flexible Server administrator username"
  type        = string
  default     = "goodgameadmin"
}

variable "postgres_admin_password" {
  description = "PostgreSQL Flexible Server administrator password"
  type        = string
  sensitive   = true
}

variable "postgres_db_name" {
  description = "Name of the application database"
  type        = string
  default     = "goodgame"
}

variable "postgres_sku" {
  description = "PostgreSQL Flexible Server SKU (Burstable B1ms = cheapest option)"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_location" {
  description = "Azure region for PostgreSQL (may differ from main location due to free-trial restrictions)"
  type        = string
  default     = "centralus"
}

# ── Django ────────────────────────────────────────────────────────────────────

variable "django_secret_key" {
  description = "Django SECRET_KEY — must be a long random string"
  type        = string
  sensitive   = true
}

variable "django_allowed_hosts" {
  description = "Comma-separated ALLOWED_HOSTS for Django (Container Apps URL added automatically)"
  type        = string
  default     = "localhost,127.0.0.1"
}

variable "cors_allowed_origins" {
  description = "Comma-separated CORS_ALLOWED_ORIGINS (Static Web App URL added after deploy)"
  type        = string
  default     = ""
}

# ── Container Registry ────────────────────────────────────────────────────────

variable "registry_sku" {
  description = "Azure Container Registry SKU (Basic is cheapest, ~$5/month)"
  type        = string
  default     = "Basic"
}

# ── GitHub (for Static Web Apps) ─────────────────────────────────────────────

variable "github_repo_url" {
  description = "GitHub repository URL for Static Web Apps integration (e.g. https://github.com/org/repo)"
  type        = string
}

variable "github_branch" {
  description = "Branch to deploy from for the Static Web App"
  type        = string
  default     = "main"
}

variable "github_token" {
  description = "GitHub personal access token for Static Web Apps deployment (needs repo scope)"
  type        = string
  sensitive   = true
}
