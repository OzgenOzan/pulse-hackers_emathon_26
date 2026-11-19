# Şahin Göz v0: OMP start prompt

> EM@THON 2026 · Team 4 PULSE HACKERS · Stage 4 of the team workflow (autonomous first draft).
> Start OMP at the repository root. Either paste this whole file, or save it as `prompts/00_omp-initial-draft.md` and say: "Read prompts/00_omp-initial-draft.md completely and execute it."

---

## 0. Mission

You are the lead engineer of a five-person clinical team at a 24-hour medical hackathon. Build the **first working draft (v0)** of **Şahin Göz**, a clinical decision-support prototype for the emergency department's **yellow zone** (*sarı alan*: the observation area for patients who arrived stable). It catches **silent deterioration** and **idle waiting after results are ready**, using a three-level alert system (RED / YELLOW / GREEN) built to avoid alarm fatigue.

- This spec is final and approved by the team's clinicians. Design brainstorming is finished: do not run a brainstorming step, do not ask design questions, and do not add features that are not listed here.
- Work autonomously. Interrupt the operator only if you are truly blocked (missing credentials, broken toolchain). Write every other assumption into `docs/STATUS.md`.
- The mentors' rule: **one end-to-end working core beats a broad, half-working system.** Build the core first, make it run twice in a row with identical results, then improve it.
- Timebox: aim to have P0 (§9) committed and pushed about 3 hours after you start. If you run long, cut P1 items, never P0 items.

## 1. First actions

1. If this prompt is not already saved in the repo, save it verbatim as `prompts/00_omp-initial-draft.md`.
2. Read `README.md` and the three PDFs (in Turkish): `brainstorming/01_sahin-goz.pdf` (design report), `sessions/01_emathon-2026_opening.pdf` (mentor guidance), `brainstorming/00_is-akisi.pdf` (team workflow). Do not modify or move them. Where they differ from this prompt on technical detail, this prompt wins.
3. Create the branch `feat/sahin-goz-v0`.
4. Use the superpowers **writing-plans** skill to write `docs/superpowers/plans/2026-11-19-sahin-goz-v0.md`: 10–14 tasks that follow the phases in §9. Do not stop to ask which execution mode to use. Execute with **subagent-driven-development**, run the parallel tracks in §9 with **dispatching-parallel-agents** (the `task` tool), use **test-driven-development** for the engine and the simulator, and use **verification-before-completion** before you claim anything is done. If the superpowers skills are not installed, follow the same flow by hand.
5. Create `AGENTS.md` and `docs/STATUS.md` (§10) in the first commit and keep both current.

## 2. Context you need

**Event.** EM@THON 2026, run by the Emergency Medicine Association of Türkiye at the EACEM congress. Coding runs from 19 Nov 13:30 to the code freeze on 20 Nov 13:30. The jury demo is on 21 Nov at 16:25: 5–8 minutes in English, about half of it a live demo, then 2 minutes of Q&A. A 60-second backup screen recording of the demo is mandatory. Jury criteria: originality, innovation, contribution to emergency patient-care quality, potential for further development and scalability.

**Mentor rules that shape the code.**
- Build one working core that tests the riskiest assumption. Simulate everything else and **label it SIMULATED** in the UI and the README. ("Imitate, but say you are imitating before the jury asks.")
- One journey from trigger to decision must run end to end. Integrate early; never assemble the parts for the first time at the end.
- ED reality: decisions take minutes, and a clinician may walk away mid-task and come back 8 minutes later, so the screen must resume exactly where it was. Gloves and noise mean big buttons, few taps and visual (not audio) cues. The physician always makes the final decision.
- No login, no settings pages, no 12-chart dashboards. Start from the moment of use: one alert plus a suggested action.
- Never claim performance numbers ("94% accurate"). Show what happens when the system is wrong and where its limits are.
- Synthetic data only. Real use would need ethics approval and on-premise servers (KVKK/GDPR), so the app makes **no network calls at runtime**.

**Clinical question** (from the design report): can Şahin Göz help yellow-zone physicians and nurses on a busy night shift (02:45) notice silent deterioration in monitor and lab data, and patients who are ready for discharge, within minutes and without alarm fatigue?

