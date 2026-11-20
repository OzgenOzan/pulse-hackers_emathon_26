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
& .\.venv\Scripts\python.exe -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 8000
```

To develop instead, add `--reload --reload-dir backend` to the Uvicorn command, and in another terminal run `Set-Location frontend` then `npm.cmd run dev`.

### Try the night shift

1. Choose **Hekim → Sıfırla → +15 dk**. Point out that Ali Kurt (Yatak 01) is **Yakın Takip** at 03:00. Open Fatih Rüzgar (Yatak 06) and choose **Taburculuk kararı verildi**.
2. Choose **+15 dk → Hemşire**. Open Ceyda Metin (Yatak 03) and choose **Monitör yeniden bağlandı**. The patient stays unclassified until data returns.
3. Choose **Hekim → +15 dk**. Yatak 01 is now **Kritik**. Try opening another patient, press **Alarmı gördüm**, and show that the lock holds. Choose **Klinik değerlendirme kaydı oluştur → Kırmızı alana al**. Open **Klinik Alarmlar** to show the seen and evaluation records.

For an English-language rehearsal, choose **Ayarlar → Dil → İngilizce**. The default Turkish clicks above match the backup recording. **İstatistik ve Analiz** shows simulated audit activity, not clinical outcomes.

The project is rule-based and uses prototype thresholds only. It illustrates tradeoffs, not clinical performance. See the [demo script](docs/demo-script.md), [60-second backup](docs/demo-backup.mp4), [generated clinical rules](docs/clinical-rules.md), [status and review items](docs/STATUS.md), and the [light](docs/screenshots/gui-light.png), [dark](docs/screenshots/gui-dark.png) and [mobile](docs/screenshots/gui-mobile.png) screenshots.