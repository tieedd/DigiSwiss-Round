import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught DigiSwiss error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ backgroundColor: '#080d1a', color: '#f8fafc', minHeight: '100vh', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: '420px', width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '24px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#ff6d00' }}>Terjadi Kendala Tampilan</h2>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0', lineHeight: '1.5' }}>
              Aplikasi mengalami kendala memuat data. Anda dapat mencoba memuat ulang atau mereset data lokal.
            </p>
            <div style={{ padding: '10px', background: '#080d1a', borderRadius: '12px', border: '1px solid #1e293b', fontSize: '11px', color: '#f43f5e', marginBottom: '16px', wordBreak: 'break-word', textAlign: 'left', maxHeight: '100px', overflowY: 'auto' }}>
              {this.state.error?.message || 'Terjadi kesalahan sistem.'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ flex: 1, padding: '12px', background: 'linear-gradient(to right, #00e5ff, #0077b6)', color: '#000', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                Muat Ulang
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('DIGISWISS_USER_PROFILE');
                    localStorage.removeItem('DIGISWISS_AUTH_TOKEN');
                  } catch (e) {}
                  window.location.reload();
                }}
                style={{ flex: 1, padding: '12px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                Reset Sesi
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
