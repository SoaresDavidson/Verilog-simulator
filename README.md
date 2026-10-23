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
