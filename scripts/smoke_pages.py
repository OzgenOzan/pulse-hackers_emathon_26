"""Smoke the deployed demo or the same project-subpath build on loopback."""

import argparse
import json
import re
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from time import monotonic, sleep
from urllib.error import URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

from playwright.sync_api import Browser, BrowserContext, Locator, Page, Request, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = 'http://127.0.0.1:8080/pulse-hackers_emathon_26/'
DESKTOP = {'width': 1280, 'height': 720}
MOBILE = {'width': 390, 'height': 844}
BOOT_TITLE = 'Starting Şahin Göz in your browser'


@contextmanager
def preview(url: str | None):
    if url:
        yield url
        return
    with subprocess.Popen([sys.executable, str(ROOT / 'scripts/build_pages.py'), '--preview'], cwd=ROOT) as process:
        try:
            deadline = monotonic() + 15
            while process.poll() is None:
                try:
                    with urlopen(PREVIEW, timeout=1):
                        break
                except URLError:
                    if monotonic() >= deadline:
                        raise RuntimeError(f'Preview did not start at {PREVIEW}')
                    sleep(0.1)
            else:
                raise RuntimeError(f'Preview exited with status {process.returncode}')
            yield PREVIEW
        finally:
            if process.poll() is None:
                process.terminate()


def origin(url: str) -> str:
    parts = urlsplit(url)
    return f'{parts.scheme}://{parts.netloc}'


class Traffic:
    def __init__(self, context: BrowserContext, url: str):
        self.home = origin(url)
        self.urls: set[str] = set()
        self.finished: list[Request] = []
        self.errors: list[str] = []
        context.on('request', lambda request: self.urls.add(request.url))
        context.on('requestfinished', lambda request: self.finished.append(request))
        context.on('console', lambda message: self.errors.append(message.text) if message.type == 'error' else None)
        context.on('weberror', lambda error: self.errors.append(str(error.error)))

    def report(self, name: str) -> None:
        origins = {origin(url) for url in self.urls if urlsplit(url).scheme in {'http', 'https'}}
        assert origins == {self.home}, f'{name}: unexpected origins: {origins}'
        assert not self.errors, f'{name}: browser errors: {self.errors}'
        size = sum(max(0, request.sizes()['responseBodySize']) for request in self.finished)
        print(f'{name}: {size:,} response-body bytes, origins: {", ".join(sorted(origins))}')


def clean_page(browser: Browser, viewport: dict[str, int], url: str):
    context = browser.new_context(viewport=viewport)
    context.set_default_timeout(8_000)
    return context, Traffic(context, url), context.new_page()


def reset(page: Page) -> None:
    expect(page.locator('html')).to_have_attribute('lang', 'en')
    expect(page.get_by_test_id('connection-status')).to_have_text('Connected')
    page.get_by_test_id('role-physician').click()
    page.get_by_test_id('demo-reset').click()
    expect(page.locator('.demo-status')).to_contain_text('02:45')
    expect(page.get_by_test_id('stat-stabil')).to_have_attribute('aria-label', 'Stable: 11')
    expect(page.get_by_text('SIMULATED DATA', exact=True)).to_be_visible()


def step(page: Page, time: str) -> None:
    control = page.get_by_test_id('demo-step')
    expect(control).to_have_text('+15 min')
    control.click()
    expect(page.locator('.demo-status')).to_contain_text(time)


def settings(page: Page) -> None:
    button = page.get_by_test_id('nav-ayarlar')
    if not button.is_visible():
        page.get_by_test_id('nav-more').click()
    button.click()
    expect(page.get_by_test_id('language-tr')).to_be_visible()


