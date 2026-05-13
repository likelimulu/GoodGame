# Docker Setup

## Overview

| File                       | Description                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Dockerfile.django.dev`    | Django dev image — Python 3.14 slim, installs `uv`, `ty`, `ruff`, `git`, `gh`; serves on port 8000                                                           |
| `Dockerfile.django.prod`   | Django production image — Python 3.12 slim, runs `gunicorn`; built by CI and deployed to Azure Container Apps                                                |
| `Dockerfile.react.dev`     | React dev image — Node.js 25.8 Alpine, installs `git`, `curl`, `gh`; runs `npm install` at build time; serves on port 5173                                   |
| `entrypoint.sh`            | Production entrypoint — runs `migrate`, `seed_test_users`, `seed_tags`, then launches `gunicorn`                                                             |
| `../docker-compose.yml`    | Orchestrates `db` (Postgres 16), `api`, and `frontend` on `goodgame-network`; `frontend` waits for `api` health check, `api` waits for `db` health check     |
| `../.devcontainer/django/` | VS Code Dev Container for backend — attaches to `api`, installs Python/Ruff/Ty/Docker/Claude extensions, auto-runs migrations via `postCreateCommand`        |
| `../.devcontainer/react/`  | VS Code Dev Container for frontend — attaches to `frontend`, installs ESLint/Prettier/Claude extensions, runs `npm run dev -- --host` via `postStartCommand` |

## Prerequisites

- Docker + Docker Compose
- A `backend/.env` file (the `api` service mounts it as `env_file`). Copy `backend/.env.example`; for Compose keep `POSTGRES_HOST=db`.
- (Optional) VS Code with Dev Containers extension

## Quick Start

```bash
docker-compose up --build

# Frontend:     http://localhost:5173
# Django API:   http://localhost:8000/api
# Django Admin: http://localhost:8000/admin
```

Startup order: `db` → `api` (runs `migrate` + `seed_hubs` + `seed_test_users` + `seed_tags`) → `frontend` (waits for the API health check).

## First Time Setup

`docker-compose up --build` already runs `migrate` and the seed commands automatically — there is nothing extra to do. The seeded role accounts all use password `TestPass123!`; examples include `test_contributor_1`, `test_moderator_1`, `test_developer_nintendo`, and `test_admin_1`.

To create a separate Django admin login:

```bash
docker-compose exec api python manage.py createsuperuser
```

> When using VS Code Dev Containers, the Django `postCreateCommand` runs migrations automatically.

## Production Image Note

`Dockerfile.django.prod` runs `/entrypoint.sh`, which currently seeds `test_*` users before Gunicorn starts. That matches the current file, but remove `python manage.py seed_test_users` from `docker/entrypoint.sh` before treating the deployment as real production.

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
docker-compose exec api python manage.py seed_hubs
docker-compose exec api python manage.py seed_tags
docker-compose exec api python manage.py seed_test_users

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

PostgreSQL 16 runs as the `db` service. Data is persisted in the `postgres_data` named volume, so it survives container restarts. Default credentials (from `docker-compose.yml`): database `goodgame`, user `goodgameadmin`, password `localpass123`. The DB is reachable from other containers as host `db:5432` on the `goodgame-network`; it is **not** published to the host by default.

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

**Reset database:** drop the `postgres_data` volume. The `api` container will re-run migrations and seeds on next start.

```bash
docker-compose down -v
docker-compose up --build
```

**Rebuild from scratch:**

```bash
docker-compose down -v
docker-compose up --build
```
