"""Local API and same-origin app for the offline prototype."""

from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic as system_monotonic

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from app.adapters.simulator import DataSource, SimulatorSource
from app.api.routes import router
from app.engine.config import load_config
from app.state import Session, SessionError

DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_app(source: DataSource | None = None, monotonic: Callable[[], float] = system_monotonic,
               wall_now: Callable[[], datetime] = utc_now) -> FastAPI:
    app = FastAPI(title='Şahin Göz — simulated clinical decision support', docs_url=None,
                  redoc_url=None, openapi_url=None)
    app.state.session = Session(load_config(), source if source is not None else SimulatorSource(), monotonic, wall_now)
    app.include_router(router)

    @app.exception_handler(SessionError)
    async def session_error(_request: Request, exc: SessionError) -> JSONResponse:
        return JSONResponse({'detail': exc.key}, status_code=exc.status_code)

    @app.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        if path == 'api' or path.startswith('api/'):
            raise HTTPException(404)
        resolved = (DIST / path).resolve()
        if not resolved.is_relative_to(DIST):
            raise HTTPException(404)
        if path and resolved.is_file():
            return FileResponse(resolved)
        index = DIST / 'index.html'
        if path.startswith('assets/') or Path(path).suffix or not index.is_file():
            raise HTTPException(404)
        return FileResponse(index)

    return app


app = create_app()
