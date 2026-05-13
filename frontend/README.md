# GoodGame — Frontend

React 19 + TypeScript + Vite frontend for the GoodGame gaming discussion platform.

## Development

Use a current Node/npm version compatible with Vite 7. The Docker dev image uses Node.js 25.8.

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server at http://localhost:5173
npm run build     # Production build (type-check + bundle)
npm run preview   # Preview the production build locally
npm run lint      # ESLint
npm run format    # Prettier
```

### Environment variables

- **`VITE_API_TARGET`** (dev only) — backend URL the Vite dev server proxies `/api` and `/media` to. Defaults to `http://localhost:8000`. Set to `http://api:8000` when running inside Docker Compose.
- **`VITE_API_URL`** (production build) — backend origin the bundled app uses for API calls directly, for example `https://goodgame-api.example.azurecontainerapps.io`. `src/api/client.ts` appends `/api` to this value. Leave unset for local dev so requests stay same-origin via the proxy.

## API client

Use `src/api/client.ts` for backend calls. Callers pass paths without `/api` (`api.get("/posts")`), and the client adds session credentials to every request. JSON bodies are serialized automatically; `FormData` is sent as multipart for avatar/comment uploads.

## Routes

| Path | Page |
|---|---|
| `/posts`, `/my-posts` | Feed and authenticated user's posts |
| `/posts/create`, `/posts/:postId/edit`, `/posts/:postId` | Post create/edit/detail |
| `/search`, `/notifications`, `/content-rules`, `/verify-email` | Supporting app pages |
| `/admin/moderator-requests` | Admin-only moderator request review |
| `/moderator` | Moderator workspace |
| `/developer` | Developer feedback portal |

## Testing

Tests use **Vitest** + **React Testing Library** with a jsdom environment.

```bash
npm test                 # Run all tests once
npm run test:watch       # Watch mode — re-runs on file changes
npm run test:coverage    # Run tests and generate a coverage report
```

Test files live in `src/test/`. Each file targets a specific unit:

| File | Covers |
|---|---|
| `VoteControls.test.tsx` | Upvote/downvote rendering, click handlers, active state, busy disabling |
| `TagEditor.test.tsx` | Add/remove tags, Enter key, normalization, 5-tag limit, duplicate prevention |
| `apiClient.test.ts` | `isNetworkError` guard, fetch success/failure, FormData, credentials, AbortError |

## Project Structure

```
src/
  api/          # Typed fetch client and backend response types
  components/   # Shared UI: Layout, VoteControls, TagEditor, PostComments, SearchableHubSelect, Spinner, ErrorBoundary
  context/      # AuthContext + useAuth hook, ToastContext
  pages/        # Route-level page components (error/ holds 404 and generic error pages)
  test/         # Unit tests and Vitest setup
```
