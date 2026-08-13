"use client";

import { useEffect } from "react";

// Transient action-failure banner for the workspace. Unlike the fatal
// "Studio unreachable" card (which replaces the console when state can't
// load), a toast reports a single failed action - approve, regenerate, asset
// generation, render - while the workspace stays fully visible, and carries
// its own Retry that re-fires the exact action that failed.
//
// Auto-dismisses after TOAST_MS so failures never permanently squat on screen;
// the timer resets per new toast, and dismissing or retrying clears it.
export type ToastData = {
  message: string;
  retry?: () => void;
};

const TOAST_MS = 6000;

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast" role="alert" aria-live="assertive">
      <span className="toast-kicker">
        <i className="rec-dot" aria-hidden="true"></i> Roll interrupted
      </span>
      <p className="toast-msg">{toast.message}</p>
      <div className="toast-actions">
        {toast.retry && (
          <button
            className="btn btn-rec btn-sm"
            onClick={() => {
              toast.retry?.();
              onDismiss();
            }}
          >
            ↻ Retry
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
