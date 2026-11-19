# Şahin Göz 2.0 GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for the parallel frontend tracks; §8 explicitly assigns backend and integration to the controller. Track work in omp's todo and SDD ledger.

**Goal:** Ship a Turkish-first clinical control panel for the synthetic night shift without changing clinical decisions, replay behavior, or the existing API contract.

**Architecture:** Keep the existing evaluator and lifecycle authoritative. Add display projections, risk status, role-specific seen metadata and evaluation notes in the session/API boundary. Three frontend tracks share the new typed API, tokens (CSS variable names), and explicit component props; the controller owns integration and browser verification.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic v2, pytest, React 19, TypeScript, Vite, locally bundled Inter and Lucide React.

**Spec:** [Follow-up 02](../../../prompts/02_omp-gui2.md) and [team brief](../../gui-2.0-brief.md).

## Global constraints

- Tag `v1-audited` on latest remote `main` before editing and push it. Work on `feat/gui-2`; small Conventional Commits, no force-push or self-merge. Push verified backend and then integrated P0 before P1.
- Keep all existing config values, fields, endpoint behavior, and 94 tests. Extend the scenario with §3 display metadata and events only; do not change scheduling, scoring, alert reconciliation or the protected timeline.
- All patient data synthetic; runtime loopback only. Use §2 terminology, Turkish `tr-TR` formatting, role permissions, accessible text/icon/colour, no blinking.
- At end of P1 check Istanbul clock; do not start P2 after 04:30 on 20 November. Use real browser verification at the named viewports and both themes/roles.

## Review focus

- Acknowledging a data issue does not make data current (Tasks 2 and 5: classify from assessment `candidates`; hero reconnect keeps S-03 unclassified).
- Seen writes must be role-specific, atomic with audit, replay-scoped and independent of alarm state (Task 4: duplicate calls, cross-role calls, reset and 409 checks).
- A user must not mistake a partially stale set for normal measurements (Tasks 5/7: score evidence timestamps stay separate from display-only latest per-field values).
- Display events and manual GCS must not supply missing HR/MAP, create a physician action, or alter alert timing (Task 3: compare canonical replay to a copy without display events).
- A below-threshold latched alarm is still critical; a recorded but still high patient remains critical without a panel alarm (Tasks 2/4/5 tests).

### Task 1: Establish audited fallback and save this plan (controller)
**Files:** `docs/gui-2.0-brief.md`, this plan, `docs/STATUS.md`, approved `prompts/02_omp-gui2.md`.
1. Confirm `origin/main`, tag and push `v1-audited`, and start `feat/gui-2` from that same ref.
2. Run `make test`, exporter and noise checks unchanged; record 94 baseline tests. Save Appendix A verbatim and this plan.

### Task 2: Pure risk projection and config (controller, P0)
**Files:** `backend/app/domain/models.py`, `backend/app/engine/{config.py,config.yaml,status.py}`, `backend/tests/test_status.py`, `scripts/export_rules.py`, `docs/clinical-rules.md`.
**Produces:** `RiskStatus` with `key/reasons/data_issues/since/worsened`, `classify(snapshot, result, alerts_for_patient, now, config) -> RiskStatus`, `update_status(current, previous, scheduled=...) -> RiskStatus`; `RISK_RANK` with stable 0, unclassified 1, watch 2, critical 3. `EngineConfig.status`, `.display`, `.manual_entry.limits['gcs']`.
1. Red: `test_classifies_risk_and_independent_data_issues` covers every §2.1 row, absent/expired required data, a latched alarm, GREEN-only stable, and watch with gap. `test_worsened_expires_at_the_next_scheduled_evaluation` exercises status since, rank direction and retaining inter-cycle emphasis. Invalid config tests exercise GCS (strict integer bounds), duplicate required vitals and watch threshold ordering.
2. Green: assessment candidates, not active YELLOW acknowledgements, define gaps. At now, use per-field timestamp freshness. No previous assessment means no deterioration badge. On scheduled evaluations recompute emphasis; off-cycle status updates may set it and do not clear it unless the patient leaves watch/critical. Regenerate clinical rules; run `pytest ... test_status.py` and exporter check.

