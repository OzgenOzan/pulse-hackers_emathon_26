"""Data-source boundary for synthetic scenarios stored as JSON in app/sim/scenarios."""

from pathlib import Path

from app.domain.models import Model
from app.sim.player import Scenario

SCENARIO_DIR = Path(__file__).resolve().parents[1] / 'sim' / 'scenarios'


class ScenarioInfo(Model):
    id: str
    title: str


class SimulatorSource:
    """Lists and loads scenarios. The scenario id is the JSON file stem."""

    def __init__(self, directory: Path = SCENARIO_DIR) -> None:
        self._directory = directory

    def _paths(self) -> dict[str, Path]:
        return {path.stem: path for path in sorted(self._directory.glob('*.json'))}

    def list_scenarios(self) -> list[ScenarioInfo]:
        return [
            ScenarioInfo(id=scenario.id, title=scenario.title)
            for scenario in (Scenario.load(path) for path in self._paths().values())
        ]

    def load(self, scenario_id: str) -> Scenario:
        path = self._paths().get(scenario_id)
        if path is None:
            raise KeyError(scenario_id)
        scenario = Scenario.load(path)
        if scenario.id != scenario_id:
            raise ValueError(f'{path.name} declares id {scenario.id}')
        return scenario
