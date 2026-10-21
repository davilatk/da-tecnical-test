import { HeroUIProvider } from '@heroui/react';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './presentation/routes/app-router';

export function App() {
  return (
    <HeroUIProvider locale="es-MX">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRouter />
      </BrowserRouter>
    </HeroUIProvider>
  );
}
