import { vi, type Mock } from 'vitest'

export const TEST_BASE_URL = 'http://api.test/api/v1'

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type FetchMock = Mock<typeof fetch>

/** `fetch` falso; configure com `mockResolvedValueOnce(jsonResponse(...))`. */
export function createFetchMock(): FetchMock {
  return vi.fn<typeof fetch>()
}

/** Extrai método, URL e headers da n-ésima chamada. */
export function fetchCall(mock: FetchMock, index = 0) {
  const [input, init] = mock.mock.calls[index]
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: init?.body,
    signal: init?.signal ?? undefined,
  }
}

/** `fetch` que respeita o AbortSignal e nunca resolve sozinho. */
export function pendingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
}
