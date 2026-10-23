import { Screen } from '../../components/Screen'

/** Tela 1 (#s1) — upload do ZIP e criação da sessão. Implementada em #19/#25. */
export function UploadScreen() {
  return (
    <Screen
      title="Novo Projeto"
      description="Faça upload de um arquivo ZIP contendo seus módulos Verilog/SystemVerilog."
      className="scr--center"
    >
      <div className="card placeholder">
        <p>Em construção.</p>
      </div>
    </Screen>
  )
}
