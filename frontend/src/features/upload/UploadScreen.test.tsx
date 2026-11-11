import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../../api/errors'
import { PROJECT_ID, SESSION_TOKEN, uploadedState } from '../../test/fixtures'
import { createFetchMock, fetchCall, jsonResponse, pendingFetch, TEST_BASE_URL } from '../../test/http'
import { renderApp } from '../../test/render'
import { zipFile } from '../../test/zip'

const validZip = () => zipFile([{ name: 'src/top.v', content: 'module top; endmodule' }], 'cpu.zip')
const uploadOk = () => jsonResponse(200, { project_id: PROJECT_ID, message: 'ok', session_token: SESSION_TOKEN })

/** Alerta inline da tela (o toast fica fora de <main>). */
function findInlineAlert() {
  return within(screen.getByRole('main')).findByRole('alert')
}

function fileInput() {
  return screen.getByLabelText('Arquivo ZIP do projeto')
}

async function selectValidFile(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(fileInput(), validZip())
  await screen.findByText(/arquivo pronto para envio/i)
}

describe('UploadScreen', () => {
  it('estado inicial: envio desabilitado sem arquivo e etapa 2 bloqueada', () => {
    renderApp()
    expect(screen.getByText('Nenhum arquivo selecionado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar projeto' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /criar sessão e continuar/i })).not.toBeInTheDocument()
  })

  it('fluxo feliz: preview, uma requisição multipart, sessão criada e avanço', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(uploadOk())
    renderApp({ fetch })

    await selectValidFile(user)
    expect(screen.getByRole('list', { name: /arquivos de cpu\.zip/i })).toHaveTextContent('top.v')

    await user.click(screen.getByRole('button', { name: 'Enviar projeto' }))
    expect(await screen.findByText('Projeto enviado. Sessão criada.')).toBeInTheDocument()

    expect(fetch).toHaveBeenCalledTimes(1)
    const call = fetchCall(fetch)
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/upload-projeto-zip`)
    expect(call.method).toBe('POST')
    expect((call.body as FormData).get('file')).toBeInstanceOf(File)

    expect(screen.getAllByText(PROJECT_ID).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /criar sessão e continuar/i }))
    expect(screen.getByRole('heading', { level: 1, name: 'Seleção e Síntese' })).toBeInTheDocument()
  })

  it('aceita arquivo por arrastar e soltar', async () => {
    renderApp()
    fireEvent.drop(screen.getByRole('button', { name: /arraste um arquivo/i }), {
      dataTransfer: { files: [validZip()] },
    })
    expect(await screen.findByText(/arquivo pronto para envio/i)).toBeInTheDocument()
  })

  it('dropzone abre o seletor pelo teclado', async () => {
    const user = userEvent.setup()
    renderApp()
    const input = fileInput() as HTMLInputElement
    let opened = 0
    input.addEventListener('click', () => (opened += 1))
    screen.getByRole('button', { name: /arraste um arquivo/i }).focus()
    await user.keyboard('{Enter}')
    expect(opened).toBe(1)
  })

  it('rejeita ZIP inválido e extensão errada antes do envio', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const fetch = createFetchMock()
    renderApp({ fetch })

    await user.upload(fileInput(), new File(['não é zip, apenas texto'], 'x.zip'))
    expect(await findInlineAlert()).toHaveTextContent(/não é um ZIP válido/i)

    await user.upload(fileInput(), new File(['x'], 'x.txt'))
    expect(await findInlineAlert()).toHaveTextContent(/extensão \.zip/i)

    expect(screen.getByRole('button', { name: 'Enviar projeto' })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('erro HTTP mostra mensagem da API e permite tentar novamente', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: 'NO_SOURCES', message: 'Projeto sem fontes.', request_id: 'r1' } }))
      .mockResolvedValueOnce(uploadOk())
    renderApp({ fetch })

    await selectValidFile(user)
    await user.click(screen.getByRole('button', { name: 'Enviar projeto' }))
    expect(await findInlineAlert()).toHaveTextContent('Projeto sem fontes.')

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Projeto enviado. Sessão criada.')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('falha de rede mostra mensagem específica e mantém a tela utilizável', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderApp({ fetch })

    await selectValidFile(user)
    await user.click(screen.getByRole('button', { name: 'Enviar projeto' }))
    expect(await findInlineAlert()).toHaveTextContent(MESSAGES.network)
    expect(screen.getByRole('button', { name: 'Trocar arquivo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled()
  })

  it('bloqueia envio duplicado e permite cancelar (upload interrompido)', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockImplementation(pendingFetch())
    renderApp({ fetch })

    await selectValidFile(user)
    const send = screen.getByRole('button', { name: 'Enviar projeto' })
    await user.dblClick(send)
    expect(screen.getByText('Enviando projeto…')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /enviando/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancelar envio' }))
    expect(await screen.findByText('Envio cancelado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar projeto' })).toBeEnabled()
  })

  it('descartar chama DELETE com token e limpa a sessão após sucesso', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, { success: true, message: 'ok' }))
    renderApp({ fetch, initialState: uploadedState() })

    await user.click(screen.getByRole('button', { name: 'Descartar sessão' }))
    await waitFor(() => expect(screen.getByText('Nenhum arquivo selecionado.')).toBeInTheDocument())

    const call = fetchCall(fetch)
    expect(call.method).toBe('DELETE')
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/projeto/${PROJECT_ID}`)
    expect(call.headers.get('X-Session-Token')).toBe(SESSION_TOKEN)
    expect(screen.queryByText(PROJECT_ID)).not.toBeInTheDocument()
  })

  it('falha ao descartar mantém a sessão', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }))
    renderApp({ fetch, initialState: uploadedState() })

    await user.click(screen.getByRole('button', { name: 'Descartar sessão' }))
    expect(await screen.findByText(/não foi possível encerrar/i)).toBeInTheDocument()
    expect(screen.getByText('Projeto enviado. Sessão criada.')).toBeInTheDocument()
  })
})
