import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css';
import './styles/index.scss';
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
    window.location.reload();
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
