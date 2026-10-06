/**
 * Android lists the installed app in its share sheet (the manifest's
 * share_target), and sharing a message to it opens the app with the text in
 * the address. These are the names it uses - unlikely to clash with anything
 * else that ever lands in the address, like a sign-in link.
 */
export const SHARE_PARAMS = { title: 'shared_title', text: 'shared_text', url: 'shared_url' } as const;

/**
 * Whatever was shared into the app, or null. It's taken out of the address as
 * it's read, so a reload doesn't open the same message a second time.
 */
export function takeSharedText(
  location: Pick<Location, 'search' | 'pathname' | 'hash'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
): string | null {
  const params = new URLSearchParams(location.search);
  const keys = Object.values(SHARE_PARAMS);
  if (!keys.some((key) => params.has(key))) return null;
  const parts = keys.map((key) => params.get(key)?.trim() ?? '').filter(Boolean);
  for (const key of keys) params.delete(key);
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  // Some apps put the same words in the title and the text.
  const text = [...new Set(parts)].join('\n');
  return text || null;
}
