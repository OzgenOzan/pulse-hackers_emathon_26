"""Simulated clock. Wall time moves simulated time only while playing."""

import time
from collections.abc import Callable
from datetime import datetime, timedelta


def _checked_speed(speed: int) -> int:
    if isinstance(speed, bool) or not isinstance(speed, int) or speed < 1:
        raise ValueError('speed must be a positive integer multiplier of wall time')
    return speed


class SimClock:
    """Simulated time anchored at the last play, pause, step, or reset.

    While playing, ``now()`` equals the anchor plus wall seconds since the anchor
    times ``speed``. It stops at ``end`` and reports ``playing`` as False.
    """

    def __init__(
        self,
        start: datetime,
        end: datetime,
        *,
        monotonic: Callable[[], float] = time.monotonic,
        speed: int = 30,
    ) -> None:
        if end <= start:
            raise ValueError('end must be after start')
        self._start = start
        self._end = end
        self._monotonic = monotonic
        self._speed = _checked_speed(speed)
        self._anchor_sim = start
        self._anchor_wall: float | None = None

    @property
    def speed(self) -> int:
        return self._speed

    @property
    def playing(self) -> bool:
        self.now()
        return self._anchor_wall is not None

    def now(self) -> datetime:
        if self._anchor_wall is None:
            return self._anchor_sim
        elapsed = self._monotonic() - self._anchor_wall
        current = self._anchor_sim + timedelta(seconds=elapsed * self._speed)
        if current >= self._end:
            self._anchor_sim = self._end
            self._anchor_wall = None
            return self._end
        return current

    def play(self, speed: int | None = None) -> datetime:
        current = self.now()
        if speed is not None:
            self._speed = _checked_speed(speed)
        if current >= self._end:
            return current
        self._anchor_sim = current
        self._anchor_wall = self._monotonic()
        return current

    def pause(self) -> datetime:
        current = self.now()
        self._anchor_sim = current
        self._anchor_wall = None
        return current

    def step(self, minutes: int) -> datetime:
        if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes < 1:
            raise ValueError('step must be a positive number of minutes')
        current = self.pause()
        self._anchor_sim = min(current + timedelta(minutes=minutes), self._end)
        return self._anchor_sim

    def reset(self) -> datetime:
        self._anchor_sim = self._start
        self._anchor_wall = None
        return self._start
