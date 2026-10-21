import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { env } from './infrastructure/env';
import { bindApiPorts } from './infrastructure/http/bind-api-ports';
import { logger } from './infrastructure/logger';
import { createTraceId } from './infrastructure/trace-id';
import './index.css';

bindApiPorts();
logger.info(createTraceId(), 'web client started', { mode: env.mode });

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
