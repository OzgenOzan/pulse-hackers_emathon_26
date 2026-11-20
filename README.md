Team 4 | PULSE HACKERS
EM@THON 2026

19–20 November 2026: 24-hour coding marathon
 21 November 2026: English jury presentation

Team Members
Assist. Prof. Gül Pamukçu Günaydın, MD
Ahmet Emre Ay, MD, Specialist
Yıldız Yıldırımer Çelik, MD, Specialist
Kadir Yenal, MD, Specialist
Ahmet Ozan Özgen, Pharmacist

About the Event

The Emergency Medicine Association of Türkiye (TATD) launched EM@THON in 2023, bringing emergency medicine physicians and information technology professionals together in multidisciplinary teams for the first time in Türkiye.

EM@THON is a medical hackathon in which software projects are transformed from ideas into working prototypes within a limited period. The event focuses on improving the speed and accuracy of triage, patient management, diagnosis, treatment, and clinical decision-making in emergency medicine.

The fourth edition of EM@THON will take place on 19–20 November 2026 as part of the EACEM Congress. This year, the event will be held as a 24-hour coding marathon. Following brief opening seminars and team–mentor matching, teams will develop projects aligned with the designated theme and produce functional prototypes.

Projects will be evaluated by the jury according to the following criteria:

Originality
Innovation
Contribution to the quality of emergency patient care
Potential for further development and scalability
Project Approach

PULSE HACKERS combines a five-member multidisciplinary team with an operational workflow supported by multiple artificial intelligence agents.

The primary objectives of this approach are:

Systematic definition of the clinical problem
Evidence-based solution design
Rapid and parallel software development
Clinical validation and risk assessment
Completion of a functional prototype within 24 hours
Preparation of the English jury presentation

Team:

Team 4 — PULSE HACKERS

## Şahin Göz prototype

Şahin Göz is an offline decision-support demo for the emergency department’s yellow-zone observation area. All patients, feeds, times, diagnosis mappings and the HBYS screen are **SIMULATED**. The rules engine, role-routed alerts, blocking RED acknowledgement, clinician-selected state changes and audit log run end to end. No machine learning, real clinical integration or external runtime service is involved. **Not validated for clinical use.**

### Live demo (GitHub Pages)