def language_round_trip(page: Page, *, interactive_pages: bool) -> None:
    page.get_by_test_id('language-tr').click()
    expect(page.get_by_text('SİMÜLE VERİ', exact=True)).to_be_visible()
    page.reload()
    if interactive_pages:
        expect(page.get_by_text('Şahin Göz tarayıcınızda başlatılıyor', exact=True)).to_be_visible()
    expect(page.locator('html')).to_have_attribute('lang', 'tr')
    expect(page.get_by_text('SİMÜLE VERİ', exact=True)).to_be_visible(timeout=60_000)
    expect(page.locator('.demo-status')).to_contain_text('02:45')
    expect(page.get_by_test_id('alarm-Y01')).to_have_count(0)
    page.get_by_test_id('language-en').click()
    expect(page.locator('html')).to_have_attribute('lang', 'en')
    expect(page.get_by_text('SIMULATED DATA', exact=True)).to_be_visible()
    page.get_by_test_id('nav-genel-bakis').click()
    expect(page.get_by_test_id('stat-kritik').locator('.stat-count')).to_have_text('0')


def turkish_only_phrases() -> dict[str, re.Pattern[str]]:
    catalogs = ROOT / 'frontend/src/i18n'
    en = json.loads((catalogs / 'en.json').read_text(encoding='utf-8'))
    tr = json.loads((catalogs / 'tr.json').read_text(encoding='utf-8'))
    return {
        key: re.compile(rf'(?<!\w){re.escape(" ".join(value.split()))}(?!\w)')
        for key, value in tr.items()
        if len(value.strip()) >= 4 and not re.search(r'\{\w+\}', value) and en[key] != value
    }


def assert_english(surface: Locator, name: str, phrases: dict[str, re.Pattern[str]]) -> None:
    visible = ' '.join(surface.inner_text().split())
    leaked = [f'{key}: {match.group()}' for key, phrase in phrases.items() if (match := phrase.search(visible))]
    assert not leaked, f'{name} contains Turkish catalog values: {leaked}'


def smoke_interactive(browser: Browser, url: str, viewport: dict[str, int]) -> None:
    context, traffic, page = clean_page(browser, viewport, url)
    mobile = viewport == MOBILE
    try:
        start = monotonic()
        page.goto(url, wait_until='commit')
        expect(page.get_by_text(BOOT_TITLE, exact=True)).to_be_visible(timeout=10_000)
        expect(page.get_by_test_id('connection-status')).to_have_text('Connected', timeout=60_000)
        elapsed = monotonic() - start
        assert elapsed <= 60, f'Boot took {elapsed:.2f}s'
        print(f'{viewport["width"]}x{viewport["height"]}: interactive boot in {elapsed:.2f}s')
        reset(page)
        if not mobile:
            phrases = turkish_only_phrases()
            assert_english(page.locator('body'), 'Overview', phrases)
        step(page, '03:00')
        first = page.get_by_test_id('board-row-Y01')
        if not mobile:
            expect(first).to_contain_text('Ali Kurt')
            expect(first).to_contain_text('Close Watch')
            expect(page.get_by_test_id('board-row-Y06')).to_contain_text('Discharge assessment pending')
        step(page, '03:15')
        step(page, '03:30')
        panel = page.get_by_test_id('alarm-strip' if mobile else 'alarm-panel')
        expect(panel).to_be_visible()
        expect(panel).to_contain_text('Bed 01')
        second = page.get_by_test_id('board-row-Y02')
        expect(second).to_have_attribute('data-locked', 'true')
        second.click()
        expect(page.get_by_text('Record a clinical evaluation for the critical alarm first.', exact=True)).to_be_visible()
        expect(page.locator('dialog.patient-sheet')).to_have_count(0)
        if not mobile:
            assert_english(panel, 'Critical alarm panel', phrases)
            page.get_by_test_id('alarm-view-Y01').click()
            detail = page.locator('dialog.patient-sheet[open]')
            expect(detail).to_contain_text('Ali Kurt')
            expect(detail.locator('[role="status"]')).to_have_count(0)
            assert_english(detail, 'Bed 01 detail', phrases)
            page.keyboard.press('Escape')
            settings(page)
            expect(page.get_by_test_id('language-en')).to_have_attribute('aria-pressed', 'true')
            page.locator('.settings-rules summary').click()
            assert_english(page.locator('main'), 'Settings', phrases)
            language_round_trip(page, interactive_pages=True)
        assert any(urlsplit(request).path.endswith('/pyodide.asm.wasm') for request in traffic.urls), 'Worker Wasm traffic not observed'
        assert not any('/api/' in urlsplit(request).path for request in traffic.urls), 'Browser engine sent a network API request'
        traffic.report('Mobile' if mobile else 'Desktop')
    finally:
        context.close()


