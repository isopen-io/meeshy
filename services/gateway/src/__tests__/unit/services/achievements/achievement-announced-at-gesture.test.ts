/**
 * **Un succès obtenu se célèbre au moment du geste** (#5847).
 *
 * Avant ce lot, `CerclesAchievements` et `GlobalAchievements` gravaient la
 * ligne `EngagementMilestone` et s'arrêtaient là : aucune notification, donc
 * aucun toast, donc aucune célébration. Cent quatorze succès composés
 * tombaient en silence, découverts des jours plus tard à l'ouverture de
 * l'écran Progression.
 *
 * Ces témoins fixent les TROIS règles qui rendent l'annonce juste :
 *  1. un palier gravé PAR UN GESTE s'annonce ;
 *  2. un palier gravé PAR LE BALAYAGE ne s'annonce pas — c'est un rattrapage,
 *     le geste est passé, et notifier ferait une rafale à la première
 *     ouverture de l'écran ;
 *  3. quand un même geste franchit plusieurs paliers d'une famille, SEUL LE
 *     PLUS HAUT s'annonce : « 1 000 messages envoyés » subsume « 1 message
 *     envoyé », et trois bannières pour un seul geste ne récompensent rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CERCLES_FAMILIES, familyId } from '@meeshy/shared/types/achievement-families';
import { achievementKey } from '@meeshy/shared/types/achievement-catalog';
import { CerclesAchievements } from '../../../../services/achievements/CerclesAchievements';
import { GlobalAchievements } from '../../../../services/achievements/GlobalAchievements';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

type NotificationArgs = {
  userId: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
};

function makeNotificationService() {
  const createNotification = jest.fn<(args: NotificationArgs) => Promise<unknown>>().mockResolvedValue({});
  mockGetSharedNotificationService.mockReturnValue({ createNotification } as never);
  return createNotification;
}

/** Les paliers déjà gravés — le `create` rend `P2002` pour eux, comme la base. */
function makePrisma(params: {
  dejaGraves?: readonly string[];
  counts?: Record<string, number>;
  /** Membres de la conversation qu'on vient de rejoindre — l'AMPLEUR. */
  tailleConversation?: number;
}) {
  const deja = new Set(params.dejaGraves ?? []);
  const graves: string[] = [];
  const create = jest.fn(async (args: unknown) => {
    const cle = (args as { data: { milestoneKey: string } }).data.milestoneKey;
    if (deja.has(cle)) {
      const err: Error & { code?: string } = new Error('unique');
      err.code = 'P2002';
      throw err;
    }
    deja.add(cle);
    graves.push(cle);
    return {};
  });

  const compteur = (nom: string) => jest.fn().mockResolvedValue(params.counts?.[nom] ?? 0);

  /**
   * `participant.count` répond à DEUX questions et un mock qui ignore son
   * `where` rendrait la même chose aux deux : le VOLUME de conversations
   * rejointes (filtre sur `userId`) et l'AMPLEUR de celle qu'on vient de
   * rejoindre (filtre sur `conversationId`). Les confondre ferait franchir un
   * palier d'ampleur à chaque palier de volume — un témoin vert qui ne mesure
   * rien. Le mock DISCRIMINE donc, comme la base.
   */
  const participantCount = jest.fn(async (args: unknown) => {
    const where = (args as { where?: { conversationId?: string } } | undefined)?.where;
    if (where?.conversationId !== undefined) return params.tailleConversation ?? 0;
    return params.counts?.participant ?? 0;
  });

  const prisma = {
    engagementMilestone: { create },
    participant: { count: participantCount },
    communityMember: { count: compteur('communityMember') },
    community: { count: compteur('community') },
    message: { count: compteur('message') },
    messageAttachment: { count: compteur('messageAttachment') },
    reaction: { count: compteur('reaction') },
    callSession: { count: compteur('callSession'), findMany: jest.fn().mockResolvedValue([]) },
    callParticipant: { count: compteur('callParticipant'), groupBy: jest.fn().mockResolvedValue([]) },
    affiliateRelation: { count: compteur('affiliateRelation') },
    trackingLinkClick: { count: compteur('trackingLinkClick') },
    user: { findUnique: jest.fn().mockResolvedValue({ systemLanguage: 'fr' }) },
  } as unknown as PrismaClient;

  return { prisma, graves };
}

const famille = (id: string) => {
  const f = CERCLES_FAMILIES.find((c) => familyId(c) === id);
  if (!f) throw new Error(`famille absente du catalogue : ${id}`);
  return f;
};

