import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout';

const HomePage = lazy(() => import('./pages/HomePage'));
const CharacterListPage = lazy(() => import('./pages/CharacterListPage'));
const CharacterDetailPage = lazy(() => import('./pages/CharacterDetailPage'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const SharedBattlePage = lazy(() => import('./pages/SharedBattlePage'));
const StrategiumPage = lazy(() => import('./pages/StrategiumPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-gray-400">Loading...</div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/TacticusDamageCalc">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<SuspenseWrapper><HomePage /></SuspenseWrapper>} />
            <Route path="characters" element={<SuspenseWrapper><CharacterListPage /></SuspenseWrapper>} />
            <Route path="characters/:id" element={<SuspenseWrapper><CharacterDetailPage /></SuspenseWrapper>} />
            <Route path="calculator" element={<SuspenseWrapper><CalculatorPage /></SuspenseWrapper>} />
            <Route path="calculator/shared/:id" element={<SuspenseWrapper><SharedBattlePage /></SuspenseWrapper>} />
            <Route path="strategium" element={<SuspenseWrapper><StrategiumPage /></SuspenseWrapper>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
