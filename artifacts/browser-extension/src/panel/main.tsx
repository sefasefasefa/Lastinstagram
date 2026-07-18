import './styles.css';
import { createRoot } from 'react-dom/client';
import App from './App';

// Artık local sunucu yok — Instagram API'si doğrudan background üzerinden çağrılır.
createRoot(document.getElementById('root')!).render(<App />);
