import { describe, expect, test } from 'bun:test';

import { href } from '@/routes/route-table';

import { THREAD_ANCHOR_PARAM, threadAnchorOf } from './thread-anchor';

describe('L’adresse du fil nomme le message où s’ouvrir (#9294)', () => {
  test('l’adresse du fil ancrée se relit en son message', () => {
    const address = href('thread', { conversation: 'c-medias' }, { [THREAD_ANCHOR_PARAM]: 'media-17' });

    expect(address).toBe('/c/c-medias?message=media-17');
    expect(threadAnchorOf(new URL(address, 'http://localhost').searchParams)).toBe('media-17');
  });

  test('sans message nommé, ni ancre vide ni ancre inventée', () => {
    expect(threadAnchorOf(new URLSearchParams(''))).toBeNull();
    expect(threadAnchorOf(new URLSearchParams('message='))).toBeNull();
    expect(threadAnchorOf(undefined)).toBeNull();
  });
});
