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
	$(VENV_PYTHON) -m unittest discover -s scripts -p test_check_palette.py
	$(VENV_PYTHON) scripts/check_locales.py
	cd frontend && $(NPM) run typecheck
	cd frontend && $(NPM) run build
	$(VENV_PYTHON) scripts/export_rules.py --check
	$(VENV_PYTHON) scripts/generate_noise.py --check
	$(VENV_PYTHON) scripts/export_raw_data.py --check

demo:
	cd frontend && $(NPM) run build
	$(VENV_PYTHON) -m uvicorn --app-dir backend app.main:app --host 127.0.0.1 --port 8000

.PHONY: pages pages-fallback pages-preview pages-smoke
pages:
	$(VENV_PYTHON) scripts/build_pages.py

pages-fallback:
	$(PYTHON) scripts/build_pages.py --fallback

pages-preview:
	$(PYTHON) scripts/build_pages.py --preview

pages-smoke:
	$(VENV_PYTHON) -m pip install playwright==1.58.0
	$(VENV_PYTHON) -m playwright install chromium
	$(VENV_PYTHON) scripts/smoke_pages.py $(PAGES_SMOKE_ARGS)
