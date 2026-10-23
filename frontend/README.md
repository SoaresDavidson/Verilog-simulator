# Verilog Classroom — frontend

React 19 + Vite + TypeScript.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest + Testing Library (jsdom)
npm run lint
npm run build
```

`VITE_API_URL` define a URL base da API (padrão `http://localhost:8000/api/v1`, ver `.env.example`).

## Estrutura

- `src/api/` — cliente HTTP central (`useApi()`), tipos do contrato (`types.ts`) e `ApiError`.
- `src/state/` — estado global da sessão (Context + `useReducer`): `useSessionState`, `useSessionDispatch`, ações `SessionAction`.
- `src/app/` — shell, stepper e guarda de navegação (`useStepNavigation().goTo`).
- `src/components/` — componentes compartilhados (`Screen`, toast via `useToast()`).
- `src/features/<feature>/` — uma pasta por tela/feature (`upload`, `synthesis`, `datapath`, `simulation`).
- `src/styles/` — tokens e classes do design system (portados de `prototype/styles.css`).
- `src/test/` — helpers de teste (`renderApp`, `jsonResponse`, fixtures).
