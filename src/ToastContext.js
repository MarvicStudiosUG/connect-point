import React, { createContext, useContext, useState } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return React.createElement(
    ToastContext.Provider,
    { value: { addToast } },
    children,
    React.createElement('div', {
      style: {
        position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 10000, display: 'flex', flexDirection: 'column-reverse', gap: '8px'
      }
    },
      toasts.map(t => React.createElement(ToastItem, { key: t.id, toast: t, onClose: () => removeToast(t.id) }))
    )
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

function ToastItem({ toast, onClose }) {
  const bg = toast.type === 'success' ? 'rgba(34,197,94,0.95)' :
             toast.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(127,90,240,0.95)';
  return React.createElement('div', {
    className: 'fade-in toast-item',
    style: {
      background: bg, color: 'white', padding: '12px 24px', borderRadius: '12px',
      display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      cursor: 'pointer'
    },
    onClick: onClose
  },
    React.createElement('i', { className: `ph ${toast.type === 'success' ? 'ph-check-circle' : toast.type === 'error' ? 'ph-x-circle' : 'ph-info'}` }),
    toast.message
  );
}
