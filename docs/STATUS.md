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
- §2.3 (`5da36ac`) — **CLINICAL-REVIEW:** score-based re-alert within the cooldown applies to critical alarms only. The lifecycle and Y03 API regressions initially re-fired; both pass with the guard. The original RED test is unchanged.
- §2.4 (`345d610`, `dd9dd99`) — `make test` and the Windows PowerShell commands check the clinical rules export, seeded noise, and raw-data export. Both P0 checkpoints passed with 127 backend tests and all frontend checks.
- §3 (`dd9dd99`) — [Raw jury data](../raw_data/) includes 12 synthetic patient pages, 91 vital samples, all lab orders and results, 135 canonical events, and the five documented first alerts. `--check` passed, including a BOM and CRLF text comparison smoke; the projection preserved measured MAP in a synthetic variant, marked six undelivered Y03 samples, and showed the Y05 suppression. Excel opened the 91×14 vitals table and preserved ş, ğ and İ in the patient data.
  The published Y01 page was also checked with GitHub's Markdown renderer: identity, vitals, and lab tables render with the synthetic notice.

- §4.1–4.2 and §4.4 (`8f97026`) — Config defaults, guarded apply/reset, structured field errors and process-lived history. The original 32 rules API cases failed before implementation; seven further cases reproduced malformed keys, incorrect bound locations, invalid scenario reload, no-op replay rotation, and clock range. All 39 passed after the fixes. A concurrent-write smoke accepted one PUT and rejected the other with `stale_replay`, recording one change.

### Clinical rules decisions

- The clinician-owned YAML remains the default and is never written by the app. An override and its change history live in memory for the server process; the normal replay reset keeps the active rules, while **Varsayılan kurallara dön** or a server restart restores the shipped defaults.
- The physician demo role can apply rules; the nurse sees the read-only view. This is not authentication and the rules apply session-wide, not per user or per tab.
- Applying or restoring rules restarts the replay at 02:45 with a new replay ID. The confirmation warns that open critical alarms and replay records are cleared. The replay audit stays separate from rules history.
- Only the whitelisted numeric and Boolean settings are editable. Cutoffs that are `null`, rule metadata, diagnosis mappings, required measurements, evaluation cadence, and the RED navigation interlock remain read-only. Validation preserves integer fields and checks the existing score, lab, overdue, manual-entry, and GCS constraints. An invalid request leaves the rules and replay unchanged.
- **CLINICAL-REVIEW:** edited thresholds are simulation what-ifs only. Confirm the SpO₂/RR language and RED-only re-alert, and start the jury demo with default rules and no **ÖZEL KURAL SETİ** pill.

- §4.3 (`12fec05`) — Edge at 1280×720 replayed the default hero twice with identical 03:30 seen/transfer records and no custom badge. In Settings, threshold 2 restarted at 02:45 and made Y01 critical at 03:15; both neutral badges appeared. Reset warned about the unrecorded critical alarm and removed both badges. Invalid Close Watch threshold 3 focused the field error without applying; decimal comma worked; the nurse view was read-only. With the next poll held in a second tab, a stale draft received the localized conflict and the active config refreshed. The browser observed no page errors and only loopback resource origins.

### Optional P2 checks

- §5 (`a4602e7`, `2020c98`) — Edge with `AbortSignal.any` and `AbortSignal.timeout` unavailable still loaded config and stepped to 03:00. In two tabs, the second tab followed playback at 60× and 120× and reset to 30×.
- §5 (`bd0cf1b`) — The derived default replay CSV produced 90 patient evaluations across eight cycle boundaries, including Y01 at score 2 / Yakın Takip at 03:15 and score 3 / Kritik at 03:30.
- §5 (`f841521`) — The YAML proposal is an attachment labelled `öneri — config.yaml'ın yerine geçmez`; the download matched active custom rules and did not reset the replay.

### Deferred until after the jury

- M2: return structured vital flag keys instead of Turkish strings from `gui_projection.py`.
- M5: prune unused v1 locale keys and add a dead-key check.
- C4: support scenarios crossing midnight; today invalid timelines are rejected at load.
- Add Vitest/React Testing Library safety tests and GitHub Actions CI.
- Add persistence, actual role-based authorization, and server-sent events.

### Release checks

- `make test`: 166 backend tests versus 122 on the verified baseline; palette and its two tests, 638 matching locale keys and placeholders, TypeScript, Vite, and all three generated-artifact checks passed. The existing Starlette/AnyIO deprecation warning remains.
- The clinician-owned YAML, night-shift JSON, three protected tests, original RED re-alert test, screenshots, backup recording, and original hero text are unchanged. The what-if rehearsal is an optional Q&A beat only.
