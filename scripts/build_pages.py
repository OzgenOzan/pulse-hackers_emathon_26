"""Assemble the GitHub Pages site into frontend/dist-pages.
Standard library only, so the same command runs on Windows and Linux.

    python scripts/build_pages.py             interactive site (Vite pages build + Pyodide engine)
    python scripts/build_pages.py --fallback  static jury fallback only
    python scripts/build_pages.py --preview   serve the existing site at http://127.0.0.1:8080/pulse-hackers_emathon_26/

Downloads (Pyodide files, pip wheels) happen at build time only. The Pyodide cache lives outside the
repository: $PAGES_CACHE_DIR, or ~/.cache/pulse-hackers-pages when that variable is unset.
"""

import argparse
import functools
import hashlib
import http.server
import json
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'frontend' / 'dist-pages'
FALLBACK_HTML = ROOT / 'scripts' / 'pages-fallback' / 'index.html'
DEMO_VIDEO = ROOT / 'docs' / 'demo-backup.mp4'
SCREENSHOTS = ('gui-light.png', 'gui-dark.png', 'gui-mobile.png')
PREVIEW_HOST = '127.0.0.1'
PREVIEW_PORT = 8080
PREVIEW_PREFIX = '/pulse-hackers_emathon_26/'

PYODIDE_VERSION = '0.29.5'
PYODIDE_CDN = f'https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/'
PYODIDE_CORE = (
    'pyodide.asm.js', 'pyodide.asm.wasm', 'pyodide.js', 'pyodide.mjs', 'python_stdlib.zip', 'pyodide-lock.json',
)
# Compiled packages taken from Pyodide; their lockfile depends are pulled in as well.
PYODIDE_PACKAGE_ROOTS = ('pydantic-core', 'pyyaml', 'ssl')
# Pure-Python packages vendored at their backend/requirements.txt versions; pydantic must match pydantic-core 2.41.5.
PURE_PACKAGES = (
    'fastapi==0.115.12', 'starlette==0.46.2', 'anyio==4.16.0', 'idna==3.20', 'typing-extensions==4.16.0',
    'annotated-types==0.8.0', 'typing-inspection==0.4.5', 'pydantic==2.12.5',
)
ENGINE_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def copy_static_media(site: Path) -> None:
    shutil.copyfile(DEMO_VIDEO, site / 'demo-backup.mp4')
    for name in SCREENSHOTS:
        shutil.copyfile(ROOT / 'docs' / 'screenshots' / name, site / name)
    (site / '.nojekyll').write_text('', encoding='utf-8')


def build_fallback() -> Path:
    shutil.rmtree(SITE, ignore_errors=True)
    SITE.mkdir(parents=True)
    shutil.copyfile(FALLBACK_HTML, SITE / 'index.html')
    copy_static_media(SITE)
    print(f'Fallback site written to {SITE}')
    return SITE


def npm_executable() -> str:
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if npm is None:
        sys.exit('npm is not on PATH; install Node.js 20 or newer.')
    return npm


def cache_dir() -> Path:
    override = os.environ.get('PAGES_CACHE_DIR')
    return Path(override) if override else Path.home() / '.cache' / 'pulse-hackers-pages'


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_name(name: str) -> str:
    return re.sub(r'[-_.]+', '-', name).lower()


def package_closure(packages: dict) -> list[dict]:
    """Return the lockfile entries for PYODIDE_PACKAGE_ROOTS and every package they depend on."""
    by_name = {canonical_name(key): entry for key, entry in packages.items()}
    selected: dict[str, dict] = {}
    pending = list(PYODIDE_PACKAGE_ROOTS)
    while pending:
        name = canonical_name(pending.pop())
        if name in selected:
            continue
        if name not in by_name:
            sys.exit(f'{name} is missing from pyodide-lock.json')
        selected[name] = by_name[name]
        pending.extend(by_name[name]['depends'])
    return [selected[name] for name in sorted(selected)]


def fetch_pyodide_file(entry: dict) -> Path:
    """Return a verified local copy of one Pyodide package file, downloading it into the cache when needed."""
    target = cache_dir() / f'pyodide-{PYODIDE_VERSION}' / entry['file_name']
    if not (target.is_file() and sha256_of(target) == entry['sha256']):
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + '.part')
        print(f'Downloading {entry["file_name"]}')
        with urllib.request.urlopen(PYODIDE_CDN + entry['file_name'], timeout=120) as response:
            partial.write_bytes(response.read())
        if sha256_of(partial) != entry['sha256']:
            partial.unlink()
            sys.exit(f'sha256 mismatch for {entry["file_name"]}; expected {entry["sha256"]}')
        partial.replace(target)
    return target


