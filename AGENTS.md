# Şahin Göz

- Setup: `make setup`. Development: `make dev`. Tests and build: `make test`. Single-process demo: `make demo` at `http://127.0.0.1:8000`. Python 3.11+ and Node 20+ are required; use the PowerShell commands in the README when not using Make.
- `backend/app/domain/`: shared models and API contract; `engine/`: pure evaluation and alert lifecycle; `sim/`: deterministic clock, player and synthetic scenarios; `adapters/`: data-source boundary; `api/`: HTTP adapter; `backend/tests/`: backend verification; `frontend/`: HBYS mock; `scripts/`: launchers and generated artifacts; `docs/`: status, rules and demo material.
- `backend/app/engine/config.yaml` belongs to the clinical team. Do not invent or tune clinical rules. `CLINICAL-REVIEW` denotes prototype logic or thresholds requiring clinician confirmation, not clinical recommendations.
- Regenerate `docs/clinical-rules.md` from `scripts/export_rules.py`; verify with `scripts/export_rules.py --check`. The night-shift noise data is committed explicitly; verify it with `scripts/generate_noise.py --check`.
- Use only synthetic data. Bind to loopback; no outbound runtime requests, credentials, or real system connections. Clinicians make all clinical decisions; the app only changes simulated state.
- `brainstorming/` and `sessions/` are read-only source material. Update `docs/STATUS.md` after every task.
- The UI defaults to English; Turkish is available in Settings. Keep both locale catalogs complete.
- The interactive Pages build runs the unchanged backend in a browser worker; both Pages artifacts load assets from their own origin only.
