import { useEffect, useRef } from 'react'
import { useApi } from '../../api/context'
import { useSessionState } from '../../state/hooks'

/**
 * Ao sair da página (fechar aba, recarregar, navegar para fora) envia
 * `DELETE /verilog/projeto/{id}` com `keepalive`, já que o estado vive só
 * em memória e o token se perderia. Melhor esforço: a resposta não é
 * aguardada. Nunca usa `POST /limpar`.
 */
export function useSessionTeardownOnExit(): void {
  const api = useApi()
  const { session } = useSessionState()
  const projectIdRef = useRef<string | null>(null)

  useEffect(() => {
    projectIdRef.current = session?.projectId ?? null
  }, [session])

  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      // Página indo para o bfcache pode voltar com o estado intacto.
      if (event.persisted || !projectIdRef.current) return
      api.deleteProject(projectIdRef.current, { keepalive: true, timeoutMs: 0 }).catch(() => {})
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [api])
}
