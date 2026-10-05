import { describe, expect, test } from 'bun:test';

import { decodeAdminBans } from './admin-user-bans';

/**
 * QUI A BANNI, QUI A LEVÉ (#8876) — la passerelle nomme les deux acteurs ; le
 * décodeur les garde champ par champ (jamais l'avatar ni le reste de la ligne de
 * bannissement : `bannedById`, `liftedById` sont des identifiants, pas des noms), et
 * dit « système » pour une levée que personne n'a posée.
 */
const ACTEUR = { id: '64f1c2a9e8b7d6c5b4a39281', username: 'jcnm', displayName: ' Jean-Claude ', avatar: 'https://cdn.test/a.png', role: 'BIGBOSS' };

describe('decodeAdminBans — les acteurs sont NOMMÉS', () => {
  test('bannedBy et liftedBy : identifiant, pseudo et nom affiché, rien de plus', () => {
    const [ban] = decodeAdminBans([
      { id: 'b-1', reason: 'spam', active: false, liftedAt: '2026-09-29T10:00:00.000Z', bannedById: 'x', liftedById: 'y', bannedBy: ACTEUR, liftedBy: { ...ACTEUR, id: '64f1c2a9e8b7d6c5b4a39282', displayName: 'Awa Diop', username: 'awa' }, liftedBySystem: false },
    ]);
    expect(ban?.bannedBy).toEqual({ id: '64f1c2a9e8b7d6c5b4a39281', username: 'jcnm', displayName: 'Jean-Claude' });
    expect(ban?.liftedBy).toEqual({ id: '64f1c2a9e8b7d6c5b4a39282', username: 'awa', displayName: 'Awa Diop' });
    expect(ban?.liftedBySystem).toBe(false);
    expect(Object.keys(ban ?? {})).not.toContain('bannedById');
    expect(Object.keys(ban?.bannedBy ?? {})).not.toContain('avatar');
  });

  test('une levée sans administrateur est celle du SYSTÈME', () => {
    const [ban] = decodeAdminBans([
      { id: 'b-2', reason: 'spam', active: false, liftedAt: '2026-09-29T10:00:00.000Z', bannedBy: ACTEUR, liftedBy: null, liftedBySystem: true },
    ]);
    expect(ban?.liftedBy).toBeNull();
    expect(ban?.liftedBySystem).toBe(true);
  });

  test('un ban en vigueur n’a ni levée ni acteur de levée ; un acteur illisible vaut « inconnu »', () => {
    const [ban] = decodeAdminBans([{ id: 'b-3', reason: 'spam', active: true, bannedBy: { username: 'sans-id' }, liftedBy: null }]);
    expect(ban?.bannedBy).toBeNull();
    expect(ban?.liftedBy).toBeNull();
    expect(ban?.liftedBySystem).toBe(false);
  });
});
