"""Render the clinical rule knobs from backend/app/engine/config.yaml as Markdown.

Usage:
  python scripts/export_rules.py          print the rendered rules to stdout
  python scripts/export_rules.py --check  fail unless docs/clinical-rules.md matches the rendering

Values come only from the canonical config parser; nothing is defaulted here.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

from app.engine.config import EngineConfig, load_config  # noqa: E402

CONFIG_YAML = ROOT / 'backend' / 'app' / 'engine' / 'config.yaml'
RULES_DOC = ROOT / 'docs' / 'clinical-rules.md'
REVIEW_MARKERS = ('CLINICAL-REVIEW', 'not in design report', 'candidate')


def _num(value: float | None) -> str:
    return '-' if value is None else str(value)


def _bound(op: str, value: float | None) -> str:
    return '-' if value is None else f'{op} {_num(value)}'


def _reference(low: float | None, high: float | None) -> str:
    return ', '.join(_bound(op, value) for op, value in [('≥', low), ('≤', high)] if value is not None) or '-'


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    lines += ['| ' + ' | '.join(row) + ' |' for row in rows]
    return lines


def _render(config: EngineConfig, source_lines: list[str]) -> list[str]:
    out = [
        f'Evaluation cadence: every {config.cycle_minutes} simulated minutes.',
        '',
        '## Red',
        '',
        f'- Threshold: {config.red.threshold} points',
        f'- Vital data maximum age: {config.red.vital_max_age_minutes} minutes',
        f'- Critical lab points: {config.red.critical_lab_points}',
        '',
        '### Vital rules',
        '',
        *_table(
            ['Key', 'Parameter', 'Rule', 'Points', 'Enabled'],
            [[f'`{r.key}`', r.param, f'{r.op} {_num(r.value)}', str(r.points), 'yes' if r.enabled else 'no']
             for r in config.red.vital_rules],
        ),
        '',
        '### Trend rules (versus the first reading in the zone)',
        '',
        *_table(
            ['Key', 'Parameter', 'Direction', 'Delta', 'Points'],
            [[f'`{r.key}`', r.param, r.direction, _num(r.delta), str(r.points)] for r in config.red.trend_rules],
        ),
        '',
        '## Labs',
        '',
        *_table(
            ['Lab', 'Unit', 'Reference', 'Critical low trigger', 'Critical high trigger'],
            [[f'{name} ({lab.label})', lab.unit or '-', _reference(lab.ref_low, lab.ref_high),
              _bound('≤', lab.critical_low), _bound('≥', lab.critical_high)]
             for name, lab in config.labs.items()],
        ),
        '',
        '## Diagnosis to lab relevance',
        '',
        *_table(
            ['Group', 'ICD prefixes', 'Labs'],
            [[f'`{group}`', ', '.join(f'`{p}`' for p in g.icd_prefixes), ', '.join(g.labs)]
             for group, g in config.icd_lab_relevance.items()],
        ),
        '',
        '## Universal panic (bypasses the diagnosis filter)',
        '',
        f'- Enabled: {"yes" if config.universal_panic.enabled else "no"}',
        *_table(
            ['Lab', 'Critical low trigger', 'Critical high trigger'],
            [[test, _bound('≤', bounds.critical_low), _bound('≥', bounds.critical_high)]
             for test, bounds in (('potassium', config.universal_panic.potassium),
                                  ('ph', config.universal_panic.ph))],
        ),
        '',
        '## Yellow',
        '',
        f'- Monitor gap: {config.yellow.monitor_gap_minutes} minutes',
        f'- Vitals overdue: {config.yellow.vitals_overdue_minutes} minutes',
        f'- Vitals overdue escalation: {config.yellow.vitals_overdue_escalate_minutes} minutes',
        '',
        '## Green',
        '',
        f'- Idle after results: {config.green.idle_after_results_minutes} minutes',
        '',
        '## Alerting',
        '',
        f'- Acknowledgement cooldown: {config.alerting.ack_cooldown_minutes} minutes',
        f'- Re-alert on score increase of: {config.alerting.realert_score_increase}',
        f'- Red blocks navigation: {"yes" if config.alerting.red_blocks_navigation else "no"}',
        '',
        '## Review markers in config.yaml',
        '',
    ]
    markers = [
        f'- line {number}: `{line.strip()}`'
        for number, line in enumerate(source_lines, 1)
        if any(marker in line for marker in REVIEW_MARKERS)
    ]
    return out + markers


def render(config: EngineConfig, source_lines: list[str]) -> str:
    header = [
        '# Clinical rules (generated)',
        '',
        'Generated from `backend/app/engine/config.yaml` by `scripts/export_rules.py`. Do not edit by hand.',
        '',
    ]
    return '\n'.join(header + _render(config, source_lines)) + '\n'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true', help='fail unless docs/clinical-rules.md matches')
    args = parser.parse_args(argv)

    rendered = render(load_config(), CONFIG_YAML.read_text(encoding='utf-8').splitlines())
    if not args.check:
        sys.stdout.buffer.write(rendered.encode('utf-8'))
        return 0
    if not RULES_DOC.is_file():
        print(f'missing {RULES_DOC.relative_to(ROOT)}', file=sys.stderr)
        return 1
    if RULES_DOC.read_text(encoding='utf-8') != rendered:
        print(f'{RULES_DOC.relative_to(ROOT)} differs from config.yaml; regenerate and review', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
