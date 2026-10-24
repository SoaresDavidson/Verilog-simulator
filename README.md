# Proposta
Atualmente, ferramentas de simulação de hardware utilizam as ondas geradas pelo processador para verificar a execução correta do código. Além de ser trabalhosa, essa metodologia é chata, propensa a erros e ameaçadora para estudantes. Nós propomos uma forma de simular o hardware de forma mais intuitiva e de fácil acesso, usando interfaces web.
# Para quem é essa ferramenta
- Professores que desejam uma porta de entrada mais amigável para o estudo de hardware.
- Estudantes que querem ver como seu código em verilog se comporta de verdade.
- Profissionais que querem testar a simulação do seu hardware descrito em verilg por interface web

# Como rodar
- Tudo com Docker: `docker compose up --build` (yosys, icarus-verilog, backend e frontend).
- Backend local: veja [backend/README.md](backend/README.md) (`cd backend && uv sync && uv run uvicorn main:app --reload`).
- Frontend local: veja [frontend/README.md](frontend/README.md).
- Variaveis de ambiente do backend: [backend/.env.example](backend/.env.example).

# API: sessão e autenticação
- O upload (`POST /api/v1/verilog/upload-projeto-zip`) devolve `project_id` e `session_token`.
- `mapear-processador`, `simular-execucao` e `DELETE /projeto/{project_id}` exigem o header
  `X-Session-Token` com o token recebido no upload (`401` sem token, `403` token de outra sessão).
- `POST /api/v1/verilog/limpar` exige `X-Admin-Token` igual à variável `ADMIN_TOKEN` do backend;
  sem `ADMIN_TOKEN` configurado a rota fica desabilitada.
- Detalhes e variáveis em [`backend/README.md`](backend/README.md) e `backend/.env.example`.

# Retenção
Os projetos enviados são temporários: runs sem uso por mais de `RUN_TTL_HOURS` (padrão 6 h) são
apagados automaticamente, e um teto opcional de espaço (`RUNS_MAX_TOTAL_BYTES`) remove os mais
antigos primeiro. Veja [`backend/README.md`](backend/README.md#retenção-dos-projetos-enviados).
