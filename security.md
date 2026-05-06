# GoodGame Backend — Security Review Notes

**Reviewed:** 2026-05-05  
**Scope:** `backend/` Django app, Docker configuration, environment files

---

## Status

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| C-1 | Critical | All API endpoints CSRF-exempt | Pending — see notes |
| C-2 | Critical | `seed_test_users` runs in production entrypoint | Pending |
| C-3 | Critical | Placeholder `SECRET_KEY` in live `.env` | Pending |
| C-4 | Critical | Hardcoded DB password in `docker-compose.yml` | Pending |
| H-1 | High | No rate limiting on login / signup | Pending — see notes |
| H-2 | High | Unauthenticated access to draft/deleted posts | **Fixed** |
| H-3 | High | File uploads accept any type and size | **Fixed** |
| H-4 | High | Password validators bypassed at signup | Pending |
| H-5 | High | Swagger UI exposed in production | Pending |
| H-6 | High | No input length limits on signup/post schemas | Pending |
| H-7 | High | Tag names hit DB with no length validation | Pending |
| M-1 | Medium | Security headers not configured | Pending |
| M-2 | Medium | `email` field accepts non-email strings | Pending |
| M-3 | Medium | Login does not check `email_verified` | Pending |
| M-4 | Medium | `ALLOWED_HOSTS` default includes `0.0.0.0` | Pending |
| M-5 | Medium | `get_post` leaks existence of deleted posts | Pending |
| M-6 | Medium | Moderators can review their own posts | Pending |
| M-7 | Medium | Gunicorn has no worker timeout | Pending |
| M-8 | Medium | `db.sqlite3` exists on disk | Pending |
| M-9 | Medium | Reputation threshold of 5 is trivially gamed | Pending |
| L-1 | Low | `DEBUG=True` in live `.env` | Pending |
| L-2 | Low | No audit logging configured | Pending |
| L-3 | Low | Verification emails fail silently | Pending |
| L-4 | Low | `collectstatic \|\| true` in prod Dockerfile | Pending |
| L-5 | Low | Django 4.2 LTS reaching EOL | Pending |
| L-6 | Low | Dev tooling installed in Docker image | Pending |

---

## Fixed

### H-2 — Unauthenticated access to draft/deleted posts
**File:** `backend/GoodGame/views.py`

`list_posts` accepted a raw `?status=` query param and passed it directly to the ORM filter. Any caller (including unauthenticated users) could pass `?status=draft` or `?status=deleted` to retrieve hidden posts from all users.

**Fix:** The public (non-`mine`) path now hardcodes `Post.Status.PUBLISHED`, ignoring the `status` param entirely.

---

### H-3 — File uploads accept any type and size
**File:** `backend/GoodGame/views.py`

Avatar uploads had no size limit. Comment attachments had no size limit and accepted any file type, including executables and scripts. Filenames were passed to storage unsanitized.

**Fix:**
- Added `_validate_upload()` helper that checks file size and extension before saving.
- Avatar: rejects files over 2 MB.
- Comment attachments: rejects files over 5 MB and restricts extensions to `.jpg`, `.jpeg`, `.png`, `.gif`.
- Filenames sanitized via `django.utils.text.get_valid_filename` on both endpoints.
- `update_avatar` response schema updated to include `400`.

---

## Pending — Notes

### C-1 — All API endpoints are CSRF-exempt (Critical)

**The problem:**  
Django-Ninja marks every route `csrf_exempt` at the Django middleware level. The app uses session cookies for authentication (`SESSION_COOKIE_SAMESITE = "None"` in production). This means any page on the internet can make authenticated state-changing requests on behalf of a logged-in user with no CSRF token required.

**The naive fix:**  
```python
# config/urls.py
from ninja.security import django_auth
api = NinjaAPI(auth=django_auth)
```

**Why this would break the cloud deployment immediately:**  
The frontend (`frontend/src/api/client.ts`) sends `credentials: "include"` but **never sends a CSRF token** — there is no `X-CSRFToken` header anywhere in the request helper. Additionally, `CSRF_COOKIE_SAMESITE` is not configured (defaults to `"Lax"`), so the CSRF cookie is not readable cross-origin even if the frontend tried to use it.

Applying `django_auth` globally would also make all currently-public routes (GET `/posts`, `/gamehubs`, `/tags`) return 401 unless each is explicitly marked `auth=None`.

**What a proper fix requires (both frontend and backend, deployed together):**

Backend:
- Set `CSRF_COOKIE_SAMESITE = "None"` and `CSRF_COOKIE_SECURE = True` in `settings.py`
- Mark all public routes with `auth=None` explicitly
- Expose a lightweight endpoint (or use `django.views.decorators.csrf.ensure_csrf_cookie`) for the frontend to call on app load to receive the CSRF cookie

Frontend (`client.ts`):
- On app load, call the CSRF-cookie-setting endpoint
- Read the `csrftoken` cookie value
- Attach `X-CSRFToken: <value>` header to every POST, PUT, and DELETE request

This is a coordinated frontend + backend change. It should be its own PR and tested end-to-end in the dev environment before merging to `main`.

---

### H-1 — No rate limiting on login / signup (High)

**The problem:**  
`/signup` and `/api/auth/login` have no throttle. Unlimited password attempts and account creation are possible.

**The fix:**  
Django-Ninja 1.5+ has built-in `AnonRateThrottle`. Applied per-operation:
```python
from ninja.throttling import AnonRateThrottle

@router.post("/signup", response={...}, throttle=[AnonRateThrottle("20/minute")])
@router.post("/auth/login", response={...}, throttle=[AnonRateThrottle("20/minute")])
```

**CI/CD concern:**  
The Django test suite makes 23 calls to `/auth/login` or `/signup`, all from `127.0.0.1`. Django-Ninja throttle uses `django.core.cache.cache` (defaults to `LocMemCache`), which is **not cleared between `TestCase` classes**. All 23 calls share a single throttle bucket, so a limit below 23/minute will cause later test methods to receive 429s and fail — blocking the CI deploy gate.

Options:
1. Use a `DummyCache` backend in CI (GitHub Actions sets `CI=true`) so the throttle bucket is never written.
2. Clear the cache in the auth test class `setUp`/`tearDown`.
3. Set the limit high enough (e.g. `60/minute`) that the test suite never hits it — 60/min still blocks automated brute-force while being well above what tests generate.
