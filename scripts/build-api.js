/* On Render (RENDER=true) the build also installs the Python API (scripts/render-build.sh). Locally use: npm run setup:api */
if (process.env.RENDER !== 'true' && !__dirname.startsWith('/opt/render')) { console.log('Skipping Python API build (local). Run npm run setup:api once.'); process.exit(0); }
const r = require('child_process').spawnSync('bash', [require('path').join(__dirname, 'render-build.sh')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
