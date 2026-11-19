from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError


def test_prototype_config_is_loadable():
    from app.engine.config import load_config

    config = load_config()
    assert config.red.threshold == 3
    assert config.labs['troponin'].unit == 'ng/L'
    assert not next(rule for rule in config.red.vital_rules if rule.key == 'spo2_low').enabled


@pytest.mark.parametrize(('section', 'change', 'diagnostic'), [
    ('yellow', lambda data: data.update(mointor_gap_minutes=15), 'mointor_gap_minutes'),
    ('green', lambda data: data.pop('idle_after_results_minutes'), 'idle_after_results_minutes'),
    ('red', lambda data: data['vital_rules'][0].update(op='<=='), 'op'),
    ('universal_panic', lambda data: data.update(unmapped_lab={'critical_high': 5}), 'unmapped_lab'),
])
def test_invalid_config_explains_startup_failure(tmp_path, section, change, diagnostic):
    from app.engine.config import load_config

    source = Path(__file__).parents[1] / 'app' / 'engine' / 'config.yaml'
    raw = yaml.safe_load(source.read_text(encoding='utf-8'))
    change(raw[section])
    path = tmp_path / 'rules.yaml'
    path.write_text(yaml.safe_dump(raw), encoding='utf-8')
    with pytest.raises(ValidationError, match=diagnostic):
        load_config(path)
