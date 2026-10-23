import { AppProviders, type AppProvidersProps } from './app/AppProviders'
import { AppShell } from './app/AppShell'

export type AppProps = Omit<AppProvidersProps, 'children'>

export default function App(props: AppProps) {
  return (
    <AppProviders {...props}>
      <AppShell />
    </AppProviders>
  )
}
