import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlPanel } from './gui/ControlPanel';
import { applyLanguage } from './i18n';
import '@fontsource-variable/inter';
import './styles/base.css';

applyLanguage();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlPanel />
  </StrictMode>,
);
