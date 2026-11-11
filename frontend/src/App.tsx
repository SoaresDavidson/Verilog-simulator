import { AppProviders, type AppProvidersProps } from './app/AppProviders'
import { AppShell } from './app/AppShell'
import { HealthIndicator } from './features/health'
import { EndSessionButton, useSessionTeardownOnExit } from './features/session'

export type AppProps = Omit<AppProvidersProps, 'children'>

function Root() {
  useSessionTeardownOnExit()
  return (
    <AppShell
      headerActions={
        <>
          <HealthIndicator />
          <EndSessionButton />
        </>
      }
    />
  )
}

export default function App(props: AppProps) {
  return (
    <AppProviders {...props}>
      <Root />
    </AppProviders>
  )
}
