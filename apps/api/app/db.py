"""Database connection, migrations and small query helpers.

- DATABASE_URL set (Render, production): regular PostgreSQL.
- Otherwise (local demo): an embedded PostgreSQL 16 started with `pgserver` in ./data/pg (nothing to install).
The schema lives in plain SQL migrations (./migrations). The runner is compatible with the migration history table the
earlier Node.js backend wrote ("drizzle"."__drizzle_migrations"), so existing databases continue without changes.
"""
from __future__ import annotations
import hashlib, json, os, re, tempfile, uuid
from datetime import datetime, date
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import MetaData, create_engine, event, text, select, insert, update, delete, func, and_, or_, desc, asc
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.engine import Engine

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get('PP_DATA_DIR') or ROOT / 'data')
MIGRATIONS = ROOT / 'migrations'

_engine: Engine | None = None
_pg = None  # embedded server handle
meta = MetaData()


class _Tables:
    """Reflected tables, e.g. T.users, T.listing_access."""
    def __getattr__(self, name: str):
        try:
            return meta.tables[name]
        except KeyError:
            raise AttributeError(name)


T = _Tables()


@event.listens_for(MetaData, 'column_reflect')
def _uuid_as_str(inspector, table, column_info):  # ids travel as plain strings, like the JSON API
    if isinstance(column_info['type'], PG_UUID):
        column_info['type'] = PG_UUID(as_uuid=False)


def _url() -> str:
    global _pg
    url = os.environ.get('DATABASE_URL')
    if not url:
        import pgserver  # local demo only
        folder = Path(tempfile.mkdtemp(prefix='pp-test-')) if os.environ.get('PP_MEMORY_DB') else DATA_DIR / 'pg'
        folder.mkdir(parents=True, exist_ok=True)
        _pg = pgserver.get_server(str(folder), cleanup_mode='delete' if os.environ.get('PP_MEMORY_DB') else 'stop')
        url = _pg.get_uri()
    url = re.sub(r'^postgres(ql)?(\+\w+)?://', 'postgresql+psycopg://', url)
    if os.environ.get('PGSSL') == '1' and 'sslmode' not in url:
        url += ('&' if '?' in url else '?') + 'sslmode=require'
    return url


def engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(_url(), pool_size=5, max_overflow=5, pool_pre_ping=True, isolation_level='AUTOCOMMIT',
                                json_serializer=lambda o: json.dumps(o, default=str))
        migrate(_engine)
        meta.reflect(bind=_engine)
    return _engine


def close():
    global _engine, _pg
    if _engine is not None:
        _engine.dispose(); _engine = None
    if _pg is not None:
        try: _pg.cleanup()
        except Exception: pass
        _pg = None


def kind() -> str:
    return 'PostgreSQL' if os.environ.get('DATABASE_URL') else 'PostgreSQL (embedded)'


def migrate(eng: Engine):
    """Applies ./migrations in journal order; same bookkeeping as drizzle-orm's PostgreSQL migrator."""
    journal = json.loads((MIGRATIONS / 'meta' / '_journal.json').read_text(encoding='utf-8'))
    with eng.connect().execution_options(isolation_level='READ COMMITTED') as c:
        with c.begin():
            c.execute(text('CREATE SCHEMA IF NOT EXISTS "drizzle"'))
            c.execute(text('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'))
            last = c.execute(text('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1')).scalar()
        for e in journal['entries']:
            if last is not None and int(last) >= int(e['when']):
                continue
            sql = (MIGRATIONS / f"{e['tag']}.sql").read_text(encoding='utf-8')
            with c.begin():  # one transaction per migration file
                for stmt in sql.split('--> statement-breakpoint'):
                    if stmt.strip():
                        c.exec_driver_sql(stmt)
                c.execute(text('INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (:h, :t)'), {'h': hashlib.sha256(sql.encode()).hexdigest(), 't': int(e['when'])})


# ---------------- query helpers (every statement autocommits, like the API it replaces) ----------------
def rows(stmt, params: dict | None = None) -> list[dict]:
    with engine().connect() as c:
        r = c.execute(text(stmt) if isinstance(stmt, str) else stmt, params or {})
        return [dict(m) for m in r.mappings()] if r.returns_rows else []


def one(stmt, params: dict | None = None) -> dict | None:
    r = rows(stmt, params)
    return r[0] if r else None


def scalar(stmt, params: dict | None = None):
    with engine().connect() as c:
        return c.execute(text(stmt) if isinstance(stmt, str) else stmt, params or {}).scalar()


def run(stmt, params: dict | None = None):
    with engine().connect() as c:
        c.execute(text(stmt) if isinstance(stmt, str) else stmt, params or {})


def ins(table, values: dict | list[dict], returning: bool = True):
    """Insert one row (returns it) or many rows (returns the list)."""
    many = isinstance(values, list)
    if many and not values:
        return []
    groups: dict[tuple, list[dict]] = {}
    for v in (values if many else [values]):  # rows with the same columns go in one statement (missing columns keep their DB default)
        groups.setdefault(tuple(sorted(v)), []).append(v)
    out = []
    with engine().connect() as c:
        for group in groups.values():
            stmt = insert(table).values(group)
            if returning:
                stmt = stmt.returning(*table.c)
            r = c.execute(stmt)
            if returning:
                out += [dict(m) for m in r.mappings()]
    if not returning:
        return None
    return out if many else out[0]


def upd(table, where, values: dict):
    run(update(table).where(where).values(**values))


def get(table, **eq) -> dict | None:
    return one(select(table).where(and_(*[table.c[k] == v for k, v in eq.items()])))


def all_(table, *where, order=None, limit: int | None = None) -> list[dict]:
    stmt = select(table)
    if where:
        stmt = stmt.where(and_(*where))
    if order is not None:
        stmt = stmt.order_by(*(order if isinstance(order, (list, tuple)) else [order]))
    if limit:
        stmt = stmt.limit(limit)
    return rows(stmt)


def count(table, *where) -> int:
    stmt = select(func.count()).select_from(table)
    if where:
        stmt = stmt.where(and_(*where))
    return int(scalar(stmt) or 0)


# ---------------- JSON shape ----------------
def _camel_key(k: str) -> str:
    head, *rest = k.split('_')
    return head + ''.join(w[:1].upper() + w[1:] for w in rest)


def camel(row: dict | None) -> dict | None:
    """Database row (snake_case) to the API's camelCase JSON shape."""
    return None if row is None else {_camel_key(k): v for k, v in row.items()}


def camels(rs: Iterable[dict]) -> list[dict]:
    return [camel(r) for r in rs]


def logs(rs: Iterable[dict]) -> list[dict]:
    """Log tables (audit_events, automation_log) expose their created_at timestamp as `at`."""
    out = []
    for r in rs:
        d = camel(r); d['at'] = d.pop('createdAt', None); out.append(d)
    return out


__all__ = ['T', 'engine', 'close', 'kind', 'rows', 'one', 'scalar', 'run', 'ins', 'upd', 'get', 'all_', 'count', 'camel', 'camels', 'logs',
           'select', 'insert', 'update', 'delete', 'func', 'and_', 'or_', 'desc', 'asc', 'text', 'DATA_DIR']
