/**
 * **L'EXPORT RGPD ET LA PURGE RATAIENT LES MÉDIAS TRANSFÉRÉS DU COMPTE** (#20129).
 *
 * `MessageAttachment.uploadedBy` porte l'identité de compte depuis #20113 ; les
 * lignes écrites AVANT — les copies transférées, produites par
 * `copyAttachments` et `MessageProcessor.copyForwardedAttachments` — portent un
 * `Participant.id`, et rien ne les réécrit. Deux requêtes à l'échelle d'un
 * compte entier n'appariaient que le premier espace :
 *
 *  - `exportMedia` : un média transféré par le compte était absent de son export
 *    (RGPD art. 15) — une donnée qu'aucune autre section ne rattrape ;
 *  - `purgeAttachments` : ses octets survivaient à la fin de la période de
 *    grâce, hors de portée de tout balayage futur.
 *
 * ─── POURQUOI CES TÉMOINS ÉVALUENT LE `where` ───────────────────────────────
 *
 * Le témoin existant de `exportMedia` RECOPIAIT la clause
 * (`{ uploadedBy: USER_ID, isAnonymous: false }`) : un double auto-réalisateur
 * valide un changement d'espace de clés au lieu de le voir — c'est la mesure que
 * l'audit adversarial de #20113 a rendue (F1). Les doubles ci-dessous APPLIQUENT
 * la clause ligne par ligne (`matchesMongoWhere`), donc une ligne héritée y est
 * servie ou purgée pour de vrai, et celle d'autrui ne l'est pas.
 *
 * ─── LE SECOND DÉFAUT N'EST PAS DANS `exportMedia` ──────────────────────────
 *
 * La liste des participants est calculée UNE fois par `me/export.ts`, sous une
 * condition qui ne nommait que `messages` et `reactions`. Un export qui ne
 * demande QUE les médias ne la calculait donc pas — `exportMedia` aurait reçu
 * une liste vide, et le correctif serait resté sans effet sur le cas le plus
 * probable d'un export ciblé. `needsParticipantIds` est cette condition, et elle
 * vit avec les sections qui en dépendent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import {
  exportMedia,
  needsParticipantIds,
  SECTIONS_NEEDING_PARTICIPANT_IDS,
  type ExportPage,
} from '../../routes/me/export-sections';
import { purgeMediaOfDeletedAccount } from '../../services/purgeDeletedAccountMedia';

const USER_ID = '507f1f77bcf86cd799439011';
/** Le siège du compte dans une conversation — la clé des lignes HÉRITÉES. */
const OWN_PARTICIPANT_ID = '507f1f77bcf86cd799439021';
const OTHER_PARTICIPANT_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';

const page: ExportPage = { limit: 50, offset: 0 };

/** Un double qui ÉVALUE le `where` et honore `skip`/`take`, comme Prisma. */
const model = (rows: readonly MongoDocument[]) => {
  const matched = (where: MongoDocument) => rows.filter((row) => matchesMongoWhere(row, where));
  return {
    findMany: async ({ where, skip = 0, take }: { where: MongoDocument; skip?: number; take?: number }) =>
      matched(where).slice(skip, take === undefined ? undefined : skip + take),
    count: async ({ where }: { where: MongoDocument }) => matched(where).length,
  };
};

const attachment = (id: string, uploadedBy: string): MongoDocument => ({
  id,
  uploadedBy,
  isAnonymous: false,
  messageId: 'm-1',
  originalName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: `/uploads/${id}.jpg`,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
});

const emptyModel = () => model([]);

describe("l'export RGPD contient les médias TRANSFÉRÉS du compte (#20129)", () => {
  const prismaWith = (rows: readonly MongoDocument[]) =>
    ({ messageAttachment: model(rows), postMedia: emptyModel() }) as never;

  it('sert la pièce HÉRITÉE, écrite sous la clé de participation du compte, et la COMPTE', async () => {
    const prisma = prismaWith([
      attachment('att-televerse', USER_ID),
      attachment('att-transfere-herite', OWN_PARTICIPANT_ID),
    ]);

    const sections = await exportMedia(prisma, [OWN_PARTICIPANT_ID], USER_ID, page);

    expect(sections.attachments.items.map((item: { id: string }) => item.id)).toEqual([
      'att-televerse',
      'att-transfere-herite',
    ]);
    // Le `where` est partagé par `findMany` et `count` : un témoin qui n'assert
    // que `items` laisserait passer la moitié qui rend le défaut invisible.
    expect(sections.attachments.total).toBe(2);
  });

  it("ne sert NI la pièce d'un autre compte, NI celle du siège d'autrui", async () => {
    const prisma = prismaWith([
      attachment('att-a-moi', USER_ID),
      attachment('att-autre-compte', OTHER_USER_ID),
      attachment('att-siege-autrui', OTHER_PARTICIPANT_ID),
    ]);

    const sections = await exportMedia(prisma, [OWN_PARTICIPANT_ID], USER_ID, page);

    expect(sections.attachments.items.map((item: { id: string }) => item.id)).toEqual(['att-a-moi']);
    expect(sections.attachments.total).toBe(1);
  });

  it('sert le compte seul quand la liste des participations est vide', async () => {
    const prisma = prismaWith([attachment('att-a-moi', USER_ID), attachment('att-autre-compte', OTHER_USER_ID)]);

    const sections = await exportMedia(prisma, [], USER_ID, page);

    expect(sections.attachments.items.map((item: { id: string }) => item.id)).toEqual(['att-a-moi']);
  });

  it('calcule la liste des participations pour un export qui ne demande QUE les médias', async () => {
    expect(needsParticipantIds(['media'])).toBe(true);
    expect(needsParticipantIds(['messages'])).toBe(true);
    expect(needsParticipantIds(['reactions'])).toBe(true);
    expect(needsParticipantIds(['profile', 'contacts'])).toBe(false);
    // `calls` y a été inscrite après l'audit : `exportCallTelemetry` avait
    // besoin de la même liste et la relisait chez elle, avec son propre `where`.
    expect(needsParticipantIds(['calls'])).toBe(true);
    expect([...SECTIONS_NEEDING_PARTICIPANT_IDS]).toEqual(['messages', 'reactions', 'media', 'calls']);
  });

  it("la route LIT cette condition plutôt que d'en réécrire une", async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const route = readFileSync(join(__dirname, '../../routes/me/export.ts'), 'utf8');

    expect(route).toContain('needsParticipantIds(requestedTypes)');
    expect(route).toContain('exportMedia(fastify.prisma, pIds, userId, page)');
    expect(route).toContain('accountSeatIds(fastify.prisma, userId)');
    expect(route).toContain('exportCallTelemetry(fastify.prisma, pIds, page)');
  });
});