[Open the jury demo on GitHub Pages](https://ozgenozan.github.io/pulse-hackers_emathon_26/). The interactive site runs the same Python rules engine through self-hosted Pyodide, with no API server. The first load transferred about 17 MB in the loopback browser smoke test.

Each tab has its own simulation; reloading restores the default rules and starts the shift at 02:45. The stage demo and advisory YAML export still use `make demo`. A separate static fallback contains a 60-second recording and three screenshots of the local app.

| Task | Make | Windows PowerShell without Make |
|---|---|---|
| Assemble the interactive site (after setup) | `make pages` | `& .\.venv\Scripts\python.exe scripts/build_pages.py` |
| Assemble the static fallback | `make pages-fallback` | `python scripts/build_pages.py --fallback` |
| Serve the artifact under the project path | `make pages-preview` | `python scripts/build_pages.py --preview` |
| Smoke-test the interactive artifact | `make pages-smoke` | Run the PowerShell smoke commands below |

The preview URL is [http://127.0.0.1:8080/pulse-hackers_emathon_26/](http://127.0.0.1:8080/pulse-hackers_emathon_26/). Close any existing preview before running the smoke test; it starts the preview itself. For the fallback use `make pages-smoke PAGES_SMOKE_ARGS=--fallback`, or add `--fallback` to the last command below.

```powershell
& .\.venv\Scripts\python.exe -m pip install playwright==1.58.0
& .\.venv\Scripts\python.exe -m playwright install chromium
& .\.venv\Scripts\python.exe scripts/smoke_pages.py
```

Repository owner: enable **Settings → Pages → Build and deployment → Source: GitHub Actions** once before merging. The push to `main` publishes the artifact; **Actions → pages → Run workflow** on `main` redeploys it.

### Run locally

Requires Python 3.11+, Node.js 20+, and npm. Setup needs network access to download dependencies; the running demo does not.

```sh
make setup
make test
make demo
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). For development, `make dev` starts the API on port 8000 and Vite on [port 5173](http://127.0.0.1:5173). Stop the demo before starting development.

#### Windows PowerShell without Make

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
& .\.venv\Scripts\python.exe -m pytest -c backend/pytest.ini backend/tests
Push-Location frontend
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
Pop-Location
& .\.venv\Scripts\python.exe scripts/export_rules.py --check
& .\.venv\Scripts\python.exe scripts/generate_noise.py --check
& .\.venv\Scripts\python.exe scripts/export_raw_data.py --check
& .\.venv\Scripts\python.exe -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 8000
```

To develop instead, add `--reload --reload-dir backend` to the Uvicorn command, and in another terminal run `Set-Location frontend` then `npm.cmd run dev`.

### Try the night shift

1. Choose **Physician → Reset → +15 min** (**Hekim → Sıfırla → +15 dk**). Point out that Ali Kurt (Bed 01 / Yatak 01) is **Close Watch** (**Yakın Takip**) at 03:00. Open Fatih Rüzgar (Bed 06 / Yatak 06) and choose **Discharge decision made** (**Taburculuk kararı verildi**).
2. Choose **+15 min → Nurse** (**+15 dk → Hemşire**). Open Ceyda Metin (Bed 03 / Yatak 03) and choose **Monitor reconnected** (**Monitör yeniden bağlandı**). The patient stays **Unclassified** (**Sınıflandırılmamış**) until data returns.
3. Choose **Physician → +15 min** (**Hekim → +15 dk**). Bed 01 (Yatak 01) is now **Critical** (**Kritik**). Try opening another patient, press **Mark alarm seen** (**Alarmı gördüm**), and show that the lock holds. Choose **Create clinical assessment record → Move to red zone** (**Klinik değerlendirme kaydı oluştur → Kırmızı alana al**). Open **Clinical Alarms** (**Klinik Alarmlar**) to show the seen and evaluation records.

The UI opens in English. For Turkish, choose **Settings → Language → Turkish** (**Ayarlar → Dil → Türkçe**). The choice survives reload. The backup recording and the screenshots show the Turkish UI. **Statistics and Analysis** (**İstatistik ve Analiz**) shows simulated audit activity, not clinical outcomes.

The project is rule-based and uses prototype thresholds only. It illustrates tradeoffs, not clinical performance. See the [demo script](docs/demo-script.md), [60-second backup](docs/demo-backup.mp4), [generated clinical rules](docs/clinical-rules.md), [status and review items](docs/STATUS.md), and the [light](docs/screenshots/gui-light.png), [dark](docs/screenshots/gui-dark.png) and [mobile](docs/screenshots/gui-mobile.png) screenshots.

### Raw data for the jury

Browse [raw_data/](raw_data/) to inspect the synthetic patient profiles, vital and lab feeds, events, and expected first alerts without running the app. The [patient pages](raw_data/night_shift_0245/patients/) organize the same feed by patient; the CSVs indicate which monitor samples the unattended simulator delivers.

### Editing clinical rules (Settings / Ayarlar)

In the **Physician** (**Hekim**) demo role, open **Settings → Clinical rules** (**Ayarlar → Klinik kurallar**) to compare and tune the simulated thresholds and limits. Applying a change restarts the shift at 02:45, clears the prior replay's alarms and records, and displays **CUSTOM RULE SET** (**ÖZEL KURAL SETİ**). Changes are shared across tabs for the current server process; **Restore default rules** (**Varsayılan kurallara dön**) or a server restart restores the default rules. The **Nurse** (**Hemşire**) view is read-only. The demo role is not authentication, and the editor never writes `config.yaml`. These are simulation what-ifs, not clinical recommendations.

With the demo running, [download the active rules as an advisory YAML](http://127.0.0.1:8000/api/config/export). It is a proposal, not a replacement for `config.yaml`.