interface ApiResponse<T> {
  status: number;
  data: T;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const isFormData = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers:
      body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {},
    body:
      body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    signal,
  });
  const data: T = await res.json();
  return { status: res.status, data };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
