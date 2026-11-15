/**
 * `contactLookupScope` — le `where` qu'il produit doit être ACCEPTÉ par le
 * client Prisma GÉNÉRÉ. #6811.
 *
 * ## Pourquoi ce témoin, à côté de celui qui joue la sémantique
 *
 * `contact-lookup-scope-blocked-absent.test.ts` rejoue le `where` contre un
 * double qui honore « absent ≠ null » (`mongo-where.ts`). Ce double dit si la
 * forme SÉLECTIONNE les bons documents — il ne dit RIEN de ce que Prisma
 * accepte d'ÉMETTRE, et il implémente `isSet` sur un tableau parce que
 * MongoDB, lui, le ferait. Le correctif de #6452 a donc posé
 * `blockedUserIds: { isSet: false }` sur une liste scalaire REQUISE, dont le
 * filtre généré (`StringNullableListFilter`) ne déclare que `equals`, `has`,
 * `hasEvery`, `hasSome` et `isEmpty` : le client refusait la requête avant le
 * moteur, et les quatre appelants rendaient 500 en production.
 *
 * Le double était vert. Le typage ne pouvait rien dire non plus — la fonction
 * rendait `Record<string, unknown>` — et la suite unitaire remplace
 * `@meeshy/shared/prisma/client` par un STUB (`moduleNameMapper`), si bien
 * qu'aucun témoin du dépôt ne voyait le vrai client.
 *
 * D'où ce témoin : il charge le client GÉNÉRÉ, par un `require` dynamique que
 * ni `moduleNameMapper` ni `tsc` ne détournent, et n'exige qu'une chose — que
 * le validateur ne rejette pas la forme.
 *
 * ## Pourquoi une adresse morte, et pourquoi elle porte un délai
 *
 * Un `PrismaClientValidationError` est jeté à la SÉRIALISATION, avant toute
 * E/S : la forme se juge donc sans base. Une forme ACCEPTÉE part en revanche
 * sur le réseau, et le défaut de `serverSelectionTimeoutMS` — trente secondes —
 * ferait durer chaque cas ACCEPTÉ trente secondes pour rien, en laissant une
 * poignée ouverte que Jest signale. Le délai ramené à 50 ms rend la question à
 * sa vraie taille : le verdict du VALIDATEUR, l'échec de connexion n'étant
 * qu'une façon de dire « la forme est passée ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { contactLookupScope } from '../../../services/ContactDirectoryService';

/**
 * Le client GÉNÉRÉ, pas le stub. Le chemin est calculé — un littéral serait
 * réécrit par `moduleNameMapper`, et `tsc` chargerait les 144 000 lignes de
 * `index.d.ts` pour rien.
 */
const CLIENT_GENERE = path.join(__dirname, '../../../../../../packages/shared/prisma/client');

type ClientPrisma = {
  user: { findMany: (args: unknown) => Promise<unknown> };
  $disconnect: () => Promise<void>;
};

/** Adresse sans écoutant : la connexion ne réussit jamais, et c'est voulu. */
const URL_MORTE = 'mongodb://127.0.0.1:1/guard-6811?serverSelectionTimeoutMS=50&connectTimeoutMS=50';

function nouveauClient(): ClientPrisma {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require(CLIENT_GENERE) as {
    PrismaClient: new (options: unknown) => ClientPrisma;
  };
  return new PrismaClient({ datasources: { db: { url: URL_MORTE } } });
}

/**
 * Le message du validateur si Prisma REFUSE la forme, `null` s'il l'accepte.
 */
async function refusDuValidateur(where: unknown): Promise<string | null> {
  const prisma = nouveauClient();
  try {
    await prisma.user.findMany({ where, select: { id: true }, take: 1 });
    return null;
  } catch (erreur) {
    return (erreur as Error).constructor.name === 'PrismaClientValidationError'
      ? (erreur as Error).message
      : null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const VIEWER = '507f1f77bcf86cd799439011';
const BLOQUE = '507f1f77bcf86cd799439012';

describe('contactLookupScope — le client Prisma généré accepte la forme (#6811)', () => {
  it("le témoin SAIT rougir : `isSet` sur une liste scalaire est refusé", async () => {
    const refus = await refusDuValidateur({ blockedUserIds: { isSet: false } });
    expect(refus).toMatch(/isSet/);
  }, 15000);

  it('la portée nue est acceptée', async () => {
    expect(await refusDuValidateur(contactLookupScope({ blockedRelatedIds: [] }))).toBeNull();
  }, 15000);

  it('la portée avec des identifiants écartés est acceptée', async () => {
    expect(
      await refusDuValidateur(contactLookupScope({ blockedRelatedIds: [BLOQUE] }))
    ).toBeNull();
  }, 15000);

  it('la portée composée comme `GET /directory/people` la compose est acceptée', async () => {
    const where = {
      ...contactLookupScope({ blockedRelatedIds: [BLOQUE] }),
      searchTokens: { has: 'lauri' },
    };
    expect(await refusDuValidateur(where)).toBeNull();
  }, 15000);

  it('la portée composée comme `ContactDirectoryService.match` la compose est acceptée', async () => {
    const where = {
      ...contactLookupScope({ blockedRelatedIds: [BLOQUE] }),
      id: { notIn: [VIEWER, BLOQUE] },
      OR: [{ phoneNumber: { in: ['+33600000000'] } }, { email: { in: ['a@b.c'] } }],
    };
    expect(await refusDuValidateur(where)).toBeNull();
  }, 15000);
});
