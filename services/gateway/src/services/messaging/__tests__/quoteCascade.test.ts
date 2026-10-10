/**
 * #8630 — décision porteur 2026-09-29 : « une flamme-œil pas encore lue est
 * lisible dans une citation, mais lorsqu'elle se détruit, elle entraîne la
 * destruction du message qui l'a cité ».
 *
 * Les témoins sont posés sur une réponse qui vivrait PLUS LONGTEMPS que ce
 * qu'elle cite (non éphémère, ou à échéance plus tardive) : c'est le seul cas
 * où la règle change le verdict. Le faux Prisma répond depuis une table en
 * mémoire, et les assertions portent sur la VALEUR SERVIE.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import {
  isServableThroughQuotes,
  loadInheritedEphemeralDeadlines,
  loadQuoteCascadeAudience,
  loadQuoteDescendants,
  withInheritedExpiry,
} from '../quoteCascade';

const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const LECTEUR = 'p-lecteur';
const AUTRE = 'p-autre';
const EXPEDITEUR = 'p-expediteur';
const CONSUMED = new Date('2026-09-29T10:00:00.000Z');
const RETENTION = new Date('2026-10-06T10:00:00.000Z');

type Row = {
  id: string;
  conversationId: string;
  replyToId: string | null;
  senderId: string;
  ephemeralDuration: number | null;
  effectFlags: number;
  expiresAt: Date | null;
  deletedAt: Date | null;
};

type Entry = { messageId: string; participantId: string; ephemeralExpiresAt: Date | null; userId?: string | null };

const message = (over: Partial<Row> & { id: string }): Row => ({
  conversationId: 'c1',
  replyToId: null,
  senderId: AUTRE,
  ephemeralDuration: null,
  effectFlags: 0,
  expiresAt: null,
  deletedAt: null,
  ...over,
});

const flamme = message({ id: 'flamme', senderId: EXPEDITEUR, effectFlags: AFTER_READ, expiresAt: RETENTION });
const reponse = message({ id: 'reponse', replyToId: 'flamme', senderId: AUTRE });
const petiteReponse = message({ id: 'petite-reponse', replyToId: 'reponse', senderId: EXPEDITEUR });
const sansLien = message({ id: 'sans-lien' });

function fakePrisma(rows: Row[], entries: Entry[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const queries: string[] = [];
  const prisma = {
    message: {
      findMany: async ({ where, take }: { where: Record<string, any>; take?: number }) => {
        const ids: string[] | undefined = where.id?.in;
        const parents: string[] | undefined = where.replyToId?.in;
        queries.push(ids ? 'by-id' : 'by-reply');
        const matched = ids
          ? ids.map((id) => byId.get(id)).filter((row): row is Row => Boolean(row))
          : rows.filter((row) => row.replyToId !== null && parents!.includes(row.replyToId) && row.deletedAt === null);
        return matched.slice(0, take ?? matched.length);
      },
    },
    messageStatusEntry: {
      findMany: async ({ where }: { where: Record<string, any> }) => {
        const ids: string[] = where.messageId?.in ?? [where.messageId];
        const lte: Date | undefined = where.ephemeralExpiresAt?.lte;
        return entries
          .filter((entry) => ids.includes(entry.messageId))
          .filter((entry) => entry.ephemeralExpiresAt instanceof Date)
          .filter((entry) => !lte || entry.ephemeralExpiresAt!.getTime() <= lte.getTime())
          .map((entry) => ({ ...entry, participant: { userId: entry.userId ?? null } }));
      },
    },
  };
  return { prisma: prisma as never, queries };
}

describe('la destruction d\'une flamme-œil entraîne ses réponses, pour CE lecteur (#8630)', () => {
  it('sert à la réponse l\'échéance du message cité quand celui-ci est consommé par le lecteur', async () => {
    const { prisma } = fakePrisma([flamme, reponse], [{ messageId: 'flamme', participantId: LECTEUR, ephemeralExpiresAt: CONSUMED }]);

    const inherited = await loadInheritedEphemeralDeadlines(prisma, [reponse], LECTEUR);

    expect(inherited.get('reponse')).toEqual(CONSUMED);
    expect(withInheritedExpiry({ id: 'reponse', expiresAt: null }, inherited).expiresAt).toEqual(CONSUMED);
  });

  it('laisse vivre la réponse tant que la flamme-œil n\'est pas consommée : la citation reste lisible', async () => {
    const { prisma } = fakePrisma([flamme, reponse], [{ messageId: 'flamme', participantId: AUTRE, ephemeralExpiresAt: CONSUMED }]);

    const inherited = await loadInheritedEphemeralDeadlines(prisma, [reponse], LECTEUR);

    expect(inherited.has('reponse')).toBe(false);
    expect(isServableThroughQuotes(inherited, 'reponse', new Date(CONSUMED.getTime() + 10 * EPHEMERAL_UNAVAILABILITY_GRACE_MS))).toBe(true);
  });

  it('est transitive : la réponse à la réponse meurt avec la flamme-œil', async () => {
    const { prisma } = fakePrisma(
      [flamme, reponse, petiteReponse],
      [{ messageId: 'flamme', participantId: LECTEUR, ephemeralExpiresAt: CONSUMED }],
    );

    const inherited = await loadInheritedEphemeralDeadlines(prisma, [petiteReponse], LECTEUR);

    expect(inherited.get('petite-reponse')).toEqual(CONSUMED);
  });

  it('cesse de servir la réponse une heure après la mort du cité, et pas avant', async () => {
    const { prisma } = fakePrisma([flamme, reponse], [{ messageId: 'flamme', participantId: LECTEUR, ephemeralExpiresAt: CONSUMED }]);
    const inherited = await loadInheritedEphemeralDeadlines(prisma, [reponse], LECTEUR);

    expect(isServableThroughQuotes(inherited, 'reponse', new Date(CONSUMED.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS - 1))).toBe(true);
    expect(isServableThroughQuotes(inherited, 'reponse', new Date(CONSUMED.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS))).toBe(false);
  });

  it('n\'avance jamais la mort d\'une réponse qui meurt déjà plus tôt que ce qu\'elle cite', async () => {
    const early = new Date(CONSUMED.getTime() - 60_000);
    const { prisma } = fakePrisma([flamme, reponse], [{ messageId: 'flamme', participantId: LECTEUR, ephemeralExpiresAt: CONSUMED }]);
    const inherited = await loadInheritedEphemeralDeadlines(prisma, [reponse], LECTEUR);

    expect(withInheritedExpiry({ id: 'reponse', expiresAt: early }, inherited).expiresAt).toEqual(early);
  });

  it('ne tue rien chez l\'expéditeur de la flamme-œil : sa réponse vit jusqu\'à la destruction globale', async () => {
    const { prisma } = fakePrisma(
      [flamme, reponse],
      [{ messageId: 'flamme', participantId: LECTEUR, ephemeralExpiresAt: CONSUMED }],
    );

    const inherited = await loadInheritedEphemeralDeadlines(prisma, [reponse], EXPEDITEUR);

    expect(inherited.has('reponse')).toBe(false);
  });

  it('ne coûte aucune requête à une page sans citation', async () => {
    const { prisma, queries } = fakePrisma([sansLien], []);

    const inherited = await loadInheritedEphemeralDeadlines(prisma, [sansLien], LECTEUR);

    expect(inherited.size).toBe(0);
    expect(queries).toEqual([]);
  });
});

describe('les réponses d\'un message qui meurt, pour les annonces et la destruction (#8630)', () => {
  it('rend toute la descendance vivante, transitivement', async () => {
    const supprimee = message({ id: 'supprimee', replyToId: 'flamme', deletedAt: CONSUMED });
    const { prisma } = fakePrisma([flamme, reponse, petiteReponse, supprimee, sansLien], []);

    const descendants = await loadQuoteDescendants(prisma, ['flamme']);

    expect(descendants.map((row) => row.id).sort()).toEqual(['petite-reponse', 'reponse']);
    expect(descendants.every((row) => row.conversationId === 'c1')).toBe(true);
  });

  it('désigne, pour une nouvelle réponse, les lecteurs pour qui un ancêtre cité est déjà mort', async () => {
    const { prisma } = fakePrisma(
      [flamme, reponse],
      [
        { messageId: 'flamme', participantId: LECTEUR, userId: 'u-lecteur', ephemeralExpiresAt: CONSUMED },
        { messageId: 'flamme', participantId: AUTRE, ephemeralExpiresAt: new Date(CONSUMED.getTime() + 3_600_000) },
      ],
    );

    const audience = await loadQuoteCascadeAudience(prisma, 'reponse', new Date(CONSUMED.getTime() + 1000));

    expect([...audience.entries()]).toEqual([['u-lecteur', CONSUMED]]);
  });
});
