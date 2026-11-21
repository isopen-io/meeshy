/**
 * « Ajouté à la communauté Y » (#18052) — la personne qu'on fait entrer dans
 * une communauté l'apprend, dans SA langue, et la notification nomme la
 * communauté pour que le tap l'ouvre. Rien d'autre ne part : ni l'effectif, ni
 * la confidentialité, ni qui d'autre en est membre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const log = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => log }, notificationLogger: log };
});

import { announceAddedToCommunity, scheduleCommunityAddedAnnouncement } from '../community-added';
import { findManyIn } from '../../../__tests__/helpers/mongo-where';

const COMMUNITY = '507f1f77bcf86cd799439aaa';
const ACTOR = '507f1f77bcf86cd799439011';
const ANNA = '507f1f77bcf86cd799439021';
const BOB = '507f1f77bcf86cd799439022';

const recipient = (id: string, systemLanguage: string | null, deviceLocale: string | null = null) => ({
  id, systemLanguage, regionalLanguage: null, customDestinationLanguage: null, deviceLocale,
});

function world(options: {
  community?: { name: string } | null;
  actor?: { username: string; displayName: string | null; avatar: string | null } | null;
  recipients?: ReturnType<typeof recipient>[];
  failFor?: string;
} = {}) {
  const community = options.community === undefined ? { name: 'Jardins &amp; Potagers' } : options.community;
  const actor = options.actor === undefined ? { username: 'paul', displayName: 'Paul', avatar: 'https://cdn/p.jpg' } : options.actor;
  const recipients = options.recipients ?? [recipient(ANNA, 'fr'), recipient(BOB, 'en')];
  const prisma = {
    community: { findFirst: jest.fn(async (_args: { where: Record<string, unknown> }) => community) },
    user: {
      findUnique: jest.fn(async () => actor),
      // Les destinataires sont LUS sous la loi « compte vivant », et le double
      // l'ÉVALUE : les lignes sont à la forme NOMINALE de production — ni
      // `deletedAt` ni `deactivatedAt`, qu'aucune création de compte n'écrit
      // (#19799). Répondre depuis la seule liste accepte une égalité nue qui,
      // en base, ne nomme personne.
      findMany: jest.fn(async (args: Record<string, unknown>) =>
        findManyIn(recipients.map((r) => ({ isActive: true, ...r }))).findMany(args)),
    },
  };
  const createNotification = jest.fn(async (params: { userId: string }) => {
    if (params.userId === options.failFor) throw new Error('boom');
    return { id: `n-${params.userId}` };
  });
  return { prisma, createNotification, deps: { prisma: prisma as never, notifications: { createNotification } as never } };
}

type Sent = {
  userId: string; type: string; content: string; lang: string;
  actor: { id: string; displayName: string };
  context: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
const sent = (fn: jest.Mock) => fn.mock.calls.map((call) => call[0] as Sent);

describe('announceAddedToCommunity', () => {
  it('dit à chaque personne ajoutée, dans sa langue, quelle communauté elle a rejointe', async () => {
    const { deps, createNotification } = world();

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA, BOB] });

    expect(count).toBe(2);
    const [anna, bob] = sent(createNotification);
    expect(anna).toMatchObject({
      userId: ANNA,
      type: 'community_invite',
      content: 'Ajouté à la communauté Jardins & Potagers',
      lang: 'fr',
      actor: { id: ACTOR, displayName: 'Paul' },
      context: { communityId: COMMUNITY, communityName: 'Jardins & Potagers' },
      metadata: { action: 'view_community' },
    });
    expect(bob).toMatchObject({ userId: BOB, content: 'Added to the community Jardins & Potagers', lang: 'en' });
  });

  it('descend le prisme au-delà du premier rang (locale appareil)', async () => {
    const { deps, createNotification, prisma } = world({ recipients: [recipient(ANNA, null, 'es')] });

    await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] });

    expect(sent(createNotification)[0]?.content).toBe('Añadido a la comunidad Jardins & Potagers');
    const select = prisma.user.findMany.mock.calls[0]?.[0]?.select;
    expect(select).toMatchObject({ systemLanguage: true, regionalLanguage: true, customDestinationLanguage: true, deviceLocale: true });
  });

  it("ne transporte que l'identité de la communauté et celle de l'acteur", async () => {
    const { deps, createNotification } = world();

    await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] });

    const notice = sent(createNotification)[0];
    expect(Object.keys(notice?.context ?? {}).sort()).toEqual(['communityId', 'communityName']);
    expect(Object.keys(notice?.actor ?? {}).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
  });

  it("ne prévient ni l'acteur lui-même, ni deux fois la même personne", async () => {
    const { deps, createNotification } = world({ recipients: [recipient(ANNA, 'fr'), recipient(ACTOR, 'fr')] });

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA, ANNA, ACTOR] });

    expect(count).toBe(1);
    expect(sent(createNotification).map((n) => n.userId)).toEqual([ANNA]);
  });

  /**
   * Le témoin d'avant assertait la CLAUSE contre sa propre copie
   * (`toMatchObject({ isActive: true, deactivatedAt: null, deletedAt: null })`) :
   * il passait aussi bien avec une clause juste qu'avec une clause qui, en base,
   * ne nomme personne — et c'est ainsi que le défaut #19799 a traversé une suite
   * verte. Il assert désormais le RÉSULTAT, contre des lignes à la forme
   * nominale de production.
   */
  it("prévient un compte vivant dont « pas encore supprimé » n'écrit aucune colonne", async () => {
    const { deps, createNotification } = world({ recipients: [recipient(ANNA, 'fr')] });

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] });

    expect(count).toBe(1);
    expect(sent(createNotification).map((n) => n.userId)).toEqual([ANNA]);
  });

  it.each([
    ['désactivé', { deactivatedAt: new Date('2026-10-01T00:00:00.000Z') }],
    ['supprimé', { deletedAt: new Date('2026-10-01T00:00:00.000Z') }],
    ['inactif', { isActive: false }],
  ])("ne prévient pas un compte %s", async (_etat, mort) => {
    const { deps, createNotification } = world({
      recipients: [{ ...recipient(ANNA, 'fr'), ...mort }, recipient(BOB, 'en')],
    });

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA, BOB] });

    expect(count).toBe(1);
    expect(sent(createNotification).map((n) => n.userId)).toEqual([BOB]);
  });

  it("se tait sur une communauté désactivée ou disparue", async () => {
    const { deps, createNotification, prisma } = world({ community: null });

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] });

    expect(count).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
    expect(prisma.community.findFirst.mock.calls[0]?.[0]?.where)
      .toMatchObject({ id: COMMUNITY, isActive: true });
  });

  it("se tait quand l'acteur n'existe plus", async () => {
    const { deps, createNotification } = world({ actor: null });

    expect(await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] })).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("ne lit rien quand personne n'est à prévenir", async () => {
    const { deps, prisma } = world();

    expect(await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ACTOR] })).toBe(0);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
  });

  it("un échec pour une personne n'empêche pas les autres", async () => {
    const { deps, createNotification } = world({ failFor: ANNA });

    const count = await announceAddedToCommunity(deps, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA, BOB] });

    expect(count).toBe(1);
    expect(sent(createNotification).map((n) => n.userId)).toEqual([ANNA, BOB]);
  });
});

describe('scheduleCommunityAddedAnnouncement', () => {
  it("annonce APRÈS la réponse, et n'en rejette jamais", async () => {
    const { prisma, createNotification } = world({ community: null });
    const deferred: Array<() => Promise<void>> = [];
    prisma.community.findFirst.mockImplementation(async () => { throw new Error('db down'); });

    scheduleCommunityAddedAnnouncement(prisma as never, { communityId: COMMUNITY, actorId: ACTOR, recipientIds: [ANNA] }, {
      notifications: { createNotification } as never,
      afterResponse: (task) => { deferred.push(task); },
    });

    expect(prisma.community.findFirst).not.toHaveBeenCalled();
    await expect(deferred[0]?.()).resolves.toBeUndefined();
  });
});
