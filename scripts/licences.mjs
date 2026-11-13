// Writes the licence of every package that ships inside Matchday to one text
// file, published beside the app (licences.txt). The MIT, BSD and Apache
// licences and the font's Open Font Licence all allow the code to be used on
// condition their notices go with it - this is that.
//
//   node scripts/licences.mjs dist/licences.txt     (run by `npm run build`)
//
// Only what the app ships: production dependencies and everything they pull in,
// read from node_modules as npm installed them, plus the parts of Workbox the
// build bundles in. Other dev tools (Vite, TypeScript, Vitest) build the app
// but are not part of it.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2] ?? 'dist/licences.txt';
const root = process.cwd();

/**
 * Build tools that put some of their own code into what ships: the service
 * worker vite-plugin-pwa writes is Workbox (sw.js, workbox-*.js), and its
 * update prompt bundles workbox-window. Check dist/workbox-*.js after a
 * Workbox upgrade - it names each module it holds.
 */
const BUNDLED_BY_BUILD = ['workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies', 'workbox-window'];

const parseable = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' });
const dirs = [
  ...new Set([
    ...parseable.split('\n').map((l) => l.trim()).filter((l) => l && l !== root),
    ...BUNDLED_BY_BUILD.map((name) => join(root, 'node_modules', name)),
  ]),
];

const licenceOf = (pkg) =>
  typeof pkg.license === 'string'
    ? pkg.license
    : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type ?? l).join(' OR ') : 'UNKNOWN');
const authorOf = (pkg) => (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '');

const entries = [];
const seen = new Set();
for (const dir of dirs) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const texts = readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying|notice|ofl)([.-].*)?$/i.test(name))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8').trim());
  entries.push({ id, licence: licenceOf(pkg), author: authorOf(pkg), homepage: pkg.homepage ?? '', texts });
}
entries.sort((a, b) => a.id.localeCompare(b.id));

const unknown = entries.filter((e) => e.licence === 'UNKNOWN');
if (unknown.length) {
  console.error(`No licence declared for: ${unknown.map((e) => e.id).join(', ')} - check before shipping.`);
  process.exit(1);
}

const rule = '-'.repeat(78);
const body = [
  'Matchday - third-party licences',
  '',
  'Matchday itself is proprietary: Copyright (c) Aarav Chopra, all rights reserved (see LICENSE).',
  'It is built with the open-source packages below, each used under its own licence, reproduced here',
  'as each one asks. The Barlow Condensed font is used under the SIL Open Font License 1.1.',
  '',
  `${entries.length} packages.`,
  '',
  ...entries.flatMap((e) => [
    rule,
    `${e.id}`,
    `Licence: ${e.licence}${e.author ? `   Author: ${e.author}` : ''}${e.homepage ? `\n${e.homepage}` : ''}`,
    '',
    e.texts.length
      ? e.texts.join('\n\n')
      : `(This package publishes no licence file. It declares the ${e.licence} licence in its package.json${
          e.author ? `; copyright ${e.author}` : ''
        }.)`,
    '',
  ]),
].join('\n');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
console.log(`Wrote ${out}: ${entries.length} packages.`);
