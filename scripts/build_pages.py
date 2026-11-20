"""Assemble the GitHub Pages site into frontend/dist-pages.

Standard library only, so the same command runs on Windows and Linux.

    python scripts/build_pages.py             interactive site (Vite pages build + Pyodide engine)
    python scripts/build_pages.py --fallback  static jury fallback only
    python scripts/build_pages.py --preview   serve the existing site at http://127.0.0.1:8080/pulse-hackers_emathon_26/
"""

import argparse
import functools
import http.server
import os
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'frontend' / 'dist-pages'
FALLBACK_HTML = ROOT / 'scripts' / 'pages-fallback' / 'index.html'
DEMO_VIDEO = ROOT / 'docs' / 'demo-backup.mp4'
SCREENSHOTS = ('gui-light.png', 'gui-dark.png', 'gui-mobile.png')
PREVIEW_HOST = '127.0.0.1'
PREVIEW_PORT = 8080
PREVIEW_PREFIX = '/pulse-hackers_emathon_26/'


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
    sys.exit('interactive build is not implemented yet')


if __name__ == '__main__':
    raise SystemExit(main())
