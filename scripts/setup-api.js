/* Creates the Python virtual environment for the API (apps/api/.venv) and installs its packages. Run once: npm run setup:api */
const { execFileSync } = require('child_process');
const path = require('path'); const fs = require('fs');
const dir = path.join(__dirname, '..', 'apps', 'api'); const win = process.platform === 'win32';
const py = process.env.PYTHON || (win ? 'python' : 'python3');
const venvPy = path.join(dir, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' });
if (!fs.existsSync(venvPy)) { console.log('Creating apps/api/.venv …'); run(py, ['-m', 'venv', '.venv']); }
run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q']);
run(venvPy, ['-m', 'pip', 'install', '-r', process.argv.includes('--prod') ? 'requirements.txt' : 'requirements-dev.txt', '-q']);
console.log('Python API ready. Start everything with: npm start');
