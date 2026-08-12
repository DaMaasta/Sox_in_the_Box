// API-Client ersetzt firebase.ts — alle Anfragen gehen an den eigenen Backend-Server

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

function getToken(): string | null {
  return localStorage.getItem('kistle_token');
}

export function setToken(token: string): void {
  localStorage.setItem('kistle_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('kistle_token');
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  formData?: FormData
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !formData) headers['Content-Type'] = 'application/json';

  const maxAttempts = method === 'GET' ? 3 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: formData ?? (body ? JSON.stringify(body) : undefined),
      });

      if (res.status === 401) {
        clearToken();
        window.location.reload();
        throw new ApiError(401, 'Session abgelaufen');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
      return data as T;
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      if (err instanceof ApiError && err.status < 500) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }

  throw new Error('unreachable');
}

async function fetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  return res.blob();
}

export const api = {
  get:    <T>(path: string)                       => request<T>('GET', path),
  post:   <T>(path: string, body: unknown)        => request<T>('POST', path, body),
  put:    <T>(path: string, body: unknown)        => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown)       => request<T>('DELETE', path, body),
  upload: <T>(path: string, formData: FormData)   => request<T>('POST', path, undefined, formData),
  blob:   (path: string)                          => fetchBlob(path),
};
