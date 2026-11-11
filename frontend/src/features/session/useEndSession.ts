import { useCallback, useRef, useState } from 'react'
import { useApi } from '../../api/context'
import { isApiError } from '../../api/errors'
import { useToast } from '../../components/toast'
import { useSession } from '../../state/hooks'

export interface EndSession {
  /**
   * Encerra a sessão ativa via `DELETE /verilog/projeto/{project_id}` e só
   * então limpa o estado local. Nunca usa `POST /limpar`.
   * Devolve `true` se a sessão foi encerrada (ou já não existia no servidor).
   * Em falha mantém a sessão e mostra toast.
   */
  endSession: () => Promise<boolean>
  ending: boolean
}

export function useEndSession(): EndSession {
  const api = useApi()
  const toast = useToast()
  const { state, dispatch } = useSession()
  const [ending, setEnding] = useState(false)
  const inFlight = useRef(false)
  const projectId = state.session?.projectId ?? null

  const endSession = useCallback(async () => {
    if (!projectId) return true
    if (inFlight.current) return false
    inFlight.current = true
    setEnding(true)
    try {
      await api.deleteProject(projectId)
    } catch (error) {
      // 404: o run já não existe no servidor — a sessão está de fato encerrada.
      if (!(isApiError(error) && error.status === 404)) {
        toast.error(`Não foi possível encerrar a sessão. ${isApiError(error) ? error.message : ''}`.trim())
        return false
      }
    } finally {
      inFlight.current = false
      setEnding(false)
    }
    dispatch({ type: 'SESSION_CLEARED' })
    toast.success('Sessão encerrada.')
    return true
  }, [api, toast, dispatch, projectId])

  return { endSession, ending }
}
