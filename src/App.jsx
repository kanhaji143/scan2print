import { useState, useEffect } from 'react';
import Upload from './pages/Upload';
import Dashboard from './pages/Dashboard';
import QrGenerator from './pages/QrGenerator';
import './App.css';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  if (route.startsWith('/dashboard')) {
    return <Dashboard navigate={navigate} />;
  }
  if (route.startsWith('/qr')) {
    return <QrGenerator navigate={navigate} />;
  }
  return <Upload navigate={navigate} />;
}
