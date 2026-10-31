import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
let sequence = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message, type = 'success', options = {}) => {
    sequence += 1;
    const id = `toast-${Date.now()}-${sequence}`;
    const duration = options.duration ?? (type === 'error' ? 5500 : 3200);
    setToasts((list) => [...list.slice(-4), { id, message, type, action: options.action }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  const icons = {
    success: <CheckCircle2 size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((item) => (
            <div className={`toast toast-${item.type}`} key={item.id}>
              <span className="toast-icon">{icons[item.type] || icons.info}</span>
              <span className="toast-message">{item.message}</span>
              {item.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => { item.action.onClick?.(); dismiss(item.id); }}
                >
                  {item.action.label}
                </button>
              )}
              <button type="button" className="toast-close" onClick={() => dismiss(item.id)} aria-label="关闭提示">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
