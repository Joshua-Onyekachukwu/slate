"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const isDash = pathname === "/";
  const isWs = pathname.startsWith("/projects");

  return (
    <nav className="nav">
      <Link className="brand" href="/">
        <span className="rec-dot"></span> videogen
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
        <div className="avatar" aria-hidden="true">
          S
        </div>
      </div>
    </nav>
  );
}
