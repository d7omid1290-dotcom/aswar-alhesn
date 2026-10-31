import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './ui/App';

const StageLab = lazy(() => import('./dev/StageLab'));
const isLab = location.hash.startsWith('#/lab');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLab ? <Suspense fallback={null}><StageLab /></Suspense> : <App />}
  </StrictMode>,
);
