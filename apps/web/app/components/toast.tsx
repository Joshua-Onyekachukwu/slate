"use client";

import { useEffect, useState } from "react";

export function Toast({ message, nonce }: { message: string | null; nonce: number }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!message) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 1800);
    return () => clearTimeout(t);
  }, [message, nonce]);

  if (!message) return null;

  return (
    <div className={`toast${shown ? " show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
