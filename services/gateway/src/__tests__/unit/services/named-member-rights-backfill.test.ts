/**
 * #6080 — **rouvrir les lignes DÉJÀ écrites, sans effacer une restriction
 * voulue.**
 *
 * Les trois portes de création écrivent désormais la table du site unique, mais
 * une table n'est pas rétroactive : les `Participant` nés avant le correctif
 * gardent `canSendVideos: false, canSendAudios: false`. Le rattrapage les
 * reconnaît par la SIGNATURE EXACTE de la table héritée — c'est la seule façon
 * de distinguer « né fermé » d'« explicitement restreint par un hôte ».
 *
 * Les témoins NÉGATIFS portent tout le poids : un prédicat qui rendrait `true`
 * partout rouvrirait aussi ce qu'un hôte a fermé, et le témoin positif seul ne
 * le verrait pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  wasBornWithClosedMemberTable,
  INHERITED_CLOSED_MEMBER_PERMISSIONS,
  PARTICIPANT_SEND_RIGHT_NAMES,
  NEW_MEMBER_PERMISSIONS,
} from '../../../services/participantRights';
import { backfillNamedMemberAttachmentRights } from '../../../services/conversations/namedMemberRightsBackfill';

const HERITEE = { ...INHERITED_CLOSED_MEMBER_PERMISSIONS };

describe('wasBornWithClosedMemberTable — la signature de la table héritée', () => {
  it('reconnaît la signature exacte, sur un membre nommé sans lien ni session anonyme', () => {
    expect(wasBornWithClosedMemberTable({ permissions: HERITEE })).toBe(true);
  });

  it('la reconnaît quel que soit `canViewHistory` — les trois portes ne l\'écrivaient pas', () => {
    expect(wasBornWithClosedMemberTable({ permissions: { ...HERITEE, canViewHistory: true } })).toBe(true);
    expect(wasBornWithClosedMemberTable({ permissions: { ...HERITEE, canViewHistory: false } })).toBe(true);
  });

  // Le témoin qui interdit d'assouplir le prédicat : CHAQUE droit compte, y
  // compris ceux qui valent déjà `true`. Un hôte qui a retiré `canSendImages`
  // produit une table proche à un champ près — la rouvrir effacerait sa
  // décision.
  it.each(PARTICIPANT_SEND_RIGHT_NAMES)('refuse dès que `%s` diffère — une restriction d\'hôte est préservée', (droit) => {
    const modifiee = { ...HERITEE, [droit]: !HERITEE[droit] };

    expect(wasBornWithClosedMemberTable({ permissions: modifiee })).toBe(false);
  });

  it('refuse un droit ABSENT de la table — la signature est une correspondance, pas un sous-ensemble', () => {
    const { canSendLinks: _absent, ...incomplete } = HERITEE;

    expect(wasBornWithClosedMemberTable({ permissions: incomplete })).toBe(false);
  });

  it('refuse un participant ANONYME — ses droits viennent du lien qu\'il a suivi', () => {
    expect(
      wasBornWithClosedMemberTable({ permissions: HERITEE, anonymousSession: { rights: null } })
    ).toBe(false);
  });

  it('refuse un INSCRIT entré par un LIEN — même table, mais c\'est la décision du lien', () => {
    // `link-admission.ts` écrit pour un inscrit une table de même forme, SANS
    // session anonyme : le `shareLinkId` est le seul discriminant. Sans lui, le
    // rattrapage rouvrirait des membres qu'un hôte a délibérément bornés.
    expect(
      wasBornWithClosedMemberTable({ permissions: HERITEE, shareLinkId: 'mshy_lnk' })
    ).toBe(false);
  });

  it('refuse une ligne sans table du tout', () => {
    expect(wasBornWithClosedMemberTable({})).toBe(false);
    expect(wasBornWithClosedMemberTable({ permissions: null })).toBe(false);
  });

  it('refuse la table OUVERTE — le rattrapage ne repasse pas sur ce qu\'il a déjà fait', () => {
    expect(wasBornWithClosedMemberTable({ permissions: { ...NEW_MEMBER_PERMISSIONS } })).toBe(false);
  });
});

const ligne = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: 'conv1',
  permissions: { ...HERITEE, canViewHistory: true },
  anonymousSession: null,
  shareLinkId: null,
  ...extra,
});

function prismaDouble(rows: Array<Record<string, unknown>>) {
  const wheres: unknown[] = [];
  return {
    wheres,
    participant: {
      findMany: jest.fn<any>(async (args: any) => {
        wheres.push(args?.where);
        const apres = args?.cursor ? rows.findIndex((r) => r.id === args.cursor.id) + (args.skip ?? 0) : 0;
        return rows.slice(apres, apres + (args?.take ?? rows.length));
      }),
      update: jest.fn<any>(async (args: any) => ({ id: args.where.id })),
    },
  };
}

describe('backfillNamedMemberAttachmentRights', () => {
  it('à blanc par défaut : il COMPTE et n\'écrit rien', async () => {
    const prisma = prismaDouble([ligne('a'), ligne('b')]);

    const rapport = await backfillNamedMemberAttachmentRights(prisma as never);

    expect(rapport.reopenable).toBe(2);
    expect(rapport.reopened).toBe(0);
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('avec `apply`, écrit la table du site unique', async () => {
    const prisma = prismaDouble([ligne('a')]);

    const rapport = await backfillNamedMemberAttachmentRights(prisma as never, { apply: true });

    expect(rapport.reopened).toBe(1);
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    expect(ecrit.where).toEqual({ id: 'a' });
    expect(ecrit.data.permissions.canSendVideos).toBe(true);
    expect(ecrit.data.permissions.canSendAudios).toBe(true);
  });

  it('PRÉSERVE `canViewHistory` de la ligne — le rattrapage rouvre l\'ÉMISSION, pas la lecture', async () => {
    // Écrire `NEW_MEMBER_PERMISSIONS` tel quel poserait `canViewHistory: false`
    // sur des lignes qui voient l'historique aujourd'hui : leur plancher
    // passerait de `null` à `joinedAt`, et pour une ligne migrée d'une
    // `ConversationMember` ancienne, ce plancher masque du contenu RÉEL.
    const prisma = prismaDouble([
      ligne('ouvert', { permissions: { ...HERITEE, canViewHistory: true } }),
      ligne('ferme', { permissions: { ...HERITEE, canViewHistory: false } }),
    ]);

    await backfillNamedMemberAttachmentRights(prisma as never, { apply: true });

    const ecrits = (prisma.participant.update.mock.calls as any[][]).map((c) => c[0]);
    expect(ecrits[0].data.permissions.canViewHistory).toBe(true);
    expect(ecrits[1].data.permissions.canViewHistory).toBe(false);
  });

  it('laisse intacte une ligne restreinte par un hôte, une ligne anonyme et une entrée par lien', async () => {
    const prisma = prismaDouble([
      ligne('restreinte', { permissions: { ...HERITEE, canSendImages: false } }),
      ligne('anonyme', { anonymousSession: { rights: null } }),
      ligne('par-lien', { shareLinkId: 'mshy_lnk' }),
      ligne('née-fermée'),
    ]);

    const rapport = await backfillNamedMemberAttachmentRights(prisma as never, { apply: true });

    expect(rapport.scanned).toBe(4);
    expect(rapport.reopened).toBe(1);
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    expect((prisma.participant.update.mock.calls[0] as any[])[0].where.id).toBe('née-fermée');
  });

  it('ne balaie pas toute la collection : le `where` nomme les deux droits fermés', async () => {
    // Un rattrapage qui lirait TOUTE la table `Participant` sur la base de
    // production coûterait bien plus que ce qu'il corrige — et le jour où
    // quelqu'un retirerait ce filtre, aucun témoin fonctionnel ne rougirait.
    const prisma = prismaDouble([ligne('a')]);

    await backfillNamedMemberAttachmentRights(prisma as never);

    expect(prisma.wheres[0]).toEqual({
      permissions: { is: { canSendVideos: { equals: false }, canSendAudios: { equals: false } } },
    });
  });

  it('pagine — une page pleine en appelle une suivante', async () => {
    const prisma = prismaDouble([ligne('a'), ligne('b'), ligne('c')]);

    const rapport = await backfillNamedMemberAttachmentRights(prisma as never, { batchSize: 2 });

    expect(prisma.participant.findMany.mock.calls.length).toBeGreaterThan(1);
    expect(rapport.scanned).toBe(3);
    expect(rapport.reopenable).toBe(3);
  });
});
