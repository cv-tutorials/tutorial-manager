/**
 * Resolving a tutorial config, shared by every script that reads one.
 *
 * `extends: "<partner>/<flow>"` builds a tutorial from another one's config: the same
 * steps and hand-tuned highlight boxes, a different partner, branding or language set.
 * EFL's five club-admin walkthroughs are the generic Coaches' Voice ones in EFL colours.
 *
 * Keeping one copy of the boxes is the whole point. Seven hand-copied configs start
 * identical and drift the first time someone nudges a box in one of them, and nothing
 * warns you — the other six just quietly stop matching the product.
 *
 * Returns `{ config, baseDir }`. `baseDir` is where the extended config lives, so
 * callers can resolve screenshots against it; it equals the tutorial's own folder when
 * nothing is extended.
 */
const fs = require('fs');
const path = require('path');

const TUTORIALS_DIR = path.join(path.resolve(__dirname, '..'), 'tutorials');

function resolveConfig(configFile, configDir) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!config.extends) return { config, baseDir: configDir };

  const baseDir = path.join(TUTORIALS_DIR, ...config.extends.split('/'));
  const baseFile = path.join(baseDir, 'config.json');
  if (!fs.existsSync(baseFile)) {
    console.error(`  extends: "${config.extends}" not found (expected ${baseFile})`);
    process.exit(1);
  }

  const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  if (base.extends) {
    console.error(`  extends: "${config.extends}" itself extends something — keep it one level deep`);
    process.exit(1);
  }

  const merged = { ...base, ...config };
  delete merged.extends;
  return { config: merged, baseDir };
}

/** A tutorial may narrow its partner's languages — EFL's admin set is English-only. */
function langsFor(partner, config) {
  return config.languages || partner.languages || ['en', 'es'];
}

module.exports = { resolveConfig, langsFor };
