# Şahin Göz 2.0 GUI: OMP follow-up prompt 02

> EM@THON 2026 · Team 4 PULSE HACKERS · Stage 5 of the team workflow (audit → follow-up).
> Audit of `main` at `ba0261a` (PR #2 merged), 19 Nov 2026, about 22:00. Implements the team's **GUI 2.0 brief** (Appendix A).
> Start OMP at the repository root on an up-to-date `main`. Either paste this whole file, or save it as `prompts/02_omp-gui2.md` and say: "Read prompts/02_omp-gui2.md completely and execute it."

---

## 0. Mission and ground rules

Redesign the interface into the "Smart Clinical Control Panel" described in Appendix A. The engine already works and has been audited. Keep it.

- **UI/UX first.** Backend changes are limited to the **additive** items in §3: a status classifier, display-only data, a "seen" record, an evaluation note, and new view fields. Do not change:
  - the scoring, lifecycle or player logic;
  - any existing value in `config.yaml`;
  - any existing API field or endpoint behaviour.
- **The protected tests must pass unchanged:** `test_exact_night_shift_timeline`, `test_scripted_user_replay_has_identical_alerts_and_audit`, and the rest of the current 94 backend tests. The only exception is a test that asserts English UI text, if one exists. Explain any such change in the report.
- **Fallback first.** Before any change, create the git tag `v1-audited` on the current `main` and push it. If GUI 2.0 is not stable by the morning, the team demos `v1-audited`.
- **Process.** No brainstorming step: this prompt plus Appendix A is the approved spec. Use **writing-plans** (14 tasks at most, saved under `docs/superpowers/plans/`) and execute with **subagent-driven-development**. Run the parallel tracks in §8 with the `task` tool. Use **test-driven-development** for all backend work and **verification-before-completion** before you report.
- **Git.** Branch `feat/gui-2` from the latest `main`. Make small Conventional Commits and push regularly. Never commit to `main`, never force-push, never merge your own PR.
- **Time.** Mentors freeze scope at about 05:30 and code at 13:30 on 20 Nov. Finish P0 completely and push it before starting P1. Check `date` in Europe/Istanbul: if it is past 04:30 when P1 is done, stop and report without starting P2.

## 1. Audit of `main` @ `ba0261a` (all verified; keep it working)

- `make test`: 94 backend tests pass; the type check and build pass; `export_rules.py --check` and `generate_noise.py --check` pass.
- Every follow-up-01 fix holds:
  - **D1:** a partial manual entry keeps fresh evidence (Y01 stays at score 3).
  - **D2:** a nurse acknowledgement no longer blocks GREEN.
  - **D3:** the five bad payloads return specific 422s.
  - **D4:** unknown action types return 422.
  - **U1–U6:** at 1280×720, all 11 rows are visible; the RED actions stay on screen at 04:00; no long decimals; the nurse lands on S-03; labels are shown; no console errors.
- The timeline, determinism, the server-side RED navigation lock (409), and persistence across a reload are all unchanged.
- Nothing needs fixing before GUI 2.0. The current compact board becomes the basis of the **table view**.

## 2. Decisions that reconcile the brief with the running system (follow exactly)

### 2.1 One patient risk status, derived from engine output (the engine is unchanged)

The brief's four colours are **patient statuses**. The engine's three alert levels (RED/YELLOW/GREEN) mean different things. Never show the words RED/YELLOW/GREEN or "code" in the UI again. Map them like this:

| Engine output (unchanged) | GUI 2.0 | Colour | Who acts |
|---|---|---|---|
| Unacknowledged RED alert (latched), or RED condition (score ≥ `red.threshold`) | Status **Kritik**. An unacknowledged alert also appears in the **critical alarm panel** | red | Physician records the evaluation; both roles can press "Alarmı gördüm" |
| Score still ≥ threshold after an evaluation record | **Kritik**, with the sublabel "Değerlendirildi HH:MM · {decision}" | red | — |
| Fresh vitals and `status.watch_min_score` ≤ score < threshold | **Yakın Takip** | yellow | — |
| YELLOW **condition** in the latest assessment (monitor gap ≥ 15 min, or vitals overdue ≥ 30 min), even if its alert was acknowledged | **Sınıflandırılmamış**: "Monitör verisi yok · N dk" or "Vital ölçümü gecikti · N dk". The active YELLOW alert also creates a nurse task, "Veri eksikliği" | light gray (status), neutral gray (task) | Nurse |
| No assessment yet, or HR or MAP not fresh | **Sınıflandırılmamış**: "Değerlendirme bekliyor" or "Yetersiz veri" | light gray | — |
| GREEN alert (results ready ≥ 30 min, no physician action) | Physician task **"Taburculuk değerlendirmesi"**. It counts in "Taburculuk değerlendirmesi bekleyen" and never changes the status colour | neutral gray | Physician |
| Fresh vitals, score 0, no data gap | **Stabil** | green | — |

- **Precedence:** Kritik > Yakın Takip > Sınıflandırılmamış > Stabil. This also sets the default list order: Kritik → Yakın Takip → Sınıflandırılmamış → Stabil, so unclassified ranks above stable.
- **Data-gap badges stay visible** next to any status. For example, a Yakın Takip patient with a monitor gap shows both.
- **"Yeni kötüleşme" (newly worsened)** means that, at the latest evaluation, the status moved **into** Yakın Takip or Kritik from a lower rank. A move to Sınıflandırılmamış is a data problem, not a deterioration. Show the emphasis until the next scheduled evaluation.

### 2.2 Critical alarms: seen ≠ evaluated

- The **full-screen RED modal goes away.** Its place is the **critical alarm panel**, directly below the stat cards. It uses a light red background, a strong red border, a warning icon and high-contrast text, and never blinks. On desktop, when the panel scrolls out of view, a compact sticky strip appears under the header ("1 kritik alarm · Yatak 01 – A.K. · Hastayı görüntüle"). On mobile, only the strip is shown.
- **Alarm text** follows the brief's example, built from the engine components (translated, top 3 by points, then "+N bulgu"):
  ```
  KRİTİK HASTA UYARISI
  Yatak 01 – A.K. – 68 yaş
  Taşikardi (nabız 108/dk), ateş (38,4 °C) ve bazale göre OAB düşüşü (18 mmHg) saptandı.
  Öncelikli klinik değerlendirme gerekli.
  ```
  Phrase map:
  - `map_low` → Hipotansiyon (OAB {v} mmHg)
  - `hr_high` → Taşikardi (nabız {v}/dk)
  - `temp_high` → Ateş ({v} °C)
  - `map_drop` → Bazale göre OAB düşüşü ({v} mmHg)
  - `hr_rise` → Bazale göre nabız artışı ({v}/dk)
  - `lab_troponin` → Troponin yüksekliği ({v} ng/L)
  - `lab_lactate` → Laktat yüksekliği ({v} mmol/L)
  - `lab_ph` → Kritik pH ({v})
  - `lab_potassium` → Kritik potasyum ({v} mmol/L)

  For a lab-driven alarm, append "· Çalışma tanısı: {ICD} {text}".
- **"Hastayı görüntüle"** opens that patient's detail.
- **"Alarmı gördüm"** calls the new `POST /api/alerts/{id}/seen` (§3). It records who saw the alarm and when, and nothing more. The alarm stays in the panel, the patient stays Kritik, and the navigation lock stays. Afterwards show "Görüldü 03:31 · Hekim", and drop the "YENİ" badge for that role.
- **"Klinik değerlendirme kaydı oluştur"** opens a sheet (not a full-screen block). It holds the alarm's evidence, an optional note (≤ 280 characters), and the **existing four RED acknowledgement actions** as decision buttons:
  - "Yeniden değerlendiriyorum"
  - "Kırmızı alana al"
  - "Müdahale başlatıldı"
  - "Bu hasta için beklenen" → choose a reason: "Kronik bazal değer", "Artefakt" or "Zaten yönetiliyor"

  Choosing a decision saves immediately via `POST /api/alerts/{id}/ack` with `{action, reason?, note?}`: 2 taps, or 3 with a reason. This is the only thing that closes an alarm.
- **Badges:**
  - "YENİ": not yet seen by the current role.
  - "KÖTÜLEŞİYOR": the alert is `escalated`, or its score rose since the current role saw it (or, if never seen, since it was created).
  - Emphasis is a thicker border plus the badge. No animation.
- **The navigation lock stays** (`red_blocks_navigation`, server-side 409). While the physician has an unrecorded alarm, they can open only the blocking patient. Other cards show a lock icon, and opening one gives the notice "Önce kritik alarm için klinik değerlendirme kaydı oluşturun." With several alarms, "Hastayı görüntüle" on a non-blocking alarm is disabled with the reason "Önce öncelikli alarmı kaydedin (Yatak NN)". The nurse is never locked. The nurse sees all critical alarms and may press "Alarmı gördüm"; "Klinik değerlendirme kaydı oluştur" is shown disabled with "Hekim yetkisi gerekir".

### 2.3 Language and honesty

- **All visible text is Turkish** and uses the brief's terms verbatim. Format numbers in the `tr-TR` locale (38,4 °C, SpO₂ %95, KB 106/58 mmHg). Show "OAB" (Ortalama arter basıncı, with a tooltip) wherever the engine uses MAP. Show the bed as "Yatak 01" in the UI only; the data keeps `S-01`.
- **English:** remove the header TR/EN switch. English stays reachable only under **Ayarlar → Dil**, for the English jury demo, and only if `en.json` passes a completeness check against `tr.json`. Otherwise hide the option. Completing English is P2.
- **Keep these mentor-required honesty elements** (black/gray only):
  - the "SİMÜLE VERİ" pill in the header;
  - the footer "Yalnızca karar desteğidir; nihai karar hekime aittir.";
  - "Bu prototip hakkında" (an info icon in the header, also in Ayarlar);
  - the demo strip, labelled "Demo kontrolleri — ürünün parçası değil". It stays usable under the lock and never covers alarm actions.

## 3. Backend additions (additive only, TDD, all existing tests unchanged)

1. **Config.** Add these sections; existing keys are untouched. Validate them in `config.py` and render them in `docs/clinical-rules.md`:
   ```yaml
   status:                               # GUI risk-status mapping. CLINICAL-REVIEW
     watch_min_score: 1                  # fresh vitals and watch_min_score ≤ score < red.threshold → "Yakın Takip"
     required_fresh_vitals: [hr, map]    # any of these missing or stale → "Sınıflandırılmamış · Yetersiz veri"
   display:
     gcs_fresh_minutes: 120              # older GCS shows "Güncel değil". CLINICAL-REVIEW
   ```
   Also add `gcs: {min: 3, max: 15}` under the existing `manual_entry.limits` (integers only).
2. **`engine/status.py`**, a pure function: `classify(snapshot, result, alerts_for_patient, now, config) -> RiskStatus`. `RiskStatus` holds:
   - `key`: `kritik | yakin_takip | siniflandirilmamis | stabil`;
   - `reasons`: list of `{key, params}`;
   - `data_issues`;
   - `since`;
   - `worsened`.

   Implement §2.1 exactly. Classification uses the YELLOW **condition** from the latest assessment, not the alert's acknowledgement state. Track the previous status per patient in `Session` at every scheduled evaluation, to compute `since` and `worsened`.
3. **Display-only data.** Add an optional `display` object to `PatientProfile` (default `None`, so test fixtures keep working). Add two new scenario event types that **never** enter scoring, the lifecycle, YELLOW or GREEN:
   - `gcs {value}`, stored in a separate stream, not in vitals;
   - `consult_request {service}` and `consult_result {service}`. A result requires a pending request, like labs.

   Display fields per patient:

   | ID | Display name (label) | Protocol | Başvuru şikâyeti | Hemşire | GCS events | Consults |
   |---|---|---|---|---|---|---|
   | Y01 | Ali Kurt (A.K.) | 26110001 | Ateş, idrarda yanma | Hmş. Elif Kaya | 02:12 → 15 | – |
   | Y02 | Berrin Laçin (B.L.) | 26110002 | Göğüs ağrısı | Hmş. Elif Kaya | 02:27 → 15 | Kardiyoloji, requested 03:55 |
   | Y03 | Ceyda Metin (C.M.) | 26110003 | Nefes darlığı | Hmş. Elif Kaya | 02:42 → 15 | – |
   | Y04 | Dilek Nalbant (D.N.) | 26110004 | Bayılma | Hmş. Elif Kaya | 02:28 → 15 | – |
   | Y05 | Emre Polat (E.P.) | 26110005 | Nöbet geçirme | Hmş. Elif Kaya | 02:22 → 14; 03:22 → 15 | Nöroloji, requested 02:40 |
   | Y06 | Fatih Rüzgar (F.R.) | 26110006 | Sağ yan ağrısı | Hmş. Elif Kaya | 01:57 → 15 | – |
   | Y07 | Gizem Sezer (G.S.) | 26110007 | Kusma, ishal | Hmş. Selin Yıldız | 02:33 → 15 | – |
   | Y08 | Hatice Tekin (H.T.) | 26110008 | Halsizlik | Hmş. Selin Yıldız | 04:07 → 15 | – |
   | Y09 | İsmail Uçar (label → İ.U.) | 26110009 | Bacakta kızarıklık ve şişlik | Hmş. Selin Yıldız | 02:35 → 15 | – |
   | Y10 | Jale Vural (J.V.) | 26110010 | Baş dönmesi | Hmş. Selin Yıldız | 02:38 → 15 | – |
   | Y11 | Kemal Öztürk (label → K.Ö.) | 26110011 | Bel ağrısı | Hmş. Selin Yıldız | 02:30 → 15 | – |
   | Y12 | Leyla Yavuz (L.Y.) | 26110012 | Kaşıntı, döküntü | Hmş. Selin Yıldız | 02:44 → 15 | – |

   - The responsible physician is "Dr. Deniz Aksoy" for all 12: one physician for 10+ patients is the clinical story.
   - All names are synthetic. Alarms keep using the initials label, as in the brief's example.
   - After editing, regenerate the scenario through `scripts/generate_noise.py`, so the canonical event order is kept and `--check` stays green.
   - The protected timeline must not move.
4. **`POST /api/alerts/{id}/seen {role}`.**
   - Requires `X-Replay-Id`. RED alerts only (others return 422 `seen_not_applicable`).
   - Idempotent per role: a repeat returns 204 and adds no audit row.
   - Stores `seen: {physician|nurse: {at, score}}` on the alert.
   - Audits a new event `seen` with role and latency.
   - Never changes status, the lock, cooldown or the lifecycle.
5. **Evaluation note.** `AckInput.note` is optional, stripped, 280 characters at most (longer returns 422 `note_too_long`). Store it on the alert and on the `acknowledged` audit entry.
6. **View fields** (additive; every current field stays as it is):
   - `StateView.overview`: `aktif`, `kritik`, `yakin_takip`, `stabil`, `siniflandirilmamis`, `taburculuk_bekleyen`, and `bekleyen_islem`. `bekleyen_islem` depends on the role: for the physician, unrecorded critical alarms plus discharge evaluations; for the nurse, active data-gap tasks.
   - `StateView.critical_alarms`: every active RED alert, priority-sorted, for **both** roles, with `seen`, `initial_score` and `blocking`.
   - `PatientSummary`: `risk_status`, the `display` fields, `gcs {value, observed_at, stale}`, `pending_labs [{label, ordered_at}]`, `pending_consults [{service, requested_at}]`, and `vital_flags`. `vital_flags` maps each parameter to `{level, note}`, derived **only** from the current components: points ≥ 3 → `kritik`, points 1–2 → `yakin_takip`; trend components add a note such as "bazale göre −18".
   - `GET /api/alerts?level=RED` returns the full alarm history (active and closed, with seen, decision, reason, note and latencies) for "Klinik Alarmlar".
7. **Tests.**
   - `test_status.py`: every row of §2.1, the precedence, the `worsened` rule, and that a data issue never yields Stabil.
   - `test_gui_api.py`: the counts in §7, seen semantics (alarm stays active, lock still returns 409, audit and latency, idempotency, 422s, replay id), notes, nurse visibility of `critical_alarms`, the display fields, GCS freshness, and that GCS and consult events leave the engine untouched.

## 4. Visual system

- **Tokens only.** Put every colour in `frontend/src/styles/tokens.css` as CSS variables, for both a light and a dark theme. Components use variables only.
- **Palette guard.** Add `scripts/check_palette.py --check` and include it in `make test`. It fails on any colour literal (hex, rgb, hsl or a named colour) outside `tokens.css`. The inline SVG favicon must also use palette colours.
- **Allowed colours:** the four status colours, plus white, black and grays. No blue, orange, purple or turquoise anywhere. That includes focus rings (use a 3 px black ring in the light theme, white in the dark theme), `accent-color`, `::selection`, links and chart lines. Prefer custom segmented buttons and chips over native selects, whose pop-ups can show the OS accent colour; list any remaining OS-drawn accents in STATUS.
- **Starting values** (adjust only to pass contrast; record the measured ratios in `docs/design-system.md`):

  | Token | Light | Dark | Use |
  |---|---|---|---|
  | `--kritik` | `#B3261E` | `#FF8A80` | stripe, icon, text |
  | `--kritik-bg` | `#FDECEA` | `#3A1414` | alarm panel background |
  | `--yakin-takip` | `#F2C200` | `#FFD54F` | **fill only**, with black text; never yellow text |
  | `--stabil` | `#1B6E2A` | `#81C784` | stripe, icon, text |
  | `--siniflandirilmamis` | `#D0D0D0` | `#9E9E9E` | stripe with a **diagonal hatch**; badge with `#222` text |
  | neutral | white/`#F5F5F5`/`#E5E5E5`/`#757575`/`#333`/`#111` | `#121212`/`#1E1E1E`/`#2A2A2A`/`#BDBDBD`/`#F2F2F2` | backgrounds, cards, borders, text |

  Text contrast must be ≥ 4.5:1; status shapes and borders must be ≥ 3:1.
- **Status = colour + icon + text, always.** Suggested lucide icons:
  - Kritik: `TriangleAlert`
  - Yakın Takip: `Eye`
  - Stabil: `CircleCheck`
  - Sınıflandırılmamış: `CircleHelp`, plus the hatch

  Light gray must never be mistaken for Stabil.
- **Type and icons.** Inter, bundled via `@fontsource-variable/inter` (no CDN, no runtime request). Body text 16 px; nothing below 14 px. Vital values 24–28 px, stat numbers 36–44 px, units smaller and lighter, clearly separate from the value. Icons come from `lucide-react` with `currentColor`. Every icon gets an accessible name and a short tooltip.
- **Cards.** White/neutral background, 1 px border, light shadow, 12 px radius. Motion only as 150–200 ms transitions, none under `prefers-reduced-motion`. No blinking, no looping animation.
- **Theme.** A light/dark toggle in the header, saved in localStorage (wrapped in try/catch). Default to the system preference. Colour meanings are identical in both themes.

## 5. Layout, components and pages

**Shell.** On desktop, from top to bottom: a fixed header → stat cards → the critical alarm panel → the patient list. A collapsible left sidebar shows icons only by default below 1600 px width, with the label on hover; the toggle persists. On tablet and mobile (< 1200 px), a bottom bar shows Genel Bakış, Aktif Hastalar, Klinik Alarmlar (badge), Bekleyen İşlemler (badge) and "Daha fazla". Use hash routes such as `#/genel-bakis?role=…&patient=…`.

**Header.**
- **Left:** a minimalist monochrome SVG logo (a hawk's eye merged with an ECG line, original artwork), then "ŞAHİN GÖZ 2.0" over "Akıllı Klinik Takip ve Karar Destek Sistemi".
- **Right:**
  - an alarm bell with the count of unrecorded critical alarms (it opens the panel or Klinik Alarmlar);
  - the simulated date and time, "20 Kas 2026 · 03:30", with a small "Simüle saat" label;
  - a visible **Hekim | Hemşire** segmented switch labelled "Demo rolü";
  - the profile ("Dr. Deniz Aksoy" or "Hmş. Elif Kaya");
  - the theme toggle;
  - the connection status, in words with grayscale icons only: "Bağlı" (last poll succeeded within 2 s), "Bağlantı zayıf" (slow poll or 1 failure), "Bağlantı kesildi" (3 consecutive failures);
  - "SİMÜLE VERİ" and the info icon.
- **When "Bağlantı kesildi":** show a full-width notice "Bağlantı kesildi — veriler HH:MM:SS itibarıyla", and mark every value "Güncel değil".
- **At 1280 px nothing may overflow:** collapse the profile to an avatar first; the connection word stays.

**Stat cards** (one row, big numbers, simple icons, short labels; clicking one filters the list, and the active filter shows as a chip):

| Card | Colour |
|---|---|
| Aktif hasta | neutral |
| Kritik | red |
| Yakın Takip | yellow fill |
| Stabil | green |
| Sınıflandırılmamış | light gray |
| Bekleyen işlem | neutral, role-specific |
| Taburculuk değerlendirmesi bekleyen | neutral; a shortened label is allowed if the full text is in `aria-label`/`title` |

**Patient card** (the default view; the user's choice of view persists):
- A status stripe on the left edge, plus a status label (icon + text) inside, plus "Yeni kötüleşme" when applicable.
- Neutral task chips: "Taburculuk değerlendirmesi bekliyor · 35 dk", "Veri eksikliği".
- A lock icon when navigation is locked.
- Patient identity: name and surname, protocol number, age and sex ("68 · E"), and "Yatak 01".
- Başvuru şikâyeti, and time in the ED ("1 sa 20 dk").
- Vitals: KB sistolik/diyastolik (OAB small underneath), Nabız, SpO₂, Solunum sayısı, Vücut sıcaklığı, GKS.
- "Son ölçüm 03:30 · Monitör".
- A one-line risk reason, the top findings in words. The raw score appears only in the detail and the table.
- Bekleyen tetkikler, and Bekleyen konsültasyonlar ("Yok" if none).
- Abnormal vitals use `vital_flags` only: red or yellow fill, an icon and a short note ("Yüksek", "≤ 65", "bazale göre −18"). SpO₂, RR and GCS get no highlight, because the engine has no enabled rule for them; list this in STATUS as CLINICAL-REVIEW.
- A value is never shown as a normal value when it is missing or old:
  - "Ölçülmedi": never recorded;
  - "Güncel değil · HH:MM": older than its freshness window, shown small and gray, never in the large style;
  - "Veri yok": the patient has no vitals at all.

**Table view.** The current compact board, restyled, with the same fields abbreviated. Lower-priority columns hide below 1440 px.

**Sorting, filtering, search.**
- Default sort is risk (§2.1). Within a status: newly worsened first, then score (descending), then time in ED (descending), then bed.
- Other sorts: bed, time in ED, last vitals time, pending tests, pending consultations. When a non-risk sort is active, show the chip "Risk sırası kapalı".
- Filters: risk status (multi-select), pending tests yes/no, pending consultations yes/no, responsible physician, responsible nurse, time in ED ≥ 2 h / ≥ 4 h, last vitals ≥ 30 min ago.
- Quick search by name, surname or protocol number.
- Active filters are always visible as chips, with one "Filtreleri temizle" action.

**Patient detail.** A right-hand slide-over (about 480 px) on desktop, full screen on mobile. It contains:
- the identity header with status;
- vitals with trends (restyled sparklines, grayscale lines, status colour only on flagged points);
- "Neden bu durum?": the components table, plus "Uyarı üretmeyen sonuçlar (alarm yorgunluğu filtresi)" listing the suppressed labs with reasons, and the working diagnosis;
- labs; consultations;
- the role's tasks and actions;
- the alarm, seen and evaluation history.

**Pages:**
- **Genel Bakış:** the shell layout.
- **Aktif Hastalar:** the list with the filter bar expanded.
- **Kritik Hastalar:** a Kritik preset.
- **Klinik Alarmlar:** active and recorded alarms with seen and decision timelines.
- **Bekleyen İşlemler:** grouped as alarms awaiting a record, discharge evaluations, data gaps, pending tests, pending consultations.
- **Hekim Paneli** and **Hemşire Paneli:** each role's queue. They do not switch the role; actions follow the active role's permissions.
- **İstatistik ve Analiz** (P2): a few big numbers from the audit, titled "Simüle vardiya özeti — klinik performans iddiası değildir". At most two simple charts.
- **Ayarlar:** theme, list view, demo role, Dil (see §2.3), "Bu prototip hakkında", and a read-only view of the clinical rules from `/api/config`. Keep it small: the mentors warn against settings and dashboards in the demo.

**Roles.** An action outside the active role's permissions is shown disabled, with a short reason ("Hekim yetkisi gerekir", "Hemşire rolü gerekir").
- **Physician:** evaluation records and discharge-evaluation actions.
- **Nurse:** data-gap actions ("Monitör yeniden bağlandı", "Vital gir", "Hasta yatağında değil" → reason) and manual vitals. The manual form adds an integer GKS field.

**Responsive and accessibility.**
- Check at 1920×1080, 1280×720, 1024×768 and 390×844, in light and dark themes and in both roles.
- Touch targets ≥ 44 px (≥ 48 px for primary actions).
- Keyboard: everything is operable and focus stays visible.
- Use `aria-live="assertive"` for new critical alarms and `polite` for tasks.

**Shared components** (in `frontend/src/components/ui/`, documented in `docs/design-system.md`): `StatusLabel`, `StatCard`, `AlarmCard`, `PatientCard`, `VitalSign`, `FilterBar`, `TaskChip`, `ConnectionStatus`.

**Stable test ids** for the hero automation: keep `demo-reset`, `demo-step`, `role-physician`, `role-nurse` and `board-row-{id}` (card or row). Add:
- `stat-{key}`
- `alarm-{patient}`, `alarm-view-{patient}`, `alarm-seen-{patient}`, `alarm-evaluate-{patient}`
- `eval-action-{action}`
- `task-action-{action}`
- `nav-{route}`

## 6. Priorities

- **P0 (demoable core; push it as soon as it is done):**
  - the tag, the backend additions in §3, the tokens with the light theme, Inter and lucide, Turkish text;
  - the header, stat cards, alarm panel (seen and evaluation semantics, the lock), the patient card view, the risk sort, missing and stale labels, flags, the detail, the neutral tasks;
  - the demo strip, the hero path (§7), and the demo-script vocabulary.
- **P1:**
  - the sidebar and bottom bar with all routes except İstatistik;
  - filters, search, sort chips and the table view;
  - the dark theme, the tablet and mobile layouts, the sticky alarm strip;
  - role-disabled states;
  - the palette check, `docs/design-system.md`, and refreshed screenshots: light and dark at 1280×720, plus one 390×844 view;
  - a re-recorded 60-second backup video.
- **P2:** İstatistik ve Analiz, a complete English catalog, polish.

## 7. Hero path in GUI 2.0 (it must work; assert these counts in `test_gui_api.py` and in the browser)

| Sim time / action | Expected |
|---|---|
| Reset, 02:45, Hekim | Aktif 11 · Kritik 0 · Yakın Takip 0 · Stabil 11 · Sınıflandırılmamış 0 · Taburculuk 0 |
| +15 → 03:00 | Y01 **Yakın Takip** (score 1, "Yeni kötüleşme") · Stabil 10 · Taburculuk 1 (Y06) · Hekim bekleyen işlem 1 |
| Y06 → "Taburculuk kararı verildi" | Aktif 10 · Yakın Takip 1 · Stabil 9 · Taburculuk 0 |
| +15 → 03:15 | Y01 Yakın Takip (score 2) · Y03 **Sınıflandırılmamış** ("Monitör verisi yok · 15 dk") · Stabil 8 · Hemşire bekleyen işlem 1 |
| Hemşire: Y03 → "Monitör yeniden bağlandı" | Y03 **stays** Sınıflandırılmamış (bağlantı onaylandı, veri bekleniyor) · Hemşire bekleyen işlem 0 |
| Hekim, +15 → 03:30 | Y01 **Kritik** ("Yeni kötüleşme") · alarm panel shows Y01 · Y03 Stabil · Stabil 9 · opening Y02 is refused |
| "Alarmı gördüm" | Alarm still shown ("Görüldü 03:30 · Hekim") · Y01 still Kritik · opening Y02 still refused · audit has `seen` |
| "Klinik değerlendirme kaydı oluştur" → "Kırmızı alana al" (+ optional note) | Aktif 9 · Kritik 0 · Stabil 9 · panel empty · Klinik Alarmlar shows created/seen/decision with latencies |

Without any actions: 04:00 Kritik 2 (Y01, Y02) · Sınıflandırılmamış 1 (Y03) · Stabil 8; 04:15 Aktif 12 · Kritik 3 (+Y08) · Sınıflandırılmamış 1 · Stabil 8.

Update `docs/demo-script.md` and the README's "Try the night shift" to these Turkish clicks, with English narration. Story beat: "Y01 turns Yakın Takip at 03:00, before it turns Kritik at 03:30" makes early deterioration visible.

## 8. Work plan

1. **You, sequentially:** tag, branch, plan; then the backend additions in §3 with tests (TDD); push.
2. **Parallel subagents** (non-overlapping folders, against the new API contract):
   - **A:** tokens, themes, the shell, header and navigation;
   - **B:** `ui/` components and the patient card/table;
   - **C:** the alarm panel, the evaluation sheet and the task flows.
3. **You:** integrate the pages; run the hero path in a real browser at 1280×720, twice; verify the responsive sizes and dark theme; write the docs; take the screenshots; record the video; push; open the PR.

## 9. Definition of done

- [ ] `v1-audited` is tagged and pushed before the first change.
- [ ] `make test` passes, including the new status/GUI tests and `check_palette.py --check`. The protected timeline and replay tests are unchanged. `export_rules.py --check` and `generate_noise.py --check` are green.
- [ ] Every count and behaviour in §7 is asserted through the API and seen in the browser. "Alarmı gördüm" never closes an alarm, never changes the status, and never lifts the lock.
- [ ] The UI shows no RED/YELLOW/GREEN/"code" wording, and every visible string is Turkish.
- [ ] No colour outside the palette (the script passes), and focus rings are black or white.
- [ ] Every status shows colour + icon + text; Sınıflandırılmamış is hatched and labelled.
- [ ] No missing or stale value is rendered in the normal style.
- [ ] At 1280×720 with no alarm: ≥ 6 patient cards in card view and ≥ 10 rows in table view are fully visible. With one alarm in the panel, the table view shows ≥ 7 rows. At 1920×1080, ≥ 12 cards are visible.
- [ ] The light and dark themes keep the same meanings.
- [ ] 1024×768 and 390×844 use the bottom bar.
- [ ] The console shows no errors, and the app makes no external requests (including fonts).
- [ ] The hero path runs twice with identical audits. Screenshots and the ≤ 60-second video are refreshed. STATUS has a "GUI 2.0" section (decisions, deviations, CLINICAL-REVIEW items: `status.*`, `display.gcs_fresh_minutes`, `manual_entry.limits.gcs`, SpO₂/RR/GCS highlighting, and consults not affecting GREEN). `docs/design-system.md` exists.
- [ ] `feat/gui-2` is pushed, and the PR is opened or its absence explained.

## 10. Final report

1. P0 / P1 / P2 status, item by item, with commits.
2. Test counts before and after; the new tests.
3. The browser results for every Definition-of-done line, per size and theme.
4. Decisions and deviations from Appendix A, and the CLINICAL-REVIEW items.
5. Branch / PR link, tag, and the recommended next prompt.

---

## Appendix A — GUI 2.0 brief from the team (verbatim; save it as `docs/gui-2.0-brief.md`)

```
# Şahin Göz 2.0 — GUI Brief

## Scope and goals
- Redesign the UI of the existing Şahin Göz ED decision-support and patient-tracking system.
- Target: a "Smart Clinical Control Panel" built for fast reading and low cognitive load.
- UI/UX only: keep all existing infrastructure and functions. Focus on visuals,
  information hierarchy, accessibility and UX.
- Goals:
  - Critical patients noticed at a glance; deterioration visible early
  - Missing or outdated data never misread
  - Patient info reachable in as few clicks as possible
  - Fast, consistent, safe use in a busy ED
- All on-screen text is Turkish. Use the Turkish terms given below.

## Visual style
- Look: a digital ED command center, not a classic hospital information system.
- Blend aviation-panel readability, ICU-monitor data display and clean health-tech design.
- Modern, minimalist, professional, highly legible. Font: Inter or Roboto.
- Avoid small text, unnecessary explanations, complex menus and decorative clutter.
- Cards: white/neutral background, light shadow, clear border, rounded corners.
- Light and dark themes; colors and hierarchy keep the same meaning in both.
- Responsive across desktop, tablet and mobile.
- Motion: brief, subtle transitions only. Nothing that blinks continuously, moves
  needlessly or pulls attention from clinical data.

## Clinical color rules (strict)
- Only these four status colors:
  - Red: "Kritik" (critical, needs urgent evaluation)
  - Yellow: "Yakın Takip" (at risk, may deteriorate, needs close monitoring)
  - Green: "Stabil" (stable)
  - Light gray: "Sınıflandırılmamış" (unclassified, evaluation incomplete, insufficient data)
- Color is never the only signal: every status color appears with its text label and an icon.
- No other hues anywhere: no blue, orange, purple or turquoise.
- All other UI (backgrounds, text, borders, buttons, menus): white, black and grays only.
- Light gray must never be mistaken for stable. Label those patients clearly, e.g.
  "Sınıflandırılmamış", "Değerlendirme bekliyor" or "Yetersiz veri".

## Layout
- Desktop, top to bottom: fixed header → stat cards → critical alarm panel → patient list.
- Navigation: collapsible left sidebar on desktop; bottom bar on tablet and mobile.

### Header (fixed, minimal)
- Left: minimalist logo (hawk's eye + medical monitoring), then:
  - Title: "ŞAHİN GÖZ 2.0"
  - Subtitle: "Akıllı Klinik Takip ve Karar Destek Sistemi"
- Right:
  - Notification/alarm icon; current date and time
  - Active role ("Hekim" or "Hemşire"); user profile
  - Light/dark theme toggle
  - System/data connection status, always in words: "Bağlı", "Bağlantı zayıf", "Bağlantı kesildi"

### Stat cards (horizontal row)
- Big numbers, simple icons, short labels.
- Clicking a card filters the patient list to that group.
- Cards and colors:
  - Aktif hasta (active patients): neutral gray
  - Kritik: red
  - Yakın Takip: yellow
  - Stabil: green
  - Sınıflandırılmamış: light gray
  - Bekleyen işlem (pending tasks): neutral gray
  - Taburculuk değerlendirmesi bekleyen (awaiting discharge evaluation): neutral gray

### Critical alarm panel
- Directly below the stat cards, above the patient list and everything else.
- Light red background, strong red border, warning icon, high-contrast text. No blinking.
- New alarms appear in real time; new or worsening conditions are visually emphasized.
- Example alarm:
    KRİTİK HASTA UYARISI
    Yatak 04 – A.K. – 68 yaş
    Hipotansiyon ve taşikardi saptandı.
    Öncelikli klinik değerlendirme gerekli.
- Buttons on every alarm: "Hastayı görüntüle", "Alarmı gördüm", "Klinik değerlendirme kaydı oluştur"
- "Alarmı gördüm" only records that the user has seen the alert. It must NOT:
  - close or dismiss the alarm
  - show the patient as resolved or back to normal

### Patient list
- Default card view; user can switch to a table view.
- Card fields:
  - Hasta adı ve soyadı, Protokol numarası, Yaş ve cinsiyet, Yatak numarası
  - Başvuru şikâyeti, Acil serviste kalış süresi
  - Vital bulgular: Kan basıncı (sistolik/diyastolik), Nabız, SpO₂, Solunum sayısı,
    Vücut sıcaklığı, Glasgow Koma Skalası
  - Son vital bulgu ölçüm zamanı, Güncel klinik risk durumu
  - Bekleyen tetkikler, Bekleyen konsültasyonlar
- Left edge: vertical stripe in the status color, plus the written status label inside the card.
- Vitals in large numbers; units visible but clearly separate from the values.
- Abnormal vitals: highlighted with color, an icon and a short note.
- Missing, unmeasured or outdated values must never look normal. Show "Ölçülmedi",
  "Veri yok" or "Güncel değil" instead.

### Sorting, filtering, search
- List re-sorts automatically by current risk:
  Kritik → Yakın Takip → Sınıflandırılmamış → Stabil (unclassified ranks above stable).
- Newly deteriorating patients get extra emphasis.
- Filter and sort by: risk status, bed number, time in ED, last vitals time, pending tests,
  pending consultations, responsible physician, responsible nurse.
- Quick search by patient name, surname or protocol number.
- Active filters always visible; one action clears them all.

### Navigation
- Sidebar items, each with a simple, consistent icon: Genel Bakış, Aktif Hastalar,
  Kritik Hastalar, Klinik Alarmlar, Bekleyen İşlemler, Hekim Paneli, Hemşire Paneli,
  İstatistik ve Analiz, Ayarlar.
- Collapsed sidebar: icons stay visible; label appears on hover.
- Tablet/mobile: bottom bar shows the most-used sections; the rest sit in a "more" menu.

## Roles, accessibility, components
- Hekim and Hemşire interfaces tailored to each role's tasks and permissions.
- Actions outside the user's permissions: hidden, or shown disabled with a clear reason.
- Touch-friendly sizes for all buttons, cards and interactive areas.
- Enough text/background contrast; every icon gets an accessible name and short description.
- Reusable, modular components in one shared design system: patient card, alarm card,
  vital-sign display, status label, filter bar, stat card.
```
