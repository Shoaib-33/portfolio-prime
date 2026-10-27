#!/usr/bin/env bash
# Render build: installs a standalone Python 3.12 with uv inside the project folder (independent of the base image),
# creates apps/api/.venv and installs the API packages. The website is built by `npm run build`.
set -euo pipefail
cd "$(dirname "$0")/.."
export UV_INSTALL_DIR="$PWD/.python/bin" UV_PYTHON_INSTALL_DIR="$PWD/.python/pythons" UV_CACHE_DIR="$PWD/.python/cache"
# Render's build image ships a uv config with python-downloads = "never"; allow the explicit install of our own Python.
export UV_PYTHON_DOWNLOADS=manual UV_NO_CONFIG=1
if [ ! -x "$UV_INSTALL_DIR/uv" ]; then curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh; fi
"$UV_INSTALL_DIR/uv" python install 3.12
"$UV_INSTALL_DIR/uv" venv --python 3.12 --python-preference only-managed --allow-existing apps/api/.venv
"$UV_INSTALL_DIR/uv" pip install --python apps/api/.venv/bin/python -r apps/api/requirements.txt
apps/api/.venv/bin/python -c "import fastapi, sqlalchemy, psycopg; print('Python API dependencies installed')"
