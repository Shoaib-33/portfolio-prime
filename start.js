/* Runs the API (FastAPI, Python) and the website (Next.js) as one service: used locally and on Render.
   The API listens on 127.0.0.1:4000 and is reached only through the website's /api proxy; the website runs on $PORT (public). */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'production';
const PORT = process.env.PORT || '3000';
const API_DIR = path.join(__dirname, 'apps', 'api');

/** Python from the project's virtual environment (created by `npm run setup:api` or the Render build), else PYTHON or the system one. */
function python() {
  for (const p of [path.join(API_DIR, '.venv', 'Scripts', 'python.exe'), path.join(API_DIR, '.venv', 'bin', 'python')]) if (fs.existsSync(p)) return p;
  return process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
}
const children = [];
/** Local demo only: stop the embedded PostgreSQL cleanly (on Windows the API is killed without running its own shutdown). */
function stopLocalDb() {
  const data = path.join(API_DIR, 'data', 'pg');
  if (process.env.DATABASE_URL || !fs.existsSync(path.join(data, 'postmaster.pid'))) return;
  const site = [path.join(API_DIR, '.venv', 'Lib', 'site-packages'), ...(fs.existsSync(path.join(API_DIR, '.venv', 'lib')) ? fs.readdirSync(path.join(API_DIR, '.venv', 'lib')).map(d => path.join(API_DIR, '.venv', 'lib', d, 'site-packages')) : [])];
  const pgCtl = site.map(s => path.join(s, 'pgserver', 'pginstall', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')).find(p => fs.existsSync(p));
  if (pgCtl) require('child_process').spawnSync(pgCtl, ['stop', '-D', data, '-m', 'fast', '-w', '-t', '30'], { stdio: 'ignore' });
}
const stop = code => { for (const c of children) c.kill(); stopLocalDb(); process.exit(code); };
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => stop(0));

const api = spawn(python(), ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '4000', '--log-level', 'warning'], { cwd: API_DIR, stdio: 'inherit', env: process.env });
children.push(api);
api.on('exit', code => { console.error(`API exited with code ${code}; stopping.`); stop(code || 1); });

const ready = (tries = 0) => http.get('http://127.0.0.1:4000/api/health', res => { res.resume(); res.statusCode === 200 ? startWeb() : retry(tries); }).on('error', () => retry(tries));
const retry = tries => tries > 180 ? (console.error('API did not start in time.'), stop(1)) : setTimeout(() => ready(tries + 1), 1000);

function startWeb() {
  console.log(`API ready (FastAPI). Starting website on port ${PORT}.`);
  const next = require.resolve('next/dist/bin/next', { paths: [path.join(__dirname, 'apps/web')] });
  const web = spawn(process.execPath, ['--max-old-space-size=160', next, 'start', '-p', PORT, '-H', '0.0.0.0'], { cwd: path.join(__dirname, 'apps/web'), stdio: 'inherit', env: { ...process.env, API_URL: 'http://127.0.0.1:4000' } });
  children.push(web);
  web.on('exit', code => { console.error(`Website exited with code ${code}; stopping.`); stop(code || 1); });
}
ready();
