import { describe, expect, test } from 'bun:test';

import { floatingMenusHost, floatingMenusRouteKey } from './floating-gate';

const search = (query: string) => new URLSearchParams(query);

describe('les disques flottants quittent un volet des réglages (#10748)', () => {
  test('/settings sans volet garde ses disques ; /settings?volet=packs les retire', () => {
    const wide = false;
    expect(floatingMenusHost({ routeKey: floatingMenusRouteKey({ key: 'settings', search: search('') }), wide, guest: false })).toBe('screen');
    expect(floatingMenusHost({ routeKey: floatingMenusRouteKey({ key: 'settings', search: search('volet=packs') }), wide, guest: false })).toBeNull();
  });

  test('les autres routes ne bougent pas', () => {
    expect(floatingMenusRouteKey({ key: 'list', search: search('volet=packs') })).toBe('list');
  });
});
