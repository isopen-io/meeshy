/**
 * `contactLookupScope` — le `where` produit est ACCEPTÉ par le client Prisma
 * GÉNÉRÉ (#6811).
 *
 * Le double `@meeshy/shared/prisma/client` (`__stubs__/prisma-client.ts`,
 * branché par `moduleNameMapper` pour tout le reste de la suite) accepte
 * n'importe quelle forme de `where` — c'est un double de COMPORTEMENT, pas de
 * VALIDATION, et c'est exactement ce qui a laissé vivre `isSet` sur
 * `blockedUserIds` jusqu'en production : `blockedUserIds` est une liste
 * scalaire REQUISE (`String[] @default([])`), dont le client GÉNÉRÉ ne
 * déclare aucun opérateur `isSet` (`StringNullableListFilter` ne porte que
 * `equals` / `has` / `hasEvery` / `hasSome` / `isEmpty`) — il rejetait donc la
 * forme posée par #6452 AVANT tout aller-retour réseau
 * (`PrismaClientValidationError`, « Unknown argument `isSet` »), et
 * `GET /directory/people` rendait 500 en production. Aucun témoin qui passe
 * par le stub ne pouvait le voir.
 *
 * Ce fichier importe donc le client par un chemin RELATIF, en contournant
 * volontairement `^@meeshy/shared/prisma/client$` (`jest.config.json`), pour
 * confronter `contactLookupScope` au VALIDATEUR RÉEL. Aucune base n'est
 * nécessaire : Prisma valide la FORME de la requête avant de tenter une
 * connexion — un hôte MongoDB injoignable (délai de sélection court) fait la
 * preuve négative, la requête passe la validation et échoue seulement, et
 * vite, au réseau.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { contactLookupScope } from '../../../services/ContactDirectoryService';
// Chemin RELATIF, volontairement : `@meeshy/shared/prisma/client` est stubbé
// pour le reste de la suite (`jest.config.json`), et un stub ne peut jamais
// attester qu'une forme de `where` passe la validation du client RÉEL.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { PrismaClient } from '../../../../../../packages/shared/prisma/client/index.js';

const prisma = new PrismaClient({
  datasourceUrl:
    'mongodb://127.0.0.1:1/contact-lookup-scope-probe?replicaSet=rs0&directConnection=true&serverSelectionTimeoutMS=1000',
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Rejette-t-il, et pour QUELLE raison — une forme refusée par le client, ou une base injoignable ? */
async function classify(where: unknown): Promise<{ ctor: string; message: string }> {
  try {
    await prisma.user.findMany({ where: where as never, select: { id: true } });
    return { ctor: 'resolved', message: '' };
  } catch (error) {
    return { ctor: (error as Error).constructor.name, message: (error as Error).message };
  }
}

describe('contactLookupScope — le `where` produit contre le client Prisma généré (#6811)', () => {
  it("n'est plus rejeté par le validateur — plus de `PrismaClientValidationError`", async () => {
    const where = contactLookupScope({ excludedUserIds: ['507f1f77bcf86cd799439011'] });

    const { ctor, message } = await classify(where);

    expect(ctor).not.toBe('PrismaClientValidationError');
    expect(message).not.toContain('isSet');
  }, 10000);

  it('rougit sur la forme #6452 — la preuve que ce témoin peut réellement tomber', async () => {
    const shapeAvant6811 = {
      isActive: true,
      AND: [
        { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
        { OR: [{ blockedUserIds: { isSet: false } }, { NOT: { blockedUserIds: { has: 'viewer' } } }] },
      ],
      id: { notIn: [] as string[] },
    };

    const { ctor, message } = await classify(shapeAvant6811);

    expect(ctor).toBe('PrismaClientValidationError');
    expect(message).toContain('isSet');
  }, 10000);

  it("ne porte plus jamais de clause sur `blockedUserIds` — la garde de blocage est résolue par l'appelant, via une requête positive indexée (#6811)", () => {
    const where = contactLookupScope({ excludedUserIds: [] });
    expect(JSON.stringify(where)).not.toContain('blockedUserIds');
  });
});
