/**
 * #14081 — l'admission d'un post `COMMUNITY` ne relit plus toutes les
 * appartenances : seulement celles de l'AUTEUR et, dans ses communautés, celles
 * des CANDIDATS. Une communauté de 5 000 membres n'entre jamais en mémoire pour
 * trancher trois destinataires.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { filterPostConsumers } from '../../../../services/posts/postAudience';
import { matchesMongoWhere } from '../../../helpers/mongo-where';

const AUTEUR = '7000000000000000000000a1';
const MEMBRE = '7000000000000000000000b1';
const AUTRE_COMMUNAUTE = '7000000000000000000000b2';
const INACTIF = '7000000000000000000000b3';
const INCONNU = '7000000000000000000000b4';

type Membership = { readonly communityId: string; readonly userId: string; readonly isActive: boolean };

function monde(options: { readonly down?: boolean } = {}) {
  const foule: Membership[] = Array.from({ length: 5000 }, (_, i) => ({
    communityId: 'c-grande',
    userId: `71${String(i).padStart(22, '0')}`,
    isActive: true,
  }));
  const rows: Membership[] = [
    { communityId: 'c-grande', userId: AUTEUR, isActive: true },
    { communityId: 'c-grande', userId: MEMBRE, isActive: true },
    { communityId: 'c-grande', userId: INACTIF, isActive: false },
    { communityId: 'c-ailleurs', userId: AUTRE_COMMUNAUTE, isActive: true },
    { communityId: 'c-petite', userId: AUTEUR, isActive: true },
    { communityId: 'c-petite', userId: MEMBRE, isActive: true },
    ...foule,
  ];
  const read = { rows: 0 };
  const findMany = async (args: { where: Record<string, unknown>; take?: number }) => {
    if (options.down) throw new Error('mongo down');
    const found = rows.filter((row) => matchesMongoWhere(row, args.where)).slice(0, args.take);
    read.rows += found.length;
    return found;
  };
  const prisma = {
    communityMember: { findMany, findFirst: async () => null },
    friendRequest: { findMany: async () => [] },
    participant: { findMany: async () => [] },
  } as unknown as Pick<PrismaClient, 'communityMember' | 'friendRequest' | 'participant'>;
  return { prisma, read };
}

const admettre = (m: ReturnType<typeof monde>, candidateUserIds: string[]) =>
  filterPostConsumers({ prisma: m.prisma, authorId: AUTEUR, visibility: 'COMMUNITY', candidateUserIds });

describe('filterPostConsumers — COMMUNITY en O(candidats) (#14081)', () => {
  it('admet un co-membre actif, jamais un membre inactif, d’une autre communauté ou un inconnu ; l’auteur toujours', async () => {
    const m = monde();
    expect(await admettre(m, [MEMBRE, INACTIF, AUTRE_COMMUNAUTE, INCONNU, AUTEUR])).toEqual([MEMBRE, AUTEUR]);
  });

  it('ne lit que les appartenances de l’auteur et des candidats, jamais la communauté entière', async () => {
    const m = monde();
    await admettre(m, [MEMBRE, INCONNU]);
    expect(m.read.rows).toBeLessThanOrEqual(4);
  });

  it('un candidat présent dans deux communautés de l’auteur est admis une fois, à sa place', async () => {
    expect(await admettre(monde(), [INCONNU, MEMBRE, MEMBRE])).toEqual([MEMBRE, MEMBRE]);
  });

  it('une lecture en panne n’admet personne d’autre que l’auteur', async () => {
    expect(await admettre(monde({ down: true }), [MEMBRE, AUTEUR])).toEqual([AUTEUR]);
  });
});
