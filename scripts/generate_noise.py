"""Regenerate the six explicitly stored, seeded background vital streams."""

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from random import Random

SCENARIO = Path(__file__).resolve().parents[1] / 'backend/app/sim/scenarios/night_shift_0245.json'
NOISE_ORDER = ('Y04', 'Y07', 'Y09', 'Y10', 'Y11', 'Y12')


def walk(rng, previous, baseline, step, lower, upper):
    return max(lower, baseline - 8, min(upper, baseline + 8, previous + rng.randint(-step, step)))


def fill_noise(scenario):
    rng = Random(20261120)
    start, end = (datetime.fromisoformat(scenario[key]) for key in ('start', 'end'))
    events = [e for e in scenario['events'] if not (e['type'] == 'vitals' and e['patient'] in NOISE_ORDER)]
    for patient in NOISE_ORDER:
        base_hr = hr = rng.randint(72, 85)
        base_map = mean = rng.randint(84, 94)
        base_temp = temp = rng.randint(366, 370)
        boundary = start
        while boundary <= end:
            events.append({'t': boundary.strftime('%H:%M'), 'patient': patient, 'type': 'vitals', 'source': 'monitor',
                           'hr': hr, 'sbp': mean + 28, 'dbp': mean - 14, 'temp': temp / 10,
                           'spo2': rng.randint(95, 99), 'rr': rng.randint(14, 20)})
            hr = walk(rng, hr, base_hr, 4, 65, 92)
            mean = walk(rng, mean, base_map, 4, 78, 100)
            temp = walk(rng, temp, base_temp, 2, 363, 373)
            boundary += timedelta(minutes=15)
    return {**scenario, 'events': sorted(events, key=lambda e: e['t'])}


def render(scenario):
    # Keep synthetic events easy to diff: each one takes a single line.
    header = {key: scenario[key] for key in ('id', 'title', 'start', 'end')}
    parts = [json.dumps(header, ensure_ascii=False, indent=2)[:-2]]
    for key in ('patients', 'events', 'expect'):
        rows = ',\n'.join('    ' + json.dumps(row, ensure_ascii=False) for row in scenario[key])
        parts.append(f',\n  "{key}": [\n{rows}\n  ]')
    return ''.join(parts) + '\n}\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, nargs='?', default=SCENARIO)
    parser.add_argument('--check', action='store_true', help='fail if the included events differ from the seed')
    args = parser.parse_args()
    original = json.loads(args.source.read_text(encoding='utf-8'))
    result = fill_noise(original)
    if args.check:
        if result != original:
            parser.exit(1, 'Committed synthetic noise differs from the deterministic generator.\n')
        print('Synthetic noise matches seed 20261120.')
    else:
        print(render(result), end='')


if __name__ == '__main__':
    main()
