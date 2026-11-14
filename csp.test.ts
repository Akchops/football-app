import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, cspFor } from './csp';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `))?.split(' ').slice(1) ?? [];

describe('the Content Security Policy', () => {
  const policy = cspFor({
    supabaseUrl: 'https://abcd.supabase.co/',
    proxyUrl: 'https://matchday-ai.someone.workers.dev',
    inlineScripts: ['document.documentElement.dataset.theme = "dark";'],
  });

  it('runs only the app\'s own scripts and the hashed inline one', () => {
    const hash = createHash('sha256').update('document.documentElement.dataset.theme = "dark";').digest('base64');
    expect(directive(policy, 'script-src')).toEqual(["'self'", `'sha256-${hash}'`]);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'");
  });

  it('talks only to the app\'s own servers and the two AI services', () => {
    expect(directive(policy, 'connect-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://abcd.supabase.co',
      'https://matchday-ai.someone.workers.dev',
      'https://generativelanguage.googleapis.com',
      'https://api.anthropic.com',
    ]);
  });

  it('leaves out a server this build has none of, or one given as something odd', () => {
    const bare = cspFor({ supabaseUrl: '', proxyUrl: 'javascript:alert(1)', inlineScripts: [] });
    expect(directive(bare, 'connect-src')).toEqual(["'self'", 'data:', 'blob:', 'https://generativelanguage.googleapis.com', 'https://api.anthropic.com']);
  });

  it('goes into the built page straight after the charset, hashing its inline scripts as they are', () => {
    const plugin = contentSecurityPolicy({ VITE_SUPABASE_URL: 'https://abcd.supabase.co' });
    const html =
      '<!doctype html><html><head>\n<meta charset="UTF-8" />\n<script>\n  var a = 1;\n</script>\n<script type="module" src="/app.js"></script></head></html>';
    const hook = plugin.transformIndexHtml as { handler: (html: string) => string };
    const out = hook.handler(html);
    const hash = createHash('sha256').update('\n  var a = 1;\n').digest('base64');
    expect(out).toMatch(/<meta charset="UTF-8" \/>\n\s+<meta http-equiv="Content-Security-Policy"/);
    expect(out).toContain(`'sha256-${hash}'`);
    expect(out).toContain('https://abcd.supabase.co');
  });
});
