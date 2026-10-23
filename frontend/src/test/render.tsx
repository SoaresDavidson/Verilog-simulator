import { render } from '@testing-library/react'
import App from '../App'
import type { SessionState } from '../state/session'
import { createFetchMock, TEST_BASE_URL, type FetchMock } from './http'

export interface RenderAppOptions {
  initialState?: SessionState
  fetch?: FetchMock | typeof fetch
}

/** Renderiza a aplicação completa com fetch falso e URL base de teste. */
export function renderApp({ initialState, fetch = createFetchMock() }: RenderAppOptions = {}) {
  const result = render(<App initialState={initialState} fetch={fetch} baseUrl={TEST_BASE_URL} />)
  return { ...result, fetch }
}
