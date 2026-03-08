# Docker Setup

This directory contains Docker configuration for the GoodGame Django application.

## Overview

The Docker setup consists of three key files that work together:

1. **[Dockerfile.django.dev](Dockerfile.django.dev)** - Defines the Django development container image
   - Based on Python 3.14 slim image
   - Installs development tools: `uv` (package manager), `ty` (type checker), `ruff` (linter/formatter), `git`, and `gh` (GitHub CLI)
   - Sets up the `/app` working directory
   - Installs Python dependencies from `requirements.txt`
   - Exposes port 8000 and runs Django development server

2. **[docker-compose.yml](../docker-compose.yml)** - Orchestrates the container setup
   - Builds the image using `Dockerfile.django.dev`
   - Mounts the entire project directory (`.:/app`) for hot reload functionality
   - Forwards port 8000 to the host
   - Sets `DEBUG=1` environment variable
   - Creates a `goodgame-network` bridge network

3. **[.devcontainer/devcontainer.json](../.devcontainer/devcontainer.json)** - VS Code Dev Container configuration
   - References `docker-compose.yml` to use the same container definition
   - Installs VS Code extensions: Python, Ruff, Ty, Docker, and Claude Code
   - Configures Python tools (Ruff as formatter, organize imports on save)
   - Forwards port 8000 with label "Django Server"
   - Runs `postCreateCommand` to create a virtual environment at `/app/.venv`, install dependencies, and run migrations
   - Opens a bash terminal on attach

You can use either:
- **Standard Docker workflow**: `docker-compose up` (see Quick Start below)
- **VS Code Dev Containers**: Open in VS Code and select "Reopen in Container"

## Prerequisites

- Docker
- Docker Compose
- (Optional) VS Code with Dev Containers extension for integrated development

## Quick Start

```bash
# Build and start the containers
docker-compose up --build

# Access the application at http://localhost:8000
```

## First Time Setup

```bash
# 1. Build and start containers
docker-compose up --build

# 2. In a new terminal, run migrations
docker-compose exec django python manage.py migrate

# 3. Create a superuser (optional)
docker-compose exec django python manage.py createsuperuser

# 4. Access the application
# - API: http://localhost:8000/api
# - Admin: http://localhost:8000/admin
```

## Common Commands

```bash
# Start containers
docker-compose up

# Start in detached mode (background)
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker-compose logs -f django

# Run Django commands
docker-compose exec django python manage.py <command>

# Examples:
docker-compose exec django python manage.py makemigrations
docker-compose exec django python manage.py migrate
docker-compose exec django python manage.py shell

# Access Django shell
docker-compose exec django python manage.py shell

# Run tests
docker-compose exec django python manage.py test

# Type checking with ty
docker-compose exec django ty check .

# Linting with ruff
docker-compose exec django ruff check .
docker-compose exec django ruff format .
```

## Development Workflow

The setup includes hot reload - code changes are automatically reflected without restarting containers.

1. Make changes to your Python files
2. Save the file
3. Django dev server automatically reloads

## Database

The project uses SQLite for development. The database file (`db.sqlite3`) is persisted on your host machine, so data survives container restarts.

## Tools Included

- **uv**: Fast Python package manager
- **ty**: Type checker
- **ruff**: Linter and formatter

## Troubleshooting

### Port already in use
```bash
# Stop any process using port 8000
lsof -ti:8000 | xargs kill -9
```

### Reset database
```bash
# Stop containers
docker-compose down

# Delete database file
rm db.sqlite3

# Start and run migrations
docker-compose up -d
docker-compose exec django python manage.py migrate
```

### Rebuild from scratch
```bash
# Remove containers, volumes, and rebuild
docker-compose down -v
docker-compose up --build
```
