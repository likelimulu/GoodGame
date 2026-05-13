# GoodGame

A gaming discussion platform where players can post, discuss, and organize conversations around specific games. Built by NYU Software Engineering I — Team 05.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7 |
| Backend | Django 4.2, Django Ninja (REST API) |
| Auth | Django session-based authentication (cookies) |
| Database | PostgreSQL 16 |
| Media storage | Local disk (dev) / Azure Blob Storage (prod) |
| Containerization | Docker + Docker Compose |
| Deploy | Azure Container Apps (API), Static Web Apps (frontend), Container Registry, Postgres Flexible Server |

## Features

- **Accounts & auth** — Sign up, email verification, log in with optional 30-day persistent sessions, profile avatar upload
- **Roles** — `contributor` (default), `moderator`, `developer`, `admin`; users may request moderator access for admin review
- **Game Hubs** — Discussions organized by game; developers can be assigned to hubs, with each developer limited to one hub
- **Posts** — Create, edit, soft-delete posts with draft/publish workflow, developer pinning, question/spoiler flags
- **Tags** — Up to 5 per post, auto-normalized; tag suggestions endpoint
- **Comments** — Flat discussion under posts with optional image attachments
- **Voting & reputation** — Upvote/downvote posts; author `reputation_score` recalculated automatically; trusted users (`reputation_score >= 5`) unlock advanced feed filters
- **Moderation** — Users can report posts/comments; moderators and admins warn/remove/escalate/dismiss with audit trail and recipient notifications
- **Developer feedback** — Players submit feedback to a game's assigned developer; developers see a per-hub feedback queue
- **Notifications** — In-app notifications for moderation actions
- **Search** — Cross-entity search across posts, hubs, tags, and users
- **Protected routes** — Auth-gated pages on the frontend, role-gated pages for admin/moderator/developer

## Getting Started

### With Docker Compose (recommended)

Brings up Postgres, the Django API (with migrations + seed data), and the Vite frontend.

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- Django admin: http://localhost:8000/admin
- Postgres: `db:5432` inside the `goodgame-network` (not exposed on the host by default)

You'll need a `backend/.env`. Copy `backend/.env.example`; keep `POSTGRES_HOST=db` for Docker Compose, or use `POSTGRES_HOST=localhost` for a manually started host Postgres.

### With VS Code Dev Containers

Open the repo in VS Code and choose a dev container:

- **Django** — `.devcontainer/django/devcontainer.json`: auto-installs deps, runs migrations, exposes port 8000
- **React** — `.devcontainer/react/devcontainer.json`: auto-starts Vite dev server on port 5173

### Manual Setup

Manual setup assumes Python with `uv` available for the backend and Node/npm for the frontend. CI and the production image use Python 3.12.

**Backend** (from `backend/`):

1. Start a Postgres 16 instance and create a database. Easiest:
   ```bash
   docker run -d --name goodgame-postgres \
     -p 5432:5432 \
     -e POSTGRES_DB=goodgame \
     -e POSTGRES_USER=goodgameadmin \
     -e POSTGRES_PASSWORD=localpass123 \
     postgres:16
   ```
2. Copy `backend/.env.example` to `backend/.env` and set at minimum:
   ```
   SECRET_KEY=dev-secret-key
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
   POSTGRES_DB=goodgame
   POSTGRES_USER=goodgameadmin
   POSTGRES_PASSWORD=localpass123
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   FRONTEND_URL=http://localhost:5173
   ```
3. Install dependencies, migrate, seed, and run:
   ```bash
   uv venv && source .venv/bin/activate
   uv pip install -r requirements.txt
   python manage.py migrate
   python manage.py seed_hubs
   python manage.py seed_tags
   python manage.py seed_test_users      # optional — dev-only test accounts
   python manage.py runserver
   ```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/media` to `VITE_API_TARGET` (default `http://localhost:8000`).

### Seeded Development Accounts

`docker-compose up` runs `seed_hubs`, `seed_test_users`, and `seed_tags`. Manual setup can run the same commands. Test users include `test_contributor_1`, `test_moderator_1`, `test_developer_nintendo`, and `test_admin_1`; all use password `TestPass123!`.

## API Endpoints

All routes are mounted under `/api/`. Authentication is session-cookie based — pass `credentials: "include"` from the browser. Interactive OpenAPI docs are available at http://localhost:8000/api/docs when the backend is running.

### Auth & accounts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signup` | Create account; sends verification email |
| POST | `/api/auth/login` | Log in (supports `remember_me` for 30-day session) |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/verify-email` | Confirm email with token from verification link |
| POST | `/api/auth/resend-verification` | Resend the verification email |
| PUT | `/api/users/me/avatar` | Upload profile picture (multipart) |
| PUT | `/api/users/{id}/role` | Admin-only: change a user's role |

### Moderator access requests
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/me/moderator-request` | Apply for moderator role |
| GET | `/api/moderator-requests` | Admin-only: list pending requests |
| PUT | `/api/moderator-requests/{id}` | Admin-only: approve / reject |

