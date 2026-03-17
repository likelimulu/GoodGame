# Docker Setup

## Overview

| File                       | Description                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Dockerfile.django.dev`    | Django dev image — Python 3.14 slim, installs `uv`, `ty`, `ruff`, `git`, `gh`; serves on port 8000                                                           |
| `Dockerfile.react.dev`     | React dev image — Node.js 25.8 Alpine, installs `git`, `curl`, `gh`; runs `npm install` at build time; serves on port 5173                                   |
| `../docker-compose.yml`    | Orchestrates both containers on `goodgame-network`; `frontend` waits for `api` health check                                                                  |
| `../.devcontainer/django/` | VS Code Dev Container for backend — attaches to `api`, installs Python/Ruff/Ty/Docker/Claude extensions, auto-runs migrations via `postCreateCommand`        |
| `../.devcontainer/react/`  | VS Code Dev Container for frontend — attaches to `frontend`, installs ESLint/Prettier/Claude extensions, runs `npm run dev -- --host` via `postStartCommand` |

## Prerequisites

- Docker + Docker Compose
- (Optional) VS Code with Dev Containers extension

## Quick Start

```bash
docker-compose up --build

# Frontend:     http://localhost:5173
# Django API:   http://localhost:8000/api
# Django Admin: http://localhost:8000/admin
```

The frontend waits for the Django API health check before starting.

## First Time Setup

```bash
# 1. Build and start
docker-compose up --build

# 2. Run migrations
docker-compose exec api python manage.py migrate

# 3. Create a superuser (optional)
docker-compose exec api python manage.py createsuperuser
```

> When using VS Code Dev Containers, the Django `postCreateCommand` runs migrations automatically.

## VS Code Dev Containers

Open Command Palette → "Dev Containers: Reopen in Container", then select:

- **GoodGame Django** (`.devcontainer/django/`) — backend work
- **GoodGame React** (`.devcontainer/react/`) — frontend work

**Dependency changes:** After modifying `requirements.txt` or `package.json`, use Command Palette → "Dev Containers: Rebuild Container" to re-run Dockerfile steps.

## Common Commands

### Django

```bash
docker-compose exec api python manage.py makemigrations
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py shell
docker-compose exec api python manage.py test

docker-compose exec api ty check .
docker-compose exec api ruff check .
docker-compose exec api ruff format .
```

### React

```bash
docker-compose exec frontend npm install <package>
docker-compose exec frontend npm run lint
docker-compose exec frontend npm run format
docker-compose exec frontend npm run build
```

### General

```bash
docker-compose up              # start
docker-compose up -d           # start detached
docker-compose down            # stop
docker-compose logs -f api
docker-compose logs -f frontend
```

## Development Workflow

Both services support hot reload - no container restart needed for code changes.

- **Django**: dev server watches for Python file changes
- **React**: Vite HMR updates the browser instantly on save

## Database

SQLite (`db.sqlite3`) is used for development and persisted on the host, so data survives container restarts.

## Tools

| Container | Tools                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Django    | `uv` (package manager), `ty` (type checker), `ruff` (linter/formatter) |
| React     | Node.js 25.8, Vite (HMR), TypeScript, ESLint, Prettier, Tailwind CSS   |

## Troubleshooting

**Port already in use:**

```bash
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

**Frontend stuck waiting for API:** Check API logs - the frontend won't start until the health check passes.

```bash
docker-compose logs -f api
```

**Reset database:**

```bash
docker-compose down
rm db.sqlite3
docker-compose up -d
docker-compose exec api python manage.py migrate
```

**Rebuild from scratch:**

```bash
docker-compose down -v
docker-compose up --build
```
