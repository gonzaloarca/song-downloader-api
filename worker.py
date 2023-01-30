from uvicorn.workers import UvicornWorker


class AsyncioLoopUvicornWorker(UvicornWorker):
    CONFIG_KWARGS = {"loop": "asyncio"}