def smoke_local(browser: Browser, url: str) -> None:
    context, traffic, page = clean_page(browser, DESKTOP, url)
    try:
        page.goto(url)
        reset(page)
        settings(page)
        language_round_trip(page, interactive_pages=False)
        traffic.report('Local stage: English reset and saved Turkish reloaded')
    finally:
        context.close()
    context, traffic, page = clean_page(browser, DESKTOP, url)
    try:
        context.add_init_script("Object.defineProperty(window, 'localStorage', {get() { throw new Error('Storage disabled'); }});")
        page.goto(url)
        expect(page.get_by_text('SIMULATED DATA', exact=True)).to_be_visible()
        expect(page.locator('html')).to_have_attribute('lang', 'en')
        traffic.report('Local stage: denied storage still defaults to English')
    finally:
        context.close()


def smoke_fallback(browser: Browser, url: str, viewport: dict[str, int]) -> None:
    context, traffic, page = clean_page(browser, viewport, url)
    try:
        response = page.goto(url)
        assert response and response.ok, f'Fallback unavailable: {url}'
        expect(page.locator('html')).to_have_attribute('lang', 'en')
        expect(page.locator('meta[name="robots"]')).to_have_attribute('content', 'noindex')
        expect(page.get_by_text(re.compile(r'SIMULATED DATA.*not validated for clinical use', re.I))).to_be_visible()
        expect(page.locator('[lang="tr"]').get_by_text(re.compile('SİMÜLE VERİ'))).to_be_visible()
        expect(page.locator('video[controls]').first).to_be_visible()
        page.wait_for_function("document.querySelector('video').readyState >= 1")
        duration = page.locator('video').first.evaluate('(video) => video.duration')
        assert 55 <= duration <= 65, f'Expected the 60-second recording, got {duration:.1f}s'
        for image in page.locator('img').all():
            image.scroll_into_view_if_needed()
        assert page.locator('img').count() >= 3, 'Expected screenshots for light, dark and mobile layouts'
        page.wait_for_function("Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)")
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Fallback has horizontal overflow'
        video = page.request.get(urljoin(url, 'demo-backup.mp4'))
        assert video.ok and video.headers['content-type'].startswith('video/mp4'), 'Missing backup video'
        assert len(video.body()) > 1_000_000, 'The backup video is truncated'
        for path in ('raw_data', 'docs/demo-script.md'):
            assert page.locator(f'a[href*="{path}"]').count(), f'Fallback missing link to {path}'
        traffic.report(f'Fallback at {viewport["width"]}x{viewport["height"]} (plus {len(video.body()):,} backup video bytes verified)')
    finally:
        context.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Test a running Pages site instead of starting the loopback preview')
    parser.add_argument('--local-url', help='Also verify language behavior on a running local stage demo')
    parser.add_argument('--fallback', action='store_true', help='Verify the static jury page instead of the simulation')
    args = parser.parse_args()
    with sync_playwright() as playwright, preview(args.url) as url:
        browser = playwright.chromium.launch()
        for viewport in (DESKTOP, MOBILE):
            (smoke_fallback if args.fallback else smoke_interactive)(browser, url, viewport)
        if args.local_url:
            smoke_local(browser, args.local_url)


if __name__ == '__main__':
    main()
