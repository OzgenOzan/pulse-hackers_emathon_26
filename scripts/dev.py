"""Run both loopback development servers and stop them together."""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if npm is None:
        sys.exit('npm is not on PATH; install Node.js 20 or newer.')
    commands = [
        [sys.executable, '-m', 'uvicorn', '--app-dir', 'backend', 'app.main:app', '--reload',
         '--reload-dir', 'backend', '--host', '127.0.0.1', '--port', '8000'],
        [npm, 'run', 'dev'],
    ]
    children: list[subprocess.Popen] = []
    try:
        for command, directory in zip(commands, (ROOT, ROOT / 'frontend')):
            children.append(subprocess.Popen(command, cwd=directory))
        while True:
            if any(process.poll() is not None for process in children):
                return next(process.returncode for process in children if process.returncode is not None)
            time.sleep(0.2)
    except KeyboardInterrupt:
        return 0
    finally:
        for process in children:
            if process.poll() is None:
                process.terminate()
        for process in children:
            process.wait()


if __name__ == '__main__':
    raise SystemExit(main())
