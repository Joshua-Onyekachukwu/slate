import { Landing } from "./components/landing";
import { authEnabled } from "./lib/auth-enabled";

// Public marketing landing page - the studio itself lives at /studio
// (middleware-protected when auth is configured). authEnabled is decided on the
// server (single source of truth, lib/auth-enabled.ts) so the landing's CTAs
// can route to /sign-up vs /studio without client-side Clerk access.
export default function HomePage() {
  return <Landing authEnabled={authEnabled} />;
}
