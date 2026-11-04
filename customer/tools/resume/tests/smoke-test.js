const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const editor = read("index.html");
const gallery = read("templates.html");
const app = read("app.js");
const galleryJs = read("templates-page.js");

for (const file of ["index.html", "templates.html", "styles.css", "templates.css", "app.js", "templates.js", "templates-page.js", "assets/creatarsh-logo.png"]) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}
for (const file of ["app.js", "templates.js", "templates-page.js"]) {
  const source = read(file);
  new vm.Script(source, { filename: file });
}
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const editorIds = new Set(ids(editor));
const galleryIds = new Set(ids(gallery));
assert.equal(ids(editor).length, editorIds.size, "Duplicate editor HTML IDs");
assert.equal(ids(gallery).length, galleryIds.size, "Duplicate gallery HTML IDs");
for (const match of app.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(editorIds.has(match[1]), `Editor references missing ID: ${match[1]}`);
for (const match of galleryJs.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(galleryIds.has(match[1]), `Gallery references missing ID: ${match[1]}`);

const context = { window: {} };
vm.runInNewContext(read("templates.js"), context);
const templates = context.window.CREATARSH_TEMPLATES;
assert.equal(templates.length, 100, "Expected 100 templates");
assert.equal(new Set(templates.map(t => t.id)).size, 100, "Template IDs must be unique");
assert.equal(new Set(templates.map(t => t.name)).size, 100, "Template names must be unique");
assert.equal(new Set(templates.map(t => t.layout)).size, 10, "Expected 10 layout systems");
assert.equal(new Set(templates.map(t => t.paletteName)).size, 10, "Expected 10 palettes");
for (const t of templates) {
  assert.ok(t.id && t.name && t.layout && t.accent && t.secondary && t.tint, "Incomplete template record");
}
assert.match(editor, /templates\.js[\s\S]*app\.js/, "Editor must load catalogue before editor logic");
assert.match(gallery, /templates\.js[\s\S]*templates-page\.js/, "Gallery must load catalogue before gallery logic");
assert.match(app, /resumeForm"\)\.addEventListener\("submit",event=>event\.preventDefault\(\)\)/, "Form submit must not reload the page");
assert.match(read("styles.css"), /\.insight-panel\{display:none!important\}/, "Insights must not appear in PDF print");
assert.match(app, /creatarshResumeDraftV2/, "Autosave storage key missing");
assert.match(app, /my-creatarsh-resume-backup\.json/, "Backup export missing");
assert.match(galleryJs, /creatarshSelectedTemplate/, "Template selection persistence missing");

console.log("PASS: required files, JavaScript syntax, DOM references, unique IDs, 100 templates, 10 layouts, 10 themes, page load order, form guard, print cleanup, autosave and template persistence.");
