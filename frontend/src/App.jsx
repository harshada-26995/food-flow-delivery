import React from 'react';
import { useRider } from './context/RiderContext';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';

function Toast() {
  const { toast } = useRider();
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}

export default function App() {
  const { isAuthenticated } = useRider();
  return (
    <>
      {isAuthenticated ? <DashboardView /> : <LoginView />}
      <Toast />
    </>
  );
}
