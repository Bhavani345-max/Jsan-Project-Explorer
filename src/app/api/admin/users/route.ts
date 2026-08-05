import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Role } from "@/lib/session";
import { countUsers, listUsers, upsertUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who may manage users.
 *
 * Normally: an admin session. The middleware already blocks /api/admin/* for
 * anyone who is not an admin, so this is defence in depth rather than the only
 * check — but it is the check that still holds if the matcher is ever edited.
 *
 * The bootstrap case is the exception. On a fresh database there are no users,
 * so nobody can sign in to create the first one. A CRON_SECRET bearer token is
 * accepted ONLY while the table is empty, which closes the hole the moment the
 * first admin exists.
 */
async function authorize(request: Request): Promise<{ ok: true } | { ok: false; res: Response }> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
  if (session?.role === "admin") return { ok: true };

  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    if ((await countUsers()) === 0) return { ok: true };
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Bootstrap token is only valid while no users exist. Sign in as an admin." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: false,
    res: NextResponse.json({ error: "Administrator role required" }, { status: 403 }),
  };
}

/** GET /api/admin/users — list accounts (never password hashes). */
export async function GET(request: Request) {
  const gate = await authorize(request);
  if (!gate.ok) return gate.res;
  return NextResponse.json({ users: await listUsers() });
}

/** POST /api/admin/users — create or update an account by email. */
export async function POST(request: Request) {
  const gate = await authorize(request);
  if (!gate.ok) return gate.res;

  let body: { email?: string; name?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  const role = body.role as Role;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: 'Role must be "admin" or "manager"' }, { status: 400 });
  }
  // Floor only — scrypt makes each guess expensive, but it cannot rescue a
  // password a dictionary attack tries in its first hundred attempts. This was
  // 12 and was lowered to 8 on request; raise it back when the accounts move
  // off their initial passwords.
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  try {
    const user = await upsertUser({ email, name, password, role });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
