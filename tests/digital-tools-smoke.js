const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const server = read('server/server.js');
const manager = read('manager/js/manager.js');
const tools = read('customer/tools/tools.js');
const page = read('customer/tools/index.html');
const resume = read('customer/tools/resume/index.html');

for (const file of [
  'customer/tools/index.html', 'customer/tools/tools.css', 'customer/tools/tools.js',
  'customer/tools/resume/index.html', 'customer/tools/resume/templates.html',
  'customer/tools/resume/app.js', 'customer/tools/resume/templates.js',
  'customer/tools/resume/templates-page.js', 'customer/tools/resume/assets/creatarsh-logo.png'
]) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);

for (const [name, source] of [
  ['server/server.js', server], ['manager/js/manager.js', manager],
  ['customer/tools/tools.js', tools], ['customer/tools/resume/app.js', read('customer/tools/resume/app.js')],
  ['customer/tools/resume/templates.js', read('customer/tools/resume/templates.js')],
  ['customer/tools/resume/templates-page.js', read('customer/tools/resume/templates-page.js')]
]) new vm.Script(source, { filename: name });

assert.match(server, /app\.get\('\/api\/public\/tools'/);
assert.match(server, /Service\.find\(\{ active: true, isDigitalTool: true \}\)/);
assert.match(server, /toolPath === null/);
assert.match(server, /app\.get\('\/tools'/);
assert.match(server, /app\.use\('\/tools\/resume', express\.static/);
assert.match(server, /slug: 'resume-studio'/);
assert.match(manager, /\['digitalTools','⌘','Digital Tools'\]/);
assert.match(manager, /cmsPage\('services',true\)/);
assert.match(manager, /name="isDigitalTool"/);
assert.match(manager, /Hide this tool from the public Digital Tools page/);
assert.match(page, /CREATARSH \/ DIGITAL TOOLS/);
assert.match(tools, /fetch\('\/api\/public\/tools'/);
assert.match(tools, /safeInternalPath\(tool\.url\)/);
assert.match(resume, /Resume Studio/);
assert.ok(!fs.existsSync(path.join(root, 'server/.env')), 'Real .env must not be present in distributable source');
console.log('PASS: Digital Tools page, server catalogue API, safe launch URLs, manager controls, first-run Resume Studio seed and integrated Resume Studio files.');
