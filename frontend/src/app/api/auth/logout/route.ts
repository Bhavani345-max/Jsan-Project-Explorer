import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clear the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  // maxAge 0 with the same name/path/attributes is what actually removes it;
  // a mismatched path would leave the original cookie in place.
  res.cookies.set({ ...sessionCookieOptions(0), value: "" });
  return res;
}
