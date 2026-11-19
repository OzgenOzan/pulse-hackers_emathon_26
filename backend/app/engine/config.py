"""Typed rule data. Only load_config touches the filesystem."""

from pathlib import Path
from typing import Literal, get_args

import yaml
from pydantic import PositiveInt, model_validator

from app.domain.models import Model

VitalParam = Literal['map', 'hr', 'temp', 'spo2', 'rr', 'sbp', 'dbp']
LabName = Literal['troponin', 'lactate', 'ph', 'potassium']


class VitalRule(Model):
    key: str
    param: VitalParam
    op: Literal['<', '<=', '>', '>=']
    value: float
    points: PositiveInt
    enabled: bool = True


class TrendRule(Model):
    key: str
    param: VitalParam
    direction: Literal['down', 'up']
    delta: float
    points: PositiveInt


class RedRules(Model):
    threshold: PositiveInt
    vital_max_age_minutes: PositiveInt
    vital_rules: list[VitalRule]
    trend_rules: list[TrendRule]
    critical_lab_points: PositiveInt


class CriticalBounds(Model):
    critical_low: float | None = None
    critical_high: float | None = None

    @model_validator(mode='after')
    def ordered_critical_bounds(self):
        if self.critical_low is None and self.critical_high is None:
            raise ValueError('provide at least one critical cutoff')
        if self.critical_low is not None and self.critical_high is not None:
            if self.critical_low >= self.critical_high:
                raise ValueError('critical_low must be below critical_high')
        return self


class LabRule(CriticalBounds):
    label: str
    unit: str
    ref_low: float | None = None
    ref_high: float | None = None

    @model_validator(mode='after')
    def ordered_reference_bounds(self):
        if (self.critical_low is None) != (self.ref_low is None) or (self.critical_high is None) != (self.ref_high is None):
            raise ValueError('provide matching reference and critical limits')
        bounds = [x for x in (self.critical_low, self.ref_low, self.ref_high, self.critical_high) if x is not None]
        if any(a >= b for a, b in zip(bounds, bounds[1:])):
            raise ValueError('reference limits must be strictly inside critical limits')
        return self


class DiagnosisGroup(Model):
    icd_prefixes: list[str]
    labs: list[LabName]


class PanicRules(Model):
    enabled: bool
    potassium: CriticalBounds
    ph: CriticalBounds

    def get(self, test: str) -> CriticalBounds | None:
        return getattr(self, test) if self.enabled and test in ('potassium', 'ph') else None


class YellowRules(Model):
    monitor_gap_minutes: PositiveInt
    vitals_overdue_minutes: PositiveInt
    vitals_overdue_escalate_minutes: PositiveInt

    @model_validator(mode='after')
    def ordered_escalation(self):
        if self.vitals_overdue_escalate_minutes < self.vitals_overdue_minutes:
            raise ValueError('escalation cannot precede overdue vitals')
        return self


class GreenRules(Model):
    idle_after_results_minutes: PositiveInt


class AlertingRules(Model):
    ack_cooldown_minutes: PositiveInt
    realert_score_increase: PositiveInt
    red_blocks_navigation: bool


class ManualBound(Model):
    min: float
    max: float

    @model_validator(mode='after')
    def ordered(self):
        if self.min >= self.max:
            raise ValueError('manual entry min must be below max')
        return self


class ManualEntry(Model):
    required: list[VitalParam]
    limits: dict[VitalParam, ManualBound]

    @model_validator(mode='after')
    def complete(self):
        if self.limits.keys() != set(get_args(VitalParam)):
            raise ValueError('manual entry must define limits for each vital parameter')
        if len(self.required) != len(set(self.required)):
            raise ValueError('manual entry required fields must be unique')
        return self


class EngineConfig(Model):
    cycle_minutes: PositiveInt
    red: RedRules
    labs: dict[LabName, LabRule]
    icd_lab_relevance: dict[str, DiagnosisGroup]
    universal_panic: PanicRules
    yellow: YellowRules
    green: GreenRules
    alerting: AlertingRules
    manual_entry: ManualEntry

    @model_validator(mode='after')
    def valid_lab_references(self):
        for group, mapping in self.icd_lab_relevance.items():
            if any(lab not in self.labs for lab in mapping.labs):
                raise ValueError(f'{group} references an undefined lab')
        for lab in ('potassium', 'ph'):
            if lab not in self.labs:
                raise ValueError(f'universal_panic references undefined lab: {lab}')
        return self


def load_config(path: Path | None = None) -> EngineConfig:
    source = path if path is not None else Path(__file__).with_suffix('.yaml')
    with source.open(encoding='utf-8') as handle:
        return EngineConfig.model_validate(yaml.safe_load(handle))
