import { describe, expect, test } from 'bun:test';

import { cardJoinAccount } from './card-join-account';

/**
 * LE BOUTON « MON COMPTE » EST NOMMÉ (#8727, jumelle de
 * `ConversationCardJoinAccount` iOS, #8726 — correction porteur 2026-09-29 :
 * « juste pour My Account, mets directement le pseudo ou le displayName »).
 */
describe('cardJoinAccount', () => {
  test('le nom d’affichage d’abord, le pseudo pour la voix', () => {
    expect(cardJoinAccount({ displayName: 'Awa Diallo', username: 'awa' })).toEqual({ title: 'Awa Diallo', handle: '@awa' });
  });

  test('sans nom d’affichage, le pseudo', () => {
    expect(cardJoinAccount({ displayName: '  ', username: 'awa' })).toEqual({ title: '@awa', handle: '@awa' });
  });

  test('sans nom du tout, ou sans compte : le libellé générique', () => {
    expect(cardJoinAccount({ displayName: null, username: ' ' })).toBeNull();
    expect(cardJoinAccount(null)).toBeNull();
  });
});