**Clinical flow.** A patient triaged as stable enters the yellow zone with a barcode wristband, is examined, and has labs and treatment ordered. The nurse enters the first vitals into HBYS (*Hastane Bilgi Yönetim Sistemi*, the hospital information system), then connects the patient to a bedside monitor. One physician watches 10+ patients on one screen; the engine catches the changes the eye misses. Alerts appear **inside the HBYS screen** the staff already use, not in a separate mobile app.

**Aims and later evaluation (context for the README and demo script; do not build any of it).** Aims: patient safety (catch silent deterioration early), zone crowding (cut needless 3–4-hour waits), staff safety (less waiting-related tension with relatives). A later pilot would compare 2×2 pilot areas on five KPIs: cardiac arrests, in-ED mortality, time from results to discharge, stretcher/bed occupancy, and "white code" calls (violence against staff).

## 3. Scope of v0

**Real (must actually run):** one patient flow from data to decision; the scoring engine; RED/YELLOW/GREEN alerts routed by role; the blocking RED acknowledgement screen; the audit log; a transparent "why" for every alert.

**Simulated (labeled SIMULATED wherever it appears):** the HBYS screen itself (a generic mock with no real vendor's look or branding); monitor and lab feeds (synthetic JSON scenario); time (accelerated demo clock); the ICD→lab map (4 diagnosis groups only); patient identities (synthetic labels, never real names).

**Out of scope for v0** (put ideas in `docs/backlog.md` instead of building them): real HBYS/HL7/FHIR or monitor integration, authentication and user management, settings or admin pages, a mobile app, machine-learning models, full ICD-10 coverage, physician-specific parameter tuning, a nurse performance module, multiple zones, a database (in-memory state is enough), cloud deployment, audio alarms, dark mode, mobile layouts.

## 4. Clinical logic: the engine

The engine is a **pure, deterministic Python package** with no FastAPI or I/O imports: `evaluate(patient_snapshot, now, config) -> EngineResult`. All thresholds, weights and maps live in `backend/app/engine/config.yaml`. **Never hardcode a clinical number in code.** Every value marked `CLINICAL-REVIEW` is a prototype default that the team's clinicians will confirm or change.

**Cadence.** The engine evaluates every in-zone patient at each 15-minute sim-clock boundary (the design's 15-minute monitor pull). Events stamped at time t are applied before the evaluation at boundary t. When the clock jumps over several boundaries, evaluate each one in order; never skip one.

**Inputs per patient.** Profile (bed, synthetic label, age, sex, arrival time, working diagnoses as ICD-10 codes, monitored yes/no); vitals history (time, source `monitor | manual`, HR, SBP, DBP, MAP, Temp, SpO2, RR; compute MAP = DBP + (SBP − DBP) / 3 when it is missing); labs (test, ordered_at, resulted_at, value, unit); physician actions (time, type); status (`in_zone | transferred_red | discharged`). A `lab_order` and any alert acknowledgement also count as physician actions.

**RED (physician screen): a weighted score, not AND/OR rule combinations.** The design report rejects pure rule combinations because they conflict, so each parameter adds weighted points.
- Score only vitals no older than `vital_max_age_minutes`. Stale or missing data is a YELLOW problem; never score it as normal or as abnormal.
- Vital rules: MAP ≤ 65 → +3; HR > 100 → +1; Temp ≥ 38.0 °C → +1.
- Trend rules against the patient's own baseline (the first vitals reading recorded in the zone): MAP fallen ≥ 15 mmHg → +1; HR risen ≥ 20 bpm → +1.
- Lab rule: a lab beyond its critical cut-off **and** related to a working diagnosis through `icd_lab_relevance` → +3 per lab. A result stays current until a newer result for the same test arrives.
- Abnormal labs (outside the reference range) that do not score are recorded in `EngineResult.suppressed_labs` with a readable reason. This is the alarm-fatigue filter, and the UI must show it.
- Universal panic values (`universal_panic`) score +3 whatever the diagnosis. This safety net is not in the design report, so keep it switchable.
- RED when the total ≥ `red.threshold` (3). So MAP ≤ 65 alone, or one related critical lab alone, triggers RED, while HR > 100 plus fever (2 points) does not.

**YELLOW (nurse screen): a data-quality alert.**
- A monitored patient with no monitor reading for ≥ 15 min (probe off, battery) → YELLOW "check the monitor at the bedside".
- Any patient with no vitals from any source for ≥ 30 min → YELLOW "vitals overdue", flagged **escalated** at ≥ 60 min.
- YELLOW resolves automatically when fresh vitals arrive.

**GREEN (physician screen): idle waiting.**
- At least one lab ordered, **all** ordered labs resulted, ≥ 30 min since the last result, no physician action after that result, the RED score below threshold and no unacknowledged RED → GREEN "results ready for N min: consider discharge or prescription".
- Labs that have no thresholds in `labs:` (CBC, creatinine, urinalysis and so on) count only for readiness.
- GREEN resolves automatically on any physician action.

**Conflict-free priority and alert lifecycle.**
- RED overrides GREEN for the same patient: an active GREEN is withdrawn with the reason "superseded by RED".
- At most one active alert per patient per level. Later cycles **update** the active alert (score, components); they never create duplicates.
- A RED stays active until a physician acknowledges it, even if the values improve meanwhile (show "criteria no longer met").
- After an acknowledgement, the same level is not raised again for `ack_cooldown_minutes` (30), unless the score has risen by ≥ `realert_score_increase` (2); then a new alert is raised and marked **escalated**.
- Sort order: RED (unacknowledged first, then score high to low, then oldest) > YELLOW (escalated first, then longest gap) > GREEN (longest idle first).
- The physician sees RED and GREEN. The nurse sees YELLOW.

**EngineResult** contains the total score; components `{key, label, value, unit, rule, points, observed_at}`; `suppressed_labs` `{test, value, unit, reason}`; and alert candidates `{level, target_role, title_key, params, recommended_actions}`. Every alert must be explainable from its components alone.

**Default `backend/app/engine/config.yaml`** (copy it exactly, comments included):

```yaml
# Şahin Göz engine config. PROTOTYPE DEFAULTS. Values marked CLINICAL-REVIEW
# must be confirmed by the team's clinicians before any demo claim.
cycle_minutes: 15
red:
  threshold: 3                        # CLINICAL-REVIEW
  vital_max_age_minutes: 30           # CLINICAL-REVIEW (not in design report)
  vital_rules:                        # design report
    - {key: map_low,   param: map,  op: "<=", value: 65,   points: 3}   # CLINICAL-REVIEW
    - {key: hr_high,   param: hr,   op: ">",  value: 100,  points: 1}   # CLINICAL-REVIEW
    - {key: temp_high, param: temp, op: ">=", value: 38.0, points: 1}   # CLINICAL-REVIEW
    - {key: spo2_low,  param: spo2, op: "<=", value: 90,   points: 2, enabled: false}  # candidate, not in design report
    - {key: rr_high,   param: rr,   op: ">=", value: 25,   points: 1, enabled: false}  # candidate, not in design report
  trend_rules:                        # vs the patient's first reading in the zone. CLINICAL-REVIEW (not in design report)
    - {key: map_drop, param: map, direction: down, delta: 15, points: 1}
    - {key: hr_rise,  param: hr,  direction: up,   delta: 20, points: 1}
  critical_lab_points: 3              # CLINICAL-REVIEW
labs:                                 # CLINICAL-REVIEW: cut-offs are assay- and lab-specific
  troponin:  {label: "hs-cTnT", unit: "ng/L",   ref_high: 14,  critical_high: 52}   # 52 = ESC 0h rule-in for Elecsys hs-cTnT
  lactate:   {label: "Lactate", unit: "mmol/L", ref_high: 2.0, critical_high: 4.0}
  ph:        {label: "pH (blood gas)", unit: "", ref_low: 7.35, ref_high: 7.45, critical_low: 7.20, critical_high: 7.60}
  potassium: {label: "K+",      unit: "mmol/L", ref_low: 3.5,  ref_high: 5.1,  critical_low: 2.5,  critical_high: 6.0}
icd_lab_relevance:                    # only these diagnosis→lab pairs may raise a lab-driven RED. CLINICAL-REVIEW
  chest_pain_acs:   {icd_prefixes: ["R07", "I20", "I21", "I24"], labs: [troponin]}
  infection_sepsis: {icd_prefixes: ["A40", "A41", "N39.0", "J18", "R50", "R65"], labs: [lactate]}
  dka_acidosis:     {icd_prefixes: ["E10.1", "E11.1", "E87.2"], labs: [ph, potassium]}
  renal_potassium:  {icd_prefixes: ["N17", "N18", "N19", "E87.5", "E87.6"], labs: [potassium, ph]}
universal_panic:                      # bypasses the diagnosis filter. NOT in design report. CLINICAL-REVIEW
  enabled: true
  potassium: {critical_low: 2.5, critical_high: 6.5}
  ph:        {critical_low: 7.10}
yellow:
  monitor_gap_minutes: 15             # design report
  vitals_overdue_minutes: 30          # design report gives 30–60
  vitals_overdue_escalate_minutes: 60
green:
  idle_after_results_minutes: 30      # design report
alerting:
  ack_cooldown_minutes: 30            # CLINICAL-REVIEW (not in design report)
  realert_score_increase: 2           # CLINICAL-REVIEW (not in design report)
  red_blocks_navigation: true         # design report
```

Validate the config at startup with a Pydantic model and fail loudly on unknown keys or missing values. Add `scripts/export_rules.py`, which renders `docs/clinical-rules.md` (a readable rules table for the clinicians) from the config, so the two never drift apart.

## 5. Synthetic scenario `night_shift_0245`

Store scenarios as JSON in `backend/app/sim/scenarios/` so clinicians can edit them without touching code. The player sorts events by time. Event types: `vitals`, `lab_order`, `lab_result`, `physician_action`, `monitor_disconnect`, `arrival`. Events may be stamped before `start`; they are applied at reset. Times are `HH:MM` on the scenario date.

```json
{
  "id": "night_shift_0245",
  "title": "Night shift, yellow zone, 02:45",
  "start": "2026-11-20T02:45:00",
  "end": "2026-11-20T04:30:00",
  "patients": [
    {"id": "Y01", "bed": "S-01", "label": "A.K.", "age": 68, "sex": "M",
     "arrived_at": "2026-11-20T02:10:00", "monitored": true,
     "working_dx": [{"code": "N39.0", "text": "Urinary tract infection"}, {"code": "R50.9", "text": "Fever"}]}
  ],
  "events": [
    {"t": "02:45", "patient": "Y01", "type": "vitals", "source": "monitor", "hr": 94, "sbp": 128, "dbp": 74, "temp": 37.9, "spo2": 96, "rr": 20},
    {"t": "03:00", "patient": "Y01", "type": "lab_order", "test": "lactate"},
    {"t": "03:40", "patient": "Y01", "type": "lab_result", "test": "lactate", "value": 4.6, "unit": "mmol/L"},
    {"t": "03:00", "patient": "Y03", "type": "monitor_disconnect", "resume": "on_nurse_ack"},
    {"t": "04:05", "patient": "Y08", "type": "arrival"},
    {"t": "02:05", "patient": "Y06", "type": "physician_action", "action": "prescription_written"}
  ],
  "expect": [
    {"patient": "Y01", "level": "RED", "first_at": "03:30"}
  ]
}
```

The scenario has 12 patients in beds S-01 to S-12:

| ID | Patient (synthetic) | Working diagnosis | Script | Expected with default config |
|---|---|---|---|---|
| Y01 | 68 M, arrived 02:10, monitored | N39.0 urinary tract infection; R50.9 fever | Vitals in the table below; lactate ordered 03:00, result 03:40 = 4.6 mmol/L | **RED first at 03:30** (score 3: HR 108 +1, Temp 38.4 +1, MAP 18 below baseline +1) while MAP is still 74; score 6 at 03:45 |
| Y02 | 54 F, monitored, stable (HR ~84, BP ~135/80, Temp ~36.7) | R07.4 chest pain | Troponin ordered 02:50, result 03:52 = 68 ng/L | **RED first at 04:00** (one related critical lab: +3) |
| Y03 | 45 F, monitored (HR ~96, BP ~125/78, SpO2 ~94, Temp ~36.9) | J45.9 asthma | Monitor readings at 02:45 and 03:00, then disconnected; the feed resumes at the next boundary after "monitor reconnected" | **YELLOW at 03:15**; escalated at 04:00 if never acknowledged |
| Y05 | 26 M, post-ictal, now alert, monitored, stable (HR ~88, BP ~124/76, Temp ~37.1) | R56.8 convulsions | Labs ordered 02:30; results 03:10: lactate 4.2 mmol/L, K+ 4.1; physician orders a repeat lactate at 03:20 | **No alert.** Lactate logged as suppressed at 03:15 (its critical cut-off applies to infection/sepsis diagnoses; lactate after a seizure is expected) |
| Y06 | 37 M, monitored, stable (HR ~82, BP ~130/82, Temp ~36.8) | N23 renal colic | CBC, creatinine and urinalysis ordered 02:00; analgesic prescribed 02:05; all results normal at 02:25; no further action | **GREEN at 03:00** (results ready for 35 min) |
| Y08 | 72 F, arrives 04:05, monitored | K74.6 liver cirrhosis | Manual vitals 04:07: HR 78, BP 92/50 (MAP 64), Temp 36.5; monitor 04:15: HR 80, BP 90/51 (MAP 64); 04:30: HR 79, BP 91/50 | **RED at 04:15** (MAP ≤ 65). The deliberate **limitation case**: a chronically low baseline, which the physician overrides with `chronic_baseline` |
| Y04, Y07, Y09–Y12 | Stable noise patients: 64 F, 24 F, 52 M, 58 F, 45 M, 31 F | R55 syncope, A09 gastroenteritis, L03.1 cellulitis, R42 dizziness, M54.5 low back pain, T78.4 allergy | Generated, see below | **No alert, ever** |

Y01 monitor vitals (every 15 min; the 02:45 reading is the baseline):

| Time | HR | BP | MAP | Temp | SpO2 | RR | Score |
|---|---|---|---|---|---|---|---|
| 02:45 | 94 | 128/74 | 92 | 37.9 | 96 | 20 | 0 |
| 03:00 | 98 | 122/70 | 87.3 | 38.1 | 96 | 21 | 1 |
| 03:15 | 103 | 114/63 | 80 | 38.3 | 95 | 22 | 2 |
| 03:30 | 108 | 106/58 | 74 | 38.4 | 95 | 23 | **3: RED** |
| 03:45 | 112 | 100/55 | 70 | 38.4 | 94 | 24 | 6 (lactate +3) |
| 04:00 | 118 | 94/50 | 64.7 | 38.5 | 94 | 25 | 10 |
| 04:15 | 121 | 90/48 | 62 | 38.6 | 93 | 26 | 10 |
| 04:30 | 124 | 86/46 | 59.3 | 38.6 | 93 | 26 | 10 |

Noise patients: generate them once with `scripts/generate_noise.py` (fixed seed `20261120`) and commit the explicit values into the JSON, so the runtime has no randomness. Constraints: monitored, a reading every 15 min from 02:45 to 04:30; HR 65–92, MAP 78–100, Temp 36.3–37.3, SpO2 95–99, RR 14–20; reading-to-reading changes within ±4 (HR, MAP) and ±0.2 (Temp); no drift larger than 8 from baseline; labs either none, still pending at 04:30, or followed by a physician action within 20 minutes of the last result.

**Expected timeline** with the default config and no operator actions. The scenario test must assert exactly this:

| Sim time | Must happen |
|---|---|
| 02:45 | No alerts |
| 03:00 | GREEN Y06 |
| 03:15 | YELLOW Y03; Y05's lactate logged as suppressed |
| 03:30 | RED Y01 (score 3) |
| 03:45 | Y01's RED updated to score 6; no duplicate alert |
| 04:00 | RED Y02; Y01's RED updated to score 10; Y03's YELLOW escalated (60 min without vitals) |
| 04:15 | RED Y08 |
| 04:30 | Nothing new |
| Any time | Y04, Y07, Y09–Y12: zero alerts |

**Demo hero path** (must fit the 60-second backup recording using step mode): reset → step to 03:00: GREEN Y06, the physician taps "Discharge decision made" and the bed is freed → step to 03:15: switch to the nurse view, YELLOW Y03, tap "Monitor reconnected" → switch back, step to 03:30: RED Y01 blocks the screen, opening another patient is refused, the "why" panel shows HR 108, Temp 38.4 and MAP 18 below baseline while MAP is still 74 → the physician taps "Move to red zone". Optional ending: step to 04:15 for Y08 (the limitation case). Talking point for the demo script: in this scenario a single MAP ≤ 65 rule would have fired only at 04:00, 30 minutes later (illustrative; synthetic data).

## 6. Stack and repository layout

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, Uvicorn, PyYAML; pytest and httpx for tests. In-memory state behind a lock; no database.
- **Frontend:** React + TypeScript + Vite, plain CSS with CSS variables, polling every second. No websockets, no state library, no chart library (draw sparklines as inline SVG). `lucide-react` (icons) is the only allowed extra dependency; any other dependency needs a one-line reason in `docs/STATUS.md`.
- **Sim time: lazy catch-up.** On every API call, advance the simulation to the current sim time (`sim_start + (wall_now − play_started) × speed` while playing) and evaluate every crossed 15-minute boundary in order. No background threads; fully deterministic.
- **Single-process demo:** FastAPI serves `frontend/dist` at `/` (with SPA fallback) when it exists.
- Use npm with Node 20+; if Node is missing but Bun is installed, use Bun. Pin versions in lock files.

```
.
├── README.md                    # existing team README: keep it, append a "Şahin Göz prototype" section
├── AGENTS.md                    # new, see §10
├── Makefile                     # setup | dev | test | demo
├── prompts/00_omp-initial-draft.md
├── brainstorming/  sessions/    # existing, read-only
├── backend/
│   ├── pyproject.toml           # or requirements*.txt
│   ├── app/
│   │   ├── main.py              # app, routers, static mount
│   │   ├── api/                 # state.py, patients.py, alerts.py, sim.py, audit.py, config.py
│   │   ├── domain/models.py     # Pydantic models = the shared contract
│   │   ├── engine/              # PURE: config.yaml, config.py, vitals.py, labs.py, yellow.py, green.py, lifecycle.py, evaluate.py
│   │   ├── sim/                 # clock.py, player.py, scenarios/night_shift_0245.json
│   │   ├── adapters/            # DataSource protocol + SimulatorSource
│   │   └── state.py             # store + audit log
│   └── tests/                   # test_vitals.py, test_labs.py, test_yellow.py, test_green.py, test_lifecycle.py,
│                                # test_scenario_night_shift.py, test_api.py
├── frontend/
│   ├── package.json  vite.config.ts (proxy /api → :8000)  tsconfig.json  index.html
│   └── src/  main.tsx  App.tsx  api.ts  types.ts  i18n/{en,tr}.json  components/  styles.css
├── scripts/                     # export_rules.py, generate_noise.py
└── docs/                        # STATUS.md, clinical-rules.md, demo-script.md, backlog.md, screenshots/, superpowers/plans/
```

Makefile targets: `setup` (virtualenv, backend and frontend dependencies), `dev` (Uvicorn on :8000 with reload plus Vite on :5173), `test` (pytest plus the frontend type-check and build), `demo` (build the frontend, serve everything on http://localhost:8000). Document the equivalent raw commands for Windows PowerShell in the README.

## 7. API contract

| Method and path | Purpose |
|---|---|
| `GET /api/health` | Status and sim time |
| `GET /api/state?role=physician\|nurse` | The single polling endpoint: `sim` {time, playing, speed, scenario_id, next_cycle_at}; `patients` (summaries, in-zone first); `alerts` (active, for this role, priority-sorted); `blocking_alert_id` (physician only: the highest-priority unacknowledged RED, else null); `counters` (suppressed labs, acknowledgements) |
| `GET /api/patients/{id}` | Detail: vitals series, labs, actions, the latest EngineResult (components and suppressed labs), alert history |
| `POST /api/alerts/{id}/ack` | `{action, reason?}`; checks that the action fits the alert level, writes the audit entry, applies side effects |
| `POST /api/patients/{id}/vitals` | Manual vitals entry by the nurse (`source=manual`) |
| `POST /api/patients/{id}/actions` | Physician action `{type}`; resets the GREEN idle timer |
| `GET /api/scenarios` · `POST /api/sim/reset {scenario_id?}` · `POST /api/sim/play {speed}` · `POST /api/sim/pause` · `POST /api/sim/step {minutes: 15}` | Demo clock control |
| `GET /api/audit` | The audit log |
| `GET /api/config` | The active engine config, read-only, for the transparency panel |

Acknowledgement actions and their side effects:
- **RED:** `reassessing` (starts the cooldown) · `move_to_red_zone` (status `transferred_red`; the patient leaves the list) · `start_intervention` (a badge on the row) · `expected_for_patient` with a required reason `chronic_baseline | artifact | already_managed` (logged as a **physician override**).
- **YELLOW:** `monitor_reconnected` (the scenario resumes that patient's monitor feed at the next boundary) · `vitals_entered` (opens manual entry) · `not_at_bed` with a reason.
- **GREEN:** `discharge_decided` (status `discharged`; the bed is freed) · `prescription_written` (resolves it) · `wait_justified` with a reason `consult | imaging | other` (snoozes it for 30 min).

Audit entries record sim time, wall time, patient, alert id, event (`created | updated | escalated | acknowledged | auto_resolved | superseded | lab_suppressed | status_changed | manual_vitals | physician_action`), role, action, reason, and acknowledgement latency in sim minutes. Use sequential ids (`A-0001`) so two runs produce identical logs.

## 8. UI

A generic mock HBYS screen with the Şahin Göz layer built in. Desktop first, and readable on a 1280×720 projector.

- **Top bar:** "Şahin Göz", "Yellow zone · night shift", a large sim clock, a role switch (Physician | Nurse, marked "demo"), a TR/EN switch, a permanent **SIMULATED DATA** pill, and an "About this prototype" button that opens the honesty panel.
- **Layout:** the patient list on the left (about 40%), the selected patient's detail on the right.
- **Patient row:** bed, synthetic label, age/sex, working diagnosis with ICD code, minutes in zone, last vitals with a freshness marker (stale data must look stale), the Şahin Göz score with a trend arrow, and the alert chip.
- **Alert visual language:** colour, icon and text together, never colour alone (colour-blind safe). No sound, no flashing.
- **RED (physician):** a full-screen blocking modal. It shows the patient, the score against the threshold, every component with its value, rule and points, a MAP/HR sparkline of the last 6 readings, and large action buttons (at least 56 px tall; each action takes 1 tap, an override with reason takes 2). While a RED is unacknowledged, opening another patient is refused with a short notice; the role switch and the demo controls stay usable. Several REDs form a queue ("1 of 2"). Footer: "Decision support only. The physician makes the final decision."
- **GREEN (physician):** a non-blocking banner and row chip; its actions sit in the detail panel.
- **YELLOW (nurse):** a banner list sorted by priority with its actions; "Vitals entered" opens a quick form with large numeric inputs.
- **Detail panel, "Şahin Göz assessment":** the score breakdown, plus "Not alerted (alarm-fatigue filter)" listing suppressed labs with their reasons.
- **Audit drawer:** the acknowledgement log with latencies.
- **Demo control bar** (visibly separate, labeled "Demo controls, not part of the product"): scenario, reset, play/pause, speed 30×/60×/120×, and a "+15 min" step.
- **Honesty panel:** what is real and what is simulated (§3); "rule-based weighted scoring, no machine learning"; "built with AI coding agents under clinician supervision"; and the known limits (static thresholds ignore personal baselines; only 4 diagnosis groups; up to 15 minutes of latency from the cycle; no real HBYS or monitor connection).
- **Resume where you left off:** all state lives on the server, so a page reload restores the view and any unacknowledged RED.
- **Text:** every UI string lives in `i18n/en.json` and `i18n/tr.json`. Default to English (the jury presentation is in English) and remember the choice in localStorage, wrapped in try/catch. Clinical wording suggests ("Consider…", "Suggested action"); it never states a diagnosis.
- **Accessibility:** WCAG AA contrast, base font of at least 16 px, a focus trap in the modal, full keyboard operation.

## 9. Work plan

**Phase 1: contracts and walking skeleton (you, sequentially).** Scaffold both apps, the dependencies and the Makefile; write `domain/models.py` and the matching `frontend/src/types.ts`; load and validate `config.yaml`; stub every endpoint with fixture data; make the frontend list patients from `/api/state`. `make dev` and `make test` must pass. Commit and push, so the team sees progress early.

**Phase 2: three parallel tracks (subagents working in non-overlapping folders against the Phase 1 contract).**
- **Track A, engine:** `backend/app/engine/`, tests first. Cover every boundary (MAP 65 vs 66, HR 100 vs 101, Temp 37.9 vs 38.0, monitor gap 14 vs 15 min, idle 29 vs 30 min), the diagnosis filter and universal panic values, stale data, RED over GREEN, deduplication, cooldown and escalation.
- **Track B, simulator:** clock, player, `night_shift_0245.json`, the noise generator, `export_rules.py`, and the scenario test (the expected timeline from §5; zero alerts for the noise patients; two runs with the same scripted actions produce identical audit logs).
- **Track C, UI:** all of §8, built against the stubbed API.

**Phase 3: integration and verification (you).** Wire the engine, simulator, state and audit log into the API and finish the API tests. Run the hero path from §5 in a real browser with the `browser` tool, twice in a row after a reset. Save four screenshots to `docs/screenshots/` (physician list, RED modal, nurse YELLOW, GREEN). Write the docs, push, and open a PR.

**Priorities.** Finish P0 completely (committed and pushed) before starting P1. **Stop after P1** and report. List the P2 items as next steps; do not build them.
- **P0, the working core:** the engine with all rules and the lifecycle; the scenario with its expected timeline; the API; the physician view with the blocking RED and GREEN; the nurse view with YELLOW; acknowledgements with side effects; the audit log; SIMULATED labels; reset; deterministic tests passing; `make demo` as a single process.
- **P1:** the "why" sparkline and the suppressed-labs panel; TR/EN; the honesty panel; the README section; `docs/demo-script.md` (a 30-second clinician story, then the hero path mapped onto the 8-minute talk: problem 1–2 min, live flow 3–4 min, result and limits 1–2 min); `docs/clinical-rules.md`; screenshots; `AGENTS.md`; `docs/STATUS.md`.
- **P2 (do not build now):** a night summary of KPIs, audit CSV export, GitHub Actions CI, a "physician alerted" marker in the nurse view, more scenarios, a FHIR adapter stub.

## 10. Guardrails

- No real patient data anywhere. No network calls at runtime. No secrets in the repo.
- Do not invent clinical rules or thresholds beyond this spec. If something is clinically ambiguous, build the simplest version, mark it `CLINICAL-REVIEW`, and list it in `docs/STATUS.md`.
- No accuracy or performance claims in the UI or the docs.
- Decision support only: nothing is executed automatically, and every clinical action is a physician's or a nurse's click.
- Anything not in this spec goes into `docs/backlog.md`.
- `AGENTS.md` must state how to set up, run and test; the folder map; that `config.yaml` belongs to the clinical team; the `CLINICAL-REVIEW` convention; the no-real-data and no-runtime-network rules; that `brainstorming/` and `sessions/` are read-only; and that `docs/STATUS.md` is updated after every task. The team's later review-and-follow-up prompts rely on it.
- `docs/STATUS.md` sections: Done · Real vs simulated · Assumptions · CLINICAL-REVIEW items · Known issues · Next steps.

## 11. Git

- Work on `feat/sahin-goz-v0`. Commit after each task with Conventional Commit messages (`omp commit` is fine) and push the branch regularly.
- Never commit to `main`, never force-push, never rewrite history, and never merge your own PR: the team's GitHub operator merges.
- At the end, open a PR to `main` with `gh` if it is authenticated; otherwise push the branch and say so.
- `.gitignore`: `node_modules/`, `.venv/`, `dist/`, `__pycache__/`, `.pytest_cache/`, `.env`.

## 12. Definition of done (tick every box before you report)

- [ ] `make setup && make test` passes on a clean clone, and the engine tests run in under 10 seconds.
- [ ] `make demo` serves the whole app on http://localhost:8000 from a single process.
- [ ] The scenario test asserts the full expected timeline from §5 and zero alerts for the noise patients.
- [ ] Two runs after a reset, with the same actions, produce identical alerts and audit logs.
- [ ] The hero path was verified in a real browser, twice: GREEN → YELLOW → blocking RED → acknowledgement → audit entry.
- [ ] While a RED is unacknowledged, the physician cannot open another patient, and after a page reload the RED is still there.
- [ ] Every alert shows its "why", and Y05's lactate appears as suppressed with its reason.
- [ ] SIMULATED DATA is visible on every screen, and the honesty panel lists what is real and what is simulated.
- [ ] No clinical number is hardcoded outside `config.yaml`, and `docs/clinical-rules.md` matches the config.
- [ ] `docs/STATUS.md`, `AGENTS.md`, the README section and `docs/demo-script.md` exist and are current.
- [ ] The branch is pushed, and the PR is opened or its absence explained.

## 13. Final report (your last message)

1. What runs now, with the commands to start it.
2. Test results (counts) and the browser verification.
3. Real vs simulated, in brief.
4. The `CLINICAL-REVIEW` items the clinicians must confirm.
5. Assumptions, deviations from this spec, and known issues.
6. The branch / PR link, and the P2 next steps in priority order.
