import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const t = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 3200);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
