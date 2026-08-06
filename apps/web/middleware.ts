import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { authEnabled } from "./app/lib/auth-enabled";

// Task 2 (ADR-022/023) route protection — ENV-GATED like the layout + API's
// enforced/local split: with no Clerk keys (local slice, E2E, zero-key demo)
// this is a pure pass-through and clerkMiddleware is never invoked (it would
// throw on a missing key). With BOTH keys present, Studio and the workspace
// are protected and anonymous visitors redirect to /sign-in.
const isProtected = createRouteMatcher(["/", "/projects(.*)"]);

export default authEnabled
  ? clerkMiddleware(async (auth, req) => {
      // Clerk v7: auth() is async and carries .protect on the function itself.
      if (isProtected(req)) await auth.protect();
    })
  : function passThrough() {};

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
