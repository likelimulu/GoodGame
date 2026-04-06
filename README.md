# GoodGame

A gaming discussion platform where players can post, discuss, and organize conversations around specific games. Built by NYU Software Engineering I — Team 05.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Backend | Django, Django Ninja (REST API) |
| Auth | Django session-based authentication |
| Database | SQLite (dev) |
| Containerization | Docker + Docker Compose |

## Features

- **Accounts** — Sign up, log in with optional 30-day persistent sessions
- **Game Hubs** — Discussions organized by game
- **Posts** — Create, edit, and delete posts with draft/publish workflow
- **Tags** — Add up to 5 tags per post, auto-normalized on input
- **Protected routes** — Create/edit pages require authentication

## Getting Started

### With Docker Compose (both services)

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api

### With VS Code Dev Containers (recommended for development)

Open the repo in VS Code and choose a dev container:

- **Django** — `.devcontainer/django/devcontainer.json`: auto-installs deps, runs migrations, exposes port 8000
- **React** — `.devcontainer/react/devcontainer.json`: auto-starts Vite dev server on port 5173

### Manual Setup

**Backend** (from `backend/`):
```bash
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signup` | Create account |
| POST | `/api/auth/login` | Log in (supports `remember_me`) |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/gamehubs` | List all game hubs |
| POST | `/api/posts` | Create a post |
| GET | `/api/posts` | List posts (filter by `game_hub_id`, `status`) |
| GET | `/api/posts/{id}` | Get a single post |
| PUT | `/api/posts/{id}` | Update a post (author only) |
| DELETE | `/api/posts/{id}` | Soft-delete a post (author only) |

## Development

**Backend:**
```bash
python manage.py test        # Run tests
ruff check . && ruff format . # Lint and format
ty check .                   # Type check
python manage.py makemigrations && python manage.py migrate  # Apply migrations
```

**Frontend:**
```bash
npm run lint     # ESLint
npm run format   # Prettier
npm run build    # Production build
```

## Project Structure

```
backend/
  config/       # Django settings, root URLs
  GoodGame/     # Models, views, schemas, tests, signals
frontend/
  src/
    api/        # Fetch client and TypeScript types
    components/ # Layout, TagEditor
    context/    # Auth context and hook
    pages/      # Login, Signup, CreatePost, EditPost
  mockups/      # Static HTML/CSS reference designs
docker/         # Dockerfiles
.devcontainer/  # VS Code Dev Container configs
```
