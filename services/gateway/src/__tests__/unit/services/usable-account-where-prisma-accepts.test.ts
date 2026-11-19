/**
 * `USABLE_ACCOUNT_WHERE` — la loi « compte vivant » doit être ACCEPTÉE par le
 * client Prisma GÉNÉRÉ, à CHACUNE des formes d'appel que ses consommateurs
 * emploient.
 *
 * C'est le constat I du cycle 180 pris au sérieux : *avant de prendre une forme
 * de requête plus juste, demander qui l'a déjà mesurée — et quand la réponse est
 * « personne », préférer la forme attestée, surtout si l'échec de l'autre est
 * avalé par un `catch` en amont.* Ici deux chemins avalent justement leur échec :
 *
 *  · `_globalAdminUserIds` vit sous le `try/catch` de `_broadcastUserStatus` —
 *    une forme refusée par le validateur tuerait **toute** transition de
 *    présence, en silence ;
 *  · `announceAddedToCommunity` et `addableUnderCreator` journalisent en
 *    best-effort.
 *
 * Et la forme la moins attestée du lot est `findUnique` avec un `AND` : la clause
 * unique ÉTENDUE accepte des filtres non uniques à côté de la clé, mais aucun
 * `AND`/`OR`/`isSet` n'y était attesté dans le dépôt. Le validateur du client
 * généré est la couche qui a refusé dans tous les incidents que ce dépôt a payés
 * (#6811, cycle 129) — ce témoin le fait parler, et il est REJOUABLE, ce qu'une
 * mesure faite une fois dans une session ne sera jamais.
 *
 * Ce n'est PAS une mesure contre un vrai MongoDB 8 : le validateur se prononce
 * sur la FORME, pas sur l'appariement des documents (#19739 reste la seule chose
 * qui prouverait la sémantique).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { USABLE_ACCOUNT_WHERE } from '../../../services/relations/usableAccount';

const CLIENT_GENERE = path.join(__dirname, '../../../../../../packages/shared/prisma/client');
const URL_MORTE = 'mongodb://127.0.0.1:1/guard-usable-account?serverSelectionTimeoutMS=50&connectTimeoutMS=50';

const ID = '507f1f77bcf86cd799439011';

type Appel = (prisma: ClientPrisma) => Promise<unknown>;

type ClientPrisma = {
  user: {
    findMany: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
  };
  communityMember: { count: (args: unknown) => Promise<unknown> };
  $disconnect: () => Promise<void>;
};

/** Le message du validateur, ou `null` quand la FORME est acceptée. */
async function refusDuValidateur(appel: Appel): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require(CLIENT_GENERE) as { PrismaClient: new (o: unknown) => ClientPrisma };
  const prisma = new PrismaClient({ datasources: { db: { url: URL_MORTE } } });
  try {
    await appel(prisma);
    return null;
  } catch (erreur) {
    return (erreur as Error).constructor.name === 'PrismaClientValidationError' ? (erreur as Error).message : null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

describe('USABLE_ACCOUNT_WHERE — le client Prisma généré accepte la loi partout', () => {
  it('le témoin SAIT rougir : `isSet` sur une liste scalaire est refusé', async () => {
    expect(await refusDuValidateur((prisma) =>
      prisma.user.findMany({ where: { blockedUserIds: { isSet: false } }, select: { id: true } }),
    )).toMatch(/blockedUserIds/);
  }, 20000);

  it.each<[string, Appel]>([
    ['findMany + `id: { in }` (communityMembershipSync, communitySalonAdoption, community-added)', (prisma) =>
      prisma.user.findMany({ where: { id: { in: [ID] }, ...USABLE_ACCOUNT_WHERE }, select: { id: true } })],
    ['findFirst + clé (isAddableUser)', (prisma) =>
      prisma.user.findFirst({ where: { id: ID, ...USABLE_ACCOUNT_WHERE }, select: { id: true } })],
    ['findUnique + clé unique ÉTENDUE (canMentionUser) — la forme la moins attestée', (prisma) =>
      prisma.user.findUnique({ where: { id: ID, ...USABLE_ACCOUNT_WHERE }, select: { id: true } })],
    ['count sur une RELATION `user: { is: … }` (community-online-count)', (prisma) =>
      prisma.communityMember.count({ where: { communityId: ID, user: { is: USABLE_ACCOUNT_WHERE } } })],
    ['findMany + `role: { in }` (TEAM_COLLEAGUES_WHERE, _globalAdminUserIds)', (prisma) =>
      prisma.user.findMany({ where: { role: { in: ['MODERATOR'] }, ...USABLE_ACCOUNT_WHERE }, select: { id: true } })],
  ])('%s', async (_forme, appel) => {
    expect(await refusDuValidateur(appel)).toBeNull();
  }, 20000);
});