def copy_pyodide_runtime(site: Path) -> dict:
    """Copy the Pyodide core and compiled packages into site/pyodide; return the parsed lockfile."""
    node_pyodide = ROOT / 'frontend' / 'node_modules' / 'pyodide'
    package_json = node_pyodide / 'package.json'
    if not package_json.is_file():
        sys.exit('frontend/node_modules/pyodide is missing; run `make setup` first.')
    installed = json.loads(package_json.read_text(encoding='utf-8'))['version']
    if installed != PYODIDE_VERSION:
        sys.exit(f'pyodide {installed} is installed; expected exactly {PYODIDE_VERSION}.')
    target = site / 'pyodide'
    target.mkdir(parents=True, exist_ok=True)
    for name in PYODIDE_CORE:
        shutil.copyfile(node_pyodide / name, target / name)
    lock = json.loads((target / 'pyodide-lock.json').read_text(encoding='utf-8'))
    for entry in package_closure(lock['packages']):
        shutil.copyfile(fetch_pyodide_file(entry), target / entry['file_name'])
    return lock


def download_pure_wheels(destination: Path) -> list[Path]:
    subprocess.run(
        [sys.executable, '-m', 'pip', 'download', '--no-deps', '--only-binary=:all:', '--dest', str(destination),
         *PURE_PACKAGES],
        check=True,
    )
    wheels = sorted(destination.glob('*.whl'))
    if len(wheels) != len(PURE_PACKAGES):
        sys.exit(f'expected {len(PURE_PACKAGES)} wheels, got {[w.name for w in wheels]}')
    for wheel in wheels:
        if not wheel.name.endswith('-none-any.whl'):
            sys.exit(f'{wheel.name} is not a pure-Python wheel; it cannot run in Pyodide without its binary.')
    return wheels


def is_packaged(relative: Path) -> bool:
    parts = relative.parts
    return '__pycache__' not in parts and 'tests' not in parts and 'test' not in parts and relative.suffix != '.pyc'


def write_engine_zip(destination: Path) -> None:
    """Pack the vendored pure-Python packages and backend/app into one deterministic archive."""
    entries: dict[str, bytes] = {}
    with tempfile.TemporaryDirectory() as wheel_dir:
        for wheel in download_pure_wheels(Path(wheel_dir)):
            with zipfile.ZipFile(wheel) as archive:
                for info in archive.infolist():
                    relative = Path(info.filename)
                    if info.is_dir() or not is_packaged(relative):
                        continue
                    entries[f'vendor/{info.filename}'] = archive.read(info)
    app_root = ROOT / 'backend' / 'app'
    for path in app_root.rglob('*'):
        relative = path.relative_to(ROOT)
        if path.is_file() and is_packaged(relative):
            entries[relative.as_posix()] = path.read_bytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=ENGINE_ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, entries[name])
    destination.write_bytes(buffer.getvalue())


def build_interactive() -> Path:
    shutil.rmtree(SITE, ignore_errors=True)
    subprocess.run([npm_executable(), 'run', 'build:pages'], cwd=ROOT / 'frontend', check=True)
    if not (SITE / 'index.html').is_file():
        sys.exit('`npm run build:pages` did not write frontend/dist-pages/index.html; check outDir in vite.config.ts.')
    copy_pyodide_runtime(SITE)
    write_engine_zip(SITE / 'engine' / 'engine.zip')
    copy_static_media(SITE)
    print(f'Interactive site written to {SITE}')
    return SITE


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the site under PREVIEW_PREFIX, like GitHub Pages does for a project site."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.wasm': 'application/wasm',
        '.mjs': 'text/javascript',
        '.js': 'text/javascript',
        '.mp4': 'video/mp4',
        '.zip': 'application/zip',
    }

    def translate_path(self, path: str) -> str:
        url_path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if url_path == PREVIEW_PREFIX.rstrip('/'):
            url_path = PREVIEW_PREFIX
        if not url_path.startswith(PREVIEW_PREFIX):
            return os.path.join(self.directory, '__outside_site__')
        return super().translate_path('/' + url_path[len(PREVIEW_PREFIX):])


def preview(site: Path) -> int:
    if not (site / 'index.html').is_file():
        sys.exit(f'{site} is missing; run `make pages` or `make pages-fallback` first.')
    handler = functools.partial(PagesHandler, directory=str(site))
    server = http.server.ThreadingHTTPServer((PREVIEW_HOST, PREVIEW_PORT), handler)
    print(f'Serving {site} at http://{PREVIEW_HOST}:{PREVIEW_PORT}{PREVIEW_PREFIX} (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--fallback', action='store_true', help='build only the static jury fallback')
    mode.add_argument('--preview', action='store_true', help='serve the existing site on 127.0.0.1:8080')
    args = parser.parse_args(argv)
    if args.preview:
        return preview(SITE)
    if args.fallback:
        build_fallback()
        return 0
    build_interactive()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
