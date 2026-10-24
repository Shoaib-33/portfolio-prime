/* Runs the API and the website as one service (used on Render's free plan, 512 MB memory).
   The API runs inside this process on 127.0.0.1:4000; the website runs as a child process on $PORT (public)
   and reaches the API only through its /api proxy. */
const { spawn } = require('child_process');
const path = require('path');
process.env.NODE_ENV = 'production';
const PORT = process.env.PORT || '3000';

require('./apps/api/dist/main.js').createApp()
  .then(app => app.listen(4000, '127.0.0.1'))
  .then(() => {
    console.log(`API ready. Starting website on port ${PORT}.`);
    const next = require.resolve('next/dist/bin/next', { paths: [path.join(__dirname, 'apps/web')] });
    const web = spawn(process.execPath, ['--max-old-space-size=160', next, 'start', '-p', PORT, '-H', '0.0.0.0'], {
      cwd: path.join(__dirname, 'apps/web'), stdio: 'inherit',
      env: { ...process.env, API_URL: 'http://127.0.0.1:4000' },
    });
    web.on('exit', code => { console.error(`Website exited with code ${code}; stopping.`); process.exit(code || 1); });
    for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { web.kill(); process.exit(0); });
  })
  .catch(err => { console.error('API failed to start', err); process.exit(1); });
