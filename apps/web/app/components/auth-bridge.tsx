"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { installTokenGate, setAuthToken } from "../lib/api";

// Task 2 (ADR-022/023): bridges the Clerk session into the API client. Mounted
// ONLY inside ClerkProvider (auth enabled).
//
// 1. installTokenGate during RENDER — before any page effect fires, so the
//    dashboard's first fetch awaits the session token instead of 401ing.
// 2. A re-sync effect on getToken identity change (sign-in/sign-out): re-reads
//    the token and clears it when the session ends.
export function AuthBridge() {
  const { getToken } = useAuth();

  installTokenGate(getToken);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) => {
        if (!cancelled) setAuthToken(token);
      })
      .catch(() => {
        // Failed read (e.g. network) — go bare rather than hang or reject.
        if (!cancelled) setAuthToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return null;
}
