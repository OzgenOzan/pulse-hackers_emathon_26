# Şahin Göz: OMP prompt 04 (English by default, public demo on GitHub Pages)

> EM@THON 2026 · Team 4 PULSE HACKERS · deployment task after follow-up 03.
> Written against `main` at `718545d` (PR #4 merged), 20 Nov 2026, about 12:50 Istanbul time.
> Start OMP at the repository root on an up-to-date `main`. Either paste this whole file, or save it as `prompts/04_omp-github-pages.md` and say: "Read prompts/04_omp-github-pages.md completely and execute it."

---

## 0. Mission and ground rules

Two goals, in this order:

1. **English by default, everywhere (§2).** The app opens in English, both locally and on the public site, and everything new in this prompt is English first. Turkish stays one click away.
2. **A public demo (§3–§5)** at **https://ozgenozan.github.io/pulse-hackers_emathon_26/**, so that a juror can run the night shift on a laptop or phone without installing anything. Apart from the default language, the stage demo (`make demo` on the laptop) must not change in any way.

GitHub Pages serves static files only, and the UI needs the Python engine behind `/api`. **Decision (do not reopen it):** in a separate `pages` build, run the unchanged FastAPI app inside the browser with Pyodide (CPython compiled to WebAssembly) in a Web Worker, and swap only the transport in `frontend/src/api.ts`. The same Python code, rules and scenario then run in both places. Every visitor gets an isolated session, so jurors cannot overwrite each other's replay.

- **Do not:**
  - port any engine, session, rule or API logic to TypeScript;
  - host the backend anywhere else, or add CORS;
  - serve pre-recorded API responses;
  - use a service worker. `api.ts` is already the single seam, and a worker scoped to `/pulse-hackers_emathon_26/` could not intercept `/api/…` at the origin root anyway;
  - load anything from another origin at runtime. Pyodide and every wheel are self-hosted on the Pages site; AGENTS.md's "no outbound runtime requests" applies to the public site too. Build-time downloads in CI are fine.
- **Clock.** Check the Istanbul time at the start and write it in the plan as T0. The hard stop is T0 + 2:00, or an earlier time the team gives you.
  - Hard stop − 45 min: if the §5 smoke test is not green, ship the §7 fallback page so the URL exists, and keep the engine work on the branch.
  - Hard stop − 25 min: no new work. Hard stop − 15 min: run every check, push, open the PR. Report by the hard stop.
  - Never push a red `make test`.
- **Fallback first.** Before any change, run `git fetch`, tag `origin/main` as `v3-rules` (expected commit `718545d`) and push the tag. If a tag already points at that commit, reuse it and say so.
- **Do not change:**
  - anything under `backend/`, including `config.yaml`, the scenario, the tests and `requirements.txt` (one exception in §3.5);
  - the behaviour of `make dev`, `make demo` and the default `npm run build`, except the default language (§2), or the steps of `make setup` and `make test`. Add new targets and scripts only. The one allowed dependency change is the exact `pyodide` devDependency (§3.5);
  - any existing i18n string (add keys only);
  - the screenshots and `docs/demo-backup.mp4` (§6 may add English versions next to them);
  - the protected tests `test_exact_night_shift_timeline`, `test_scripted_user_replay_has_identical_alerts_and_audit` and `test_gui_hero_counts_and_lock`;
  - the **SIMULATED DATA** (**SİMÜLE VERİ**) pill and the About honesty panel, which stay visible in the public build.
- **Process.** No brainstorming step: this prompt is the approved spec.
  - Write a short **writing-plans** plan (8 tasks at most), saved as `docs/superpowers/plans/2026-11-20-github-pages.md`.
  - Use **systematic-debugging** for any Pyodide failure, **subagent-driven-development** for the §8 tracks, and **verification-before-completion** before you report.
  - Update `docs/STATUS.md` after every task, as AGENTS.md requires.
- **Git.** Branch `feat/github-pages` from the latest `main`. Make one Conventional Commit per item and push after each P0 item. Never commit to `main`, never force-push, never merge your own PR. Do not change repository settings (Pages source, environments, secrets); §11 lists what the owner must click.

## 1. What this check found (rely on it)

- **Language.** Turkish is the default today. `loadLanguage()` in `frontend/src/i18n/index.ts` returns English only when the `localStorage` key `sg.language` is `'en'`, and `frontend/index.html` has `lang="tr"` and a Turkish title. English is complete: both catalogs have 638 keys, and `englishAvailable` checks them at runtime. `gui/clinical.ts` already localizes numbers, dates, bed labels and the backend's Turkish notes, lab and consult labels.
- **One API seam.** `frontend/src/api.ts` is the only module that calls the API. Every call goes through `send()`, which calls `fetch(path, init)` with a same-origin path such as `/api/state?role=physician`. It reads `ok`, `status`, `statusText`, the `X-Replay-Id` response header and a JSON body, and passes the caller's `AbortSignal` (the 5-second deadline from `requestDeadline.ts`).
- **Hash routing** (`#/genel-bakis?role=…`), so Pages needs no SPA 404 fallback.
- **No threads needed.** Every route and dependency in `backend/app/api/routes.py` is `async def`, so FastAPI never uses its thread pool. That matters because Pyodide has no threads. The catch-all frontend route in `main.py` uses `FileResponse`; the browser build never calls it.
- **Plain in-memory app.** `create_app()` builds one `Session` guarded by an `asyncio.Lock`. The clock uses `time.monotonic`, the audit `datetime.now(timezone.utc)`. There are no lifespan hooks, no database and no network calls.
- **Runtime files.** `engine/config.yaml` (found next to `config.py`) and `sim/scenarios/*.json`. `main.py` evaluates `Path(__file__).resolve().parents[2]` at import, so the virtual file system needs at least two directories above `app/`, for example `/home/pyodide/engine/backend/app/…`.
- **Polling.** The UI polls `/api/state` every second. Three failed polls show **Disconnected** and disable every action, so the engine must be ready before the first poll.
- **Server wording.** `about.rulesAndData` (About dialog) and `gui.rules.confirmLifetime` (rules confirmation, `RulesEditor.tsx`) both say the rules last until the server restarts. In the browser, reloading the page is the server restart.
- **Tabs.** On the local server, rule changes are shared across tabs. In the browser build every tab runs its own session. That is intended; document it.
- **Repository.** It is public and has no `.github/` folder. Assume Pages is not configured yet. Existing tags: `v1-audited`, `v2-gui`.
- **Pyodide, checked on npm today:**
  - `latest` is 314.0.8 (Python 3.14.2); `stable-0.29` is 0.29.5 (Python 3.13.2).
  - The current release of every line bundles pydantic 2.10.x or 2.12.5, never the pinned 2.11.4. pydantic-core is compiled, so it can only come from Pyodide.
  - 0.29.5 bundles pydantic-core 2.41.5, PyYAML 6.0.2 (the pinned version), `ssl` (with `libopenssl`) and typing-extensions 4.15.0.
  - The pinned anyio 4.16.0 imports `ssl` at import time and, on Python < 3.15, requires typing-extensions ≥ 4.16.0.
  - The core alone is about 11 MB: `pyodide.asm.wasm` 8.6 MB and `python_stdlib.zip` 2.4 MB.

## 2. P0: English by default, everywhere (first commit)

- In `loadLanguage()`, return Turkish only when the saved choice is `'tr'`; otherwise return English. Keep today's safety net: if `englishAvailable` is false, use Turkish. If storage is unavailable, use English when it is available.
- In `frontend/index.html`, set `lang="en"` and the English title `ŞAHİN GÖZ 2.0 · Clinical Monitoring and Decision Support`. This is the same text `applyLanguage()` sets in English, so the page is English before JavaScript runs.
- This applies to both builds. Turkish stays one click away (**Settings → Language → Turkish**), and a saved choice still wins after reload, so a browser that has already chosen Turkish stays Turkish.
- Change no catalog string and no other language logic; `changeLanguage()` stays as it is.
- Everything new in this prompt is English first: the boot screen follows the UI language, the fallback page starts in English, the new-key table lists English first, and the smoke test runs in English.
- Commit this on its own (`feat(i18n): default to English`) and push it before the Pages work, so it lands even if the rest does not. The §9 language edits to the docs go in a second commit.

## 3. P0: the `pages` build

### 3.1 Build mode and commands

- Add `"build:pages": "vite build --mode pages"` to `frontend/package.json`. The output goes to `frontend/dist-pages/`; add it to `.gitignore`.
- In `vite.config.ts`, for pages mode only:
  - `base: './'`, so the site works under `/pulse-hackers_emathon_26/` and under any preview path;
  - `worker.format: 'es'`;
  - `<meta name="robots" content="noindex">`: a public clinical prototype should not turn up in search results.
- The default `vite build` must produce today's app (with the English default), with no Pyodide or worker code in it. Check that `frontend/dist` contains no `pyodide` string.
- **One assembly script**, `scripts/build_pages.py`, standard library only, so it runs the same on Windows. It runs the Vite pages build, then adds the Pyodide files (§3.5), `engine/engine.zip`, the backup video and `.nojekyll`.
- New Makefile targets; leave the existing ones as they are:
  - `make pages` builds the whole site into `frontend/dist-pages/`;
  - `make pages-preview` serves it at `http://127.0.0.1:8080/pulse-hackers_emathon_26/`, the real subpath, so base-path bugs show up locally. Like GitHub Pages, it must send `application/wasm` for `.wasm` and a JavaScript type for `.mjs`;
  - `make pages-smoke` runs §5.

### 3.2 Transport seam (`api.ts`)

- In `send()`, replace the one `fetch(path, init)` call with `transport(path, init)`. In the default build `transport` is `fetch`; in the pages build it is the engine client. Choose with `import.meta.env.MODE === 'pages'` and a dynamic import, so the default bundle never contains the engine.
- The engine client returns a real `Response`. It must:
  - copy the status and every response header (`X-Replay-Id` matters);
  - use a `null` body for 204, because the `Response` constructor throws otherwise;
  - honour the `AbortSignal`: reject with `signal.reason` when it is already aborted or aborts later, and drop the late reply.
- "The only module that calls the same-origin API" stays true. Change nothing else in `api.ts`, `useSession.ts` or `requestDeadline.ts`.

### 3.3 Engine worker (`frontend/src/engine/`)

- Start one module Web Worker per tab, exactly once: a module-level singleton, so React StrictMode cannot start two.
- Boot order:
  1. load Pyodide from the self-hosted `pyodide/` folder;
  2. `loadPackage` the compiled packages (§3.5);
  3. fetch `engine/engine.zip` and unpack it;
  4. run the Python bridge (§3.4);
  5. warm up with one `GET /api/state?role=physician`, so the first real poll is fast;
  6. post `ready`. Send progress messages for the boot screen between steps.
- Pass absolute URLs from the page, built with `new URL('pyodide/', document.baseURI)`. Inside a worker, relative URLs resolve against `assets/`.
- Follow Pyodide's Vite notes: exclude `pyodide` from `optimizeDeps` and pass `indexURL` explicitly. If Pyodide still tries its CDN for packages, point its package base URL at the same folder.
- Use a small request/reply protocol with ids. Concurrent requests are fine; the session lock serializes them.
- Convert results with `toJs`, and destroy every `PyProxy` you create. The UI polls every second, and a juror may leave the tab open for an hour: memory must stay flat.

### 3.4 Python bridge (`frontend/src/engine/asgi_bridge.py`, loaded with `?raw`)

- Put the vendored packages first on `sys.path`, then the engine's `backend/` directory, and import `app.main.app`: the unchanged `create_app()` instance.
- `dispatch(method, path, query, headers, body)` builds a standard ASGI 3 HTTP scope, sends the body as a single `http.request` message, collects `http.response.start` and `http.response.body`, and returns the status, headers and body bytes. No HTTP server, no uvicorn, no httpx.
- Avoid monkeypatching FastAPI, Starlette or the app. If one is truly unavoidable, keep it in the bridge, explain it in STATUS, and prove that `browser-parity` (§4) and §5 still pass.

### 3.5 Package set and version policy

- Pin Pyodide **0.29.5** (Python 3.13) as an exact devDependency (`npm install --save-dev --save-exact pyodide@0.29.5`), for its types and core files. `npm ci` must still pass. Do not use 314.x: Python 3.14 is untested here.
- **From Pyodide, take only the compiled packages:** `pydantic-core` 2.41.5, `pyyaml` 6.0.2 and `ssl`, with their lockfile dependencies (`libopenssl`; typing-extensions 4.15.0 comes along but is shadowed).
- **Vendor every pure-Python package at its `backend/requirements.txt` version:** fastapi 0.115.12, starlette 0.46.2, anyio 4.16.0, idna 3.20, typing-extensions 4.16.0, annotated-types 0.8.0 and typing-inspection 0.4.5. The one exception is pydantic, which must match pydantic-core: **2.12.5**.
  - Download them at build time with `pip download --no-deps --only-binary=:all:`. Unpack them, together with `backend/app`, into `engine.zip`: no tests, no `__pycache__`, entries in a sorted, deterministic order.
  - The vendored directory goes first on `sys.path`, so anyio gets typing-extensions 4.16.0.
- **Self-hosting:**
  - Copy the core files from `node_modules/pyodide` into `pyodide/`.
  - At build time, fetch only the files you load from `https://cdn.jsdelivr.net/pyodide/v0.29.5/full/`. Compute the closure from the `depends` fields in `pyodide-lock.json`; `pydantic_core` and `pydantic-core` are the same name.
  - Fail the build if any sha256 differs from the lockfile, and cache the downloads outside the repository.
- **The one accepted drift** is pydantic 2.11.4 → 2.12.5 (pydantic-core 2.33.2 → 2.41.5). Write the full browser package table in STATUS.
- **The only exception to "do not change `backend/`":** if `browser-parity` (§4) fails, make the smallest compatibility fix outside `backend/app/engine/`, in its own commit. It must keep the suite green with both the pinned and the browser package set. Never change a clinical value or a protected test.

### 3.6 Boot screen, errors and browser wording

- In pages mode, `main.tsx` shows a boot screen until the worker is ready, then renders `<ControlPanel />` as today. The boot screen uses the current UI language (English unless the browser saved Turkish) and the existing tokens; the palette check stays green.
- On failure (no WebAssembly, a failed download, a Python error), show a localized error with the technical message, a link to the backup video (copied into the site) and a link to the repository. Never a blank page.
- Add these keys to both catalogs. The team may refine the wording later.

| Key | EN | TR |
|---|---|---|
| `pages.boot.title` | Starting Şahin Göz in your browser | Şahin Göz tarayıcınızda başlatılıyor |
| `pages.boot.body` | The rules engine and simulation run on this device; no data is sent to a server. The first visit can take a moment. | Kural motoru ve simülasyon bu cihazda çalışır; sunucuya veri gönderilmez. İlk açılış biraz sürebilir. |
| `pages.boot.runtime` | Downloading the Python runtime… | Python çalışma ortamı indiriliyor… |
| `pages.boot.packages` | Loading packages… | Paketler yükleniyor… |
| `pages.boot.engine` | Starting the rules engine… | Kural motoru başlatılıyor… |
| `pages.boot.error` | The simulation could not start ({message}). | Simülasyon başlatılamadı ({message}). |
| `pages.boot.video` | Watch the 60-second backup video | 60 saniyelik yedek videoyu izleyin |
| `pages.boot.repo` | Source code and local setup | Kaynak kod ve yerel kurulum |
| `pages.rulesAndData` | The data is synthetic and listed in the repository's raw_data/ folder; physicians can tune the simulated rules in Settings until the defaults are restored or the page is reloaded. | Veriler sentetiktir ve GitHub deposundaki raw_data/ klasöründe listelenir; hekimler Ayarlar'da simülasyon kurallarını varsayılanlara dönülene veya sayfa yenilenene kadar değiştirebilir. |
| `pages.rules.confirmLifetime` | Custom rules stay active in this tab until defaults are restored or the page is reloaded. | Özel kurallar bu sekmede, varsayılanlara dönülene veya sayfa yenilenene kadar geçerlidir. |
| `pages.about.browser` | This public build runs the local demo's Python rules engine, unchanged, inside your browser (WebAssembly). Each tab runs its own simulation; reloading restarts the shift at 02:45 with the default rules. | Bu genel sürüm, yerel demodaki Python kural motorunu değiştirmeden tarayıcınızda (WebAssembly) çalıştırır. Her sekme kendi simülasyonunu yürütür; sayfayı yenilemek vardiyayı 02:45'ten varsayılan kurallarla yeniden başlatır. |

- In pages mode, `AboutPrototype.tsx` shows `pages.rulesAndData` instead of `about.rulesAndData` and adds `pages.about.browser`; `RulesEditor.tsx` shows `pages.rules.confirmLifetime` instead of `gui.rules.confirmLifetime`. The default build shows exactly today's text.

## 4. P0: GitHub Actions (`.github/workflows/pages.yml`)

- **Triggers:** `push` to `main`, `pull_request` and `workflow_dispatch`. Set top-level `permissions: contents: read` and `concurrency: { group: pages, cancel-in-progress: false }`.
- **Jobs:**

| Job | What it does |
|---|---|
| `test` | Ubuntu, Python 3.11 and Node 20 (the documented minimums): `make setup` and `make test`. |
| `browser-parity` | Python 3.13: install `backend/requirements.txt`, override only `pydantic==2.12.5 pydantic-core==2.41.5`, and run `python -m pytest -c backend/pytest.ini backend/tests`. This proves the browser's package set against every backend test. |
| `build` | Needs both. Runs `make pages`, then the §5 smoke test, then `actions/upload-pages-artifact` with `frontend/dist-pages`. |
| `deploy` | Needs `build`; runs only on `main`, never for pull requests. Uses `environment: github-pages` and `actions/deploy-pages`, with `pages: write` and `id-token: write` on this job only. |

- Use the current major versions of the official actions (checkout, setup-python, setup-node, configure-pages, upload-pages-artifact, deploy-pages). Cache npm and the wheel downloads.
- Run `browser-parity` locally first if Python 3.13 is available; otherwise its first CI run is the check.

## 5. P0: browser smoke test (`scripts/smoke_pages.py`)

Use Playwright for Python with Chromium. Pin it in the workflow and in `make pages-smoke`; do not add it to `backend/requirements.txt`. Run it against `make pages-preview` at 1280×720, in a fresh browser profile, so the UI starts in English:

1. The boot screen appears in English, and the app is ready within 60 seconds. Record the boot time.
2. **Physician → Reset**: 02:45, 11 **Stable** patients, **SIMULATED DATA** visible, `connection-status` shows **Connected**, and `<html lang="en">`.
3. **+15 min** (03:00): Bed 01 (Ali Kurt) is **Close Watch**, and Bed 06 has a discharge-evaluation task.
4. **+15 min** twice (03:30): the Bed 01 critical alarm appears and blocks; opening another patient stays locked.
5. **English completeness.** On the overview, the Bed 01 detail, the alarm panel and Settings, no `tr.json` value appears as a whole word or phrase in the visible text. Check only values of four or more characters, without placeholders, that differ from their English value. Patient names, staff names and the brand are expected.
6. **Settings → Language → Turkish**: **SİMÜLE VERİ** appears. Reload: the UI is still Turkish, and the shift is back at 02:45 with no alarm. Switch back to English.
7. At 390×844, repeat steps 2 and 4: the app boots in English, and the alarm strip shows the Bed 01 alarm.
8. Across the whole run: no request to any origin other than the site's, including from the worker; no console errors; no page errors.

Also run steps 2 and 6 once against `make demo` (`http://127.0.0.1:8000`) to prove the local default.

Print a short summary: boot time, total bytes downloaded, request origins and, if easy, the p95 latency of `/api/state`.

## 6. P1 and P2: only after P0 is pushed

- **P1: engine parity in the real runtime.** A Node script loads Pyodide 0.29.5 from the built `pyodide/` folder, the same `engine.zip` and the same bridge. It sends the request sequence of `test_gui_hero_counts_and_lock` (with `X-Replay-Id` taken from `sim.replay_id`), then unattended steps to 04:15. After every step, compare the JSON of `/api/state` (both roles), `/api/audit` and `/api/alerts?level=RED` with the same sequence run through CPython's `create_app()`. Ignore only `wall_time` and `replay_id`; any other difference is a bug. Add the script to the `build` job.
- **P1: live check.** After `deploy`, run the §5 smoke test against `steps.deployment.outputs.page_url`.
- **P2: English media.** Retake the light, dark and mobile screenshots in English at the same sizes, as `docs/screenshots/gui-light-en.png`, `gui-dark-en.png` and `gui-mobile-en.png`, and record an English 60-second backup with the same clicks as `docs/demo-backup-en.mp4`. Keep the Turkish files unchanged, and link both versions from the README, English first. If there is no time, list this as an open item.

## 7. Fallback (only if §5 is not green at hard stop − 45 min)

- Deploy a static `index.html` instead of the app: English first, with a Turkish section below it (`lang="en"` on the page, `lang="tr"` on the Turkish section). It contains:
  - the title and **SIMULATED DATA: not validated for clinical use** (**SİMÜLE VERİ**);
  - the 60-second video and the three screenshots;
  - links to `raw_data/`, `docs/demo-script.md` and the repository;
  - the `make setup` / `make demo` instructions.
- No external fonts or scripts. Same workflow, same URL. Keep the engine work on the branch, and report exactly where it stopped.

## 8. Work plan

1. **You:** check the time, tag, branch and write the plan, in about 10 minutes.
2. **You:** do §2 (two files), commit and push. It takes minutes and must land first.
3. **Then two subagents in parallel:**
   - **A (pipeline):** `scripts/build_pages.py`, the workflow, the new Makefile targets, `.gitignore`, and the §7 page, built but unused.
   - **B (frontend):** the `api.ts` seam, `frontend/src/engine/*`, `main.tsx`, `vite.config.ts`, `package.json` and its lock, the new i18n keys, `AboutPrototype.tsx` and `RulesEditor.tsx`.
4. **You:** prove `browser-parity` (§4). If it fails, pause B and apply the §3.5 exception first.
5. **Subagent C**, once A and B land: §5, then §6.
6. **You only** edit `README.md`, `AGENTS.md`, `docs/*` and `docs/STATUS.md`. Integrate, run `make test`, `make pages` and `make pages-smoke`, write the §9 docs, push and open the PR.

## 9. Docs

- **Language in `README.md` and `docs/demo-script.md`:**
  - In the hero path, "Try the night shift", "Editing clinical rules", the optional limitation rehearsal and the what-if Q&A, replace every Turkish UI label with its English label from `en.json`, followed by the Turkish label in parentheses. For example: **Physician → Reset** (**Hekim → Sıfırla**), **+15 min** (**+15 dk**), **Close Watch** (**Yakın Takip**).
  - Change only the labels. Never change the clicks, their order, the timings or the narration.
  - Replace README's "For an English-language rehearsal… The default Turkish clicks above match the backup recording." and the demo script's "the controls below are in Turkish" with this: the UI opens in English; for Turkish, choose **Settings → Language → Turkish**; the backup recording and the screenshots show the Turkish UI (until §6 adds English versions).
- **`README.md`:** near the top, a "Live demo (GitHub Pages)" section:
  - the URL;
  - the same Python engine runs in the browser through Pyodide, and the first load is about N MB (measure it);
  - each tab is its own session, and reloading restarts at 02:45 with the default rules;
  - the advisory YAML export works with the local server only;
  - the stage demo still uses `make demo`;
  - `make pages`, `make pages-preview` and `make pages-smoke`, with their PowerShell equivalents.
- **`AGENTS.md`:** two short lines. English is the default UI language, Turkish is in Settings, and both catalogs must stay complete. The pages build runs the unchanged backend in the browser, and the site makes no request to any other origin.
- **`docs/STATUS.md`:** an "English default and GitHub Pages" section with the decisions, the browser package table and the pydantic drift, the CI jobs, the smoke results (boot time, download size) and open items. Keep the history: record the new default here instead of editing older entries such as "Turkish remains the default".
- **`docs/demo-script.md`:** also add one line after the hero path: jurors can try the public link on their own devices.
- Save this prompt as `prompts/04_omp-github-pages.md`.

## 10. Definition of done (tick every box before you report)

- [ ] `v3-rules` was tagged and pushed before the first change.
- [ ] The English default was committed and pushed first. A fresh browser opens in English with both `make demo` and `make pages-preview`; a saved Turkish choice survives reload; `index.html` has `lang="en"`.
- [ ] `make test` passes; the three protected tests are unchanged; `git diff main -- backend/` is empty, or holds only the explained §3.5 exception.
- [ ] Apart from the language, `make demo` behaves as today, and `frontend/dist` contains no Pyodide or worker code.
- [ ] `browser-parity`: every backend test passes on Python 3.13 with pydantic 2.12.5.
- [ ] `make pages` builds a self-contained site, and §5 passes at 1280×720 and 390×844, including the English-completeness check, with no request to another origin and no console errors.
- [ ] The workflow is green on the PR, with `deploy` skipped.
- [ ] Every new string is in both catalogs; the locale and palette checks pass; no existing string changed.
- [ ] README and the demo script use English labels with the Turkish label in parentheses, and the flow is unchanged.
- [ ] README, AGENTS.md, STATUS and this prompt are committed.
- [ ] `feat/github-pages` is pushed and the PR is open by hard stop − 15 min, or the report says why not.

## 11. Final report (your last message)

1. Item by item (§2–§7): done, partly done or not done, with the commit for each.
2. Backend test counts, the `browser-parity` result and the §5 summary.
3. Deviations from this prompt, and the browser package table.
4. The PR link, and exactly what the repository owner must do:
   - **Settings → Pages → Build and deployment → Source: GitHub Actions** (once);
   - merge the PR: the push to `main` deploys, and **Actions → Run workflow** can redeploy later;
   - open https://ozgenozan.github.io/pulse-hackers_emathon_26/ and run the hero path once.
5. A note for the stage laptop: the UI now opens in English; to present in Turkish, choose **Settings → Language → Turkish** once, and the choice persists.
6. What the team should review: the new EN/TR wording, the English hero-path labels, and whether the §6 English media were done.
