/**
 * Prints, one per line, the scopes this repository publishes to GitHub Packages - read from each
 * package's own `publishConfig.registry`. Used by `github-registries: "auto"`.
 *
 * Usage: node github-package-scopes.mjs [rootDir]
 */

/* **What this can and cannot see, because the difference is the whole reason it is opt-in.**
 *
 * An `@scope:registry=` line in .npmrc does one job: it *routes* a request for `@scope/x` to a
 * registry. Two of the three things a repository wants from GitHub Packages do not need it at all -
 * measured, both:
 *
 *   - publishing routes itself. `npm publish` reads `publishConfig.registry`, and with no scope
 *     mapping anywhere `npm publish --dry-run` still reported
 *     `Publishing to https://npm.pkg.github.com/`.
 *   - authentication is keyed by *registry*, not by scope. With the scope mapping in a project
 *     .npmrc and `//127.0.0.1:PORT/:_authToken=` in the userconfig alone, npm sent
 *     `Authorization: Bearer`; with the auth line removed it sent nothing.
 *
 * So the only job left is routing an *install* of a dependency hosted there - and that is exactly
 * what this script cannot answer. It reads what the repository *publishes*; a scope it merely
 * consumes appears in no `publishConfig` here. A repository that publishes to npmjs.org and depends
 * on `@acme/private` from GitHub Packages derives nothing from this and must declare the scope.
 *
 * It is a good guess where a repository both publishes and consumes under one scope, which is the
 * common house case. It is a guess nonetheless, which is why it runs only when asked for by name
 * rather than as a default - a silently empty answer here is an install that 404s with nothing
 * pointing at the reason.
 */

/* **This deliberately does not use rman, and that was measured rather than assumed.**
 *
 * rman is the right authority on which directories hold packages, and it cannot answer here: the
 * scopes are needed to *route* `npm ci`, so this runs before `node_modules` exists. A repository
 * whose `.rmanrc` says `extends: "@panates/rman-preset"` - the house setup - then fails with
 * `"extends" target "@panates/rman-preset" could not be resolved ... is it installed in this
 * repository?`, because the preset is one of the packages the install was going to fetch. Falling
 * back to `npx rman@<major>` does not help: it resolves rman from npmjs.org into a temp directory,
 * where the repository's own preset is equally absent.
 *
 * So the walk below is the whole implementation. It is less precise than rman - it will look inside
 * a fixture directory that happens to hold a package.json - but a fixture declaring a
 * `publishConfig.registry` pointing at GitHub Packages is not a thing that occurs, and being
 * answerable at this point in the run is worth more than that precision.
 */

import fs from 'node:fs';
import path from 'node:path';

const GITHUB_PACKAGES_HOST = 'npm.pkg.github.com';

/* Deep enough for `packages/<group>/<pkg>`, shallow enough that a stray vendored tree does not turn
 * this into a full-disk walk. */
const MAX_DEPTH = 5;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'tmp']);

const root = process.argv[2] || process.cwd();
const scopes = new Set();

for (const manifestFile of findManifests(root, 0)) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    continue;
  }
  const registry = manifest?.publishConfig?.registry;
  if (!registry || hostOf(registry) !== GITHUB_PACKAGES_HOST) continue;
  const scope = scopeOf(manifest.name);
  if (scope) scopes.add(scope);
}

for (const scope of [...scopes].sort()) console.log(scope);

function* findManifests(dir, depth) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'package.json') yield path.join(dir, entry.name);
    /* `isDirectory()` is false for a symlinked directory, which is what keeps a linked package -
     * or a `node_modules` entry that survived the name check - from being walked twice or forever. */
    else if (entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith('.')) {
      yield* findManifests(path.join(dir, entry.name), depth + 1);
    }
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function scopeOf(name) {
  return typeof name === 'string' && name.startsWith('@') ? name.slice(1).split('/')[0] : undefined;
}
