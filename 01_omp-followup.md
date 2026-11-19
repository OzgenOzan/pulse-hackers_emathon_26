# Şahin Göz: OMP follow-up prompt 01 (audit fixes)

> EM@THON 2026 · Team 4 PULSE HACKERS · Stage 5 of the team workflow (audit → follow-up).
> Audit of `main` at `eff91f3` (PR #1 merged), 19 Nov 2026, about 21:00.
> Start OMP at the repository root on an up-to-date `main`. Either paste this whole file, or save it as `prompts/01_omp-followup.md` and say: "Read prompts/01_omp-followup.md completely and execute it."

---

## 0. Mission and ground rules

v0 works. An independent audit re-ran everything and found **4 clinical-logic defects** and **6 demo-visible UI problems**. Fix exactly these, in the priority order below, and nothing else.

- **Do not refactor** working code and do not rename public API fields. Every change must trace back to an item in this prompt.
- **Do not change any existing value** in `backend/app/engine/config.yaml`. The only allowed config change is the new `manual_entry` section in D3.
- **Do not change** `backend/app/sim/scenarios/night_shift_0245.json`.
- `test_exact_night_shift_timeline` and `test_scripted_user_replay_has_identical_alerts_and_audit` must keep passing **unchanged**. The jury hero path (same clicks, same alerts) must keep working.
- Process: no brainstorming step. Use the superpowers **systematic-debugging** and **test-driven-development** skills for D1–D4: first turn the reproduction given into a failing test, then fix it. A short **writing-plans** plan (8 tasks at most) is optional. Use **verification-before-completion** before you report.
- Branch: `fix/audit-01` from the latest `main`. Commit once per item (D1…U6) with Conventional Commit messages, and push regularly. Never commit to `main`, never force-push, never merge your own PR.
- Timebox: about 2–3 hours. Mentors freeze scope at about 05:30; code freezes on 20 Nov at 13:30.

## 1. What the audit verified (keep all of it working)

- `make test`: 79 backend tests pass (about 1 s); the TypeScript type check and the Vite build pass. `scripts/export_rules.py --check` and `scripts/generate_noise.py --check` pass.
- The night-shift timeline matches the spec exactly. 03:00 GREEN Y06. 03:15 YELLOW Y03, with Y05's lactate suppressed. 03:30 RED Y01 at score 3, updated to 6 at 03:45. 04:00 RED Y02, Y01 at 10, Y03 escalated. 04:15 RED Y08. Noise patients raise zero alerts.
- Replays with the same actions produce identical audit logs. The `X-Replay-Id` guard rejects stale requests.
- The RED navigation lock holds on the server (`GET /api/patients/Y02` returns 409 `red_navigation_blocked` while Y01's RED is open) and in the UI (the board is inert). The RED survives a page reload.
- Acknowledging Y01 with `reassessing` at 03:30 produces a new **escalated** RED (score 6) at 03:45, as specified.
- The hero path works in Chrome at 1280×720. The app makes no external network requests.

## 2. P0: clinical-logic defects (TDD, in this order)

### D1. A partial manual entry hides fresh RED evidence

**Reproduce (default scenario):** reset → step ×3 (03:30). Y01's RED has score 3 (`hr_high`, `temp_high`, `map_drop`). Then `POST /api/patients/Y01/vitals {"hr": 108}`. Result: the RED drops to score 1 with `criteria_met: false`, and the assessment keeps only `hr_high`. The same-minute monitor reading (BP 106/58, MAP 74, Temp 38.4) is ignored.

**Cause:** `engine/vitals.py::score_vitals` scores only the single newest reading object, and a newer reading that lacks a parameter wipes that parameter out. `backend/tests/test_evaluate.py` line 43 currently asserts this behaviour (`reading(4, map=64), reading(hr=88)` → score 0).

**Required behaviour:**
- Score each vital from its **own most recent non-null value** among all in-zone readings (monitor and manual) whose age is ≤ `red.vital_max_age_minutes`. A missing field in a newer reading never hides an older value that is still fresh. Each component's `observed_at` is that value's own time.
- Trend baseline per parameter = the first non-null value in the zone. Trend current = that parameter's latest fresh value.
- On an exact timestamp tie, the later-recorded reading wins.
- If no parameter is fresh, there are no vital components (unchanged stale behaviour).
- Add `current_vitals` (the per-parameter values the engine used) to `PatientSummary`, and let the board row show HR / MAP / SpO₂ from it, so the board and the engine always agree. Keep `last_vitals` for freshness.

**Tests:**
- Change line 43 to expect 3 (MAP 64, 4 minutes old, is still fresh).
- A same-minute partial entry keeps Y01 at score 3 with all three components and `criteria_met: true` (the API reproduction above).
- A partial manual entry 5 minutes later with HR 95 → `map_drop` and `temp_high` come from the monitor reading → score 2.
- A parameter last seen 31 minutes ago is not scored, even when other parameters are fresh.

### D2. Nurse acknowledgements reset the GREEN idle timer

**Reproduce:** a monitored patient whose only lab resulted at 02:40, with the monitor disconnected right after its 02:45 sample. At 03:00 a YELLOW appears and the nurse acknowledges `monitor_reconnected`. GREEN then **never** appears (03:15 through 04:00), although the results have been idle ≥ 30 minutes.

**Cause:** `Session.acknowledge()` (`backend/app/state.py`, about line 226) appends every acknowledgement, including the nurse's YELLOW actions, to `patient.actions` as a `PhysicianAction`. `engine/green.py` treats any action after the last result as a physician decision.

**Required behaviour:** only **physician** actions (physician acknowledgements, `physician_action` scenario events, and `POST /actions`) can satisfy or snooze GREEN. Record the actor role on each stored action, or keep nurse actions out of `patient.actions`. Nurse acknowledgements are still audited exactly as now.

**Test:** recreate the reproduction as a fixture scenario. `Session.__init__` hardcodes `night_shift_0245`, so either add an `initial_scenario` constructor parameter (default `night_shift_0245`) or follow the existing `tmp_path` pattern in `test_api.py`. Use this fixture:

```json
{"id": "night_shift_0245", "title": "nurse ack vs GREEN",
 "start": "2026-11-20T02:45:00", "end": "2026-11-20T03:30:00",
 "patients": [{"id": "Z1", "bed": "S-01", "label": "Z.Z.", "age": 40, "sex": "M",
   "arrived_at": "2026-11-20T02:00:00", "monitored": true, "working_dx": [{"code": "N23", "text": "Renal colic"}]}],
 "events": [
  {"t": "02:00", "patient": "Z1", "type": "arrival"},
  {"t": "02:10", "patient": "Z1", "type": "lab_order", "test": "cbc"},
  {"t": "02:40", "patient": "Z1", "type": "lab_result", "test": "cbc", "value": 7.0, "unit": "10^9/L"},
  {"t": "02:45", "patient": "Z1", "type": "vitals", "source": "monitor", "hr": 80, "sbp": 125, "dbp": 80, "temp": 36.8, "spo2": 98, "rr": 16},
  {"t": "02:45", "patient": "Z1", "type": "monitor_disconnect", "resume": "on_nurse_ack"},
  {"t": "03:00", "patient": "Z1", "type": "vitals", "source": "monitor", "hr": 80, "sbp": 125, "dbp": 80, "temp": 36.8, "spo2": 98, "rr": 16},
  {"t": "03:15", "patient": "Z1", "type": "vitals", "source": "monitor", "hr": 80, "sbp": 125, "dbp": 80, "temp": 36.8, "spo2": 98, "rr": 16},
  {"t": "03:30", "patient": "Z1", "type": "vitals", "source": "monitor", "hr": 80, "sbp": 125, "dbp": 80, "temp": 36.8, "spo2": 98, "rr": 16}
 ]}
```

Expected: YELLOW at 03:00 → nurse `monitor_reconnected` at 03:00 → **GREEN at 03:15** (idle 35 min).

### D3. Manual vitals accept impossible values

**Reproduce:** `POST /api/patients/Y06/vitals` with each of `{"sbp": 12, "dbp": 8}`, `{"hr": 1000}`, `{"temp": -5}`, `{"sbp": 80, "dbp": 120}`, `{"spo2": 150}` returns 204. The first one (a typo for 120/80) immediately raises a latched RED for Y06 that must then be acknowledged. During a live demo, or the independent-clinician test, one typo derails the story.

**Required behaviour.** Add this section to `config.yaml`, validate it in `config.py`, render it in `docs/clinical-rules.md` and serve it through `/api/config`:

```yaml
manual_entry:                         # data-entry plausibility limits, NOT alert thresholds. CLINICAL-REVIEW
  required: [hr, sbp, dbp]
  limits:
    hr:   {min: 20,   max: 250}
    sbp:  {min: 40,   max: 300}
    dbp:  {min: 20,   max: 200}
    map:  {min: 20,   max: 250}
    temp: {min: 30.0, max: 43.0}
    spo2: {min: 50,   max: 100}
    rr:   {min: 4,    max: 60}
```

- **Server:** `POST /vitals` returns 422 with a specific key: `vital_required_missing`, `vital_out_of_range`, `sbp_not_above_dbp`, or `map_outside_bp` (when MAP, SBP and DBP are all given, MAP must lie between DBP and SBP). Scenario JSON events are simulated monitor data and are not subject to these rules.
- **Client:** `ManualVitals` marks HR/SBP/DBP as required and takes min/max from `/api/config`. It shows localized field-level errors (EN/TR) before sending, and turns server keys into readable text instead of raw keys like `422 vital_out_of_range`.

**Tests:** one API test per key, plus a happy path. Two existing tests assert the old behaviour and must be rewritten:
- `test_same_timestamp_manual_vitals_are_reported_as_the_latest_sample` posts `{"map": 64}` alone. Post a valid full set with MAP 64 instead (e.g. HR 94, BP 90/50, MAP 64) and keep the score-4 assertion.
- `test_finite_extreme_pressure_values_do_not_raise_a_server_error` expects 204 for ±1.7e308. Expect 422 `vital_out_of_range` instead, never a 500.

### D4. `POST /api/patients/{id}/actions` accepts any string

**Reproduce:** `{"type": "banana"}` returns 204 and silently suppresses Y06's GREEN at 03:00. The UI never calls this endpoint.

**Required behaviour:** accept only `order_placed | prescription_written | consult_requested | reassessed`; anything else returns 422 `invalid_action_type`. Keep the endpoint subject to the RED navigation lock, as now.

**Test:** an unknown type returns 422 and GREEN still appears at 03:00.

## 3. P1: demo-visible UI fixes (verify in a real browser at 1280×720)

### U1. The board shows only 3 of 11 patients

At 1280×720 the board fully shows only 3 of 11 rows (6 of 11 at 1920×1080). With a banner open, it shows 1–2 rows. The core story, "one physician watches 10+ patients on one screen", is not visible.

**Required:**
- At 1280×720, with no page scroll, **every in-zone row is visible when no banner is shown, and at least 10 rows when one banner is shown**, in both roles. At 1920×1080, all rows are always visible.
- Each row is a single line about 44 px tall: level chip (icon + text), bed, label, age/sex, first diagnosis (code + short text, ellipsis, full text in `title`), minutes in zone, HR / MAP / SpO₂ (stale values greyed and tagged), and score with its trend arrow.
- Banners become a compact one-line strip (chip, patient, title, inline actions). Show at most 2, then "+N more". Banners never push the board below the fold.
- Hints: slimmer top bar and demo bar, a footer of about 28 px, tighter spacing in the detail header. Action buttons stay ≥ 48 px, and RED actions stay 56 px.

### U2. RED actions fall below the fold when there are many components

At 1280×720, Y01's RED at 04:00 (6 components plus sparklines; reached by stepping on without transferring) puts the action buttons at y ≈ 766 px. The physician has to scroll inside the overlay to act.

**Required:** the four RED actions are always visible without scrolling at 1280×720, whatever the component count. Cap the dialog height, let only the evidence area scroll inside, and give the dialog a sticky action footer. Keep 1 tap per action, 2 taps for an action with a reason.

### U3. Raw floats and mixed operators

The RED dialog at 04:00 shows `MAP 64.66666666666667 mmHg`, `27.33333333333333 mmHg` and the rule text `MAP now 64.6667 mmHg`. Operators render inconsistently: `> 100 bpm`, `>= 38 °C`, `<= 65 mmHg`, `≥ 15 mmHg`.

**Required:**
- One display precision per quantity, used everywhere (component values, rule text, banners, detail, board):
  - HR, BP, MAP, MAP/HR deltas, SpO₂, RR and minutes: integers.
  - Temperature: 1 decimal.
  - pH: 2 decimals.
  - Other labs: at most 2 decimals, trailing zeros trimmed.
- Fix the backend rule strings (the trend rule's `:g` formatting) and the frontend `ComponentTable`.
- Always render operators as `≥ ≤ > <`.
- Rounding is display-only: the engine keeps comparing unrounded values.

### U4. The default selection ignores priority

At 03:15 in the nurse view, the detail panel opens A.K. (S-01, bed order), while the only alert is C.M.'s YELLOW at the top of the board.

**Required:** when there is no valid selection (none in the URL, or the selected patient has left the zone), select the **top row of the board's own order**: the worst alert level for the current role, then the score. Extract that ordering into one shared helper that both `Board` and `selectPatient` use. Never override an explicit user selection. The RED lock still wins.

### U5. Raw lab codes in the detail panel

The labs table and the suppressed list show raw codes (`lactate`, `troponin`, `cbc`, `urinalysis`).

**Required:** show the config `label` for scored labs (hs-cTnT, Lactate, pH (blood gas), K+), and EN/TR i18n labels for the rest (CBC, Creatinine, Urinalysis).

### U6. favicon 404 on every load

`GET /favicon.ico` returns 404, which leaves a console error. Add an inline SVG favicon via a `data:` URI in `frontend/index.html` (no new request, no external asset).

## 4. P2: housekeeping and docs

- Run `git mv 00_omp-initial-draft.md prompts/00_omp-initial-draft.md`, save this prompt as `prompts/01_omp-followup.md`, and update the STATUS note about where the prompt lives.
- `docs/STATUS.md`: add an "Audit follow-up 01" section with each item, its tests, and anything you could not finish. Record one intentional deviation: manual entries and acknowledgements trigger an immediate off-cycle evaluation, so an alert can appear between 15-minute boundaries after manual input.
- Regenerate `docs/clinical-rules.md` (it now includes `manual_entry`) and keep `export_rules.py --check` green.
- After the UI changes, retake the four screenshots at 1280×720 and re-record `docs/demo-backup.mp4` with the same hero path (≤ 60 s). Update `docs/demo-script.md` and the README's "Try the night shift" only where a click actually changed.

**Out of scope for this follow-up:** KPI summary, CI workflows, new scenarios, FHIR, authentication.

## 5. Definition of done (tick every box before you report)

- [ ] `make test` passes. The new tests for D1–D4 were seen failing before each fix (say so in the report). Only the three named tests were changed, plus any test whose change you explain in the report.
- [ ] `test_exact_night_shift_timeline` and the replay determinism test pass unchanged.
- [ ] D1: after `POST {"hr": 108}` at 03:30, Y01's RED keeps score 3 with `hr_high`, `temp_high`, `map_drop`, and `criteria_met: true`.
- [ ] D2: the fixture patient gets GREEN at 03:15 after the nurse's 03:00 acknowledgement.
- [ ] D3: the five bad payloads return 422 with specific keys, and the form blocks them first with localized messages.
- [ ] D4: unknown action types return 422.
- [ ] Browser check, Chrome or Edge at 1280×720:
  - every in-zone row is visible at 02:45 with no page scroll (≥ 10 with one banner);
  - at 04:00 without transferring Y01, all four RED actions are visible without scrolling;
  - no number with more than 2 decimals appears anywhere;
  - the nurse view at 03:15 opens C.M. (S-03) by default;
  - the console shows no errors.
- [ ] The hero path still runs twice in a row with identical alerts. Screenshots and the 60-second video are refreshed.
- [ ] `git diff main -- backend/app/engine/config.yaml` shows only the new `manual_entry` section, and the scenario JSON is unchanged.
- [ ] `fix/audit-01` is pushed, and the PR is opened (with `gh` or the REST API if available) or its absence explained.

## 6. Final report (your last message)

1. Item by item (D1–D4, U1–U6, P2): done / partly done / not done, with the commit for each.
2. Test counts before and after; which new tests failed first; which existing tests changed and why.
3. The browser verification results for each Definition-of-done check.
4. New `CLINICAL-REVIEW` items (the `manual_entry` limits) and any deviation from this prompt.
5. The branch / PR link and anything the clinicians must look at before the jury.
