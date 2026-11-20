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

## GUI 2.0

- The remote `v1-audited` fallback points to the audited `main` commit `ba0261a`, before any GUI changes. Baseline: 94 backend tests, TypeScript, build, clinical rules and seeded noise checks passed.
- [Approved GUI brief](gui-2.0-brief.md) and [execution plan](superpowers/plans/2026-11-19-sahin-goz-gui-2.md). The engine and protected tests remain the control for this UI redesign.
- Added the pure risk classifier and GUI-only configuration: status precedence follows the existing engine, data gaps remain independent, and deterioration emphasis expires at the next scheduled assessment. `status.*`, `display.gcs_fresh_minutes`, and `manual_entry.limits.gcs` require clinical review; none changes scoring.
- Added the briefing's synthetic patient identities, separate GCS and consultation streams, and optional integer manual GCS. The new data does not alter clinical alerts or audit history; consultation requests/results do not affect discharge evaluation (**CLINICAL-REVIEW**).
- Both roles can record seeing an active critical alarm without closing it or lifting the navigation lock. Evaluation records accept an optional 280-character note. Replay guards, per-role idempotency, and unchanged legacy behavior passed the focused API suite.
- Added the GUI overview, patient projections, role-specific tasks and shared critical alarm list. All 121 backend tests passed, including the 94 unmodified baseline tests and the full hero count/lock sequence. SpO₂, respiratory rate and GCS have no active scoring flags (**CLINICAL-REVIEW**).
- P0: integrated the Turkish control panel, compact patient cards and detail, role-specific tasks, and the critical alarm / evaluation flow. Two production-build runs in Edge at 1280×720 matched audit entries except for wall timestamps. Both runs checked that “Alarmı gördüm” neither closes the alarm nor lifts the lock, including after reload.
- `make test`: 122 backend tests (the original 94 unchanged), TypeScript check and production build. Both generated-artifact checks passed.
- **CLINICAL-REVIEW:** `status.*`, `display.gcs_fresh_minutes` and `manual_entry.limits.gcs` are prototype rules and limits. Consult requests are display-only and do not affect discharge-evaluation alerts.
- P1 adds the role queues, clinical-rule settings, filterable cards and table, system/light/dark preferences, responsive navigation, and the persistent critical-alarm strip. Edge checks at 1920×1080, 1280×720, 1024×768 and 390×844 covered both roles and themes, with no document overflow, console errors or third-party requests.
- Density at 1280×720: 6 complete cards and 10 complete table rows at reset, and 7 complete table rows with one active alarm. At 1920×1080, all 12 cards were visible at 04:15 with three active alarms.
- The overview moves to the alarm strip on phones; the dedicated alarm and work-queue pages retain the full action controls. The narrow table scrolls internally. Native scenario, speed and filter selects can show an OS-drawn accent; app focus, selection and other accents are palette-controlled.
- [Design system and contrast](design-system.md) · [light screenshot](screenshots/gui-light.png) · [dark screenshot](screenshots/gui-dark.png) · [phone screenshot](screenshots/gui-mobile.png) · [60-second demo recording](demo-backup.mp4), decoded all 600 frames.
- A separate Edge run dropped three consecutive state requests: the phone showed the last-success timestamp, all 54 visible measured values lost their normal style, mutations were disabled, and the connection recovered when requests resumed.
- P2 started after P1 was published at 23:46 Istanbul time, before the 04:30 cutoff. Settings enables English only when both catalogs have matching nonempty messages and placeholder names. Turkish remains the default; the chosen language survives reload.
- The shift summary counts actual audit records and labels them as simulation activity, not clinical performance. In two final replays Edge showed one seen record, one recorded critical evaluation, and one filtered lab. Both runs produced the same 10 audit entries except for wall-clock timestamps.
- Final browser checks also covered a 48 px primary action and locked secondary alarm at 04:00, and English patient detail at 390×844 with localized staff/lab names and the disabled physician action.
- Published on [`feat/gui-2`](https://github.com/OzgenOzan/pulse-hackers_emathon_26/tree/feat/gui-2) and merged in [PR #3](https://github.com/OzgenOzan/pulse-hackers_emathon_26/pull/3) (`baca20b`).
- Review fixes distinguish a latched alarm's earlier findings from its current score, keep a prior evaluation out of a newly active alarm’s status, and show the seen/decision timeline and note in patient detail. A departed patient remains visible in the history with its detail action disabled and explained. The clinical engine and server-side lock are unchanged.
- Stale trend endpoints show the measurement time and the chart breaks at missing samples. Monitor-only gaps are distinct from overdue vitals, tablet navigation no longer covers the detail sheet, and one assertive critical alert region works on every route.
- Failed startup resources reload independently. A timed-out mutation keeps actions disabled until reconciliation. Edge held a real successful seen response: the connection showed offline, then accepted the saved seen record after recovery without sending a duplicate POST. The palette regression tests and final 571-key locale check passed.

## Follow-up 03

- The remote [`v2-gui`](https://github.com/OzgenOzan/pulse-hackers_emathon_26/tree/v2-gui) fallback was published before edits at `660407a` (the same tree as `baca20b`). Baseline: `make test` passed with 122 backend tests.
- §2.1 (`6c3306f`) — Vital flag severity, demo step, and overdue-vitals filter read the active rules. **CLINICAL-REVIEW:** localized hypoxaemia (SpO₂) and tachypnoea (RR) findings for the disabled candidate rules.
  Threshold regression failed on hard-coded `kritik`, then passed. At 1280×720 Edge kept the controls disabled without config, showed the default 15/30-minute labels once loaded, and stepped to 03:00.
- §2.2 (`0d52ac3`) — Added the seven missing TR/EN error keys; `not_at_bed` accepts only `left_bed`, `in_procedure`, or `other`. Tests first caught missing text and a 204 for `banana`, then verified catalog coverage and 422/204 for the rejected/allowed reasons.
- §2.3 — **CLINICAL-REVIEW:** score-based re-alert within the cooldown applies to critical alarms only. The lifecycle and Y03 API regressions initially re-fired; both pass with the guard. The original RED test is unchanged.
