import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * The page's Content Security Policy: which servers it may talk to and which
 * scripts may run in it, set as a <meta> tag because GitHub Pages can't send
 * headers.
 *
 * It's a second wall. If something ever slips a script into the page - the way
 * a fake "certificate" could, before - this stops it running, and stops it
 * sending the signed-in session, or anyone's own Gemini or Claude key, off to a
 * server of its choosing.
 *
 * - Scripts: only the app's own files, plus the one small inline script in
 *   index.html that sets the theme before anything draws, allowed by its hash.
 *   Any other inline script - including one in a file opened from the page,
 *   which keeps this policy - is refused.
 * - Network: only the app's own Supabase project, its own coach worker, and
 *   the two AI services people can use with their own key.
 * - Styles stay open to inline: React and the animation library set styles on
 *   elements, and a style can't run code.
 */

export interface CspSources {
  /** The Supabase project, if this build has accounts. */
  supabaseUrl?: string;
  /** The coach worker, if this build has one. */
  proxyUrl?: string;
  /** The text of each inline <script> in the page. */
  inlineScripts: string[];
}

/** Gemini and Claude, called straight from the phone with a person's own key. */
const AI_APIS = ['https://generativelanguage.googleapis.com', 'https://api.anthropic.com'];

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function scriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

export function cspFor({ supabaseUrl, proxyUrl, inlineScripts }: CspSources): string {
  const servers = [origin(supabaseUrl), origin(proxyUrl), ...AI_APIS].filter((s): s is string => Boolean(s));
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...inlineScripts.map(scriptHash)]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // Photos, logos and certificates are kept as data URLs; clips play as blobs.
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['media-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", 'data:', 'blob:', ...new Set(servers)]],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    // The browser's own PDF viewer, for a certificate opened as a blob.
    ['object-src', ["'self'", 'blob:']],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/** Adds the policy to the built index.html, hashing whatever inline scripts it ends up with. */
export function contentSecurityPolicy(env: Record<string, string>): Plugin {
  return {
    name: 'matchday-csp',
    // Only the built app: the dev server injects scripts of its own for hot reload.
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inlineScripts = [...html.matchAll(INLINE_SCRIPT)].map((m) => m[1]);
        const policy = cspFor({ supabaseUrl: env.VITE_SUPABASE_URL, proxyUrl: env.VITE_AI_PROXY_URL, inlineScripts });
        const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
        // Straight after the charset, so it covers every script and style after it.
        return /<meta charset[^>]*>/i.test(html)
          ? html.replace(/<meta charset[^>]*>/i, (charset) => `${charset}\n    ${tag}`)
          : html.replace(/<head>/i, `<head>\n    ${tag}`);
      },
    },
  };
}
