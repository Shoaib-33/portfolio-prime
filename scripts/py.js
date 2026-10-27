/* Runs the API's Python (apps/api/.venv) with the given arguments, from apps/api. Example: node scripts/py.js -m pytest -q */
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const dir = path.join(__dirname, '..', 'apps', 'api');
const py = [path.join(dir, '.venv', 'Scripts', 'python.exe'), path.join(dir, '.venv', 'bin', 'python')].find(p => fs.existsSync(p));
if (!py) { console.error('The Python API is not set up yet. Run: npm run setup:api'); process.exit(1); }
process.exit(spawnSync(py, process.argv.slice(2), { cwd: dir, stdio: 'inherit' }).status ?? 1);