describe('la purge de fin de grâce voit les médias HÉRITÉS du compte (#20129)', () => {
  const buildPrisma = (rows: MongoDocument[]) => {
    const attachments = [...rows];
    return {
      prisma: {
        participant: {
          findMany: jest.fn<any>(async ({ where, skip = 0, take }: any) => {
            const all = where.userId === USER_ID ? [{ id: OWN_PARTICIPANT_ID }] : [];
            return all.slice(skip, take === undefined ? undefined : skip + take);
          }),
        },
        messageAttachment: {
          findMany: async ({ where, take }: { where: MongoDocument; take?: number }) =>
            attachments.filter((row) => matchesMongoWhere(row, where)).slice(0, take),
        },
        postMedia: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
        sound: { findMany: async () => [] },
      } as never,
      remove: (id: string) => {
        const index = attachments.findIndex((row) => row.id === id);
        if (index >= 0) attachments.splice(index, 1);
      },
      remaining: () => attachments.map((row) => row.id),
    };
  };

  const mediaService = { deleteFile: jest.fn<any>(async () => undefined) } as never;

  it('purge la pièce transférée HÉRITÉE, et laisse celle des autres', async () => {
    const harness = buildPrisma([
      attachment('att-televerse', USER_ID),
      attachment('att-transfere-herite', OWN_PARTICIPANT_ID),
      attachment('att-autre-compte', OTHER_USER_ID),
      attachment('att-siege-autrui', OTHER_PARTICIPANT_ID),
    ]);
    const remover = { deleteAttachment: jest.fn<any>(async (id: string) => harness.remove(id)) };

    const result = await purgeMediaOfDeletedAccount(harness.prisma, remover, mediaService, USER_ID, { batchSize: 2 });

    expect(result.attachmentsDeleted).toBe(2);
    expect(harness.remaining()).toEqual(['att-autre-compte', 'att-siege-autrui']);
  });

  it("purge le compte seul quand la lecture des participations ÉCHOUE — jamais rien", async () => {
    const harness = buildPrisma([
      attachment('att-televerse', USER_ID),
      attachment('att-transfere-herite', OWN_PARTICIPANT_ID),
    ]);
    (harness.prisma as any).participant.findMany = jest.fn<any>(async () => {
      throw new Error('replica lag');
    });
    const remover = { deleteAttachment: jest.fn<any>(async (id: string) => harness.remove(id)) };

    const result = await purgeMediaOfDeletedAccount(harness.prisma, remover, mediaService, USER_ID, { batchSize: 2 });

    // L'espace nominal est purgé — jamais rien — et le balayage se DIT
    // incomplet : il n'y a pas de passe suivante
    // (`processAccountDeletionRequests` n'élit que les demandes `CONFIRMED`, et
    // la demande ne l'est plus), donc la fournée manquée est PERDUE jusqu'à
    // #10021. Annoncer un rejeu qui n'existe pas est plus coûteux que de
    // l'annoncer perdu.
    expect(result.attachmentsDeleted).toBe(1);
    expect(result.complete).toBe(false);
    expect(harness.remaining()).toEqual(['att-transfere-herite']);
  });

  it('ne boucle pas sur une pièce dont la suppression RÉSISTE', async () => {
    const harness = buildPrisma([attachment('att-resiste', OWN_PARTICIPANT_ID)]);
    const remover = {
      deleteAttachment: jest.fn<any>(async () => {
        throw new Error('fichier verrouillé');
      }),
    };

    const result = await purgeMediaOfDeletedAccount(harness.prisma, remover, mediaService, USER_ID, { batchSize: 2 });

    expect(result.attachmentsDeleted).toBe(0);
    expect(remover.deleteAttachment).toHaveBeenCalledTimes(1);
  });
});
