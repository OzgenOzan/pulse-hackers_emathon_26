"""Check the two shipped flat UI catalogs before publishing the English selector."""

import json
import re
from pathlib import Path

LOCALES = Path(__file__).resolve().parents[1] / 'frontend/src/i18n'
PLACEHOLDER = re.compile(r'\{\w+\}', re.ASCII)


def read_catalog(path: Path) -> dict[str, str]:
    def unique_entries(entries):
        catalog = {}
        for key, text in entries:
            if key in catalog:
                raise ValueError(f'{path.name}: duplicate key {key!r}')
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f'{path.name}: empty or non-text entry {key!r}')
            catalog[key] = text
        return catalog

    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_entries)


def check(source: dict[str, str], translated: dict[str, str]) -> list[str]:
    issues = [f'Missing in en.json: {key}' for key in sorted(source.keys() - translated.keys())]
    issues += [f'Missing in tr.json: {key}' for key in sorted(translated.keys() - source.keys())]
    issues += [f'Placeholder mismatch: {key}' for key in sorted(source.keys() & translated.keys())
               if set(PLACEHOLDER.findall(source[key])) != set(PLACEHOLDER.findall(translated[key]))]
    return issues


def main() -> int:
    try:
        source = read_catalog(LOCALES / 'tr.json')
        translated = read_catalog(LOCALES / 'en.json')
    except (OSError, ValueError) as exc:
        print(exc)
        return 1
    issues = check(source, translated)
    if issues:
        print('\n'.join(issues))
    else:
        print(f'GUI languages: {len(source)} matching keys and placeholder sets.')
    return int(bool(issues))


if __name__ == '__main__':
    raise SystemExit(main())
