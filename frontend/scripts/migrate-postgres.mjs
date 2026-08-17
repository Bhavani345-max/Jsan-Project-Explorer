// ------------------------------------------------------------------
// One-shot Postgres → Postgres migration (Neon → Railway, or either way).
//
// Moves the two tables the portal actually uses — `opportunities` and
// `portal_users` — from one host to another, schema and data.
//
// ---- why this exists rather than `pg_dump | psql` ------------------
// That is the right tool and this would be three lines with it. It is not
// installed on the machine this was written for (Windows, no Postgres client
// tools), and asking someone to install a Postgres distribution to move 773
// rows is worse than a script built on `pg`, which is already a dependency.
// If you have pg_dump, use it instead; nothing here is precious.
//
// ---- the schema is READ, not written ------------------------------
// The obvious implementation pastes the CREATE TABLE from lib/db.ts and
// lib/users.ts. That duplicate rots: the app has already gained `title_en`,
// `translated` and lost `ai_enriched` by ALTER since those tables were first
// written, and a stale copy here would silently create a target missing the
// newest columns — the data would land, minus whatever the copy did not know
// about, with no error.
//
// So nothing about the shape is hardcoded. Columns, primary keys, unique
// constraints and indexes are all read from the SOURCE catalog and replayed on
// the target, which makes the script correct by construction for whatever the
// tables look like on the day it runs.
//
// ---- why it lives here and not in db/ ------------------------------
// It used to sit in db/, beside bootstrap_remote.py, which reads better. That
// stopped working the moment the Next.js app moved into frontend/: this script
// imports `pg`, and Node resolves an ESM import by walking up from the SCRIPT's
// own directory — never sideways into frontend/node_modules. From db/ it died
// at import with ERR_MODULE_NOT_FOUND before reaching a line of its own code.
//
// It belongs to the portal anyway. The two tables it moves are created by
// frontend/src/lib/db.ts and lib/users.ts, `pg` is the portal's dependency, and
// the TLS policy below deliberately mirrors lib/db.ts. bootstrap_remote.py
// stays in db/ because it is Python and carries its own dependencies.
//
// ---- usage --------------------------------------------------------
//   Run from frontend/ (or via `npm run db:migrate`).
//
//   1. Put both URLs in a file the repo will never see (.env.migrate is
//      already covered by the .env* rule in .gitignore):
//
//        SOURCE_DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require
//        TARGET_DATABASE_URL=postgresql://…proxy.rlwy.net:PORT/railway
//
//   2. Plan first. This connects, reports both ends and writes nothing:
//
//        npm run db:migrate
//
//   3. Then apply:
//
//        npm run db:migrate -- --apply
//
// Re-runnable: rows upsert on their primary key, so an interrupted run is
// fixed by running it again rather than by cleaning up first.
// ------------------------------------------------------------------
import pg from "pg";

const TABLES = ["opportunities", "portal_users"];
const BATCH = 200;
const APPLY = process.argv.includes("--apply");

// ------------------------------------------------------------------
// Connections
// ------------------------------------------------------------------

/**
 * TLS and connection policy, mirroring lib/db.ts.
 *
 * `sslmode` and `channel_binding` are stripped from the URL and TLS is passed
 * as an explicit option instead: node-postgres emits a deprecation warning when
 * both are supplied, and Neon's pooled URLs carry both by default.
 *
 * Verification is off because managed providers terminate TLS at a proxy whose
 * certificate does not chain to a public root — Railway's `*.proxy.rlwy.net` is
 * exactly that. The connection is still encrypted.
 */
