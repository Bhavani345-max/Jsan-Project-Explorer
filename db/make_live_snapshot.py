"""
Generate db/live_snapshot.sql — a portable, idempotent seed of the live
ingested data (organizations, sources, projects).

Portability rules learned from the scratch-DB test:
  • organizations / project_sources keep their explicit UUIDs (self-contained)
  • projects.category_id is resolved BY NAME via a scalar subquery, because a
    fresh schema.sql seeds project_categories with new random UUIDs
  • every INSERT is ON CONFLICT DO NOTHING so the file coexists with
    sample_data.sql and can be re-applied safely
  • search_vector is omitted — the trg_projects_search trigger recomputes it

Run (from backend/, venv active, stack up):
    python ../db/make_live_snapshot.py
"""
import sys
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import create_engine, text

DB_URL = "postgresql+psycopg://discovery:discovery@localhost:5432/discovery"
OUT = Path(__file__).parent / "live_snapshot.sql"


def q(v) -> str:
    """SQL-literal quote."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (datetime, date)):
        return f"'{v.isoformat()}'"
    if isinstance(v, list):
        if not v:
            return "NULL"
        return "ARRAY[" + ", ".join(q(x) for x in v) + "]"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def main() -> None:
    engine = create_engine(DB_URL)
    lines = [
        "-- ============================================================",
        f"-- Live data snapshot generated {datetime.now().isoformat(timespec='seconds')}",
        "-- by db/make_live_snapshot.py — idempotent, safe after sample_data.sql",
        "-- ============================================================",
        "",
    ]
    with engine.connect() as db:
        # ---- organizations (explicit UUIDs) --------------------------
        lines.append("-- organizations")
        rows = db.execute(text(
            "SELECT id, name, country, industry, website FROM organizations "
            "WHERE deleted_at IS NULL ORDER BY name"))
        for r in rows:
            lines.append(
                "INSERT INTO organizations (id, name, country, industry, website) "
                f"VALUES ({q(str(r.id))}, {q(r.name)}, {q(r.country)}, "
                f"{q(r.industry)}, {q(r.website)}) ON CONFLICT DO NOTHING;")

        # ---- project sources (explicit UUIDs) ------------------------
        lines.append("\n-- project_sources")
        rows = db.execute(text(
            "SELECT id, name, source_type, base_url, country FROM project_sources "
            "WHERE deleted_at IS NULL ORDER BY name"))
        for r in rows:
            lines.append(
                "INSERT INTO project_sources (id, name, source_type, base_url, country) "
                f"VALUES ({q(str(r.id))}, {q(r.name)}, {q(r.source_type)}, "
                f"{q(r.base_url)}, {q(r.country)}) ON CONFLICT DO NOTHING;")

        # ---- projects (category resolved by name) --------------------
        lines.append("\n-- projects (live + sample; category_id resolved by name)")
        rows = db.execute(text("""
            SELECT p.*, c.name AS category_name
            FROM projects p LEFT JOIN project_categories c ON c.id = p.category_id
            WHERE p.deleted_at IS NULL ORDER BY p.publication_date, p.reference_number
        """))
        for r in rows:
            cat = (f"(SELECT id FROM project_categories WHERE name = {q(r.category_name)})"
                   if r.category_name else "NULL")
            lines.append(
                "INSERT INTO projects (id, reference_number, title, description, ai_summary, "
                "organization_id, category_id, source_id, country, state, budget_usd, currency, "
                "project_type, status, eligibility, official_link, contact_name, contact_email, "
                "contact_phone, tags, deadline, publication_date, source_hash) VALUES ("
                f"{q(str(r.id))}, {q(r.reference_number)}, {q(r.title)}, {q(r.description)}, "
                f"{q(r.ai_summary)}, {q(str(r.organization_id)) if r.organization_id else 'NULL'}, "
                f"{cat}, {q(str(r.source_id)) if r.source_id else 'NULL'}, {q(r.country)}, "
                f"{q(r.state)}, {q(r.budget_usd)}, {q(r.currency)}, {q(r.project_type)}, "
                f"{q(r.status)}, {q(r.eligibility)}, {q(r.official_link)}, {q(r.contact_name)}, "
                f"{q(r.contact_email)}, {q(r.contact_phone)}, {q(list(r.tags) if r.tags else None)}, "
                f"{q(r.deadline)}, {q(r.publication_date)}, {q(r.source_hash)}"
                ") ON CONFLICT DO NOTHING;")

    # newline="\n" is essential: Windows text-mode translation would turn
    # newlines EMBEDDED IN SQL STRING LITERALS into \r\n, corrupting values
    # (a 400-char title with newlines then overflows VARCHAR(400) on load).
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(lines)} lines)")


if __name__ == "__main__":
    sys.exit(main())
