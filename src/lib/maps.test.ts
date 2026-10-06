import { describe, expect, it } from 'vitest';
import { directionsUrl, mapsQuery } from './maps';

describe('mapsQuery', () => {
  it('leaves a plain ground alone', () => {
    expect(mapsQuery('Central Playing Fields')).toBe('Central Playing Fields');
    expect(mapsQuery('12 Mill Lane, Brighton BN1 2AB')).toBe('12 Mill Lane, Brighton BN1 2AB');
  });

  it('drops the pitch, wherever it is written', () => {
    expect(mapsQuery('Central Playing Fields, Pitch 3')).toBe('Central Playing Fields');
    expect(mapsQuery('Pitch 3, Central Playing Fields')).toBe('Central Playing Fields');
    expect(mapsQuery('Riverside Park - pitch 4b')).toBe('Riverside Park');
    expect(mapsQuery('Riverside Park (Pitch: 2)')).toBe('Riverside Park');
    expect(mapsQuery('Hove Park, Pitches 1-4')).toBe('Hove Park');
    expect(mapsQuery('Oakfield Rec, Field 2')).toBe('Oakfield Rec');
  });

  it('keeps names that only contain the word', () => {
    expect(mapsQuery('Oakfield')).toBe('Oakfield');
    expect(mapsQuery('Field Lane Rec')).toBe('Field Lane Rec');
    expect(mapsQuery('Central Playing Fields')).toBe('Central Playing Fields');
    // A hyphen inside a name is part of the name.
    expect(mapsQuery('Stoke-on-Trent Sports Village')).toBe('Stoke-on-Trent Sports Village');
  });

  it('has nothing to search for when only the pitch is known', () => {
    expect(mapsQuery('Pitch 3')).toBe('');
    expect(mapsQuery('  ')).toBe('');
  });
});

describe('directionsUrl', () => {
  it('opens Apple Maps or Google Maps with the ground as the search', () => {
    expect(directionsUrl('Central Playing Fields, Pitch 3', 'apple')).toBe(
      'https://maps.apple.com/?q=Central%20Playing%20Fields',
    );
    expect(directionsUrl('St. Mary\'s & All Saints', 'google')).toBe(
      'https://www.google.com/maps/search/?api=1&query=St.%20Mary\'s%20%26%20All%20Saints',
    );
  });

  it('gives no link when there is no ground', () => {
    expect(directionsUrl('', 'google')).toBeNull();
    expect(directionsUrl('Pitch 3', 'apple')).toBeNull();
  });
});
