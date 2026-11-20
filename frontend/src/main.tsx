import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlPanel } from './gui/ControlPanel';
import { applyLanguage } from './i18n';
import '@fontsource-variable/inter';
import './styles/base.css';

// Pages mode holds the panel until the in-browser engine answers; the default build never imports the engine.
const EngineGate = import.meta.env.MODE === 'pages'
  ? lazy(() => import('./engine/EngineGate').then(module => ({ default: module.EngineGate })))
  : null;

applyLanguage();
const panel = <ControlPanel />;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {EngineGate ? <Suspense fallback={null}><EngineGate>{panel}</EngineGate></Suspense> : panel}
  </StrictMode>,
);
