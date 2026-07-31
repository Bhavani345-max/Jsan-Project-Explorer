"""
Load the schema and seed data into a REMOTE Postgres (Railway, RDS, …).

The docker-compose stack gets this for free — Postgres runs schema.sql,
sample_data.sql and live_snapshot.sql from /docker-entrypoint-initdb.d on a
fresh volume. A managed database has no such hook, and the app never emits DDL
itself (the ORM is validate-only, see app/database.py), so a new Railway
Postgres starts empty and every query 500s until this script has run.

Usage:
    python db/bootstrap_remote.py "<postgres-url>" [--with-snapshot]

The URL is the provider's *public* connection string (Railway: the Postgres
service → Variables → DATABASE_PUBLIC_URL). Order matters and is enforced:
schema → sample_data → live_snapshot.

sample_data.sql has no ON CONFLICT clauses, so this is a one-shot on an empty
database; the script refuses to run twice rather than half-inserting. Only
live_snapshot.sql is idempotent and can be re-applied on its own.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import psycopg
except ModuleNotFoundError:                                   # pragma: no cover
    sys.exit("psycopg is required — run: pip install 'psycopg[binary]'")

DB_DIR = Path(__file__).resolve().parent

# This file's help text and progress lines use the same typography as the rest
# of the repo; a stock Windows console is cp1252 and raises UnicodeEncodeError
# on the first arrow. Force UTF-8 on the streams we print to.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8")


def _run_sql_file(conn: psycopg.Connection, name: str) -> None:
    """Execute one .sql file as a single statement batch.

    Deliberately NOT split on ';' — schema.sql defines set_updated_at() with a
    dollar-quoted body, and naive splitting would cut it in half. psycopg sends
    a parameter-free string over the simple-query protocol, which accepts many
    statements at once and keeps the dollar-quoting intact.
    """
    path = DB_DIR / name
    sql = path.read_text(encoding="utf-8")
    print(f"  → {name} ({len(sql):,} bytes)", flush=True)
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def _already_seeded(conn: psycopg.Connection) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.projects') IS NOT NULL")
        return bool(cur.fetchone()[0])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Target Postgres connection URL")
    parser.add_argument(
        "--with-snapshot",
        action="store_true",
        help="Also load db/live_snapshot.sql (~1.6 MB of real ingested tenders)",
    )
    parser.add_argument(
        "--snapshot-only",
        action="store_true",
        help="Skip schema + sample_data; re-apply the idempotent snapshot only",
    )
    args = parser.parse_args()

    print(f"Connecting to {args.url.split('@')[-1]} …", flush=True)
    with psycopg.connect(args.url, connect_timeout=15) as conn:
        seeded = _already_seeded(conn)

        if args.snapshot_only:
            if not seeded:
                return _fail("--snapshot-only needs an existing schema; run without it first.")
            _run_sql_file(conn, "live_snapshot.sql")
        else:
            if seeded:
                return _fail(
                    "target already has a 'projects' table — sample_data.sql is not\n"
                    "idempotent and re-running would duplicate rows. Use --snapshot-only\n"
                    "to top up data, or drop the schema first if you want a clean rebuild."
                )
            _run_sql_file(conn, "schema.sql")
            _run_sql_file(conn, "sample_data.sql")
            if args.with_snapshot:
                _run_sql_file(conn, "live_snapshot.sql")

        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM projects")
            projects = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM users")
            users = cur.fetchone()[0]

    print(f"Done — {projects:,} projects, {users} users.")
    return 0


def _fail(message: str) -> int:
    print(f"Refusing to continue: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
