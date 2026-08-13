import { NextResponse } from "next/server";
import { authenticate, ensureUserSchema } from "@/lib/users";
import { SESSION_TTL_SECONDS, sessionCookieOptions, signSession } from "@/lib/session";

export const runtime = "nodejs"; // scrypt is Node-only
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login — exchange credentials for a session cookie.
 *
 * Every failure returns the same 401 and the same message. Distinguishing
 * "no such user" from "wrong password" would turn this into an account
 * enumeration oracle; lib/users.authenticate also equalises the timing.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string; remember?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    await ensureUserSchema();
    const user = await authenticate(email, password);
    if (!user) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    });

    const res = NextResponse.json({
      user: { email: user.email, name: user.name, role: user.role },
    });
    // "Remember me" chooses how long the BROWSER keeps the cookie, never how
    // long the token is valid for — that stays at SESSION_TTL_SECONDS either
    // way. Unticked, the cookie is dropped when the browser closes, which is
    // the shared-machine case worth protecting. Defaults to true so the
    // behaviour is unchanged for anyone who never touches the box.
    const remember = body.remember !== false;
    res.cookies.set({
      ...sessionCookieOptions(remember ? SESSION_TTL_SECONDS : null),
      value: token,
    });
    return res;
  } catch (err) {
    // A misconfigured SESSION_SECRET or an unreachable database must not read
    // as "wrong password" — that would send someone hunting for a typo in
    // their credentials instead of at the configuration.
    return NextResponse.json(
      { error: `Sign-in is unavailable: ${(err as Error).message}` },
      { status: 503 },
    );
  }
}
