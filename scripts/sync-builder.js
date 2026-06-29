#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'engine', 'engine.template.html');
const BUILDER_PATH = path.join(ROOT, 'builder', 'builder.html');

const engineRaw = fs.readFileSync(ENGINE_PATH, 'utf8');
let builderRaw = fs.readFileSync(BUILDER_PATH, 'utf8');

// JSON.stringify produces a valid JS string literal, but </script> inside
// a <script> block causes the HTML parser to close the block early.
// Fix: replace the slash in </script with a unicode escape <.
let escaped = JSON.stringify(engineRaw);
escaped = escaped.replace(/<\//g, '\\u003c/');

const placeholder = "const ENGINE = `PLACEHOLDER_ENGINE`;";
const injectedRe = /^const ENGINE = ".*";$/m;

let updated;
if (builderRaw.includes(placeholder)) {
  updated = builderRaw.replace(placeholder, `const ENGINE = ${escaped};`);
} else if (injectedRe.test(builderRaw)) {
  updated = builderRaw.replace(injectedRe, `const ENGINE = ${escaped};`);
} else {
  console.error('No ENGINE constant found to replace — check builder.html format.');
  process.exit(1);
}

if (updated === builderRaw) {
  console.log('Nothing changed — ENGINE was already up to date.');
} else {
  fs.writeFileSync(BUILDER_PATH, updated);
  console.log('Builder ENGINE string synced from engine.template.html');
}
