import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_literal_session_errors_have_bilingual_copy():
    keys = {
        f'gui.error.{key.value}'
        for path in (ROOT / 'backend/app').rglob('*.py')
        for call in ast.walk(ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path)))
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == 'SessionError'
        and len(call.args) >= 2
        and isinstance(key := call.args[1], ast.Constant) and isinstance(key.value, str)
    }
    missing = {}
    for locale in ('tr', 'en'):
        catalog = json.loads((ROOT / f'frontend/src/i18n/{locale}.json').read_text(encoding='utf-8'))
        untranslated = sorted(key for key in keys if not catalog.get(key))
        if untranslated:
            missing[locale] = untranslated
    assert not missing, missing
