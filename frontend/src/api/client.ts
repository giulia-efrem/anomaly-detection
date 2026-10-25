export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') message = body.detail
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg
  } catch {
    // not JSON; keep the status text
  }
  return new ApiError(res.status, message)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running on port 8000?')
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}

/**
 * MJPEG streams hold their HTTP connection open, and browsers allow only six
 * connections per host. Each camera therefore streams from its own
 * `<id>.localhost` host name (browsers resolve these to this machine), straight
 * from the backend instead of through the dev server proxy.
 */
export function streamSrc(camera: { id: string; stream_url: string }): string {
  const host = window.location.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
  const origin = local ? `http://${camera.id}.localhost:8000` : `${window.location.protocol}//${host}:8000`
  return origin + camera.stream_url
}
