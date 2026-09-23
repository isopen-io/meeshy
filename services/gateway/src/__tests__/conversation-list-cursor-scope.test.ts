/**
 * **LE CURSEUR DE LA LISTE SE RÉSOUT DANS LE SCOPE DU LECTEUR** (#6991).
 *
 * ## L'oracle
 *
 * `core-list.ts` résolvait le curseur par `findFirst({ where: { id:
 * beforeCursor } })` — **sans aucun scope participant**. N'importe quel
 * appelant authentifié pouvait donc soumettre l'identifiant d'une conversation
 * dont il n'est pas membre et LIRE LA RÉPONSE :
 *
 *   - l'id existe **et** porte un `lastMessageAt` ⇒ la page est filtrée, donc
 *     son contenu change ;
 *   - l'id n'existe pas, **ou** n'a jamais eu de message ⇒ aucun filtre n'est
 *     posé et la page 1 est resservie **en silence**.
 *
 * Deux états distinguables ⇒ une fuite d'existence et d'activité sur des
 * conversations tierces.
 *
 * ## Pourquoi ce défaut est pire qu'un oubli
 *
 * **La garde était écrite.** `messages-list.ts` la porte depuis #4177, et son
 * commentaire dit mot pour mot : « les deux curseurs de la même route doivent
 * se comporter pareil ici ». Le correctif a été appliqué à une route et pas à
 * sa jumelle, et personne ne l'a vu depuis.
 *
 * ## Ce que ce témoin exige
 *
 * Le témoin est **fail-closed** et couvre les DEUX branches que l'optionnel
 * `?.` confondait — id introuvable ET id trouvé sans `lastMessageAt` — parce
 * que c'est précisément cette confusion qui portait la fuite : au rang
 * nominal, la garde juste et la garde absente rendent le même verdict.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { resolveListCursor } from '../routes/conversations/list-cursor';

const LECTEUR = 'u-lecteur';
const UNE_CONVERSATION = '68f3808baf186ffd9583b0fa';
const QUAND = new Date('2026-09-18T09:00:00.000Z');

/** Un Prisma qui ne rend une conversation QUE si la requête porte le scope. */
type LigneCurseur = {
  lastMessageAt: Date | null;
  lastReactionAt?: Date | null;
  lastReactionTargetKey?: string | null;
};

const prismaQuiRespecteLeScope = (ligne: LigneCurseur | null) => {
  const findFirst = jest.fn(async (args: { where: Record<string, unknown> }) => {
    const scope = args.where.participants as { some?: { userId?: string } } | undefined;
    if (scope?.some?.userId !== LECTEUR) return null;
    return ligne;
  });
  return { conversation: { findFirst } } as never;
};

describe('le curseur de GET /conversations', () => {
  it("sans curseur, ne pose aucune borne et n'interroge pas la base", async () => {
    const prisma = prismaQuiRespecteLeScope(null);

    expect(await resolveListCursor({ prisma, beforeCursor: undefined, userId: LECTEUR })).toEqual({ genre: 'absent' });
  });

  it('résout le curseur du lecteur en une borne', async () => {
    const prisma = prismaQuiRespecteLeScope({ lastMessageAt: QUAND });

    expect(await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR })).toEqual({
      genre: 'borne',
      rang: QUAND,
    });
  });

  it("#7592 — borne sur le RANG du lecteur : une réaction à SON message a remonté la ligne curseur", async () => {
    const reaction = new Date('2026-09-18T09:05:00.000Z');
    const prisma = prismaQuiRespecteLeScope({ lastMessageAt: QUAND, lastReactionAt: reaction, lastReactionTargetKey: LECTEUR });

    expect(await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR })).toEqual({
      genre: 'borne',
      rang: reaction,
    });
  });

  it("#7592 — une réaction entre tiers ne déplace pas la borne", async () => {
    const reaction = new Date('2026-09-18T09:05:00.000Z');
    const prisma = prismaQuiRespecteLeScope({ lastMessageAt: QUAND, lastReactionAt: reaction, lastReactionTargetKey: 'u-tiers' });

    expect(await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR })).toEqual({
      genre: 'borne',
      rang: QUAND,
    });
  });

  it("REFUSE un identifiant que le lecteur ne participe pas — il ne ressert JAMAIS la page 1", async () => {
    const prisma = prismaQuiRespecteLeScope({ lastMessageAt: QUAND });

    expect(await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: 'u-intrus' })).toEqual({ genre: 'refus' });
  });

  it("REFUSE un identifiant introuvable — la MÊME réponse qu'un identifiant hors scope, sinon les deux se distinguent", async () => {
    const prisma = prismaQuiRespecteLeScope(null);

    const introuvable = await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR });
    const horsScope = await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: 'u-intrus' });

    expect(introuvable).toEqual({ genre: 'refus' });
    expect(introuvable).toEqual(horsScope);
  });

  it("une conversation SANS message est la QUEUE du tri, pas une absence de borne — c'est la seconde branche que l'optionnel confondait", async () => {
    const prisma = prismaQuiRespecteLeScope({ lastMessageAt: null });

    expect(await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR })).toEqual({ genre: 'queue' });
  });

  it('interroge la base AVEC le scope participant, jamais sur le seul identifiant', async () => {
    // Le faux DÉCLARE son paramètre, sans quoi `mock.calls` est le tuple VIDE
    // `[]` et `calls[0][0]` ne compile pas (TS2493) — un témoin qui ne compile
    // pas sous Jest passe pourtant `tsc -p tsconfig.json`, qui n'inclut pas ce
    // dossier : les deux couvrent ici des ensembles DISJOINTS.
    const findFirst = jest.fn(async (_args: { where: Record<string, unknown> }) => ({ lastMessageAt: QUAND }));
    const prisma = { conversation: { findFirst } } as never;

    await resolveListCursor({ prisma, beforeCursor: UNE_CONVERSATION, userId: LECTEUR });

    // Le `where` ENTIER, jamais champ par champ : c'est l'ABSENCE du scope qui
    // était le défaut, et une assertion par champ verdit sur un `where` auquel
    // il manque justement celui qu'on a oublié d'énumérer. Comparer l'objet
    // complet fait aussi rougir tout champ AJOUTÉ sans être voulu.
    const [premierAppel] = findFirst.mock.calls;
    expect(premierAppel?.[0]?.where).toEqual({
      id: UNE_CONVERSATION,
      participants: { some: { userId: LECTEUR, isActive: true } },
    });
  });
});
