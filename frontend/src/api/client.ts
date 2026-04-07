/**
 * Lightweight API client for the GoodGame backend.
 *
 * Features:
 *  - Automatic JSON serialisation / deserialisation
 *  - `credentials: "include"` on every request (session cookies)
 *  - Graceful handling of network failures & non-JSON responses
 *  - AbortSignal support for cancellable requests
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  /** HTTP status code (0 when the request never reached the server). */
  status: number;
  data: T;
}

/** Sentinel returned when the browser cannot reach the server at all. */
export interface NetworkError {
  error: string;
  isNetworkError: true;
}

// ── Type guard ───────────────────────────────────────────────────────────────

/** Check whether an API response carries a network-level error. */
export function isNetworkError(value: unknown): value is NetworkError {
  return (
    typeof value === "object" &&
    value !== null &&
    "isNetworkError" in value &&
    (value as NetworkError).isNetworkError === true
  );
}

// ── Internal request helper ──────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const isFormData = body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers:
        body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {},
      body:
        body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  } catch (err: unknown) {
    // AbortError should be re-thrown so callers can ignore it via .catch()
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    // Network failure (offline, DNS, CORS blocked, etc.)
    return {
      status: 0,
      data: {
        error: "Unable to reach the server. Please check your connection and try again.",
        isNetworkError: true,
      } as unknown as T,
    };
  }

  // The server may occasionally return non-JSON (e.g. 502 HTML error page).
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      status: res.status,
      data: {
        error: `Unexpected response (${res.status}). Please try again later.`,
        isNetworkError: true,
      } as unknown as T,
    };
  }

  const data: T = await res.json();
  return { status: res.status, data };
}

// ── Public API ───────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>("GET", path, undefined, signal),

  post: <T>(path: string, body: unknown) =>
    request<T>("POST", path, body),

  put: <T>(path: string, body: unknown) =>
    request<T>("PUT", path, body),

  delete: <T>(path: string) =>
    request<T>("DELETE", path),
};
