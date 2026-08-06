// ------------------------------------------------------------------
// The gate. Every request to the portal passes through here.
//
// Written as a deny-by-default list: anything not explicitly public requires a
// valid session. Adding a page or an API route therefore makes it protected
// automatically — the failure mode of an allow-list is that someone adds a
// route and forgets to protect it, and this is the one place where that class
// of mistake is worth engineering out.
// ------------------------------------------------------------------
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Paths reachable without a session.
 *
 * /api/cron/* is here on purpose: those routes carry their OWN authentication
 * (a CRON_SECRET bearer token) and are called by Vercel Cron, which sends no
 * cookie. Gating them on a session would silently break daily ingestion.
 */
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/cron/"];

/**
 * Admin-only areas. Managers are redirected rather than shown a dead end.
 *
 * `/api/connectors` needs its own entry: these are matched with startsWith, and
 * "/api/connectors".startsWith("/connectors") is false. Without it the page was
 * gated while the API behind it was not, so a manager who was bounced from
 * /connectors could still fetch the very data it renders — source endpoints,
 * auth types, schedules and run logs. Hiding a nav link is not access control.
 *
 * The rule of thumb when adding to this list: gate the page AND whatever it
 * fetches, or the gate only stops people who navigate.
 */
const ADMIN_ONLY_PREFIXES = ["/connectors", "/api/connectors", "/api/admin/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Bootstrap hole, deliberately the narrowest possible one.
  //
  // /api/admin/users accepts a CRON_SECRET bearer while the user table is
  // empty, so the first admin can be created on a fresh database — but a
  // session check here would reject that request, and there is no session to
  // be had until that user exists. So this ONE path defers to the route.
  //
  // Scoped to the exact pathname, not to "any /api/ route with an
  // Authorization header": routes like /api/projects do not inspect bearer
  // tokens at all, so a blanket exemption would let `Authorization: Bearer
  // anything` walk straight past authentication.
  if (pathname === "/api/admin/users" && request.headers.get("authorization")) {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    // An API caller wants a status code, not a login page it cannot render.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    // Round-trip the destination so a deep link survives the detour.
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Administrator role required" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/?denied=connectors", request.url));
  }

  // Hand identity to server components and route handlers, so nothing has to
  // re-verify the cookie to know who is asking.
  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.sub);
  headers.set("x-user-email", session.email);
  headers.set("x-user-role", session.role);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own build output and static files. Note this
  // matcher still covers /api/* — those are filtered by PUBLIC_PREFIXES above,
  // not excluded here, so a new API route is protected by default.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.png$|.*\\.svg$).*)"],
};
