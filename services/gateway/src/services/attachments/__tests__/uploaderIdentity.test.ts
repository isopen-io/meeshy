/**
 * @jest-environment node
 *
 * #20113 — QUI a déposé une pièce jointe, dit dans UN seul espace de clés.
 *
 * `MessageAttachment.uploadedBy` avait deux écrivains et deux espaces : les
 * quatre sites de téléversement y posaient un `User.id`, les deux sites de
 * COPIE un `Participant.id`. Le champ est servi aux clients — le schéma de la
 * galerie le décrit « *Uploader id — gates the delete affordance* » — et seul
 * le serveur peut faire la jointure qui lui donnerait un sens.
 *
 * Deux responsabilités distinctes vivent donc ici, et il faut les séparer :
 *  - **écrire** l'identité de compte (`userId ?? id`), la convention du dépôt ;
 *  - **reconnaître** les lignes HÉRITÉES, écrites avant l'unification et que
 *    rien ne réécrit — c'est tout ce que `ownsAsUploader` garde désormais.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  ownsAsUploader,
  resolveUploaderIdentity,
  uploaderIdentityOf,
} from '../uploaderIdentity';

const PARTICIPANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439022';
const OTHER_USER = '507f1f77bcf86cd799439033';

/**
 * Les littéraux ne portent QUE `userId`, et c'est le contrat : la fonction ne
 * demande rien d'autre, et lui passer un `id` ne compilerait pas sous
 * `tsconfig.test.json` (`TS2353`) — le seul typecheck qui atteigne les tests.
 */
describe('uploaderIdentityOf', () => {
  it("rend le `userId` d'un inscrit", () => {
    expect(uploaderIdentityOf({ userId: USER }, PARTICIPANT)).toBe(USER);
  });

  it("rend le `Participant.id` d'un anonyme — c'est SON identité d'authentification", () => {
    expect(uploaderIdentityOf({ userId: null }, PARTICIPANT)).toBe(PARTICIPANT);
  });

  it('rend le repli quand la ligne de participant est absente', () => {
    // Le repli est le comportement d'AVANT l'unification : une ligne écrite
    // ainsi reste reconnue par `ownsAsUploader`. Échouer serait pire —
    // la pièce naîtrait sans déposant.
    expect(uploaderIdentityOf(null, PARTICIPANT)).toBe(PARTICIPANT);
  });
});

describe('resolveUploaderIdentity', () => {
  const prismaWith = (impl: () => Promise<unknown>) =>
    ({ participant: { findUnique: jest.fn(impl) } }) as unknown as Parameters<typeof resolveUploaderIdentity>[0];

  it('lit le participant UNE fois, et ne demande que son `userId`', async () => {
    const prisma = prismaWith(async () => ({ id: PARTICIPANT, userId: USER }));

    expect(await resolveUploaderIdentity(prisma, PARTICIPANT)).toBe(USER);
    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { id: PARTICIPANT },
      select: { userId: true },
    });
  });

  it('replie sur le `Participant.id` quand la lecture LÈVE — jamais de pièce sans déposant', async () => {
    const prisma = prismaWith(async () => { throw new Error('mongo down'); });

    await expect(resolveUploaderIdentity(prisma, PARTICIPANT)).resolves.toBe(PARTICIPANT);
  });
});

describe('ownsAsUploader — la compatibilité des lignes HÉRITÉES', () => {
  const prismaWith = (row: unknown) =>
    ({ participant: { findUnique: jest.fn(async () => row) } }) as unknown as Parameters<typeof ownsAsUploader>[0];

  it("reconnaît la ligne écrite dans le bon espace, SANS lire la base", async () => {
    const prisma = prismaWith(null);

    expect(await ownsAsUploader(prisma, USER, USER)).toBe(true);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it("reconnaît une ligne héritée : le `Participant.id` du propre participant du lecteur", async () => {
    expect(await ownsAsUploader(prismaWith({ userId: USER }), PARTICIPANT, USER)).toBe(true);
  });

  it("refuse le participant d'AUTRUI", async () => {
    expect(await ownsAsUploader(prismaWith({ userId: OTHER_USER }), PARTICIPANT, USER)).toBe(false);
  });

  it('refuse un participant anonyme — aucun compte à rattacher', async () => {
    expect(await ownsAsUploader(prismaWith({ userId: null }), PARTICIPANT, USER)).toBe(false);
  });

  it("refuse ce qui n'a pas la forme d'un ObjectId, sans interroger la base", async () => {
    const prisma = prismaWith({ userId: USER });

    expect(await ownsAsUploader(prisma, 'system', USER)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un APPELANT sans identité, et ne lit pas la base (#20113 F6)", async () => {
    // `tsconfig.json` du gateway porte `strictNullChecks: false` : la signature
    // `userId: string` accepte `null` et `undefined` SANS erreur de compilation.
    // Le prédicat ouvre un accès — il refuse donc explicitement, plutôt que de
    // compter sur `null === null` pour ne jamais se produire.
    const prisma = prismaWith({ userId: null });

    expect(await ownsAsUploader(prisma, PARTICIPANT, null as unknown as string)).toBe(false);
    expect(await ownsAsUploader(prisma, PARTICIPANT, undefined as unknown as string)).toBe(false);
    expect(await ownsAsUploader(prisma, PARTICIPANT, '')).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('refuse une pièce sans déposant', async () => {
    expect(await ownsAsUploader(prismaWith(null), null, USER)).toBe(false);
    expect(await ownsAsUploader(prismaWith(null), undefined, USER)).toBe(false);
  });

  it('refuse, et ne lève pas, quand la lecture échoue — fail-closed', async () => {
    const prisma = ({ participant: { findUnique: jest.fn(async () => { throw new Error('mongo down'); }) } }) as unknown as Parameters<typeof ownsAsUploader>[0];

    await expect(ownsAsUploader(prisma, PARTICIPANT, USER)).resolves.toBe(false);
  });
});
