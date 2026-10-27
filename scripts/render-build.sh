#!/usr/bin/env bash
# Render build: installs a standalone Python 3.12 with uv inside the project folder (independent of the base image),
# creates apps/api/.venv and installs the API packages. The website is built by `npm run build`.
set -euo pipefail
cd "$(dirname "$0")/.."
# Render's build image presets uv (config file and UV_* variables that forbid managed Python). Ignore them all here.
for v in $(env | grep -o '^UV_[A-Z_]*' || true); do unset "$v"; done
export UV_NO_CONFIG=1 UV_PYTHON_DOWNLOADS=manual
export UV_INSTALL_DIR="$PWD/.python/bin" UV_PYTHON_INSTALL_DIR="$PWD/.python/pythons" UV_CACHE_DIR="$PWD/.python/cache"
UV="$UV_INSTALL_DIR/uv"
if [ ! -x "$UV" ]; then curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh; fi
"$UV" python install 3.12
PY=$(ls -d "$UV_PYTHON_INSTALL_DIR"/cpython-3.12*/bin/python3.12 | head -1)
echo "Using $PY"
"$UV" venv --python "$PY" --allow-existing apps/api/.venv
"$UV" pip install --python apps/api/.venv/bin/python -r apps/api/requirements.txt
apps/api/.venv/bin/python -c "import fastapi, sqlalchemy, psycopg; print('Python API dependencies installed')"
