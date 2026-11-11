import { useSessionState } from '../../state/hooks'
import { useEndSession } from './useEndSession'

const CONFIRM_TEXT = 'Encerrar a sessão? O projeto enviado e os resultados serão apagados do servidor.'

/** Botão "Encerrar sessão" do cabeçalho (#36). Só aparece com sessão ativa. */
export function EndSessionButton() {
  const { session } = useSessionState()
  const { endSession, ending } = useEndSession()
  if (!session) return null

  const onClick = async () => {
    if (!window.confirm(CONFIRM_TEXT)) return
    if (await endSession()) {
      document.querySelector<HTMLElement>('main h1')?.focus()
    }
  }

  return (
    <button type="button" className="btn bd bsm" onClick={() => void onClick()} disabled={ending}>
      {ending ? 'Encerrando…' : 'Encerrar sessão'}
    </button>
  )
}
