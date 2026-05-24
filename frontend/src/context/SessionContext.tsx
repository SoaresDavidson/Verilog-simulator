import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { AppState, LogCiclo, NetlistData, ApiError } from '../types';
import * as api from '../services/api';

// ── State ──────────────────────────────────────────────────────────────────
interface SessionState {
  appState: AppState;
  projectId: string | null;
  netlist: NetlistData | null;
  cycles: LogCiclo[];
  currentCycle: number;
  error: ApiError | null;
  toast: { message: string; kind: 'error' | 'success' | 'info' } | null;
}

const initialState: SessionState = {
  appState: 'idle',
  projectId: null,
  netlist: null,
  cycles: [],
  currentCycle: 0,
  error: null,
  toast: null,
};

// ── Actions ────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'SET_PROJECT'; payload: string }
  | { type: 'SET_NETLIST'; payload: NetlistData }
  | { type: 'SET_CYCLES'; payload: LogCiclo[] }
  | { type: 'SET_CYCLE'; payload: number }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'SET_TOAST'; payload: SessionState['toast'] }
  | { type: 'RESET' };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'SET_STATE':    return { ...state, appState: action.payload };
    case 'SET_PROJECT':  return { ...state, projectId: action.payload };
    case 'SET_NETLIST':  return { ...state, netlist: action.payload };
    case 'SET_CYCLES':   return { ...state, cycles: action.payload, currentCycle: 0 };
    case 'SET_CYCLE':    return { ...state, currentCycle: action.payload };
    case 'SET_ERROR':    return { ...state, error: action.payload };
    case 'SET_TOAST':    return { ...state, toast: action.payload };
    case 'RESET':        return { ...initialState };
    default:             return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────
interface SessionContextValue extends SessionState {
  upload: (file: File) => Promise<void>;
  doSynthesize: () => Promise<void>;
  doSimulate: () => Promise<void>;
  doDelete: () => Promise<void>;
  doClean: () => Promise<void>;
  setCycle: (index: number) => void;
  dismissToast: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const showToast = useCallback(
    (message: string, kind: 'error' | 'success' | 'info' = 'info') => {
      dispatch({ type: 'SET_TOAST', payload: { message, kind } });
      setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), 5000);
    },
    [],
  );

  const handleError = useCallback(
    (err: unknown) => {
      const apiErr = err as ApiError;
      const msg = apiErr?.message ?? 'Erro desconhecido';
      dispatch({ type: 'SET_ERROR', payload: apiErr });
      showToast(msg, 'error');
    },
    [showToast],
  );

  const upload = useCallback(
    async (file: File) => {
      dispatch({ type: 'SET_STATE', payload: 'uploading' });
      try {
        const { project_id } = await api.uploadProject(file);
        dispatch({ type: 'SET_PROJECT', payload: project_id });
        dispatch({ type: 'SET_STATE', payload: 'uploaded' });
        showToast('Projeto carregado com sucesso', 'success');
      } catch (err) {
        dispatch({ type: 'SET_STATE', payload: 'idle' });
        handleError(err);
      }
    },
    [handleError, showToast],
  );

  const doSynthesize = useCallback(async () => {
    if (!state.projectId) return;
    dispatch({ type: 'SET_STATE', payload: 'synthesizing' });
    try {
      const netlist = await api.synthesize(state.projectId);
      dispatch({ type: 'SET_NETLIST', payload: netlist });
      dispatch({ type: 'SET_STATE', payload: 'synthesized' });
      showToast('Síntese concluída — netlist disponível', 'success');
    } catch (err) {
      dispatch({ type: 'SET_STATE', payload: 'uploaded' });
      handleError(err);
    }
  }, [state.projectId, handleError, showToast]);

  const doSimulate = useCallback(async () => {
    if (!state.projectId) return;
    dispatch({ type: 'SET_STATE', payload: 'simulating' });
    try {
      const cycles = await api.simulate(state.projectId);
      dispatch({ type: 'SET_CYCLES', payload: cycles });
      dispatch({ type: 'SET_STATE', payload: 'simulated' });
      showToast(`Simulação concluída — ${cycles.length} ciclos`, 'success');
    } catch (err) {
      dispatch({ type: 'SET_STATE', payload: 'synthesized' });
      handleError(err);
    }
  }, [state.projectId, handleError, showToast]);

  const doDelete = useCallback(async () => {
    if (!state.projectId) return;
    try {
      await api.deleteProject(state.projectId);
      dispatch({ type: 'RESET' });
      showToast('Projeto removido', 'info');
    } catch (err) {
      handleError(err);
    }
  }, [state.projectId, handleError, showToast]);

  const doClean = useCallback(async () => {
    try {
      await api.cleanSessions();
      showToast('Sessões antigas removidas', 'info');
    } catch (err) {
      handleError(err);
    }
  }, [handleError, showToast]);

  const setCycle = useCallback(
    (index: number) => dispatch({ type: 'SET_CYCLE', payload: index }),
    [],
  );

  const dismissToast = useCallback(
    () => dispatch({ type: 'SET_TOAST', payload: null }),
    [],
  );

  return (
    <SessionContext.Provider
      value={{
        ...state,
        upload,
        doSynthesize,
        doSimulate,
        doDelete,
        doClean,
        setCycle,
        dismissToast,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
