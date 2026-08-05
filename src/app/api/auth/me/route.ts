import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — who is signed in.
 *
 * Public by middleware so the login page can ask "am I already signed in?"
 * without a redirect loop. It reveals nothing to an anonymous caller: no
 * session simply returns { user: null }.
 */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token).catch(() => null);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { email: session.email, name: session.name, role: session.role },
  });
}
