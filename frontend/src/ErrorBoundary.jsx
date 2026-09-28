import React from 'react';

/**
 * Catches a render error and shows it.
 *
 * Without this, React unmounts the whole tree when any component throws, and
 * the app becomes a blank white page with nothing on screen and nothing in the
 * UI to say why. The error is only in the browser console, which a person
 * testing the app has no reason to have open — so a one-line mistake in one
 * card looks like "the site is broken".
 *
 * A class component on purpose: `componentDidCatch` has no hook equivalent.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Still logged, so the full stack is available in the console.
    console.error('Render error caught by ErrorBoundary:', error, info);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const box = {
      background: '#fff',
      border: '1px solid #ece9e6',
      borderRadius: '14px',
      padding: '20px',
      maxWidth: '760px',
      margin: '40px auto',
      color: '#1c1917',
      fontFamily: "'Poppins', -apple-system, 'Segoe UI', Roboto, sans-serif",
    };

    return (
      <div style={box}>
        <h2 style={{ margin: '0 0 6px', color: '#b91c1c', fontSize: '18px', fontWeight: 600 }}>
          Something on this screen failed to render
        </h2>
        <p style={{ margin: '0 0 16px', color: '#78716c', fontSize: '13px' }}>
          The rest of the app is fine. This is the error that stopped this view.
        </p>

        <pre
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12.5px',
            color: '#991b1b',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {String(error && (error.stack || error.message || error))}
        </pre>

        {info?.componentStack && (
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12.5px', color: '#44403c', fontWeight: 500 }}>
              Which component
            </summary>
            <pre
              style={{
                background: '#fafaf9',
                border: '1px solid #f0eeec',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '11.5px',
                color: '#44403c',
                whiteSpace: 'pre-wrap',
                marginTop: '8px',
              }}
            >
              {info.componentStack.trim()}
            </pre>
          </details>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {/* Clearing the error re-renders the same tree: enough to recover
              from a transient failure without losing the session. */}
          <button
            onClick={() => this.setState({ error: null, info: null })}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              borderRadius: '10px',
              border: '1px solid #ece9e6',
              background: '#fff',
              color: '#1c1917',
              fontFamily: 'inherit',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              borderRadius: '10px',
              border: 0,
              background: '#e8590c',
              color: '#fff',
              fontFamily: 'inherit',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
