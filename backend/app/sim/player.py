"""Scenario loading and deterministic event playback. Data only: no alerts, no clock."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, TypeAdapter

from app.domain.models import (
    LabOrder,
    Level,
    Model,
    PatientProfile,
    PatientSnapshot,
    PhysicianAction,
    VitalReading,
    VitalValues,
)

VITAL_FIELDS = frozenset(VitalValues.model_fields)


class VitalsEvent(VitalValues):
    type: Literal['vitals']
    patient: str
    source: Literal['monitor', 'manual']


class LabOrderEvent(Model):
    type: Literal['lab_order']
    patient: str
    test: str


class LabResultEvent(Model):
    type: Literal['lab_result']
    patient: str
    test: str
    value: float | None = None
    unit: str | None = None


class PhysicianActionEvent(Model):
    type: Literal['physician_action']
    patient: str
    action: str


class MonitorDisconnectEvent(Model):
    type: Literal['monitor_disconnect']
    patient: str
    resume: Literal['on_nurse_ack']


class ArrivalRef(Model):
    """Arrival as written in JSON. Scenario.load replaces it with an ArrivalEvent carrying the profile."""

    type: Literal['arrival']
    patient: str


class ArrivalEvent(Model):
    type: Literal['arrival']
    patient: str
    profile: PatientProfile


Event = (
    ArrivalEvent | VitalsEvent | LabOrderEvent | LabResultEvent
    | PhysicianActionEvent | MonitorDisconnectEvent
)

_RawEvent = TypeAdapter(Annotated[
    ArrivalRef | VitalsEvent | LabOrderEvent | LabResultEvent
    | PhysicianActionEvent | MonitorDisconnectEvent,
    Field(discriminator='type'),
])


class ExpectationFile(Model):
    patient: str
    level: Level
    first_at: str


class ScenarioFile(Model):
    id: str
    title: str
    start: datetime
    end: datetime
    patients: list[PatientProfile]
    events: list[dict[str, Any]]
    expect: list[ExpectationFile] = Field(default_factory=list)


class Expectation(Model):
    """Documented first alert in the scenario JSON. Read by tests; not used at runtime."""

    patient: str
    level: Level
    at: datetime


@dataclass(frozen=True)
class ScheduledEvent:
    at: datetime
    event: Event


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    start: datetime
    end: datetime
    patients: dict[str, PatientProfile]
    events: tuple[ScheduledEvent, ...]
    expect: tuple[Expectation, ...]

    @classmethod
    def load(cls, path: Path) -> 'Scenario':
        raw = ScenarioFile.model_validate_json(Path(path).read_text(encoding='utf-8'))
        if raw.end <= raw.start:
            raise ValueError('end must be after start')
        day = raw.start.date()

        patients: dict[str, PatientProfile] = {}
        for profile in raw.patients:
            if profile.id in patients:
                raise ValueError(f'duplicate patient id {profile.id}')
            patients[profile.id] = profile

        arrived: set[str] = set()
        scheduled: list[ScheduledEvent] = []
        for item in raw.events:
            payload = dict(item)
            if 't' not in payload:
                raise ValueError(f'event without time: {item}')
            at = _at(day, payload.pop('t'))
            event = _RawEvent.validate_python(payload)
            profile = patients.get(event.patient)
            if profile is None:
                raise ValueError(f'event for unknown patient {event.patient}')
            if at > raw.end:
                raise ValueError(f'{event.patient} event after scenario end: {at}')
            if isinstance(event, ArrivalRef):
                if at != profile.arrived_at:
                    raise ValueError(f'{event.patient} arrival event must match arrived_at')
                if event.patient in arrived:
                    raise ValueError(f'{event.patient} has two arrival events')
                arrived.add(event.patient)
                scheduled.append(ScheduledEvent(at, ArrivalEvent(
                    type='arrival', patient=event.patient, profile=profile,
                )))
                continue
            if at < profile.arrived_at:
                raise ValueError(f'{event.patient} has an event before arrival at {at}')
            scheduled.append(ScheduledEvent(at, event))

        missing = sorted(set(patients) - arrived)
        if missing:
            raise ValueError(f'patients without an arrival event: {missing}')
        # A disconnect sorts after same-time monitor samples so the boundary sample is kept.
        scheduled.sort(key=lambda item: (item.at, isinstance(item.event, MonitorDisconnectEvent)))

        expect = tuple(
            Expectation(patient=item.patient, level=item.level, at=_at(day, item.first_at))
            for item in raw.expect
        )
        for item in expect:
            if item.patient not in patients:
                raise ValueError(f'expectation for unknown patient {item.patient}')

        return cls(
            id=raw.id, title=raw.title, start=raw.start, end=raw.end,
            patients=patients, events=tuple(scheduled), expect=expect,
        )


def _at(day: date, hhmm: str) -> datetime:
    return datetime.combine(day, datetime.strptime(hhmm, '%H:%M').time())


@dataclass(frozen=True)
class Frame:
    time: datetime
    events: tuple[Event, ...]
    evaluate: bool


class Player:
    """Delivers scenario events in time order, plus one evaluated frame per cycle boundary."""

    def __init__(self, scenario: Scenario, cycle_minutes: int) -> None:
        if cycle_minutes < 1:
            raise ValueError('cycle_minutes must be positive')
        self._scenario = scenario
        self._cycle = timedelta(minutes=cycle_minutes)
        self._index = 0
        self._cursor: datetime | None = None

    @property
    def next_cycle_at(self) -> datetime | None:
        if self._cursor is None:
            return self._scenario.start
        return self._boundary_after(self._cursor)

    def reset(self) -> list[Frame]:
        """Deliver pre-start history and the start boundary; the player is then at start."""
        self._index = 0
        start = self._scenario.start
        frames = _frames(self._take(start), [start])
        self._cursor = start
        return frames

    def advance_to(self, target: datetime) -> list[Frame]:
        if self._cursor is None:
            raise RuntimeError('call reset() before advance_to()')
        target = min(target, self._scenario.end)
        if target <= self._cursor:
            return []
        boundaries: list[datetime] = []
        boundary = self._boundary_after(self._cursor)
        while boundary is not None and boundary <= target:
            boundaries.append(boundary)
            boundary = self._boundary_after(boundary)
        frames = _frames(self._take(target), boundaries)
        self._cursor = target
        return frames

    def _take(self, through: datetime) -> list[ScheduledEvent]:
        taken: list[ScheduledEvent] = []
        events = self._scenario.events
        while self._index < len(events) and events[self._index].at <= through:
            taken.append(events[self._index])
            self._index += 1
        return taken

    def _boundary_after(self, moment: datetime) -> datetime | None:
        start, end = self._scenario.start, self._scenario.end
        if moment >= end:
            return None
        cycles_elapsed = (moment - start) // self._cycle + 1
        return min(start + cycles_elapsed * self._cycle, end)


def _frames(taken: list[ScheduledEvent], boundaries: list[datetime]) -> list[Frame]:
    by_time: dict[datetime, list[Event]] = defaultdict(list)
    for item in taken:
        by_time[item.at].append(item.event)
    boundary_set = set(boundaries)
    times = sorted(by_time.keys() | boundary_set)
    return [Frame(t, tuple(by_time.get(t, ())), t in boundary_set) for t in times]


def apply_event(
    patients: dict[str, PatientSnapshot],
    event: Event,
    time: datetime,
    disconnected: set[str],
) -> None:
    """Change domain snapshots only. Monitor samples are dropped while the patient is in ``disconnected``."""
    if isinstance(event, ArrivalEvent):
        if event.patient in patients:
            raise ValueError(f'{event.patient} arrived twice')
        patients[event.patient] = PatientSnapshot(profile=event.profile)
        return
    if isinstance(event, MonitorDisconnectEvent):
        disconnected.add(event.patient)
        return

    snapshot = patients.get(event.patient)
    if snapshot is None:
        raise ValueError(f'{event.patient} has not arrived at {time}')

    if isinstance(event, VitalsEvent):
        if event.source == 'monitor' and event.patient in disconnected:
            return
        values = event.model_dump(include=VITAL_FIELDS)
        snapshot.vitals.append(VitalReading(time=time, source=event.source, **values))
    elif isinstance(event, LabOrderEvent):
        snapshot.labs.append(LabOrder(test=event.test, ordered_at=time))
    elif isinstance(event, LabResultEvent):
        order = next(
            (lab for lab in snapshot.labs if lab.test == event.test and lab.resulted_at is None),
            None,
        )
        if order is None:
            raise ValueError(f'{event.patient} {event.test} result at {time} has no pending order')
        order.resulted_at = time
        order.value = event.value
        order.unit = event.unit
    elif isinstance(event, PhysicianActionEvent):
        snapshot.actions.append(PhysicianAction(time=time, type=event.action))
