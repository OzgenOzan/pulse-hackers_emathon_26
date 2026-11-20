# English Default and GitHub Pages Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent pipeline and frontend tracks. Track execution in the task list.

**Goal:** Open the stage app in English and give jurors a public, install-free preview.

**Architecture:** The normal Vite output keeps the HTTP transport. The optional Pages build runs the unchanged FastAPI app in a Pyodide module worker; the release workflow publishes the static media page when the browser smoke gate cannot be met.

**Tech Stack:** Python 3.11+/3.13, Node 20+, Vite, Pyodide 0.29.5, Playwright Chromium, GitHub Actions.

**Spec:** [`prompts/04_omp-github-pages.md`](../../../prompts/04_omp-github-pages.md).

## Global constraints

- T0: 12:54:27 Istanbul time. The requested 20-minute deadline is 13:14:27. The prompt's fallback and work-freeze checkpoints predate T0, so prioritize the English default and a verified static artifact; never publish an unverified engine. Request review as soon as the verified fallback is ready.
- Start at `origin/main` (`718545d`), push `v3-rules` before edits, and work on `feat/github-pages`. Do not merge, force-push, or change repository settings.
- Synthetic data only. Preserve the local build, catalog wording, graded scenario and protected tests; the approved English default is the only local behavior change. No cross-origin runtime resources.
- Update `docs/STATUS.md` at each completed checkpoint. Do not publish a red `make test`.

## Review focus

- No preference, explicitly saved Turkish, and denied storage: validate the language at runtime, not only the HTML.
- Deployment under the real repository subpath: preview there and verify every fallback media request returns 200.
- Worker warmup, cancellation and 204: gate UI mount, preserve replay headers, discard late replies, and use an empty body for 204.
- Browser package drift: use lockfile hashes and prove Python 3.13 backend parity before shipping the interactive artifact.
- GitHub permissions: PR builds must not deploy; only a successful main build may enter the Pages environment.

## Tasks

1. **English default (§2).** In `frontend/src/i18n/index.ts`, prefer English unless explicitly saved Turkish or the English catalog is incomplete; set English metadata in `frontend/index.html`. Run a fresh-profile browser check before and after; run `make test`, then commit and push this item first.
2. **Static jury artifact (§7).** Add bilingual, noindex `scripts/pages-fallback/index.html` and a `scripts/build_pages.py --fallback` mode that puts the page, backup MP4, three screenshots and `.nojekyll` in `frontend/dist-pages/`. Preview below `/pulse-hackers_emathon_26/`; verify desktop and mobile, local media and no external asset requests.
3. **Workflow and build (§§3.1, 3.5, 4).** Add Pages-only Make targets, lock-hash-verified package assembly, Python 3.11 test and Python 3.13 parity jobs, then artifact upload and main-only deploy. Keep the static artifact selected until the interactive smoke is green. Review workflow permissions separately.
4. **Browser frontend and Python bridge (§§3.2–3.6).** Add the Vite pages mode, English-first bilingual boot, worker/bridge and pages-only API adapter. The client exports `transport(path: string, init: RequestInit): Promise<Response>` and accepts root API paths; the bridge dispatches HTTP ASGI requests to the unchanged app. Review worker concurrency separately.
5. **Smoke coverage (§5).** Add Playwright checkpoints from §5 for desktop and mobile and the same language flow locally; record boot, requests and bytes. Measure from the real preview subpath. Run parity before any interactive promotion.
6. **Jury and contributor documentation (§9).** Pair English and Turkish screen labels without altering the hero, and document the actually selected artifact, owner settings, package versions and observed results. Include the approved prompt byte-for-byte.
7. **Post-P0 (§6).** Exercise real-runtime parity and live smoke only after P0 is published and green; capture the English media only if the deadline allows. Report any checks and media not run.
