// ------------------------------------------------------------------
// Portal users — storage and password hashing. Server-only (Node runtime).
//
// Lives in the same Neon database as the opportunities, so there is one
// database to back up and one connection string to configure.
//
// Passwords use scrypt from Node's standard library rather than bcrypt: it is
// memory-hard, it is what `crypto` already ships, and it keeps the dependency
// count at zero. Parameters are stored in the hash string itself so they can be
// raised later without invalidating existing passwords.
// ------------------------------------------------------------------
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getSql } from "@/lib/db";
import type { Role } from "@/lib/session";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP's floor for scrypt is N=2^15, r=8, p=1 (2023) — deliberately slow, so
// a stolen table is expensive to attack.
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEYLEN = 64;

// scrypt needs 128 * N * r bytes = exactly 32 MiB at these parameters, and
// Node's default maxmem IS 32 MiB — landing on the boundary and failing with
// "memory limit exceeded". Ask for headroom rather than weakening N.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** `scrypt$N$r$p$<salt b64>$<hash b64>` — self-describing, so raising the cost
 *  later still verifies passwords hashed under the old parameters. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      // Derived from the stored parameters, so a hash written under different
      // settings still verifies.
      maxmem: 128 * Number(N) * Number(r) * 2,
    });
    // Constant-time: a plain === would leak how much of the hash matched.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS portal_users (
     id            TEXT PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE,
     name          TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_login_at TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users (lower(email))`,
];

export async function ensureUserSchema(): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  // One statement per query — Neon's HTTP driver cannot take a script.
  for (const stmt of SCHEMA) await sql.query(stmt);
}

interface Row {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
}

/**
 * Look a user up and check their password in one call, so no caller can
 * accidentally load a user and forget to verify.
 *
 * Returns null for both "no such user" and "wrong password" — the caller
 * cannot tell them apart, so the login endpoint cannot become an account
 * enumeration oracle.
 */
export async function authenticate(email: string, password: string): Promise<PortalUser | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = (await sql.query(
    `SELECT id, email, name, password_hash, role FROM portal_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email.trim()],
  )) as Row[];
  const row = rows[0];
  if (!row) {
    // Hash anyway. Without this, a missing account returns in ~1ms and a real
    // one in ~50ms, which times out the difference and reveals valid emails.
    await hashPassword(password);
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;
  await sql
    .query(`UPDATE portal_users SET last_login_at = now() WHERE id = $1`, [row.id])
    .catch(() => {});
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role };
}

/** Create or update a user by email. Returns the stored record. */
export async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<PortalUser> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureUserSchema();
  const hash = await hashPassword(input.password);
  const rows = (await sql.query(
    `INSERT INTO portal_users (id, email, name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role
     RETURNING id, email, name, role`,
    [randomUUID(), input.email.trim().toLowerCase(), input.name.trim(), hash, input.role],
  )) as Row[];
  const r = rows[0];
  return { id: r.id, email: r.email, name: r.name, role: r.role as Role };
}

export async function listUsers(): Promise<(PortalUser & { lastLoginAt: string | null })[]> {
  const sql = getSql();
  if (!sql) return [];
  await ensureUserSchema();
  const rows = (await sql.query(
    `SELECT id, email, name, role, last_login_at FROM portal_users ORDER BY created_at`,
  )) as (Row & { last_login_at: string | null })[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
  }));
}

export async function countUsers(): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  try {
    await ensureUserSchema();
    const rows = (await sql.query(`SELECT COUNT(*)::int AS n FROM portal_users`)) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}
