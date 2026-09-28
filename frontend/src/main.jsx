import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { RiderProvider } from './context/RiderContext.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

// The boundary sits inside the provider, so a render error reports itself
// instead of blanking the screen while the rider's session stays intact.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RiderProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </RiderProvider>
  </React.StrictMode>
);
