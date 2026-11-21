import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The scoreboard face for scores, ratings and stat numbers - bundled so it works offline.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import './styles.css';

// iOS Safari only applies :active (the press dip every button has) when a touch
// listener sits on the element or above it. Sheets and menus are rendered into
// <body>, outside the app's root, so without one here they'd show no press at all.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
