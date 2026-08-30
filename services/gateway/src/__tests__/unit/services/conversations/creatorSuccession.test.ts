/**
 * La succession du créateur revient au PREMIER à avoir été administrateur.
 *
 * Décision porteur du 2026-08-28 (#4058), en quatre points :
 *
 *  1. un administrateur sans trace de promotion est daté par son `joinedAt` ;
 *  2. le créateur peut désormais PARTIR — le transfert est automatique ;
 *  3. sans aucun administrateur, le plus ancien MEMBRE hérite ; sans membre,
 *     la conversation se ferme ;
 *  4. la trace n'a pas besoin d'être protégée — le repli du point 1 rend la
 *     règle TOTALE, donc elle ne dépend jamais d'une table effaçable.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  PLAFOND_CANDIDATS,
  PLAFOND_TRACES,
  elireSuccesseur,
  resoudreSuccessionDuCreateur,
} from '../../../../services/conversations/creatorSuccession';

const JANVIER = new Date('2026-01-04T09:30:00.000Z');
const FEVRIER = new Date('2026-02-04T09:30:00.000Z');
const MARS = new Date('2026-03-04T09:30:00.000Z');
const AVRIL = new Date('2026-04-04T09:30:00.000Z');

const membre = (over: Record<string, unknown> = {}) => ({
  id: `p-${String(over.userId ?? 'x')}`,
  userId: 'u-x',
  role: 'member',
  joinedAt: JANVIER,
  ...over,
});

describe('elireSuccesseur — la loi, sans base de données', () => {
  it("ferme la conversation quand il ne reste personne", () => {
    expect(elireSuccesseur([], [])).toEqual({ kind: 'close' });
  });

  it("donne la conversation à l'unique administrateur, même sans trace", () => {
    const admin = membre({ userId: 'u-a', role: 'admin', joinedAt: MARS });
    const simple = membre({ userId: 'u-b', role: 'member', joinedAt: JANVIER });

    expect(elireSuccesseur([simple, admin], [])).toEqual({
      kind: 'transfer',
      successor: admin,
    });
  });

  it("classe les administrateurs par l'instant de leur promotion", () => {
    const tardif = membre({ userId: 'u-a', role: 'admin', joinedAt: JANVIER });
    const precoce = membre({ userId: 'u-b', role: 'admin', joinedAt: AVRIL });

    // `u-b` a rejoint le DERNIER et a été promu le PREMIER : c'est le rang
    // d'administrateur qui décide, jamais l'ancienneté d'appartenance.
    const elu = elireSuccesseur(
      [tardif, precoce],
      [
        { userId: 'u-a', promotedAt: MARS },
        { userId: 'u-b', promotedAt: FEVRIER },
      ]
    );

    expect(elu).toEqual({ kind: 'transfer', successor: precoce });
  });

  it("date un administrateur sans trace par son `joinedAt` (décision 1)", () => {
    // Une participation CRÉÉE déjà administratrice (seed, ajout direct)
    // n'écrit aucune notification : seul `PATCH …/role` en produit une.
    // Le repli la fait concourir, il ne la met pas hors jeu.
    const sansTrace = membre({ userId: 'u-a', role: 'admin', joinedAt: JANVIER });
    const avecTrace = membre({ userId: 'u-b', role: 'admin', joinedAt: JANVIER });

    expect(
      elireSuccesseur([avecTrace, sansTrace], [{ userId: 'u-b', promotedAt: MARS }])
    ).toEqual({ kind: 'transfer', successor: sansTrace });
  });

  it("retient la PLUS ANCIENNE trace quand un rang a été repris plusieurs fois", () => {
    const a = membre({ userId: 'u-a', role: 'admin', joinedAt: AVRIL });
    const b = membre({ userId: 'u-b', role: 'admin', joinedAt: AVRIL });

    expect(
      elireSuccesseur(
        [a, b],
        [
          { userId: 'u-a', promotedAt: MARS },
          { userId: 'u-a', promotedAt: JANVIER },
          { userId: 'u-b', promotedAt: FEVRIER },
        ]
      )
    ).toEqual({ kind: 'transfer', successor: a });
  });

  it("ne laisse pas la casse décider d'une CONSÉQUENCE (#4008)", () => {
    // `Participant.role` a été écrit `ADMIN` par d'anciennes portes ; une
    // égalité stricte en minuscules aurait sauté l'administrateur et donné
    // la conversation au plus ancien membre.
    const admin = membre({ userId: 'u-a', role: 'ADMIN', joinedAt: AVRIL });
    const ancien = membre({ userId: 'u-b', role: 'member', joinedAt: JANVIER });

    expect(elireSuccesseur([ancien, admin], [])).toEqual({
      kind: 'transfer',
      successor: admin,
    });
  });

  it("revient au plus ancien MEMBRE quand il n'y a aucun administrateur (décision 3)", () => {
    const ancien = membre({ userId: 'u-a', role: 'member', joinedAt: JANVIER });
    const recent = membre({ userId: 'u-b', role: 'moderator', joinedAt: MARS });

    // Le rang de MODÉRATEUR ne précède plus : la décision ne connaît que
    // deux étages, administrateur puis ancienneté.
    expect(elireSuccesseur([recent, ancien], [])).toEqual({
      kind: 'transfer',
      successor: ancien,
    });
  });

  it("range en dernier une ligne sans date d'arrivée, sans jamais la perdre", () => {
    const date = membre({ userId: 'u-a', role: 'member', joinedAt: MARS });
    const sansDate = membre({ userId: 'u-b', role: 'member', joinedAt: null });

    expect(elireSuccesseur([sansDate, date], [])).toEqual({
      kind: 'transfer',
      successor: date,
    });
    expect(elireSuccesseur([sansDate], [])).toEqual({
      kind: 'transfer',
      successor: sansDate,
    });
  });

  it("tranche par l'identifiant à égalité parfaite, pour rester déterministe", () => {
    const a = { id: 'p-aaa', userId: 'u-a', role: 'member', joinedAt: JANVIER };
    const b = { id: 'p-bbb', userId: 'u-b', role: 'member', joinedAt: JANVIER };

    expect(elireSuccesseur([b, a], [])).toEqual({ kind: 'transfer', successor: a });
    expect(elireSuccesseur([a, b], [])).toEqual({ kind: 'transfer', successor: a });
  });
});

const prismaDouble = (
  candidats: unknown[],
  notifications: unknown[],
  options: { directJamaisUtilise?: boolean } = {}
) => ({
  // La loi écarte d'abord le DM JAMAIS UTILISÉ, qui se ferme au lieu de se
  // transmettre — règle qui vivait dans `delete-for-me.ts` seul.
  conversation: {
    count: jest.fn<any>().mockResolvedValue(options.directJamaisUtilise ? 1 : 0),
  },
  participant: { findMany: jest.fn<any>().mockResolvedValue(candidats) },
  notification: { findMany: jest.fn<any>().mockResolvedValue(notifications) },
});

describe('resoudreSuccessionDuCreateur — la lecture', () => {
  it("n'interroge jamais les traces quand aucun administrateur ne reste", async () => {
    const prisma = prismaDouble([membre({ userId: 'u-b', joinedAt: JANVIER })], []);

    const issue = await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(issue).toEqual({
      kind: 'transfer',
      successor: expect.objectContaining({ userId: 'u-b' }),
    });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('exclut le sortant et les participations éteintes', async () => {
    const prisma = prismaDouble([], []);

    await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'c-1', isActive: true, userId: { not: 'u-a' } },
      })
    );
  });

  it("replie la casse de `metadata.newRole`, écrit en MAJUSCULES", async () => {
    const prisma = prismaDouble(
      [
        membre({ userId: 'u-b', role: 'admin', joinedAt: AVRIL }),
        membre({ userId: 'u-c', role: 'admin', joinedAt: AVRIL }),
      ],
      [
        {
          userId: 'u-c',
          createdAt: FEVRIER,
          context: { conversationId: 'c-1' },
          metadata: { newRole: 'ADMIN' },
        },
        {
          userId: 'u-b',
          createdAt: JANVIER,
          context: { conversationId: 'c-1' },
          metadata: { newRole: 'MODERATOR' },
        },
      ]
    );

    // `u-b` a la trace la plus ANCIENNE — mais elle mène au rang de
    // modérateur, pas d'administrateur : elle ne date pas sa promotion.
    const issue = await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(issue).toEqual({
      kind: 'transfer',
      successor: expect.objectContaining({ userId: 'u-c' }),
    });
  });

  it("ignore une promotion obtenue dans une AUTRE conversation", async () => {
    const prisma = prismaDouble(
      [
        membre({ userId: 'u-b', role: 'admin', joinedAt: MARS }),
        membre({ userId: 'u-c', role: 'admin', joinedAt: AVRIL }),
      ],
      [
        {
          userId: 'u-c',
          createdAt: JANVIER,
          context: { conversationId: 'c-AUTRE' },
          metadata: { newRole: 'ADMIN' },
        },
      ]
    );

    // Sans cette garde, `u-c` hériterait d'un fil où il est arrivé en
    // dernier, sur la foi d'un rang obtenu ailleurs.
    const issue = await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(issue).toEqual({
      kind: 'transfer',
      successor: expect.objectContaining({ userId: 'u-b' }),
    });
  });

  it('ferme quand plus personne ne reste (décision 3)', async () => {
    const prisma = prismaDouble([], []);

    expect(
      await resoudreSuccessionDuCreateur(prisma as any, {
        conversationId: 'c-1',
        sortantUserId: 'u-a',
      })
    ).toEqual({ kind: 'close' });
  });

  it("survit à une table de notifications VIDÉE — la règle reste totale (décision 4)", async () => {
    // `DELETE /notifications` fait un `deleteMany({})` global. Le repli sur
    // `joinedAt` fait que l'effacement DÉGRADE la règle sans la casser :
    // la succession reste définie, déterministe, et gouvernée par le rang.
    const prisma = prismaDouble(
      [
        membre({ userId: 'u-b', role: 'admin', joinedAt: MARS }),
        membre({ userId: 'u-c', role: 'admin', joinedAt: JANVIER }),
        membre({ userId: 'u-d', role: 'member', joinedAt: JANVIER }),
      ],
      []
    );

    expect(
      await resoudreSuccessionDuCreateur(prisma as any, {
        conversationId: 'c-1',
        sortantUserId: 'u-a',
      })
    ).toEqual({
      kind: 'transfer',
      successor: expect.objectContaining({ userId: 'u-c' }),
    });
  });
});

describe('elireSuccesseur — hériter demande un compte', () => {
  it("n'élit pas un invité sans compte, fût-il le plus ancien", () => {
    // Un visiteur venu par un lien de partage n'a aucune ligne `User` : lui
    // donner le fil, c'est le laisser sans gouvernance sous couvert d'en avoir
    // une — sa session expire, et rien ne peut lui être imputé.
    const invite = membre({ userId: null, id: 'p-invite', joinedAt: JANVIER });
    const inscrit = membre({ userId: 'u-b', joinedAt: MARS });

    expect(elireSuccesseur([invite, inscrit], [])).toEqual({
      kind: 'transfer',
      successor: inscrit,
    });
  });

  it("ferme le fil quand il ne reste QUE des invités sans compte", () => {
    const invite = membre({ userId: null, id: 'p-invite', joinedAt: JANVIER });

    expect(elireSuccesseur([invite], [])).toEqual({ kind: 'close' });
  });

  it("n'élit pas un invité même écrit ADMINISTRATEUR", () => {
    // L'éligibilité passe AVANT le rang : un rang posé sur une ligne sans
    // compte ne fabrique pas un héritier.
    const inviteAdmin = membre({ userId: null, id: 'p-invite', role: 'admin', joinedAt: JANVIER });
    const inscrit = membre({ userId: 'u-b', joinedAt: MARS });

    expect(elireSuccesseur([inviteAdmin, inscrit], [])).toEqual({
      kind: 'transfer',
      successor: inscrit,
    });
  });
});

describe('resoudreSuccessionDuCreateur — ce qui ne se transmet pas, et ce qui borne', () => {
  it("ferme un DM jamais utilisé plutôt que de le transmettre", async () => {
    // Cette règle vivait dans `delete-for-me.ts` SEUL : `leave.ts` transmettait
    // donc ce que sa jumelle fermait. Elle appartient à la loi.
    const prisma = prismaDouble([membre({ userId: 'u-b', role: 'admin' })], [], {
      directJamaisUtilise: true,
    });

    const issue = await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(issue).toEqual({ kind: 'close' });
    // La loi n'a même pas cherché de candidat : il n'y a rien à transmettre.
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it("interroge le DM jamais utilisé sur le seul état DISTINGUABLE", async () => {
    // `firstMessageSentAt` rendu `null` ne dit pas si le champ est
    // present-et-null ou ABSENT (legacy jamais backfillé) — seul un `count` sur
    // l'état recherché tranche, et il ne matche jamais un champ absent.
    const prisma = prismaDouble([], []);

    await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { id: 'c-1', type: 'direct', firstMessageSentAt: null },
    });
  });

  it('BORNE ses deux lectures, et cadre la trace sur CETTE conversation', async () => {
    // #4165 — aucune lecture ne rend une collection entière. Et sans le cadre
    // en base, la requête ramenait tout l'historique de rang de ces comptes sur
    // TOUS leurs fils pour n'en garder qu'une poignée.
    const prisma = prismaDouble([membre({ userId: 'u-b', role: 'admin' })], []);

    await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: PLAFOND_CANDIDATS })
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PLAFOND_TRACES,
        where: expect.objectContaining({
          context: { path: ['conversationId'], equals: 'c-1' },
        }),
      })
    );
  });

  it("ne compte pas un invité sans compte parmi les administrateurs à tracer", async () => {
    // Une ligne sans `userId` ne peut porter aucune trace : la faire entrer
    // dans le `in` de la requête y glisserait un identifiant vide.
    const prisma = prismaDouble(
      [
        membre({ userId: null, id: 'p-invite', role: 'admin' }),
        membre({ userId: 'u-b', role: 'member' }),
      ],
      []
    );

    const issue = await resoudreSuccessionDuCreateur(prisma as any, {
      conversationId: 'c-1',
      sortantUserId: 'u-a',
    });

    expect(issue).toEqual({
      kind: 'transfer',
      successor: expect.objectContaining({ userId: 'u-b' }),
    });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});
