"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";

// Env-gated like the layout/middleware (Task 2, ADR-022/023): the SERVER decides
// authEnabled (both Clerk keys present, layout.tsx) and passes it down — client
// components can't read CLERK_SECRET_KEY. False → static local avatar, nothing
// Clerk mounted; true → signed-in avatar + sign out / sign-in link.
export function Nav({ authEnabled }: { authEnabled: boolean }) {
  const pathname = usePathname();
  const isDash = pathname === "/";
  const isWs = pathname.startsWith("/projects");

  return (
    <nav className="nav">
      <Link className="brand" href="/">
        <span className="rec-dot"></span> slate
      </Link>
      <div className="nav-links">
        <Link className={`nav-link${isDash ? " active" : ""}`} href="/">
          Studio
        </Link>
        <Link className={`nav-link${isWs ? " active" : ""}`} href="/projects/0042?stage=7">
          Projects
        </Link>
        <span className="nav-link" title="Coming with Phase 3">
          Library
        </span>
      </div>
      <div className="nav-right">
        <span className="status-pill">nvidia build · live</span>
        {authEnabled ? <NavAuth /> : <div className="avatar">S</div>}
      </div>
    </nav>
  );
}

// Signed-in avatar initial + sign out; sign-in link when anonymous. Rendered
// only under ClerkProvider (authEnabled), so the Clerk hooks are safe.
function NavAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded) return <div className="avatar">·</div>;
  if (!isSignedIn) {
    return (
      <Link className="nav-link" href="/sign-in">
        Sign in
      </Link>
    );
  }
  return (
    <>
      <div className="avatar" title={user?.fullName ?? ""}>
        {user?.firstName?.[0]?.toUpperCase() ?? "S"}
      </div>
      <button className="signout" onClick={() => signOut()}>
        Sign out
      </button>
    </>
  );
}
