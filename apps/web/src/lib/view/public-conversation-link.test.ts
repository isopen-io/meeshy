import { describe, expect, test } from 'bun:test';

import type { GuestIdentity } from '@/lib/api/session';

import { conversationShareLinkOf, conversationShareUrl } from './public-conversation-link';

/**
 * LE LIEN PUBLIC À TRANSMETTRE (#10206) — l'invité transmet la porte par
 * laquelle il est entré ; un membre de World Wide, la clé que `GET /world`
 * sert ; une conversation sans clé connue n'offre aucun partage.
 */

const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world', mayWrite: true };
const WORLD = { id: 'c-world', identifier: 'world' };

describe('conversationShareLinkOf', () => {
  test('l’invité transmet le lien par lequel il est entré', () => {
    expect(conversationShareLinkOf({ conversation: WORLD, guest: GUEST, worldLink: null })).toBe('mshy_world');
  });

  test('le lien d’un invité ne vaut que pour SA conversation', () => {
    expect(conversationShareLinkOf({ conversation: { id: 'c-autre', identifier: 'autre' }, guest: GUEST, worldLink: null })).toBeNull();
  });

  test('un membre de World Wide transmet la clé servie par GET /world', () => {
    expect(conversationShareLinkOf({ conversation: WORLD, guest: null, worldLink: 'mshy_world_v2' })).toBe('mshy_world_v2');
  });

  test('World Wide sans clé encore servie : aucun lien', () => {
    expect(conversationShareLinkOf({ conversation: WORLD, guest: null, worldLink: undefined })).toBeNull();
    expect(conversationShareLinkOf({ conversation: WORLD, guest: null, worldLink: '' })).toBeNull();
  });

  test('une conversation sans clé connue n’offre rien', () => {
    expect(conversationShareLinkOf({ conversation: { id: 'c-1', identifier: 'equipe' }, guest: null, worldLink: 'mshy_world' })).toBeNull();
  });
});

describe('conversationShareUrl', () => {
  test('/chat/<clé> sur l’origine publique, la clé encodée', () => {
    expect(conversationShareUrl('mshy_world', 'https://staging.meeshy.me')).toBe('https://staging.meeshy.me/chat/mshy_world');
    expect(conversationShareUrl('a b', 'http://localhost:5173')).toBe('http://localhost:5173/chat/a%20b');
  });
});
