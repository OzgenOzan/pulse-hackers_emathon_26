PYTHON ?= python
NPM ?= npm
ifeq ($(OS),Windows_NT)
VENV_PYTHON := .venv/Scripts/python.exe
else
VENV_PYTHON := .venv/bin/python
endif

.PHONY: setup dev test demo
setup:
	$(PYTHON) -m venv .venv
	$(VENV_PYTHON) -m pip install -r backend/requirements.txt
	cd frontend && $(NPM) ci --no-audit --no-fund

dev:
	$(VENV_PYTHON) scripts/dev.py

test:
	$(VENV_PYTHON) -m pytest -c backend/pytest.ini backend/tests
	$(VENV_PYTHON) scripts/check_palette.py --check
	$(VENV_PYTHON) scripts/check_locales.py
	cd frontend && $(NPM) run typecheck
	cd frontend && $(NPM) run build

demo:
	cd frontend && $(NPM) run build
	$(VENV_PYTHON) -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 8000
