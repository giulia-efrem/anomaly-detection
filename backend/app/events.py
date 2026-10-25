"""Live updates over the /ws WebSocket. Safe to publish from any thread."""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("veghe.events")


class EventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[str] | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue()
        self._task = asyncio.create_task(self._pump())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        for ws in list(self._clients):
            try:
                await ws.close()
            except Exception:
                pass
        self._clients.clear()

    def publish(self, event: dict[str, Any]) -> None:
        """Queue an event for every connected client. Callable from worker threads."""
        if not self._loop or not self._queue or self._loop.is_closed():
            return
        msg = json.dumps(event)
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, msg)
        except RuntimeError:
            pass  # loop shutting down

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def _pump(self) -> None:
        assert self._queue is not None
        while True:
            msg = await self._queue.get()
            dead = []
            for ws in list(self._clients):
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._clients.discard(ws)


bus = EventBus()