function clientFor(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid connection URL`);
  }

  // The trap this whole migration exists downstream of. Railway's private
  // hostname resolves only from inside Railway's own network, so it is useless
  // from a laptop and from Vercel alike — and the failure it produces is a DNS
  // error at runtime, long after anyone has stopped watching. Caught here, by
  // name, with the fix in the message.
  if (parsed.hostname.endsWith(".railway.internal")) {
    throw new Error(
      `${label} points at ${parsed.hostname}, which is Railway's PRIVATE network.\n` +
        `  It does not resolve from this machine or from Vercel.\n` +
        `  Use Railway's DATABASE_PUBLIC_URL instead (the *.proxy.rlwy.net:PORT form),\n` +
        `  found under your Postgres service → Variables.`
    );
  }

  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");

  const local =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "postgres";

  return new pg.Client({
    connectionString: parsed.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

/** Host shown in logs. Never the whole URL — it carries the password. */
const hostOf = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable)";
  }
};

// ------------------------------------------------------------------
// Reading the source's shape
// ------------------------------------------------------------------

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return rows;
}

/**
 * information_schema reports an array column as data_type 'ARRAY' with the
 * element type hidden in udt_name as `_text`. Everything else can use
 * data_type verbatim — 'timestamp with time zone' and friends are already
 * valid DDL spellings.
 */
function typeOf(col) {
  if (col.data_type === "ARRAY") return `${col.udt_name.replace(/^_/, "")}[]`;
  return col.data_type;
}

