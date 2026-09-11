/**
 * #6091 — **rouvrir les lignes DÉJÀ écrites par un lien, sans ouvrir plus que
 * ce que le lien implique.**
 *
 * `link-admission.ts` inventait `canSendVideos: false, canSendAudios: false`
 * sans jamais consulter le lien de partage. Les deux portes d'entrée sont
 * corrigées ; ce module rouvre les lignes `Participant` déjà écrites par
 * l'une d'elles. Patron de
 * `unit/services/named-member-rights-backfill.test.ts` (#6080).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  targetMediaRightsFor,
  currentMediaRights,
  mediaRightsOpeningFor,
  backfillLinkAdmissionMediaRights,
  LINK_ADMISSION_MEDIA_RIGHTS_CANDIDATE_WHERE,
} from '../../../services/conversations/linkAdmissionMediaRightsBackfill';

describe('targetMediaRightsFor', () => {
  it('anonyme : `canSendVideos` suit `allowAnonymousFiles`, `canSendAudios` suit `allowAnonymousMessages`', () => {
    expect(targetMediaRightsFor('anonymous', { allowAnonymousFiles: true, allowAnonymousMessages: true }))
      .toEqual({ canSendVideos: true, canSendAudios: true });
    expect(targetMediaRightsFor('anonymous', { allowAnonymousFiles: false, allowAnonymousMessages: false }))
      .toEqual({ canSendVideos: false, canSendAudios: false });
  });

  it('anonyme : les deux droits varient INDÉPENDAMMENT l\'un de l\'autre', () => {
    expect(targetMediaRightsFor('anonymous', { allowAnonymousFiles: false, allowAnonymousMessages: true }))
      .toEqual({ canSendVideos: false, canSendAudios: true });
    expect(targetMediaRightsFor('anonymous', { allowAnonymousFiles: true, allowAnonymousMessages: false }))
      .toEqual({ canSendVideos: true, canSendAudios: false });
  });

  it('nommé : toujours ouvert — un membre à part entière, quel que soit le lien', () => {
    expect(targetMediaRightsFor('user', { allowAnonymousFiles: false, allowAnonymousMessages: false }))
      .toEqual({ canSendVideos: true, canSendAudios: true });
  });
});

describe('currentMediaRights', () => {
  it('sans surcharge, lit l\'instantané tel quel', () => {
    expect(currentMediaRights({ canSendVideos: false, canSendAudios: true })).toEqual({
      canSendVideos: false, canSendAudios: true,
    });
  });

  it('une surcharge d\'hôte déjà posée l\'emporte, droit par droit', () => {
    expect(currentMediaRights({ canSendVideos: false, canSendAudios: false }, { canSendVideos: true })).toEqual({
      canSendVideos: true, canSendAudios: false,
    });
  });

  it('une surcharge `null` ou absente n\'est pas une réponse — `??` distinguerait l\'abstention', () => {
    expect(currentMediaRights({ canSendVideos: true, canSendAudios: false }, null)).toEqual({
      canSendVideos: true, canSendAudios: false,
    });
    expect(currentMediaRights({ canSendVideos: true, canSendAudios: false }, { canSendVideos: null })).toEqual({
      canSendVideos: true, canSendAudios: false,
    });
  });
});

describe('mediaRightsOpeningFor', () => {
  it('n\'ouvre que le droit que la cible ferme et que l\'instantané fermait — jamais plus', () => {
    expect(mediaRightsOpeningFor({ canSendVideos: false, canSendAudios: false }, { canSendVideos: true, canSendAudios: false }))
      .toEqual({ canSendVideos: true });
  });

  it('rien à ouvrir : cible et instantané déjà alignés, ouverts ou fermés', () => {
    expect(mediaRightsOpeningFor({ canSendVideos: true, canSendAudios: true }, { canSendVideos: true, canSendAudios: true }))
      .toEqual({});
    expect(mediaRightsOpeningFor({ canSendVideos: false, canSendAudios: false }, { canSendVideos: false, canSendAudios: false }))
      .toEqual({});
  });

  it('les deux droits s\'ouvrent ensemble quand la cible le permet', () => {
    expect(mediaRightsOpeningFor({ canSendVideos: false, canSendAudios: false }, { canSendVideos: true, canSendAudios: true }))
      .toEqual({ canSendVideos: true, canSendAudios: true });
  });
});

// ─── backfillLinkAdmissionMediaRights — double Prisma, patron du backfill #6080 ─

function prismaDouble(rows: Array<Record<string, unknown>>, links: Array<Record<string, unknown>>) {
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
    conversationShareLink: {
      findMany: jest.fn<any>(async (args: any) => links.filter((l) => (args?.where?.id?.in ?? []).includes(l.id))),
    },
  };
}

const ligneAnonyme = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'anonymous',
  shareLinkId: 'lnk1',
  permissions: { canSendVideos: false, canSendAudios: false, canSendFiles: false, canSendImages: true },
  anonymousSession: { shareLinkId: 'lnk1', session: {}, profile: {}, rights: null },
  ...extra,
});

const ligneNommee = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'user',
  shareLinkId: 'lnk1',
  permissions: { canSendVideos: false, canSendAudios: false, canSendFiles: true, canSendImages: true },
  anonymousSession: null,
  ...extra,
});

const lienPermissif = { id: 'lnk1', allowAnonymousFiles: true, allowAnonymousMessages: true };
const lienRestrictif = { id: 'lnk1', allowAnonymousFiles: false, allowAnonymousMessages: false };

describe('backfillLinkAdmissionMediaRights', () => {
  it('à blanc par défaut : il COMPTE et n\'écrit rien', async () => {
    const prisma = prismaDouble([ligneAnonyme('a')], [lienPermissif]);

    const rapport = await backfillLinkAdmissionMediaRights(prisma as never);

    expect(rapport.reopenable).toBe(1);
    expect(rapport.reopened).toBe(0);
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('anonyme, lien permissif : ouvre via le DELTA `anonymousSession.rights`, ne touche jamais `permissions`', async () => {
    const prisma = prismaDouble([ligneAnonyme('a')], [lienPermissif]);

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    expect(ecrit.where).toEqual({ id: 'a' });
    expect(ecrit.data.permissions).toBeUndefined();
    expect(ecrit.data.anonymousSession.rights).toEqual({ canSendVideos: true, canSendAudios: true });
  });

  it('anonyme, lien restrictif : rien à ouvrir — le refus est celui du lien, pas un bug', async () => {
    const prisma = prismaDouble([ligneAnonyme('a')], [lienRestrictif]);

    const rapport = await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    expect(rapport.reopenable).toBe(0);
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('anonyme, lien qui n\'ouvre qu\'un des deux : seul CE droit s\'ouvre', async () => {
    const prisma = prismaDouble(
      [ligneAnonyme('a')],
      [{ id: 'lnk1', allowAnonymousFiles: false, allowAnonymousMessages: true }],
    );

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    expect(ecrit.data.anonymousSession.rights).toEqual({ canSendAudios: true });
  });

  it('nommé : ouvre via `permissions` directement — `PATCH …/rights` lui est fermé (PARTICIPANT_HAS_ACCOUNT)', async () => {
    const prisma = prismaDouble([ligneNommee('b')], [lienRestrictif]);

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    expect(ecrit.data.anonymousSession).toBeUndefined();
    expect(ecrit.data.permissions.canSendVideos).toBe(true);
    expect(ecrit.data.permissions.canSendAudios).toBe(true);
    // `canSendFiles`/`canSendImages` recopiés tels quels — jamais touchés.
    expect(ecrit.data.permissions.canSendFiles).toBe(true);
    expect(ecrit.data.permissions.canSendImages).toBe(true);
  });

  it('préserve une surcharge d\'hôte déjà posée sur un AUTRE droit', async () => {
    const prisma = prismaDouble(
      [ligneAnonyme('a', {
        anonymousSession: { shareLinkId: 'lnk1', session: {}, profile: {}, rights: { canSendMessages: false } },
      })],
      [lienPermissif],
    );

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    expect(ecrit.data.anonymousSession.rights).toEqual({
      canSendMessages: false, canSendVideos: true, canSendAudios: true,
    });
  });

  it('un droit DÉJÀ ouvert par surcharge d\'hôte n\'est pas réécrit', async () => {
    const prisma = prismaDouble(
      [ligneAnonyme('a', {
        anonymousSession: { shareLinkId: 'lnk1', session: {}, profile: {}, rights: { canSendVideos: true } },
      })],
      [lienPermissif],
    );

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    const ecrit = (prisma.participant.update.mock.calls[0] as any[])[0];
    // Seul `canSendAudios` manquait encore.
    expect(ecrit.data.anonymousSession.rights).toEqual({ canSendVideos: true, canSendAudios: true });
  });

  it('lien introuvable (supprimé) : ligne ignorée, aucune écriture', async () => {
    const prisma = prismaDouble([ligneAnonyme('a', { shareLinkId: 'lnk-disparu' })], []);

    const rapport = await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    expect(rapport.scanned).toBe(1);
    expect(rapport.reopenable).toBe(0);
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('récapitule PAR DROIT et PAR LIEN', async () => {
    const prisma = prismaDouble([ligneAnonyme('a'), ligneNommee('b')], [lienPermissif]);

    const rapport = await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    expect(rapport.byRight).toEqual({ canSendVideos: 2, canSendAudios: 2 });
    expect(rapport.byLink).toEqual({ lnk1: 2 });
  });

  it('pagine — une page pleine en appelle une suivante', async () => {
    const prisma = prismaDouble(
      [ligneAnonyme('a'), ligneAnonyme('b'), ligneAnonyme('c')],
      [lienPermissif],
    );

    const rapport = await backfillLinkAdmissionMediaRights(prisma as never, { batchSize: 2 });

    expect(prisma.participant.findMany.mock.calls.length).toBeGreaterThan(1);
    expect(rapport.scanned).toBe(3);
    expect(rapport.reopenable).toBe(3);
  });

  it('ne balaie pas toute la collection : le `where` exige `shareLinkId` et au moins un droit fermé', async () => {
    const prisma = prismaDouble([ligneAnonyme('a')], [lienPermissif]);

    await backfillLinkAdmissionMediaRights(prisma as never);

    expect(prisma.wheres[0]).toEqual(LINK_ADMISSION_MEDIA_RIGHTS_CANDIDATE_WHERE);
  });

  it('interroge le lien par PAGE, jamais par ligne', async () => {
    const prisma = prismaDouble([ligneAnonyme('a'), ligneAnonyme('b')], [lienPermissif]);

    await backfillLinkAdmissionMediaRights(prisma as never, { apply: true });

    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledTimes(1);
  });

  it('`onReopen` est appelé pour chaque ligne ouverte, même à blanc', async () => {
    const onReopen = jest.fn<any>();
    const prisma = prismaDouble([ligneAnonyme('a'), ligneNommee('b')], [lienPermissif]);

    await backfillLinkAdmissionMediaRights(prisma as never, { onReopen });

    expect(onReopen).toHaveBeenCalledTimes(2);
    expect(onReopen).toHaveBeenCalledWith({ participantId: 'a', shareLinkId: 'lnk1' });
    expect(onReopen).toHaveBeenCalledWith({ participantId: 'b', shareLinkId: 'lnk1' });
  });
});
