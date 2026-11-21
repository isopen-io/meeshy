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
 *  - **écrire** l'EMPREINTE du déposant — identité de compte (`userId ?? id`) et
 *    anonymat, ensemble (#20142) ;
 *  - **reconnaître** les lignes HÉRITÉES, écrites avant l'unification et que
 *    rien ne réécrit — c'est tout ce que `ownsAsUploader` garde désormais.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ownsAsUploader, resolveUploaderStamp, uploaderStampOf } from '../uploaderIdentity';

const PARTICIPANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439022';
const OTHER_USER = '507f1f77bcf86cd799439033';

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

/**
 * #20142 — `uploadedBy` et `isAnonymous` répondent à LA MÊME question — *qui a
 * fait cette ligne ?* — et doivent donc voyager ensemble.
 *
 * `copiedAttachmentFields` posait `isAnonymous: false` sans condition, parce
 * qu'il ne connaît pas le copieur. Un invité qui transférait une pièce ne
 * pouvait donc plus la supprimer : la branche anonyme du `DELETE` exige les
 * DEUX (`uploadedBy === userId && isAnonymous`), et le bouton était pourtant
 * offert par le web, qui ne regarde que `uploadedBy`.
 */
describe('uploaderStampOf', () => {
  it("rend l'empreinte d'un inscrit : son `userId`, et PAS anonyme", () => {
    expect(uploaderStampOf({ userId: USER }, PARTICIPANT)).toEqual({ uploadedBy: USER, isAnonymous: false });
  });

  it("rend l'empreinte d'un invité : son `Participant.id`, et ANONYME", () => {
    expect(uploaderStampOf({ userId: null }, PARTICIPANT)).toEqual({ uploadedBy: PARTICIPANT, isAnonymous: true });
  });

  it('participant absent : le repli d’AVANT, et jamais une anonymité inventée', () => {
    // Le repli est le `Participant.id` avec `isAnonymous: false` — exactement
    // ce que le code écrivait avant #20142. Affirmer l'anonymat sur une ligne
    // dont on n'a pas lu le déposant OUVRIRAIT la branche anonyme du `DELETE`
    // à quiconque porte cet identifiant.
    expect(uploaderStampOf(null, PARTICIPANT)).toEqual({ uploadedBy: PARTICIPANT, isAnonymous: false });
  });
});

describe('resolveUploaderStamp', () => {
  const prismaWith = (impl: () => Promise<unknown>) =>
    ({ participant: { findUnique: jest.fn(impl) } }) as unknown as Parameters<typeof resolveUploaderStamp>[0];

  it('lit le participant UNE fois, et ne demande que son `userId`', async () => {
    const prisma = prismaWith(async () => ({ userId: USER }));

    expect(await resolveUploaderStamp(prisma, PARTICIPANT)).toEqual({ uploadedBy: USER, isAnonymous: false });
    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { id: PARTICIPANT },
      select: { userId: true },
    });
  });

  it("rend l'empreinte ANONYME d'un invité", async () => {
    expect(await resolveUploaderStamp(prismaWith(async () => ({ userId: null })), PARTICIPANT))
      .toEqual({ uploadedBy: PARTICIPANT, isAnonymous: true });
  });

  it('replie sur le comportement d’avant quand la lecture LÈVE', async () => {
    const prisma = prismaWith(async () => { throw new Error('mongo down'); });

    await expect(resolveUploaderStamp(prisma, PARTICIPANT))
      .resolves.toEqual({ uploadedBy: PARTICIPANT, isAnonymous: false });
  });
});
