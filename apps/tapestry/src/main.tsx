import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/index.css';
import '@fontsource-variable/instrument-sans/index.css';
import './styles.css';
import { ErrorBoundary } from '@wells/ui';
import { App } from './App';
import { reportError } from './monitor';

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary appName="tapestry" onError={(e, w, x) => reportError(e, w, x)}><App /></ErrorBoundary></StrictMode>);
