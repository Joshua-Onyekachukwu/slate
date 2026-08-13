import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { authEnabled } from "./app/lib/auth-enabled";

// Task 2 (ADR-022/023) route protection - ENV-GATED like the layout + API's
// enforced/local split: with no Clerk keys (local slice, E2E, zero-key demo)
// this is a pure pass-through and clerkMiddleware is never invoked (it would
// throw on a missing key). With BOTH keys present, Studio and the workspace
// are protected and anonymous visitors redirect to /sign-in.
// Public landing at / - only the studio + workspaces are protected now.
// (The auth E2E asserts /studio → /sign-in without a session; / stays public.)
const isProtected = createRouteMatcher(["/studio", "/projects(.*)"]);
// Test-only (STUB_AUTH=1, playwright.auth.config.ts): the auth E2E proves the
// redirect contract without any Clerk network. clerkMiddleware's signed-out
// dev-mode handshake would bounce to the (unresolvable) fake instance instead
// of /sign-in, so in stub mode we gate with a plain redirect - every request
// to a protected route is signed-out by construction (no sessions exist).
const stubAuth = process.env.STUB_AUTH === "1";

// Stub-mode middleware: no clerkMiddleware wrapper at all - pure redirect.
function stubProtect(req: NextRequest): NextResponse | undefined {
  if (isProtected(req)) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
}

// Real-Clerk middleware: async auth() per request. Explicit redirect instead
// of auth.protect(): protect() rewrites to Clerk's dev-browser interstitial
// when the dev cookie is missing (x-clerk-auth-reason: protect-rewrite,
// dev-browser-missing), which returns 404 headlessly. The explicit check
// keeps the contract deterministic - anonymous users always get a 307 to
// /sign-in, in the hermetic auth E2E and in dev.
const clerkProtect = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  if (isProtected(req) && !userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
});

export default authEnabled
  ? (stubAuth ? stubProtect : clerkProtect)
  : function passThrough() {};

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
