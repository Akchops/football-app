import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The scoreboard face for scores, ratings and stat numbers - bundled so it works offline.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
