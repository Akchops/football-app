import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Matchday has no analytics, advertising or tracking of any kind - which is
 * also why it needs no cookie banner: everything it keeps on a phone is there
 * for the app to work. Most of its players are children.
 *
 * This fails the build if a tracker turns up anyway - pasted in from a
 * tutorial, or pulled in by a library. Adding one is a decision to make on
 * purpose: it must not load or fire until the person has said yes, a child
 * must never be asked, and the privacy notice (public/privacy.html) must name
 * it. Then change this list - not before.
 */
const TRACKERS: [string, RegExp][] = [
  ['Google Analytics / gtag', /gtag\s*\(|googletagmanager\.com|google-analytics\.com|\bga\s*\(\s*['"]create/i],
  ['Meta pixel', /\bfbq\s*\(|connect\.facebook\.net|facebook\.com\/tr\b/i],
  ['Google ads', /doubleclick\.net|googlesyndication\.com|adservice\.google/i],
  ['TikTok pixel', /analytics\.tiktok\.com|\bttq\.(load|track|page)\b/i],
  ['Hotjar / Clarity', /static\.hotjar\.com|\bhj\s*\(|clarity\.ms/i],
  ['Product analytics', /\bmixpanel\b|cdn\.segment\.com|api\.segment\.io|\bposthog\b|\bamplitude\b|plausible\.io|\bheap\.(load|track)\b/i],
  ['Error reporting that sends data out', /\bSentry\.init\b|sentry\.io|bugsnag|logrocket/i],
];

const ROOT = join(__dirname, '..', '..');
const SELF = relative(ROOT, __filename);

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(path) ? [path] : [];
  });
}

const shipped = [
  join(ROOT, 'index.html'),
  ...files(join(ROOT, 'public'), (p) => /\.(html|js)$/.test(p)),
  ...files(join(ROOT, 'src'), (p) => /\.(ts|tsx|css)$/.test(p) && relative(ROOT, p) !== SELF),
];

describe('no tracking', () => {
  it.each(TRACKERS)('nothing in the app loads %s', (_name, pattern) => {
    const hits = shipped.filter((path) => pattern.test(readFileSync(path, 'utf8'))).map((path) => relative(ROOT, path));
    expect(hits).toEqual([]);
  });

  it('none of the libraries the app ships is a tracker', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const names = Object.keys(pkg.dependencies).join(' ');
    expect(names).not.toMatch(/analytics|gtag|pixel|mixpanel|segment|posthog|amplitude|sentry|hotjar|bugsnag|logrocket/i);
  });
});