describe("l'annonce d'un succès", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('part au moment du GESTE, avec la clé composée du palier franchi', async () => {
    const createNotification = makeNotificationService();
    // Dixième conversation rejointe, et elle ne compte que trois membres : le
    // palier de VOLUME `count:10` est franchi, celui d'AMPLEUR ne l'est pas.
    // Le `count:1` l'était déjà.
    const { prisma } = makePrisma({
      counts: { participant: 10 },
      tailleConversation: 3,
      dejaGraves: [achievementKey(famille('conversation.join.count'), 1)],
    });

    await new CerclesAchievements(prisma).recordEvent({
      kind: 'conversation.join',
      userId: 'u1',
      conversationId: 'c1',
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const args = createNotification.mock.calls[0][0];
    expect(args.userId).toBe('u1');
    expect(args.type).toBe('achievement_unlocked');
    expect(args.metadata?.achievementKey).toBe(
      achievementKey(famille('conversation.join.count'), 10),
    );
    // Le MOT, jamais la clé — la leçon du `first_content` servi tel quel.
    expect(args.content).toContain('10');
    expect(args.content).not.toContain('achievement.');
  });

  it("ne part PAS quand c'est le balayage qui grave — le geste est passé", async () => {
    const createNotification = makeNotificationService();
    const { prisma, graves } = makePrisma({ counts: { message: 1000 } });

    await new GlobalAchievements(prisma).sweep('u1');

    // Le balayage a bien fait son travail…
    expect(graves.length).toBeGreaterThan(0);
    // …et n'a réveillé personne.
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("n'annonce que le PLUS HAUT palier quand un geste en franchit plusieurs", async () => {
    const createNotification = makeNotificationService();
    // Premier geste d'un compte qui a déjà 1 000 messages en base (rattrapage) :
    // les paliers 1, 10, 100 et 1 000 se gravent d'un coup.
    const { prisma, graves } = makePrisma({ counts: { message: 1000 } });

    await new GlobalAchievements(prisma).recordEvent({ kind: 'message.send', userId: 'u1' });

    expect(graves).toHaveLength(4);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0].metadata?.achievementKey).toContain(':1000');
  });

  it("annonce DEUX succès quand un geste franchit deux FAMILLES — ce sont deux faits", async () => {
    const createNotification = makeNotificationService();
    // Dixième conversation rejointe, ET elle compte dix membres : le volume et
    // l'ampleur franchissent chacun leur palier. Ce sont deux succès distincts,
    // pas un doublon — les taire en garderait un pour soi. La rafale se
    // gouverne à l'AFFICHAGE (le client célèbre l'un après l'autre), jamais en
    // perdant un fait acquis.
    const { prisma } = makePrisma({ counts: { participant: 10 }, tailleConversation: 10 });

    await new CerclesAchievements(prisma).recordEvent({
      kind: 'conversation.join',
      userId: 'u1',
      conversationId: 'c1',
    });

    const cles = createNotification.mock.calls.map((c) => c[0].metadata?.achievementKey);
    expect(cles).toHaveLength(2);
    expect(new Set(cles)).toEqual(
      new Set([
        achievementKey(famille('conversation.join.count'), 10),
        achievementKey(famille('conversation.join.size'), 10),
      ]),
    );
  });

  it('reste MUETTE quand aucun palier neuf ne se grave', async () => {
    const createNotification = makeNotificationService();
    const { prisma } = makePrisma({
      counts: { message: 1 },
      dejaGraves: [
        achievementKey(
          { section: 'parole', subject: 'message', verb: 'send', scale: 'count', baseDifficulty: 0 },
          1,
        ),
      ],
    });

    await new GlobalAchievements(prisma).recordEvent({ kind: 'message.send', userId: 'u1' });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("ne fait pas échouer le geste métier quand la notification tombe", async () => {
    mockGetSharedNotificationService.mockReturnValue({
      createNotification: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('SMTP down')),
    } as never);
    const { prisma, graves } = makePrisma({ counts: { participant: 1 } });

    await expect(
      new CerclesAchievements(prisma).recordEvent({
        kind: 'conversation.join',
        userId: 'u1',
        conversationId: 'c1',
      }),
    ).resolves.toBeUndefined();

    // Le palier reste ACQUIS — c'est la ligne qui fait foi, pas la bannière.
    expect(graves.length).toBeGreaterThan(0);
  });
});
