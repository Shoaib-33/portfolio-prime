"""Portfolio & Prime API (FastAPI). Every route lives under /api; the Next.js website proxies /api/* here.

Run locally:  uvicorn app.main:app --reload --port 4000   (from apps/api)
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db, jobs
from .common import SESSION_COOKIE, ApiError, load_session
from .routers import access, account, admin, buyers, deals, institutional, integrations, messages, public
from .seed import seed_all

logging.basicConfig(level=logging.WARNING, format='%(levelname)s %(name)s: %(message)s')


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_in_threadpool(db.engine)      # connect + migrations + table reflection
    await run_in_threadpool(seed_all)       # demo data (idempotent)
    jobs.start()
    yield
    jobs.stop(); db.close()


def create_app() -> FastAPI:
    app = FastAPI(title='Portfolio & Prime API', version='2.0', lifespan=lifespan, docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)

    @app.middleware('http')
    async def session_and_headers(request: Request, call_next):
        token = request.cookies.get(SESSION_COOKIE)
        try:
            request.state.user = await run_in_threadpool(load_session, token) if token else None
        except Exception:
            request.state.user = None
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'; response.headers['Referrer-Policy'] = 'same-origin'
        return response

    # Errors keep the JSON shape the website reads: { statusCode, message, error }
    def err(status: int, message):
        return JSONResponse({'statusCode': status, 'message': message, 'error': ApiError.NAMES.get(status, 'Error')}, status_code=status)

    @app.exception_handler(ApiError)
    async def api_error(_: Request, e: ApiError): return err(e.status, e.message)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, e: StarletteHTTPException): return err(e.status_code, e.detail if isinstance(e.detail, str) else 'Error')

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, e: RequestValidationError):
        return err(400, '; '.join(f"{'.'.join(str(p) for p in x['loc'][1:])}: {x['msg']}" for x in e.errors()))

    for r in (public.router, account.router, deals.router, admin.router, messages.router, institutional.router, access.router, integrations.router, buyers.router):
        app.include_router(r, prefix='/api')
    return app


app = create_app()
