import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className={wide ? 'wide' : ''} aria-labelledby={id} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="dlg">
        <header>
          <h2 id={id}>{title}</h2>
          <button className="btn s" onClick={onClose} aria-label="Close dialog">✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
