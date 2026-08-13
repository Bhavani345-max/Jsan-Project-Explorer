// ------------------------------------------------------------------
// Signed session cookie.
//
// Deliberately written against Web Crypto rather than node:crypto, because
// this module is imported by BOTH the Edge middleware (which gates every
// request) and the Node API routes. One implementation, one place to get the
// signing right.
//
// The cookie is stateless: the payload travels with it and is authenticated by
// an HMAC, so gating a request costs no database round trip. The trade-off is
// that a session cannot be revoked before it expires — acceptable for an
// 8-hour internal session, and the reason the lifetime is short. Change the
// SESSION_SECRET to invalidate every outstanding session at once.
// ------------------------------------------------------------------

export type Role = "admin" | "manager";

export interface SessionPayload {
  /** User id. */
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Expiry, seconds since epoch. */
  exp: number;
}

export const SESSION_COOKIE = "jsan_session";
/** Eight hours — a working day, then re-authenticate. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short (need 32+ chars). Generate with: openssl rand -hex 32",
    );
  }
  return s;
}

/** base64url without padding — safe in a cookie, and Buffer-free for Edge. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns Uint8Array<ArrayBuffer> rather than the wider Uint8Array, because
// crypto.subtle's BufferSource excludes SharedArrayBuffer-backed views.
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `<base64url(payload)>.<base64url(hmac)>` */
export async function signSession(payload: SessionPayload): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify and decode. Returns null for anything not provably ours and unexpired
 * — a bad signature, a tampered payload, a missing field, or a past expiry all
 * look identical to the caller, which is the point.
 *
 * crypto.subtle.verify is constant-time, so this does not leak signature bytes
 * through timing the way a naive string comparison would.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.sub || !payload.email || !payload.role) return null;
    if (payload.role !== "admin" && payload.role !== "manager") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Cookie attributes. Secure only off localhost so `npm run dev` still works.
 *
 * `maxAge: null` omits Max-Age entirely, which makes this a session cookie —
 * the browser discards it on close. That is what powers "Remember me" on the
 * sign-in form, and it deliberately does NOT touch the token's own expiry: the
 * eight-hour lifetime above is the mitigation for a session that cannot be
 * revoked, so lengthening it to keep somebody signed in would trade away the
 * one property that makes a stateless cookie acceptable here. Unticking the box
 * shortens the window; ticking it only restores the eight hours.
 */
export function sessionCookieOptions(maxAge: number | null = SESSION_TTL_SECONDS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true, // unreadable from JavaScript — blunts XSS session theft
    sameSite: "lax" as const, // survives top-level navigation, blocks cross-site POSTs
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // `?? undefined` rather than a falsy check: logout passes 0 to expire the
    // cookie immediately, and that 0 must survive.
    maxAge: maxAge ?? undefined,
  };
}
