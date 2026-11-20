# Şahin Göz: OMP follow-up prompt 03 (verified audit fixes, jury raw data, editable clinical rules)

> EM@THON 2026 · Team 4 PULSE HACKERS · Stage 5 of the team workflow (audit → follow-up).
> Re-audit of `main` at `baca20b` (PR #3 merged) and of the external quality audit of the same commit, 20 Nov 2026, about 10:30.
> Start OMP at the repository root on an up-to-date `main`. Either paste this whole file, or save it as `prompts/03_omp-followup.md` and say: "Read prompts/03_omp-followup.md completely and execute it."

---

## 0. Mission and ground rules

GUI 2.0 is merged and works. Do exactly three things, in this order, and nothing else:

1. **P0: verified fixes.** They are small, and they must land before rules can become editable (§2).
2. **P0: a raw-data folder.** The jury can inspect it without running anything (§3).
3. **P1: clinical rules that physicians can edit in Ayarlar** (§4).

- **Clock.** Code freezes at **13:30 Europe/Istanbul today**. Check the Istanbul time before every item.
  - No new work after 12:45.
  - At 13:10, stop. Run `make test`, push, open the PR and report.
  - Never push a red `make test`. If the §4 frontend is not green by 13:10, push the §4 backend alone (it is additive and unused by the UI) and leave Settings read-only.
- **Fallback first.** Before any change, run `git fetch && git tag v2-gui origin/main && git push origin v2-gui` (expected commit `baca20b`). If the branch is not stable at 13:10, the team demos `v2-gui`.
- **Do not change:**
  - any existing value in `backend/app/engine/config.yaml`, or anything in `backend/app/sim/scenarios/night_shift_0245.json`;
  - scoring, player or lifecycle logic, except the single fix in §2.3;
  - existing API fields or endpoint behaviour (additions only);
  - the protected tests `test_exact_night_shift_timeline`, `test_scripted_user_replay_has_identical_alerts_and_audit` and `test_gui_hero_counts_and_lock`.
  - Change only the tests this prompt names.
- **With default rules, the hero path looks and behaves exactly as it does now.** Do not retake the screenshots or re-record `docs/demo-backup.mp4` unless a hero-path screen actually changed. None should change.
- **Process.** No brainstorming step: this prompt is the approved spec.
  - Write a short **writing-plans** plan of 10 tasks at most, saved as `docs/superpowers/plans/2026-11-20-followup-03.md`.
  - Use **test-driven-development** for all backend work, **subagent-driven-development** for the tracks in §6, and **verification-before-completion** before you report.
  - Update `docs/STATUS.md` after every task, as AGENTS.md requires.
- **Git.** Branch `feat/followup-03` from the latest `main`. Make one Conventional Commit per item, and push after §2 and after §4. Never commit to `main`, never force-push, never merge your own PR.

## 1. What this audit verified (keep all of it working)

- `make test` passes: 122 backend tests, the palette check and its unit tests, the 571-key locale check, the type check and the build. `scripts/export_rules.py --check` and `scripts/generate_noise.py --check` also pass, but `make test` does not run them.
- Unattended replay with the default rules:
  - 03:00 GREEN Y06;
  - 03:15 YELLOW Y03;
  - 03:30 RED Y01 (score 3);
  - 04:00 RED Y02, and Y03's YELLOW escalated;
  - 04:15 RED Y08.
- Check that §4 relies on: changing only `red.threshold` to 2 makes Y01's RED fire at **03:15** (score 2) instead of 03:30. No other first alert moves. `red.threshold: 1` is rejected by the existing validator ("watch_min_score must be below the critical threshold").
- No tag points at the merged GUI 2.0 `main`; `v1-audited` is the pre-GUI commit `ba0261a`.
- The external audit was checked item by item. §2 holds the confirmed findings that matter before the jury; §5 lists what is deliberately deferred.

## 2. P0: verified fixes (TDD for every backend item)

### 2.1 Config values copied into code (audit C2)

Each of these duplicates a `config.yaml` value, and each becomes a live bug once rules are editable.

| Where | Now | Change to |
|---|---|---|
| `backend/app/gui_projection.py::vital_flags` | `component.points >= 3` → `kritik` | `>= rules.threshold`. Test: with a `RedRules` copy whose `threshold` is 4, a 3-point `map_low` gives `yakin_takip`; the default still gives `kritik`. |
| `frontend/src/api.ts::api.step` | `{ minutes: 15 }` | `api.step(minutes)`, called with `config.cycle_minutes`. The step button stays disabled until the config has loaded. `demo.step` becomes `+{minutes} dk` / `+{minutes} min`. |
| `frontend/src/gui/patients/filters.ts::filterPatients` | `30 * 60_000` | Pass in `config.yellow.vitals_overdue_minutes`, which means the same thing as this filter: time since **any** vital reading. Do **not** use `red.vital_max_age_minutes`; that is the per-parameter scoring freshness. `patients.filter.oldVitals` becomes `Son vital en az {minutes} dk önce` / `Last vitals {minutes}+ min ago`. Disable the checkbox until the config has loaded. |
| `frontend/src/i18n/{tr,en}.json` | `gui.finding.spo2_low` and `gui.finding.rr_high` are missing | Add both, so enabling either candidate rule never shows the generic "Değerlendirme bulgusu". TR: `Hipoksemi (SpO₂ %{value})`, `Takipne (solunum sayısı {value}/dk)`. EN: `Hypoxaemia (SpO₂ {value}%)`, `Tachypnoea (respiratory rate {value}/min)`. The wording is **CLINICAL-REVIEW**. |

### 2.2 Error and reason contract (audit M3 and M1)

- The backend can return 7 error keys that the UI cannot name; today it falls back to the generic banner. Add `gui.error.*` entries for them in both catalogs:

  | Key | TR | EN |
  |---|---|---|
  | `alarm_history_not_applicable` | Alarm geçmişi yalnızca kritik alarmlar için gösterilir. | Alarm history is available for critical alarms only. |
  | `invalid_action_type` | Bu hekim işlemi desteklenmiyor. | This physician action is not supported. |
  | `invalid_alert_action` | Bu işlem bu alarm veya görev için geçerli değil. | This action is not valid for this alarm or task. |
  | `invalid_step_minutes` | Adım süresi değerlendirme aralığına eşit olmalıdır. | The step must equal the evaluation interval. |
  | `reason_not_applicable` | Bu işlem için gerekçe seçilmez. | This action does not take a reason. |
  | `seen_not_applicable` | "Alarmı gördüm" yalnızca kritik alarmlar için kullanılır. | Marking an alarm as seen applies to critical alarms only. |
  | `unknown_scenario` | Senaryo bulunamadı. | Scenario not found. |

- **New test `backend/tests/test_error_catalog.py`.** Scan `backend/app/**/*.py` for literal `SessionError(<status>, '<key>')` calls. Assert that `gui.error.<key>` exists in both `frontend/src/i18n/tr.json` and `en.json`. This also covers the keys §4 adds.
  - Leave the dynamic `SessionError(422, str(exc))` for invalid scenario files as it is. `test_invalid_scenario_does_not_hide_valid_choices_or_replace_the_session` asserts that the file name appears in `detail`, and the dropdown already disables invalid scenarios.
- **`not_at_bed` reasons.** `ACK_REASONS['YELLOW']['not_at_bed']` is `frozenset()`, and the reason check treats an empty set as "any non-empty reason".
  - Reproduced at 03:15: `not_at_bed` with `reason: "banana"` returns 204.
  - Set it to `frozenset({'left_bed', 'in_procedure', 'other'})`, the three reasons the UI already offers.
  - Test: `banana` → 422 `valid_reason_required`; `left_bed` → 204.
  - Delete the stale "confirm with the backend (Task 7)" comment in `frontend/src/alertActions.ts`.

### 2.3 Score-based re-alert is RED-only (audit C1, reproduced)

**Reproduce (default scenario):**
1. Reset, then step twice (03:15).
2. As the nurse, acknowledge Y03's monitor-gap task with `not_at_bed` / `left_bed`.
3. `POST /api/patients/Y03/vitals {"hr": 105, "sbp": 125, "dbp": 78, "temp": 38.2}`.

**Result:** Y03's score goes from 0 to 2, and a **new YELLOW is created immediately with `escalated: true`** (audit event `escalated`), although the monitor gap is only 15 minutes. With `{"hr": 90, "sbp": 125, "dbp": 78, "temp": 37.0}`, nothing re-fires.

**Cause:** in `backend/app/engine/lifecycle.py::reconcile`, the cooldown bypass `result.score - last_ack.score >= config.alerting.realert_score_increase` runs for every alert level. A YELLOW alert's `score` is the patient's vital score; it says nothing about the data gap.

**Required:**
- Apply the score bypass only when `level == 'RED'`.
- YELLOW and GREEN respect the full `ack_cooldown_minutes`. YELLOW escalation stays driven only by `vitals_overdue_escalate_minutes`.

**Tests:**
- A lifecycle unit test: an acknowledged YELLOW whose score rises by 2 inside the cooldown produces no new alert.
- The API reproduction above.
- `test_cooldown_and_score_based_realert` (RED) passes unchanged.

**Docs:** record in STATUS as **CLINICAL-REVIEW**: "score-based re-alert within the cooldown applies to critical alarms only". In §4, label the knob "Kritik alarm tekrarı için puan artışı".

### 2.4 `make test` runs every generated-artifact check (first half of audit C3)

Append three checks to the `test` target in `Makefile`, and to the PowerShell block in `README.md`:
- `scripts/export_rules.py --check`
- `scripts/generate_noise.py --check`
- `scripts/export_raw_data.py --check` (once §3 exists)

## 3. P0: a raw-data folder for the jury

**Goal:** a juror opens `raw_data/`, on GitHub or on the demo laptop, and can read every synthetic patient's profile, vitals, labs and events without running code. The folder must show exactly what the engine receives.

**Generator: `scripts/export_raw_data.py`.** Use the standard library plus the existing backend packages; add no new dependencies. Put `backend/` on `sys.path` the way `export_rules.py` does.
- **Modes.** By default it writes the folder; `--check` fails if any committed file differs.
- **Check comparison.** Compare decoded text (`utf-8-sig`) with universal newlines, so Windows checkouts pass.
- **Scenario loading.** Load the scenario with `app.sim.player.Scenario.load`, so times and ordering match the engine. Build every reading with `VitalValues`, so MAP is derived exactly as the engine derives it.
- **Delivery.** Decide which samples are delivered by replaying the real `Player` with `apply_event` and no user actions. Do not re-implement either.
- **Lab readings.** For each result, call `app.engine.labs.score_labs` under the default config on a snapshot that holds only that order. Do not re-implement the lab rule.
- **Background patients.** Import `NOISE_ORDER` from `scripts/generate_noise.py`; do not copy the list.
- **Determinism.** Sort rows, use `\n` line endings, and write no export timestamps.

**Layout:**
```
raw_data/
  README.md                  English first, then a short Turkish section
  night_shift_0245/
    patients.csv             one row per patient
    vitals.csv               every vital sample in the feed (long format)
    labs.csv                 every lab order and its result
    events.csv               the full canonical timeline: arrival, GCS, consults, monitor disconnect, physician actions, …
    expected_alerts.csv      the scenario's documented first alerts (its `expect` block)
    patients/Y01.md … Y12.md one readable page per patient: identity, vitals table, labs, GCS, consults, other events
```

**Columns:**

| File | Columns |
|---|---|
| `patients.csv` | `patient_id, bed, initials, synthetic_name, protocol, age, sex, arrived_at, monitored, complaint_tr, working_dx` (`code text; …`), `nurse, physician, data_origin` (`scripted` / `vitals seeded, seed 20261120`), `expected_first_alert` |
| `vitals.csv` | `time, patient_id, bed, source, hr, sbp, dbp, map, map_source` (`measured` / `derived`), `temp, spo2, rr, delivered_unattended` (`yes` / `no`), `note` |
| `labs.csv` | `patient_id, bed, test, label, unit, ordered_at, resulted_at, value, reference, critical_low, critical_high, default_rule_reading` (`scored (+3)` / `suppressed: <reason_key>` / `within reference` / `not configured` / `pending`) |
| `events.csv` | `time, patient_id, bed, type, details` |
| `expected_alerts.csv` | `first_at, patient_id, bed, level, shown_as` (RED → Kritik alarm (hekim); YELLOW → Veri eksikliği görevi (hemşire); GREEN → Taburculuk değerlendirmesi (hekim)) |

- **MAP.** Write `map` with 2 decimals for reading; the engine compares the unrounded value. No event in this scenario supplies MAP, so every `map_source` is `derived`.
- **Y03's samples.** Y03's monitor samples after the 03:00 disconnect are in the feed but marked `delivered_unattended = no`, with the note "monitor disconnected 03:00; samples resume from the first cycle after the nurse confirms reconnection".
- **CSV format.** Comma-separated, UTF-8 **with BOM**, so Excel keeps ş, ğ and İ.

**`raw_data/README.md`:**
- **Opening line:** "SYNTHETIC: no real patients; all names and protocol numbers are invented."
- **Reference:**
  - which file to open for what;
  - a column dictionary with units: HR /min, BP and MAP mmHg, °C, SpO₂ %, RR /min, GCS 3–15;
  - the time base: simulated local time on 20 Nov 2026. The shift runs 02:45–04:30, with pre-start history from 01:55;
  - the MAP formula, `DBP + (SBP − DBP) / 3`;
  - how the six background streams are generated: seed 20261120, `scripts/generate_noise.py`;
  - the Y03 delivery rule;
  - how to regenerate the folder and check it.
- **Excel tip:** in a Turkish-locale Excel, use Veri → Metinden/CSV'den with a comma delimiter.
- **Two intended limitations visible in the data** (as in `docs/demo-script.md`):
  - Y08's chronically low MAP still raises a critical alarm;
  - Y05's lactate of 4.2 is suppressed because convulsion is not mapped to lactate.

## 4. P1: clinical rules that physicians can edit in Ayarlar

The design PDF lists "hekim özel parametre seçimi" as a next-phase item. This brings forward a **session-wide** version of it. Follow these decisions exactly.

### 4.1 Decisions

- **In-memory override of `config.yaml`.**
  - The app never writes `config.yaml`. It stays the clinician-owned default and the source of `docs/clinical-rules.md`.
  - A server restart, or "Varsayılan kurallara dön", restores the defaults.
  - There are no per-user rules, because nothing authenticates users.
- **Applying restarts the shift at 02:45** (`Session.reset`, with a new replay id). Never apply rules mid-shift, for three reasons:
  - Every alarm and status stays explainable by a single rule set.
  - Score trends and "Yeni kötüleşme" stay physiological. A mid-shift change would flag patients as newly worsened when only the rule changed.
  - The existing `X-Replay-Id` guard automatically rejects stale tabs and stale drafts.
- **Open alarms.** If unrecorded critical alarms are open, the confirmation says plainly that they are discarded with the replay, as with "Sıfırla".
- **Physician role only.** This is the demo role, not authentication. The nurse sees the read-only view with "Hekim yetkisi gerekir".
- **Editable leaves (whitelist).** Only leaves that are numbers or booleans in `config.yaml` can change. A `null` stays `null`, and an integer stays an integer.
  - `red.threshold`, `red.vital_max_age_minutes`, `red.critical_lab_points`
  - `red.vital_rules.<key>.value | points | enabled` (including the disabled candidates `spo2_low` and `rr_high`)
  - `red.trend_rules.<key>.delta | points`
  - `labs.<lab>.ref_low | ref_high | critical_low | critical_high` (existing numbers only)
  - `universal_panic.enabled`, and its existing numeric cutoffs
  - `yellow.*`, `green.idle_after_results_minutes`, `alerting.ack_cooldown_minutes`, `alerting.realert_score_increase`
  - `status.watch_min_score`, `display.gcs_fresh_minutes`, `manual_entry.limits.<field>.min | max`
- **Shown but read-only:**
  - `cycle_minutes`, because it drives the player and the step;
  - `alerting.red_blocks_navigation`, a safety interlock, not a threshold;
  - rule keys, parameters, operators and directions;
  - lab labels and units;
  - `icd_lab_relevance`, `manual_entry.required` and `status.required_fresh_vitals`.
- **Validation** is the existing `EngineConfig.model_validate`, with all of its validators:
  - ordered lab limits;
  - `watch_min_score` below `threshold`;
  - escalation at or after the overdue time;
  - manual min below max;
  - GCS limits as integers within 3–15.

  On any error, nothing changes.

### 4.2 API (additive)

| Endpoint | Behaviour |
|---|---|
| `GET /api/config` | Unchanged: the active rules. |
| `GET /api/config/defaults` | The `config.yaml` rules. |
| `PUT /api/config` | See below. |
| `POST /api/config/reset` | Same guards as `PUT`. Restores the defaults, resets the replay, and returns 204. |
| `GET /api/config/history` | `[{wall_time, role, action: apply / reset_defaults, changes: [{path, before, after}]}]`, kept across replays for the life of the process. Cut this first if time runs short. |
| `SimStatus.rules_custom` | A new boolean, polled every second. |

**`PUT /api/config`:**
- Requires `X-Replay-Id`. The body is `{role, config}`, where `config` is the full rule object.
- The server diffs it leaf by leaf against the defaults, keying list items by `key`.
- **Errors:**
  - a change outside the whitelist → 422 `rule_not_editable`, with `paths`;
  - a validation failure → 422 `rules_invalid`, with `errors: [{loc: "status.watch_min_score", msg}]`;
  - the nurse role → 403 `physician_role_required`.
- **On success:** swaps `session.config`, resets the replay, and returns 204.

- **Error payloads.** `SessionError` carries only `key` today. Give it an optional payload (`paths` / `errors`), and merge that payload into the JSON response. Extend the frontend `ApiError` with the parsed body.
- **New error keys** get TR/EN text, which the §2.2 test enforces:
  - `rule_not_editable`: "Bu kural alanı Ayarlar'dan değiştirilemez." / "This rule field cannot be changed in Settings."
  - `rules_invalid`: "Kural seti geçersiz; işaretli alanları düzeltin." / "The rule set is invalid; correct the marked fields."
  - `physician_role_required`: "Hekim yetkisi gerekir." / "Physician role required."
- **The audit log is untouched.** It still resets with each replay.

### 4.3 Frontend

- **Ayarlar → Klinik kurallar.**
  - The physician gets an editable form, grouped as Kritik puanlama · Tetkikler · Evrensel panik · Veri eksikliği · Taburculuk · Alarm · Durum ve gösterim · Manuel giriş.
  - The nurse keeps the read-only view. Retitle `gui.rules.title` by role.
  - Every field shows `Varsayılan: …` and a "Değişti" mark when it differs from the default. The section header shows "N değişiklik".
  - Numeric fields accept a decimal comma; reuse the `ManualVitals` parsing.
  - Targets are at least 44 px; the primary button is at least 48 px.
  - Key the draft by replay id, so a change made in another tab discards the stale draft.
- **"Uygula ve vardiyayı 02:45'ten başlat"** opens a native `<dialog>`, like the About dialog. The dialog:
  - lists every change as before → after;
  - says the simulation restarts, and open alarms and records are cleared;
  - says the rules stay until "Varsayılan kurallara dön" or a server restart;
  - says they are simulation what-ifs, not clinical recommendations.

  On `rules_invalid`, show each message next to the field its `loc` names.
- **"Varsayılan kurallara dön"** is enabled only when `rules_custom` is true.
- **Header pill "ÖZEL KURAL SETİ".**
  - It sits next to "SİMÜLE VERİ" whenever `sim.rules_custom` is true, with a tooltip.
  - Use black and gray only, never a status colour: a custom rule set is not a patient risk.
  - The demo strip shows it too.
- **Refetch `/api/config` whenever `state.sim.replay_id` changes.** This replaces the one-time load in `ControlPanel`. The `ManualVitals` limits, the filter, the step and the threshold text then follow the active rules in every tab.
- **Types.** Extend `RulesView` in `types.ts` with `universal_panic` and `icd_lab_relevance`, and `SimStatus` with `rules_custom`.
- **Checks.** Every string goes into both catalogs. The palette and locale checks stay green.

### 4.4 Tests (`backend/tests/test_rules_api.py`, written first)

1. At start, `GET /api/config/defaults` equals `load_config()` and equals `GET /api/config`, and `rules_custom` is false.
2. As the physician, `PUT` with `red.threshold: 2` → 204, a new replay id, sim time 02:45, and `rules_custom` true. After two steps, Y01 has an active RED with score 2 at 03:15.
3. `red.threshold: 1` → 422 `rules_invalid`; the config and the replay id are unchanged.
4. Changing `cycle_minutes`, `alerting.red_blocks_navigation` or any rule's `param` → 422 `rule_not_editable`; nothing changes.
5. The nurse role → 403. A missing replay id → 428; a stale one → 409.
6. `POST /api/config/reset` restores the defaults with a new replay, and `rules_custom` is false. An unattended replay then matches the §1 timeline.
7. Enable `spo2_low`, then post a valid manual entry with SpO₂ 88 (for example, Y12 at 02:45). The assessment components include `spo2_low`, and `vital_flags` contains `spo2`. No scenario patient reaches ≤ 90, so this cannot be seen on the hero path.
8. The history records both the apply and the reset.

## 5. P2 if time remains; deferred work

**P2, in any order; stop at 12:45:**
- An `AbortSignal.any` fallback helper, used in `useSession.ts` and `ControlPanel.tsx`. Without it, every poll throws on Chromium < 116, Firefox < 124 or Safari < 17.4, and the app shows "Bağlantı kesildi" for good.
- `DemoControls` takes its speed from `sim.speed` (audit M4).
- `raw_data/night_shift_0245/derived/engine_replay_default_rules.csv`: score, components and risk status per patient at each evaluation, from an unattended `Session` replay with a fixed wall clock.
- `GET /api/config/export`: a YAML download labelled "öneri — config.yaml'ın yerine geçmez".

**Deferred until after the jury (list these in STATUS):**
- M2: return structured flag keys instead of Turkish strings from `gui_projection.py`.
- M5: prune the roughly 100–150 unused v1 locale keys and add a dead-key check.
- C4: support scenarios that cross midnight. Today they fail loudly at load ("event before arrival"), so nothing goes silently wrong.
- Vitest/React Testing Library safety tests, and GitHub Actions CI.
- Persistence, RBAC and SSE.

Keep `POST /api/patients/{id}/actions`. It is the HBYS physician-action input, covered by tests, not dead code.

## 6. Work plan

1. **You:**
   - Check the time, tag, branch and write the plan, in about 10 minutes.
   - Then start **subagent A** on §3 at once. It owns `scripts/export_raw_data.py` and `raw_data/` only.
2. **You:** do §2 with TDD, including every §2 locale edit. Commit and push.
3. **Then two subagents in parallel**, against the §4.2 contract:
   - **B (§4 backend):** `state.py`, `api/routes.py`, `domain/models.py`, `main.py` and `test_rules_api.py`.
   - **C (§4 frontend):** `Settings.tsx`, the shell pill, `ControlPanel.tsx`, `DemoControls.tsx`, `types.ts`, `api.ts` and the i18n catalogs.
4. **You only** edit `Makefile`, `README.md`, `docs/*` and `docs/STATUS.md`. Then integrate, run `make test`, do the §7 browser checks, write the §8 docs, push, and open the PR by 13:15.

## 7. Browser checks (Edge or Chrome at 1280×720, with `make demo`)

- The hero path, twice, with default rules, exactly as in `docs/demo-script.md`: the same clicks and alerts, and no custom pill.
- Physician in Ayarlar:
  1. Set Kritik puan eşiği to 2 and apply. The shift restarts at 02:45 and the pill appears.
  2. Press +15 twice. Y01 is Kritik at 03:15.
  3. Choose "Varsayılan kurallara dön". The pill disappears, and the hero path works again.
- Set Yakın Takip puan eşiği to 3 while Kritik puan eşiği is 3. The field shows an error, and nothing is applied.
- As the nurse, Ayarlar is read-only and shows the reason.
- With two tabs open, apply in tab 1. In tab 2, the next action is refused with the localized stale-replay message, and its rules view refreshes.
- `raw_data/night_shift_0245/patients/Y01.md` renders cleanly in a Markdown preview, and `vitals.csv` opens in Excel with Turkish characters intact.
- The console shows no errors, and the app makes no external requests.

## 8. Docs

- **`docs/STATUS.md`:** add a "Follow-up 03" section with:
  - each item, with its tests and commit;
  - the decisions in §4.1;
  - the CLINICAL-REVIEW items: RED-only re-alert, the SpO₂/RR finding wording, and the fact that tuned values are simulation what-ifs;
  - the deferred list from §5.

  Also fix the stale line saying PR #3 is not merged.
- **`README.md`:**
  - add a "Raw data for the jury" section linking `raw_data/`;
  - add an "Editing clinical rules (Ayarlar)" note;
  - add the new checks to the PowerShell block.
- **`AboutPrototype`:** add one sentence saying the data is synthetic and listed in `raw_data/`, and that physicians can tune the simulated rules in Ayarlar for the current session only.
- **`docs/demo-script.md`:** add an **optional Q&A beat**, outside the 8-minute flow.
  - The beat: Ayarlar → Kritik puan eşiği 2 → Uygula → press +15 twice → Y01 is Kritik at 03:15. The narration: earlier alarm, more alarms. Then choose "Varsayılan kurallara dön".
  - Do not change the hero-path text. The mentors flagged settings screens as a weak demo move, so this stays off the main stage.
- Save this prompt as `prompts/03_omp-followup.md`.

## 9. Definition of done (tick every box before you report)

- [ ] `v2-gui` was tagged and pushed before the first change.
- [ ] `make test` passes, and now runs the `export_rules.py`, `generate_noise.py` and `export_raw_data.py` checks. Every new backend test was seen failing first.
- [ ] The three protected tests are unchanged and pass.
- [ ] `git diff main -- backend/app/engine/config.yaml backend/app/sim/scenarios/night_shift_0245.json` is empty.
- [ ] The §2.3 reproduction no longer re-fires, and the RED re-alert test is unchanged.
- [ ] `not_at_bed` rejects unknown reasons.
- [ ] Every literal `SessionError` key has TR and EN text, enforced by a test.
- [ ] The step, the old-vitals filter and the vital-flag level read the config.
- [ ] `raw_data/` is generated, passes `--check`, and says SYNTHETIC on every page.
- [ ] Applying rules, restarting, showing the pill and resetting to defaults all work, both through the API tests and in the browser (§7). Nothing writes to `config.yaml`.
- [ ] With default rules, the hero path is unchanged; the screenshots and video are untouched.
- [ ] `feat/followup-03` is pushed and the PR is open by 13:15, or the report explains why not.

## 10. Final report (your last message)

1. Item by item (§2.1–2.4, §3, §4, §5): done, partly done or not done, with the commit for each.
2. Backend test counts before (122) and after, which new tests failed first, and which existing tests changed and why.
3. The §7 browser results.
4. Decisions, deviations from this prompt, and new CLINICAL-REVIEW items.
5. The branch and PR link, the tag, and what the clinicians must check before the jury. At minimum:
   - the SpO₂/RR finding wording;
   - RED-only re-alert;
   - that the demo laptop runs with default rules (no "ÖZEL KURAL SETİ" pill).
