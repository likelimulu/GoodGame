import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, isNetworkError } from '../api/client';

describe('isNetworkError', () => {
  it('returns true for a network error object', () => {
    expect(isNetworkError({ error: 'fail', isNetworkError: true })).toBe(true);
  });

  it('returns false for a normal API response object', () => {
    expect(isNetworkError({ error: 'Unauthorized' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isNetworkError('error')).toBe(false);
  });
});

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockJsonResponse(status: number, body: unknown) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status,
      headers: { get: () => 'application/json' },
      json: async () => body,
    });
  }

  function mockNetworkFailure() {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
  }

  function mockNonJsonResponse(status: number) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status,
      headers: { get: () => 'text/html' },
    });
  }

  it('returns parsed JSON on a successful GET', async () => {
    mockJsonResponse(200, { id: 1, username: 'alice' });
    const result = await api.get('/users/1');
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 1, username: 'alice' });
  });

  it('returns status 0 and a network error when fetch throws', async () => {
    mockNetworkFailure();
    const result = await api.get('/users/1');
    expect(result.status).toBe(0);
    expect(isNetworkError(result.data)).toBe(true);
  });

  it('returns a network error for non-JSON responses', async () => {
    mockNonJsonResponse(500);
    const result = await api.get('/users/1');
    expect(result.status).toBe(500);
    expect(isNetworkError(result.data)).toBe(true);
  });

  it('sends JSON body on POST', async () => {
    mockJsonResponse(201, { id: 42 });
    await api.post('/posts', { title: 'Hello' });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Hello' }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends FormData without Content-Type header', async () => {
    mockJsonResponse(201, { id: 1 });
    const form = new FormData();
    form.append('file', new Blob(['data']), 'test.txt');
    await api.post('/upload', form);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBe(form);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('includes credentials on every request', async () => {
    mockJsonResponse(200, {});
    await api.get('/me');
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('re-throws AbortError so callers can detect cancellation', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    await expect(api.get('/me')).rejects.toThrow('Aborted');
  });
});