### Task 3: Display-only fixture and GCS input (controller, P0)
**Review:** per-task — persisted format
**Files:** `backend/app/domain/models.py`, `backend/app/sim/player.py` (validation and event application only), `backend/app/sim/scenarios/night_shift_0245.json`, `backend/app/{state.py,api/routes.py}`, `backend/tests/test_gui_api.py`.
**Produces:** `Profile.display` (`name`, `protocol`, `complaint`, `physician`, `nurse`), `GcsReading(value, observed_at)`, `Consultation(service, requested_at, resulted_at)`, independent snapshot streams, optional GCS on `POST /vitals` (not on `VitalReading`), detail stream fields.
1. Red: confirm exact §3 rows, GCS-only rejection under normal HR/BP requirements, fractional/out-of-bounds rejection before mutation, and a consult result without a request rejected. Compare assessment and alert timelines against the same replay without the display fields and events.
2. Green: add discriminated GCS/consult request/result events to the validated stream; append/pair after arrival, oldest pending matching service first. Use existing cycle/frame scheduling unchanged; only pass GCS to its independent stream after normal manual vital validation. Regenerate using `generate_noise.py`; both focused GUI and protected night-shift tests pass.

### Task 4: Critical alarm seen, evaluation notes and history (controller, P0)
**Review:** per-task — concurrency
**Files:** models, `state.py`, `api/routes.py`, `backend/tests/test_gui_api.py`.
**Produces:** `POST /api/alerts/{id}/seen {role}`, `AckInput.note`, `GET /api/alerts?level=RED`; `CriticalAlarm` extends alert shape with `seen`, `initial_score`, `blocking`, and `decision_latency_minutes`. Create-time score derived from creation audit, not lifecycle mutations.
1. Red: same-role repeats return 204 and add one audit event; the other role remains unseen; reset requires a fresh replay id; noncritical → 422, absent → 404; lock still rejects Y02; long notes leave the alarm unchanged and return `note_too_long`; a trimmed valid note and decision latency appear in history and audit.
2. Green: write the record under the existing request mutex/replay guard, no reconciliation for seen; use existing acknowledgement branch with optional note stored only for the accepted decision. Keep existing ID, score, decision and reason keys intact and derive alarm projection with the existing priority key. Run focused API tests.

### Task 5: Assemble GUI projections and lock the hero contract (controller, P0)
**Files:** models, `state.py` (read model/state bookkeeping), `backend/tests/test_gui_api.py`, `frontend/src/{types.ts,api.ts}`, `docs/STATUS.md`.
**Produces:** `State.overview`, `State.critical_alarms`, `Summary.risk_status/display/gcs/pending_labs/pending_consults/vital_flags/latest_measurements`; `api.seen`, `api.alarms`, optional `note` and optional manual `gcs`. `latest_measurements` gives value/time/source/stale for normal vs old presentation independently of score.
1. Red: assert all literal §7 counts, class and worsening flags before and after each hero action, and no-action 04:00 and 04:15. Verify GCS at the 120-minute boundary and later, flags by strongest fired component, and response visibility for both roles.
2. Green: update status on assessment, project current freshness without altering assessments, use active RED plus role's original task alerts, count tasks by role, and pair documented labels. Verify full suite, generator and exporter. Push backend contract before dispatching UI tracks.

### Task 6: Track A — shell, tokens, stat cards (frontend worktree; P0 then P1 defaults)
**Files:** own `frontend/src/gui/shell/`, `frontend/src/styles/`, and `components/ui/{StatCard,ConnectionStatus}.tsx`. Controller owns package manifests, main/app and HTML.
**Produces:** `Shell` with header/stat/nav composition via props and JSX slots; `StatCard`, `ConnectionStatus`; variables-only neutral/status theme contract: `--bg`, `--surface`, `--subtle`, `--text`, `--muted`, `--line`, `--focus`, `--kritik`, `--kritik-bg`, `--yakin-takip`, `--stabil`, `--siniflandirilmamis` and companion contrast tokens.
1. Build P0 fixed Turkish header, role/theme controls, sim time, status cards, info and demo slots. Build P1 nav/sidebar/bottom bar, mobile header and sticky alarm slot only after P0 push. Verify dark/light and no 1280 overflow. Commit only owned paths.

