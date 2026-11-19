import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlPanel } from './gui/ControlPanel';
import '@fontsource-variable/inter';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlPanel />
  </StrictMode>,
);
