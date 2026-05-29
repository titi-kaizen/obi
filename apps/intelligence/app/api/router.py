from fastapi import APIRouter

from .articles import router as articles_router
from .sources import router as sources_router
from .operators import router as operators_router
from .pipeline import router as pipeline_router
from .dashboard import router as dashboard_router

api_router = APIRouter()

api_router.include_router(articles_router, prefix="/articles", tags=["Articles"])
api_router.include_router(sources_router, prefix="/sources", tags=["Sources"])
api_router.include_router(operators_router, prefix="/operators", tags=["Operators"])
api_router.include_router(pipeline_router, prefix="/pipeline", tags=["Pipeline"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
