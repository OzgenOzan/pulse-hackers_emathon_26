"""FastAPI transport for the single-session demonstration."""

from collections.abc import AsyncIterator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import StringConstraints

from app.domain.models import AuditEntry, Model, PatientDetail, Role, StateView, VitalValues
from app.engine.config import EngineConfig
from app.state import Session, SessionError

router = APIRouter(prefix='/api')
Word = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class AckInput(Model):
    action: Word
    reason: Word | None = None


class PhysicianInput(Model):
    type: str


class ResetInput(Model):
    scenario_id: Word | None = None


class PlayInput(Model):
    speed: Literal[30, 60, 120]


class StepInput(Model):
    minutes: int


async def current_session(request: Request) -> AsyncIterator[Session]:
    session: Session = request.app.state.session
    async with session.lock:
        session.catch_up()
        yield session


Current = Annotated[Session, Depends(current_session)]


async def current_mutation(session: Current, x_replay_id: Annotated[str | None, Header()] = None) -> Session:
    session.require_replay(x_replay_id)
    return session


Mutable = Annotated[Session, Depends(current_mutation)]


@router.get('/health')
async def health(session: Current):
    return {'status': 'ok', 'sim_time': session.now}


@router.get('/state')
async def state(session: Current, role: Role = 'physician') -> StateView:
    return session.view(role)


@router.get('/patients/{patient_id}')
async def detail(patient_id: str, session: Current, role: Role = 'physician') -> PatientDetail:
    return session.detail(patient_id, role)


@router.post('/patients/{patient_id}/vitals', status_code=204)
async def manual_vitals(patient_id: str, body: VitalValues, session: Mutable) -> None:
    session.add_vitals(patient_id, body)


@router.post('/patients/{patient_id}/actions', status_code=204)
async def physician_action(patient_id: str, body: PhysicianInput, session: Mutable) -> None:
    session.physician_action(patient_id, body.type)


@router.post('/alerts/{alert_id}/ack', status_code=204)
async def acknowledge(alert_id: str, body: AckInput, session: Mutable) -> None:
    session.acknowledge(alert_id, body.action, body.reason)


@router.get('/scenarios')
async def scenarios(session: Current):
    return session.source.list_scenarios()


@router.post('/sim/reset', status_code=204)
async def reset(session: Current, body: ResetInput | None = None) -> None:
    session.reset((body.scenario_id if body else None) or session.scenario_id)


@router.post('/sim/play', status_code=204)
async def play(body: PlayInput, session: Current) -> None:
    session.clock.play(body.speed)


@router.post('/sim/pause', status_code=204)
async def pause(session: Current) -> None:
    session.clock.pause()
    session.catch_up()


@router.post('/sim/step', status_code=204)
async def step(body: StepInput, session: Current) -> None:
    if body.minutes != session.config.cycle_minutes:
        raise SessionError(422, 'invalid_step_minutes')
    session.clock.step(body.minutes)
    session.catch_up()


@router.get('/audit')
async def audit(session: Current) -> list[AuditEntry]:
    return session.audit


@router.get('/config')
async def config(session: Current) -> EngineConfig:
    return session.config
