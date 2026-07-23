/**
 * Boundary gate for `packages/agents`.
 *
 * The agents package must never depend on Convex or reach into the Next.js app.
 * It fails the build (exit 1) if EITHER of these is true:
 *
 *   1. packages/agents/package.json lists `convex` or any `apps/web` path in any
 *      dependency field (dependencies, devDependencies, peerDependencies,
 *      optionalDependencies).
 *   2. Any file under packages/agents/ imports `convex`, `convex/_generated`, or
 *      reaches into `apps/` (relative path segment or the web workspace package).
 *
 * The third gate from the tracking issue — three distinct `sub` claims per run —
 * needs real agents and lands in P4. It is deliberately NOT implemented here.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENTS_DIR = join(ROOT, 'packages', 'agents');
const WEB_PACKAGE_NAME = '@procurement-floor/web';

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
] as const;

const violations: string[] = [];

/** A dependency name is forbidden if it is convex or points at the web app. */
function isForbiddenDependency(name: string): boolean {
  return (
    name === 'convex' ||
    name.startsWith('convex/') ||
    name === WEB_PACKAGE_NAME ||
    name.includes('apps/web')
  );
}

/** An import/require specifier is forbidden if it pulls in convex or apps/. */
function isForbiddenSpecifier(spec: string): boolean {
  return (
    spec === 'convex' ||
    spec.startsWith('convex/') ||
    spec === WEB_PACKAGE_NAME ||
    spec.startsWith(`${WEB_PACKAGE_NAME}/`) ||
    /(^|\/)apps\//.test(spec)
  );
}

// --- Gate 1: package.json dependency fields ---------------------------------

const pkgPath = join(AGENTS_DIR, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;

for (const field of DEP_FIELDS) {
  const deps = pkg[field];
  if (!deps || typeof deps !== 'object') continue;
  for (const name of Object.keys(deps as Record<string, string>)) {
    if (isForbiddenDependency(name)) {
      violations.push(
        `packages/agents/package.json: "${field}" declares forbidden dependency "${name}"`
      );
    }
  }
}

// --- Gate 2: import/require specifiers in source files ----------------------

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

// Match: import ... from 'x', export ... from 'x', import('x'), require('x'),
// bare `import 'x'`. Captures the specifier in group 1, 2, 3, or 4.
const SPEC_PATTERN =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const file of walk(AGENTS_DIR)) {
  const contents = readFileSync(file, 'utf8');
  for (const match of contents.matchAll(SPEC_PATTERN)) {
    const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (spec && isForbiddenSpecifier(spec)) {
      violations.push(
        `${relative(ROOT, file)}: forbidden import "${spec}"`
      );
    }
  }
}

// --- Report -----------------------------------------------------------------

if (violations.length > 0) {
  console.error('✗ Boundary check failed. packages/agents must not depend on');
  console.error('  Convex or reach into apps/. Violations:\n');
  for (const v of violations) console.error(`    - ${v}`);
  console.error('');
  process.exit(1);
}

console.log('✓ Boundary check passed: packages/agents is clean of convex and apps/.');
