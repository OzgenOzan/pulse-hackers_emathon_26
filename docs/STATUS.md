# Şahin Göz v0 status

## Done

- Reviewed the approved draft and three source PDFs; recorded the [12-task build plan](superpowers/plans/2026-11-19-sahin-goz-v0.md).
- Added the validated YAML loader and typed Python/TypeScript wire contract. The loader passed five tests covering the default and rejected config variants.
- Implemented pure alert transitions; six tests passed for latching, supersession, updates, cooldown, escalation and priority.
- Wrote the 12-profile, 120-event synthetic night shift. `scripts/generate_noise.py --check` reproduced the six noise patients' readings.
- Implemented deterministic clock and validated scenario playback. The clinical rule table renders from the active YAML config.
- `make test` passed: 79 backend tests, TypeScript type check, and Vite build. `make setup` also succeeded in a clean clone.
- `make dev` served Vite with a working API proxy; `make demo` served the built client and API from one Uvicorn process.
- Two 1280×720 Edge runs completed GREEN discharge → YELLOW reconnect → RED transfer. Each RED blocked another patient and survived reload. Audit entries matched except for actual UTC wall time.
- Verified the 56 px RED buttons were visible without scrolling, and the keyboard trap reached role/demo controls without entering the patient board.
- Verified Y05's filtered lactate in English and Turkish, Turkish preference after reload, the two vital sparklines, the honesty panel, and the Y08 chronic-baseline override in the audit. No external runtime origin was requested in the smoke run.
- [Demo script](demo-script.md), [decoded 60-second backup video](demo-backup.mp4), [clinical rules](clinical-rules.md), and [four browser screenshots](screenshots/) are available.
- Verified manual drafts do not cross patient identities or replays, the pre-alert selection survives refresh, and a latched RED distinguishes current score from earlier trigger evidence.
- The final re-review confirmed all ten review fixes. P0 and P1 are published on `feat/sahin-goz-v0`; no PR was opened because GitHub CLI was unavailable.

## Real vs simulated

- The application evaluates weighted rules, reconciles alerts, applies operator-selected changes to simulated patients, and records audit entries.
- The HBYS, monitor and lab feeds, clock, patient identities and four diagnosis-group mappings are all simulated. This is not for real clinical use.

## Assumptions

- The [initial prompt](../prompts/00_omp-initial-draft.md) and [audit follow-up](../prompts/01_omp-followup.md) live in `prompts/`. The original team PDFs remain unchanged.
- No fixture-only endpoints: the browser uses the real local API, engine, and scenario player.
- Simulated times are local to the scenario. Actual wall timestamps are UTC; identical replay audit checks inject a fixed wall clock, and real-session comparisons exclude wall timestamps only.
- Lab cutoffs are inclusive; reference limits are normal at equality. Unrecognized units are not scored. Result times and physician actions in the same simulated minute count the action as having addressed the result. Repeated tests are separate orders paired oldest pending first.
- Y06 and other profiles without specified arrival times use explicit synthetic times; Y06 arrives at 01:55, before the 02:00 lab orders.
- URL fragment preserves navigation through refresh; patients, results, and acknowledgement state remain on the server. No real integration or outbound runtime calls.
- The role switch controls demo views, not authentication or authorization. `wait_justified` is recorded as a physician action; its explicit 30-minute snooze is the exception to clearing GREEN indefinitely after an action.
- Monitor reconnection takes effect at the next cycle. Opening manual entry does not dismiss YELLOW; the nurse must submit a reading.
- The clinician team owns the numeric bounds. A scenario event cannot be an empty vital sample or a lab result without a value; a supplied MAP is accepted as measured rather than overwritten by the blood-pressure estimate.
- Clinical mutation requests include `X-Replay-Id` from `GET /api/state` (`sim.replay_id`). Stale requests cannot act on recycled demo IDs. This is a consistency check, not authentication.

## CLINICAL-REVIEW items

- Verify the vital weights/thresholds, baseline and trend approach, stale vitals window, diagnosis relevance groups, assay-specific reference and critical cutoffs, and universal panic bypass before making any demonstration claim about clinical performance.
- Review RED acknowledgement salience and navigation lock, cooldown and score-based re-alerts, role routing, and the distinction between results-ready and discharge-ready.
- Review inclusive critical cutoff interpretation, same-minute action semantics, and the Y08 chronic-baseline limitation. A clinician must always decide whether to reassess, intervene, transfer, or discharge.

## Known issues

- Not clinically validated. The test runner reports one dependency deprecation warning from Starlette's AnyIO blocking-portal alias.

## Next steps

- Review prototype defaults with the clinical team and rehearse with an independent clinician before the jury. [P2 backlog](backlog.md) is not implemented.

## Audit follow-up 01

- D1 — regressions reproduced the score drop (3 → 1) and stale-field masking. Freshness and baseline now resolve per parameter, and the board uses evaluated values. The focused engine, API and timeline checks passed (38 tests).
- D2 — the reconnect fixture reproduced a missing GREEN at 03:15; nurse acknowledgements now remain in audit without entering physician decision history.
- D3 — the new invalid-entry cases first returned 204. The server and bilingual form now enforce the clinician-supplied `manual_entry` rules; those limits are **CLINICAL-REVIEW** data-entry checks, not alert thresholds. The HR-only D1 replay is rejected after D3; the API test now supplies HR and BP while omitting optional fields, and engine tests still exercise HR-only observations.
- D4 — `banana` reproduced a 204; unsupported physician action types now return `422 invalid_action_type` without changing Y06's GREEN. The RED navigation guard still runs first.
- U1 — Edge at 1280×720 showed 11/11 44 px rows in both roles with no banner and 10 rows with one GREEN or YELLOW strip, with no page scroll. At 1920×1080 all 11 were visible with a banner.
- U2 — at 04:00, all four 56 px RED buttons were visible without scrolling in Edge (bottom at y=650). Opening the reason picker kept all three options and all four actions in view; only the evidence area scrolls.
- U3 — Edge showed all six RED evidence rows at 04:00 with consistent precision and no visible value over two decimals. The engine still uses raw values; the focused engine and replay suite passed (10 tests).
- U4 — with no URL selection, a nurse opening the board at 03:15 gets C.M. (S-03), the top YELLOW row. Edge also preserved an explicit A.K. selection after reload.
- U5 — Edge showed configured Lactate and K+ labels (including filtered lactate) and localized CBC, Creatinine and Urinalysis labels in English and Turkish.
- U6 — a fresh Edge load used the inline SVG icon, made no `/favicon.ico` request, and logged no errors.
- P2 — moved both prompts to `prompts/` and regenerated the [clinical rules](clinical-rules.md) with the manual-entry table. The documented hero clicks are unchanged.
- Review follow-through — timestamps and staleness now follow each displayed vital, halfway MAP values agree between rules and values, overflow YELLOW alerts remain actionable, and every unsupported physician-action string returns the same key. Verified with the off-cycle regression and an isolated three-alert browser fixture.
- Final checks — `make test` passed (94 backend tests, TypeScript and Vite); both generated-file checks passed. The scenario and two deterministic night-shift tests are unchanged. Edge blocked all seven invalid form cases before the POST, with localized messages, and accepted the valid entry. Two hero passes produced identical visible alerts and nine identical audit rows with no browser errors. Refreshed the [four 1280×720 screenshots](screenshots/) and decoded all 600 frames of the [60-second recording](demo-backup.mp4).
- Intentional behavior: a valid manual entry or acknowledgement re-evaluates immediately, so an alert can appear between the scheduled 15-minute evaluations.
