import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Статически грузим дефолтные шрифты (подмножество весов каталога в core/appearance.ts);
// остальные темы докачивают свои веса лениво — см. FONT_FILES в appearance.ts.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import './styles.css';
import { initAppearance } from './appearance';
import { App } from './App';

void initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
