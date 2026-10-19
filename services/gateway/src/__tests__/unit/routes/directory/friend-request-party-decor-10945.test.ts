/**
 * #10945 — les deux PARTIES d'une demande d'ami portent leur contour équipé.
 * `INCLUDE_PARTIES` (la projection unique de l'envoi, de la réponse et des
 * listes, alias `routes/friends.ts` et `GET /users/friend-requests` compris)
 * lit la colonne ; `servirParties`, le site unique de sortie, la résout en
 * `profileDecor` — jamais brute, et sans lecture de plus que la carte de
 * présence qu'il faisait déjà.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

const resolveForTargets = jest.fn<any>(async () => new Map());
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets }),
}));

import { INCLUDE_PARTIES, servirParties } from '../../../../routes/directory/friend-requests-core';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const party = (id: string, equippedAvatarRing: string | null) => ({ id, username: id, displayName: id, avatar: null, isOnline: true, lastActiveAt: null, equippedAvatarRing });

describe('#10945 — demandes d’ami : le contour des deux parties', () => {
  it('la projection des parties lit la colonne du contour', () => {
    expect(INCLUDE_PARTIES.sender.select).toMatchObject({ equippedAvatarRing: true });
    expect(INCLUDE_PARTIES.receiver.select).toMatchObject({ equippedAvatarRing: true });
  });

  it('servirParties sert profileDecor, aucune clé sans contour, jamais la colonne', async () => {
    resolveForTargets.mockClear();
    const fastify = { prisma: {} } as never;
    const request = { authContext: { isAuthenticated: true, userId: 'moi', registeredUser: { id: 'moi', role: 'USER' } } } as never;
    const [served] = await servirParties(fastify, request, [{ id: 'fr1', sender: party('ana', 'contours-essentiels/filet'), receiver: party('bob', null) }]);
    const row = served as unknown as { sender: Record<string, unknown>; receiver: Record<string, unknown> };
    expect(row.sender.profileDecor).toEqual({ avatarRing: RING });
    expect(row.receiver).not.toHaveProperty('profileDecor');
    expect(JSON.stringify(served)).not.toContain('equippedAvatarRing');
    expect(resolveForTargets).toHaveBeenCalledTimes(1);
  });
});
