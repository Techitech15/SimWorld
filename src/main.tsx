import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { sprites } from './assets/sprites';
import './styles.css';

// the favicon is a bundled sprite, so it is wired up here rather than in index.html
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = sprites.jobBuild;
document.head.appendChild(favicon);

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
