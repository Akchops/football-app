import { describe, expect, it } from 'vitest';
import { takeSharedText } from './shareTarget';

function fakeLocation(search: string) {
  const replaced: string[] = [];
  return {
    location: { search, pathname: '/football-app/', hash: '' },
    history: { replaceState: (_: unknown, __: string, url?: string | URL | null) => replaced.push(String(url)) },
    replaced,
  };
}

describe('takeSharedText', () => {
  it('reads a shared message and tidies the address', () => {
    const page = fakeLocation('?shared_title=&shared_text=Sat+17th+v+Oakfield%2C+KO+10%3A30&shared_url=');
    expect(takeSharedText(page.location, page.history)).toBe('Sat 17th v Oakfield, KO 10:30');
    expect(page.replaced).toEqual(['/football-app/']);
  });

  it('keeps anything else in the address', () => {
    const page = fakeLocation('?code=abc&shared_text=hello');
    expect(takeSharedText(page.location, page.history)).toBe('hello');
    expect(page.replaced).toEqual(['/football-app/?code=abc']);
  });

  it('says the same words once when an app sends them as title and text', () => {
    const page = fakeLocation('?shared_title=vs+Oakfield&shared_text=vs+Oakfield');
    expect(takeSharedText(page.location, page.history)).toBe('vs Oakfield');
  });

  it('leaves an ordinary launch alone', () => {
    const page = fakeLocation('');
    expect(takeSharedText(page.location, page.history)).toBeNull();
    expect(page.replaced).toEqual([]);
  });
});
