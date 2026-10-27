"""Place lookup for radius search: our own city table first, then PDOK Locatieserver (free, open, no key) for postcodes and
other places. Results are cached in memory; a failed lookup never breaks the search."""
from __future__ import annotations
import os, re
import httpx
from .domain import CITY_GEO

_cache: dict[str, dict | None] = {}


def resolve_place(q: str) -> dict | None:
    key = str(q or '').strip().lower()
    if not key or len(key) > 60: return None
    if key in _cache: return _cache[key]
    city = next((c for c in CITY_GEO if c.lower() == key), None)
    out = {'name': city, 'lat': CITY_GEO[city]['lat'], 'lng': CITY_GEO[city]['lng'], 'source': 'city table'} if city else None
    if not out and os.environ.get('PP_OFFLINE') != '1':
        try:
            r = httpx.get('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free', timeout=3,
                          params={'rows': 1, 'fl': 'weergavenaam,centroide_ll', 'fq': 'type:(postcode OR woonplaats OR gemeente)', 'q': key})
            doc = (r.json().get('response') or {}).get('docs', [None])[0] or {}
            m = re.search(r'POINT\(([-\d.]+) ([-\d.]+)\)', doc.get('centroide_ll') or '')
            if m: out = {'name': doc['weergavenaam'], 'lng': float(m.group(1)), 'lat': float(m.group(2)), 'source': 'PDOK Locatieserver'}
        except Exception:
            pass  # offline or PDOK unavailable: treat as unknown place
    _cache[key] = out
    return out
