import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import uvicorn

load_dotenv()

try:
    sentry_sdk.init(
        dsn=os.environ['SENTRY_DSN'],
        traces_sample_rate=1.0,
    )
except Exception: 
    pass

app = FastAPI(title="HC Gateway API", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this based on your needs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
from routes import include_all_internal_routers
include_all_internal_routers(app)

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.environ.get('APP_HOST', '0.0.0.0'),
        port=int(os.environ.get('APP_PORT', 6644)),
        reload=bool(os.environ.get('APP_DEBUG', False))
    )
