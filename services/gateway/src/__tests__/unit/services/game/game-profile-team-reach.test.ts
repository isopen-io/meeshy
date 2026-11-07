/**
 * `GameProfileService.viewerReach` — ce qu'un cercle ouvre du jeu d'un membre : entre
 * deux comptes de l'équipe, ce qu'un Sang y voit, sans lien (#16623). Le rôle de la
 * cible n'est lu que pour un lecteur de l'équipe.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { GameProfileService } from '../../../../services/game/GameProfileService';

const LECTEUR = '6100000000000000000000d1';
const CIBLE = '6100000000000000000000d2';

const MINEUR = new Date(Date.now() - 15 * 365 * 24 * 3600 * 1000);

const service = (targetRole: string | null, blocked = false, birthDate: Date | null = null) => {
  const findMany = jest.fn<any>().mockResolvedValue(
    targetRole === null ? [] : [{ id: CIBLE, role: targetRole, birthDate }, { id: LECTEUR, role: 'MODERATOR', birthDate: null }],
  );
  const prisma = {
    user: { findMany, findFirst: jest.fn<any>().mockResolvedValue(blocked ? { id: CIBLE } : null) },
    userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
  return { game: new GameProfileService(prisma as unknown as PrismaClient), findMany };
};

describe('viewerReach — l\'équipe (#16623)', () => {
  it('un MODERATOR voit le jeu d\'un collègue comme un Sang', async () => {
    const reach = await service('ADMIN').game.viewerReach({ userId: LECTEUR, role: 'MODERATOR' }, CIBLE);
    expect(reach).toEqual({ kind: 'friend', sparksGlory: true });
  });

  it.each(['USER', 'ANALYST', 'SUPERADMIN', null])('face à la cible %s, il reste un lecteur ordinaire', async (role) => {
    const reach = await service(role).game.viewerReach({ userId: LECTEUR, role: 'MODERATOR' }, CIBLE);
    expect(reach).toEqual({ kind: 'other', sparksGlory: false });
  });

  it('le blocage ferme entre deux comptes de l\'équipe', async () => {
    const reach = await service('ADMIN', true).game.viewerReach({ userId: LECTEUR, role: 'MODERATOR' }, CIBLE);
    expect(reach.kind).toBe('blocked');
  });

  it('un lecteur ordinaire ne paie aucune lecture de rôle', async () => {
    const { game, findMany } = service('ADMIN');
    expect(await game.viewerReach({ userId: LECTEUR, role: 'USER' }, CIBLE)).toEqual({ kind: 'other', sparksGlory: false });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un adulte de l\'équipe ne voit pas le jeu d\'un collègue mineur déclaré comme un Sang', async () => {
    const reach = await service('ADMIN', false, MINEUR).game.viewerReach({ userId: LECTEUR, role: 'MODERATOR' }, CIBLE);
    expect(reach).toEqual({ kind: 'other', sparksGlory: false });
  });
});
