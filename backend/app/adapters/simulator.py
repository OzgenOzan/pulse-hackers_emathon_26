"""Data-source boundary for synthetic scenarios stored as JSON in app/sim/scenarios."""

from pathlib import Path
from typing import Protocol

from app.domain.models import Model
from app.sim.player import Scenario

SCENARIO_DIR = Path(__file__).resolve().parents[1] / 'sim' / 'scenarios'


class ScenarioInfo(Model):
    id: str
    title: str
    error: str | None = None


class InvalidScenario(ValueError):
    """Scenario file exists, but cannot be used for playback."""


class DataSource(Protocol):
    def list_scenarios(self) -> list[ScenarioInfo]: ...
    def load(self, scenario_id: str) -> Scenario: ...


class SimulatorSource:
    """Lists and loads scenarios. The scenario id is the JSON file stem."""

    def __init__(self, directory: Path = SCENARIO_DIR) -> None:
        self._directory = directory

    def _paths(self) -> dict[str, Path]:
        return {path.stem: path for path in sorted(self._directory.glob('*.json'))}

    def list_scenarios(self) -> list[ScenarioInfo]:
        infos = []
        for path in self._paths().values():
            try:
                scenario = self._load_path(path)
            except InvalidScenario as exc:
                infos.append(ScenarioInfo(id=path.stem, title=path.stem, error=str(exc)))
            else:
                infos.append(ScenarioInfo(id=scenario.id, title=scenario.title))
        return infos

    def load(self, scenario_id: str) -> Scenario:
        path = self._paths().get(scenario_id)
        if path is None:
            raise KeyError(scenario_id)
        return self._load_path(path)

    @staticmethod
    def _load_path(path: Path) -> Scenario:
        try:
            scenario = Scenario.load(path)
        except (ValueError, OSError) as exc:
            raise InvalidScenario(f'{path.name}: {exc}') from exc
        if scenario.id != path.stem:
            raise InvalidScenario(f'{path.name} declares id {scenario.id}')
        return scenario