### Task 7: Track B — reusable UI, cards, details, table/filter (frontend worktree)
**Files:** own `frontend/src/gui/patients/` and `components/ui/{StatusLabel,PatientCard,VitalSign,FilterBar,TaskChip}.tsx`.
**Produces:** `Patients` and `PatientSheet` with visible clinical reason, alert/task slots and lock-aware callbacks; independent risk comparator. Default cards; P1 adds persisted table choice and §5 filters/sort.
1. Build P0 cards/detail with risk/data-issue labels, neutral tasks, flags exclusively from scored components, differentiated old vs never recorded vs no data, and display records. Use status rank → worse → score → time → bed.
2. After P0 push, add filters/search/sorts/table and ensure density (≥6 cards and ≥10 table rows at 1280 with no alarm; ≥7 rows with one alarm, ≥12 cards at 1920 when present). Commit only owned paths.

### Task 8: Track C — alarm, evaluation and task flows (frontend worktree)
**Files:** own `frontend/src/gui/alarms/` and `components/ui/AlarmCard.tsx`.
**Produces:** `AlarmPanel`, `EvaluationSheet`, `AlarmHistory`, `TaskQueue`, `ManualVitals`; compose via callbacks using `api.seen/ack/vitals/alarms` without shell state edits.
1. Build P0 alarm panel, translated top findings, role-specific seen/worsening state, optional note and decision/reason sheet, plus discharge and data-gap action flows. On multiple alarms, only blocking patient may be opened by physician; nurse can see both but cannot decide. Keep prescribed data-testid names and keyboard behavior.
2. After P0 push, add sticky/mobile presentation (using shell slot), grouped task pages and alarm timelines. Commit only owned paths.

### Task 9: Integrate and publish P0 (controller)
**Files:** `frontend/src/App.tsx`, `main.tsx`, i18n/shared helpers, package manifest/lock, `frontend/index.html`, `docs/demo-script.md`, README, STATUS.
1. Install local Inter/Lucide bundles and wire the three isolated tracks' P0 exports; use real app state and replay header, no runtime outbound URLs. Preserve role, poll and manual draft isolation; replace the old blocking visual modal, not the 409 lock.
2. Play §7 hero twice at 1280×720; block/reload/seen/decision/notes all check. Update hero clicks and English narration. Run tests and push usable P0 before P1 work begins.

### Task 10: Complete P1 accessibility and visual guard (controller + parallel P1 waves)
**Files:** phase-two changes in the three owned tracks; controller owns `scripts/check_palette.py`, `Makefile`, `docs/design-system.md`, `docs/STATUS.md` and final integration.
1. Integrate P1 routes, responsiveness, sticky alerts, theme and permitted roles. Validate palette scanner against forbidden CSS, JSX/SVG and inline data-URI literals; permit only token declarations and a monochrome token-equivalent favicon. Add `--check` to Make.
2. Measure ≥4.5:1 text and ≥3:1 status shapes and record ratios, OS-drawn accents and tested viewport dimensions. Verify light/dark and all viewport targets, no console or runtime external requests, and note all clinician-review items.

### Task 11: Record release media and check P2 cutoff (controller)
**Files:** `docs/screenshots/`, `docs/demo-backup.mp4`, STATUS.
1. Capture light/dark at 1280×720 and mobile at 390×844; record the real hero in ≤60 s and decode. Push P1.
2. Read Europe/Istanbul time. If allowed, deliver Task 12; otherwise record explicit deferral, then release.

### Task 12: Optional P2, then release (controller)
1. Only before the cutoff: add a simulated shift summary with at most two charts and complete the English catalog; expose English in Settings only after exact catalog parity. Keep Turkish the default.
2. Run final independent review, all tests, generated checks, protected-test diff and browser matrix. Open PR against `main`, never merge; report stage status, commits, tag, known deviations and next prompt.