### Game hubs & tags
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gamehubs` | List all game hubs |
| GET | `/api/tags` | List all tags |
| GET | `/api/tags/suggest` | Suggest tags for a draft post |
| GET | `/api/search` | Cross-entity search (posts/hubs/tags/users); query with `q` |

### Posts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/posts` | Create a post |
| GET | `/api/posts` | List posts (filter by `game_hub_id`, `status`, `mine`; trusted users can also use `sort_by`, `tag`, `author`, `date_from`, `date_to`) |
| GET | `/api/posts/{id}` | Get a single post |
| PUT | `/api/posts/{id}` | Update a post (author only) |
| DELETE | `/api/posts/{id}` | Soft-delete a post (author only) |
| PUT | `/api/posts/{id}/pin` | Pin / unpin (developer assigned to the post's hub) |
| PUT | `/api/posts/{id}/vote` | Cast or change a vote |

### Comments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/posts/{id}/comments` | List comments on a post |
| POST | `/api/posts/{id}/comments` | Add a comment (optional file attachment) |

### Reports & moderation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/posts/{id}/reports` | Report a post |
| POST | `/api/comments/{id}/reports` | Report a comment |
| GET | `/api/moderation/queue` | Moderator/admin workspace queue; optional `status` filter |
| POST | `/api/moderation/posts/{id}/actions` | Warn / remove / escalate / dismiss a post report |
| POST | `/api/moderation/comments/{id}/actions` | Warn / remove / escalate / dismiss a comment report |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List the current user's notifications |
| POST | `/api/notifications/{id}/read` | Mark a notification as read |

### Developer feedback
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/gamehubs/{id}/feedback` | Submit feedback to a hub's developer |
| GET | `/api/developer/gamehubs` | Developer-only: hubs the user owns |
| GET | `/api/developer/feedback` | Developer-only: feedback queue; optional `game_hub_id`, `date_from`, `date_to` filters |

## Managing Developer Roles & Game Hubs

The "Developer Feedback" feature requires two things on a user before they can see player feedback:

1. Their `UserProfile.role` must be `developer`
2. They must be added to a `GameHub.developers` set for the game they own (a developer may only be assigned to **one** hub — enforced by a signal)

### Option A — Django Admin (recommended)

1. Create a superuser if you haven't already:
   ```bash
   python manage.py createsuperuser
   ```
2. Run the dev server (`python manage.py runserver`) and log in at http://localhost:8000/admin/
3. **Promote a user to developer:** *User profiles* → pick the user → change *Role* to `Developer` → Save
4. **Assign the developer to a game:** *Game hubs* → pick the game → in the *Developers* picker, move the user from the left pane to the right pane → Save

The user will now see that hub in the Feedback Queue dropdown on `/developer` and start receiving feedback submitted from that hub's post page.

### Option B — Django Shell

```bash
python manage.py shell
```

```python
from django.contrib.auth.models import User
from GoodGame.models import GameHub, UserProfile

# 1. Promote a user to developer
dev = User.objects.get(username="alice")
dev.profile.role = UserProfile.Role.DEVELOPER
dev.profile.save()

# 2. Assign them to a game hub
hub = GameHub.objects.get(slug="pokemon")
hub.developers.add(dev)

# (To remove them later)
hub.developers.remove(dev)
```

### Listing what exists

```bash
# All hubs (id, slug, name)
python manage.py shell -c "from GoodGame.models import GameHub; [print(h.id, h.slug, h.name) for h in GameHub.objects.all()]"

# Or via the public API
curl http://localhost:8000/api/gamehubs
```

## Development

**Backend** (from `backend/`):
```bash
python manage.py test                # Run all tests
python manage.py test GoodGame.tests.SomeClass.test_method   # Run one test
ruff check . && ruff format .        # Lint and format
ty check .                           # Type check
python manage.py makemigrations && python manage.py migrate  # Apply migrations
python manage.py seed_hubs && python manage.py seed_tags      # Seed baseline data
python manage.py seed_test_users                             # Seed dev-only role accounts
```

**Frontend** (from `frontend/`):
```bash
npm run lint             # ESLint
npm run format           # Prettier
npm run build            # Production build
npm test                 # Run all tests once
npm run test:watch       # Watch mode — re-runs on file changes
npm run test:coverage    # Run tests with coverage report
```

## Project Structure

```
backend/
  config/                # Django settings, root URLs (mounts the Ninja API)
  GoodGame/
    models.py            # All domain models in one file
    schemas.py           # Pydantic/Ninja request and response schemas
    views.py             # All API routes on a single Ninja router
    signals.py           # Auto-create UserProfile, recalc reputation on votes
    admin.py             # Django admin registrations for core models
    tests.py             # Django test suite
    management/commands/ # seed_hubs, seed_tags, seed_test_users
frontend/
  src/
    api/                 # Fetch client and TypeScript types (mirror of schemas.py)
    components/          # Layout, TagEditor, VoteControls, PostComments, etc.
    context/             # AuthContext, ToastContext
    pages/               # One component per route (posts, search, moderator, developer, …)
    test/                # Vitest specs
  mockups/               # Static HTML/CSS reference designs
docker/                  # Dev and prod Dockerfiles, entrypoint
infra/                   # Terraform for Azure deployment
.devcontainer/           # VS Code Dev Container configs
.github/workflows/       # CI: tests, build, push to ACR, deploy to Azure
```