/** Primary key columns, in key order, so the CREATE TABLE can restate it. */
async function primaryKeyOf(client, table) {
  const { rows } = await client.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema    = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name   = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

/**
 * Index definitions, verbatim from the source.
 *
 * Postgres hands back a complete `CREATE [UNIQUE] INDEX …` statement, which is
 * replayed as-is — that carries expression indexes correctly, and the portal
 * has one that matters: `idx_portal_users_email ON portal_users (lower(email))`.
 * Rebuilding indexes from column lists would quietly turn that into a plain
 * column index and every case-insensitive login lookup would start seq-scanning.
 *
 * Indexes backing a PRIMARY KEY or UNIQUE constraint are excluded — those come
 * with the constraint in the CREATE TABLE, and issuing them again fails.
 */
async function indexesOf(client, table) {
  const { rows } = await client.query(
    `SELECT indexdef
       FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
        AND indexname NOT IN (
          SELECT conname FROM pg_constraint
           WHERE conrelid = $1::regclass AND contype IN ('p', 'u')
        )`,
    [table]
  );
  // IF NOT EXISTS so a re-run is a no-op rather than an error.
  return rows.map((r) => r.indexdef.replace(/^CREATE (UNIQUE )?INDEX /i, (m) => `${m}IF NOT EXISTS `));
}

/** Unique constraints other than the primary key (portal_users.email). */
async function uniquesOf(client, table) {
  const { rows } = await client.query(
    `SELECT tc.constraint_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema    = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name   = $1
        AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [table]
  );
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.constraint_name)) byName.set(r.constraint_name, []);
    byName.get(r.constraint_name).push(r.column_name);
  }
  return [...byName.values()];
}

function createTableSql(table, cols, pk, uniques) {
  const lines = cols.map((c) => {
    let line = `  "${c.column_name}" ${typeOf(c)}`;
    if (c.column_default !== null) line += ` DEFAULT ${c.column_default}`;
    if (c.is_nullable === "NO") line += " NOT NULL";
    return line;
  });
  if (pk.length) lines.push(`  PRIMARY KEY (${pk.map((c) => `"${c}"`).join(", ")})`);
  for (const u of uniques) lines.push(`  UNIQUE (${u.map((c) => `"${c}"`).join(", ")})`);
  return `CREATE TABLE IF NOT EXISTS "${table}" (\n${lines.join(",\n")}\n)`;
}

// ------------------------------------------------------------------
// Copy
// ------------------------------------------------------------------

/**
 * Copy one table, upserting on the primary key.
 *
 * Only columns present on BOTH ends are copied, and any source column missing
 * from the target is reported rather than dropped silently — the target is
 * created from the source in the same run, so a mismatch here means something
 * is genuinely wrong and the operator needs to see it.
 */
async function copyTable(source, target, table) {
  const srcCols = (await columnsOf(source, table)).map((c) => c.column_name);
  const tgtCols = (await columnsOf(target, table)).map((c) => c.column_name);
  const shared = srcCols.filter((c) => tgtCols.includes(c));
  const missing = srcCols.filter((c) => !tgtCols.includes(c));
  if (missing.length) {
    throw new Error(
      `${table}: target is missing column(s) ${missing.join(", ")} — refusing to copy a subset`
    );
  }

  const pk = await primaryKeyOf(source, table);
  const { rows } = await source.query(
    `SELECT ${shared.map((c) => `"${c}"`).join(", ")} FROM "${table}"`
  );
  if (!rows.length) {
    console.log(`  ${table}: source is empty, nothing to copy`);
    return 0;
  }

  const quoted = shared.map((c) => `"${c}"`).join(", ");
  // Every non-key column is refreshed on conflict, which is what makes the
  // script re-runnable: a second pass after new ingest syncs rather than skips.
  const updates = shared
    .filter((c) => !pk.includes(c))
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  const conflict = pk.length
    ? ` ON CONFLICT (${pk.map((c) => `"${c}"`).join(", ")}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`
    : "";

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params = [];
    const tuples = slice.map((row) => {
      const marks = shared.map((c) => {
        params.push(row[c]);
        return `$${params.length}`;
      });
      return `(${marks.join(", ")})`;
    });
    await target.query(
      `INSERT INTO "${table}" (${quoted}) VALUES ${tuples.join(", ")}${conflict}`,
      params
    );
    done += slice.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length} rows`);
  }
  process.stdout.write("\n");
  return done;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error(
      "Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.\n" +
        "  npm run db:migrate            # plan, writes nothing\n" +
        "  npm run db:migrate -- --apply # write the target\n" +
        "Both are read from .env.migrate — see the header of this file."
    );
  }
  if (sourceUrl === targetUrl) throw new Error("Source and target are the same database");

  const source = clientFor(sourceUrl, "SOURCE_DATABASE_URL");
  const target = clientFor(targetUrl, "TARGET_DATABASE_URL");

  console.log(`source : ${hostOf(sourceUrl)}`);
  console.log(`target : ${hostOf(targetUrl)}`);
  console.log(`mode   : ${APPLY ? "APPLY — the target will be written" : "PLAN — nothing will be written"}\n`);

  await source.connect();
  await target.connect();
  try {
    for (const table of TABLES) {
      const [{ rows: [{ n: srcCount }] }] = [
        await source.query(`SELECT count(*)::int AS n FROM "${table}"`),
      ];
      let tgtCount = null;
      try {
        const r = await target.query(`SELECT count(*)::int AS n FROM "${table}"`);
        tgtCount = r.rows[0].n;
      } catch {
        /* table does not exist yet on the target */
      }
      console.log(
        `${table}: source ${srcCount} rows, target ${tgtCount === null ? "table does not exist" : `${tgtCount} rows`}`
      );

      const cols = await columnsOf(source, table);
      const pk = await primaryKeyOf(source, table);
      const uniques = await uniquesOf(source, table);
      const ddl = [createTableSql(table, cols, pk, uniques), ...(await indexesOf(source, table))];

      // A plan that only prints row counts is not a plan. The DDL below is
      // exactly what --apply executes, derived from the source catalog, so it
      // can be read before anything is written.
      if (!APPLY) {
        console.log(ddl.map((s) => s.replace(/^/gm, "    ")).join(";\n") + ";\n");
        continue;
      }

      for (const stmt of ddl) await target.query(stmt);
      await copyTable(source, target, table);
    }

    if (APPLY) {
      console.log("\nverifying:");
      let ok = true;
      for (const table of TABLES) {
        const s = (await source.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
        const t = (await target.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
        const match = t >= s;
        if (!match) ok = false;
        console.log(`  ${table}: source ${s} → target ${t} ${match ? "OK" : "MISMATCH"}`);
      }
      console.log(ok ? "\nMigration complete." : "\nMigration finished with mismatches — do NOT cut over.");
      if (!ok) process.exitCode = 1;
    } else {
      console.log("\nPlan only. Re-run with --apply to write.");
    }
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
