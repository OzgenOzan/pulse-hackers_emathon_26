"""Pure patient snapshot evaluation; does not mutate either input."""

from datetime import datetime

from app.domain.models import AlertCandidate, EngineResult, PatientSnapshot
from app.engine.config import EngineConfig
from app.engine.green import green_candidate
from app.engine.labs import ordered_labs, score_labs
from app.engine.vitals import observed_vitals, score_vitals, vital_evidence
from app.engine.yellow import yellow_candidate


def evaluate(patient_snapshot: PatientSnapshot, now: datetime, config: EngineConfig) -> EngineResult:
    if patient_snapshot.status != 'in_zone' or patient_snapshot.profile.arrived_at > now:
        return EngineResult()
    readings = observed_vitals(patient_snapshot, now)
    orders = ordered_labs(patient_snapshot, now)
    lab_components, suppressed = score_labs(patient_snapshot, orders, now, config)
    fresh, baseline = vital_evidence(readings, now, config.red)
    components = score_vitals(fresh, baseline, config.red) + lab_components
    score = sum(component.points for component in components)
    candidates: list[AlertCandidate] = []
    if score >= config.red.threshold:
        candidates.append(AlertCandidate(
            level='RED', target_role='physician', title_key='red_deterioration', params={'threshold': config.red.threshold},
            recommended_actions=['reassessing', 'move_to_red_zone', 'start_intervention', 'expected_for_patient'],
            components=components,
        ))
    yellow = yellow_candidate(patient_snapshot, readings, now, config.yellow)
    if yellow is not None:
        candidates.append(yellow)
    green = green_candidate(patient_snapshot, orders, now, score, config)
    if green is not None:
        candidates.append(green)
    return EngineResult(score=score, components=components, suppressed_labs=suppressed, candidates=candidates,
                        current_vital_evidence=fresh)
