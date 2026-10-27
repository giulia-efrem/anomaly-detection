"""FastAPI entry point. Run with: .venv\\python.exe -m uvicorn app.main:app --port 8000"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, db
from .events import bus
from .routes import cameras, incidents, library, models, system
from .runtime import cameras as manager
from .runtime import pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    await bus.start()
    for cam in db.list_cameras():
        manager.start(cam)
    pipeline.start()  # loads the models in its own thread, so the API answers right away
    yield
    pipeline.stop()
    pipeline.join(timeout=5)
    manager.stop_all()
    await bus.stop()


app = FastAPI(title="Veghe", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(system.router)
app.include_router(cameras.router)
app.include_router(incidents.router)
app.include_router(library.router)
app.include_router(models.router)
