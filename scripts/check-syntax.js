const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ignored = new Set(['node_modules', '.git', 'uploads', 'build', 'dist']);
const roots = ['server', 'manager', 'customer'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`${file}\n${result.stderr}`);
  }
}
console.log(`Checked ${files.length} JavaScript files.`);
process.exit(failed ? 1 : 0);
