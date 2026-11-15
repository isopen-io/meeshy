import { describe, expect, test } from 'bun:test';

import { compile, match } from '@/lib/router';
import { ROUTES, href } from '@/routes/route-table';

import { LANDING_APP_PATH } from './landing-languages';

/**
 * LA PAGE `/` EST LA LANDING, LA LISTE VIT SUR `/chats` (#10002, décision
 * porteur du 2026-10-10). Les URL de fil ne changent pas.
 */
describe('routes — / est la landing, /chats la liste (#10002)', () => {
  test('la liste des conversations s’apparie à /chats, et plus à /', () => {
    expect(href('list')).toBe('/chats');
    expect(match(compile(ROUTES.list.pattern), '/chats')).toEqual({});
    expect(match(compile(ROUTES.list.pattern), '/')).toBe(null);
  });

  test('l’application installée que le prérendu renvoie à la liste vise bien /chats', () => {
    expect(LANDING_APP_PATH).toBe(href('list'));
  });

  test('/ est servie par la route home, publique', () => {
    expect(ROUTES.home.pattern).toBe('/');
    expect(href('home')).toBe('/');
  });

  test('le QR de la landing vise /world, que la table des routes sert (#10784)', () => {
    expect(href('world')).toBe('/world');
    expect(match(compile(ROUTES.world.pattern), '/world')).toEqual({});
  });

  test('les adresses de fil existantes ne changent pas', () => {
    expect(href('thread', { conversation: 'abc' })).toBe('/c/abc');
  });
});
