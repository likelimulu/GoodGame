# GoodGame — Frontend

React 19 + TypeScript + Vite frontend for the GoodGame gaming discussion platform.

## Development

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server at http://localhost:5173
npm run build     # Production build (type-check + bundle)
npm run lint      # ESLint
npm run format    # Prettier
```

The dev server proxies `/api` and `/media` to `http://localhost:8000` by default.  
Set `VITE_API_TARGET=http://api:8000` when running inside Docker.

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
  components/   # Shared UI: Layout, VoteControls, TagEditor, PostComments, Spinner, ErrorBoundary
  context/      # AuthContext + useAuth hook, ToastContext
  pages/        # Route-level page components
  test/         # Unit tests and Vitest setup
```
