from fastapi import FastAPI
from .sync import router as sync_router
from .login import router as login_router
from .health import router as health_router
from .family import router as family_router

def include_all_internal_routers(app: FastAPI):
    app.include_router(health_router, tags=["Health"])
    app.include_router(sync_router, prefix="/sync", tags=["Sync"])
    app.include_router(login_router, tags=["Login"])
    app.include_router(family_router, tags=["Family"])