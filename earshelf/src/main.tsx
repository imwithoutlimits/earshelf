import '@fontsource-variable/inter';
import '@fontsource-variable/literata';
import '@fontsource-variable/outfit';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@wells/design-tokens/tokens.css';
import './styles.css';
import './look.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalHandlers } from './monitor';

registerSW({ immediate: true });
installGlobalHandlers();
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
