/**
 * Ce qu'un post a rapporté à son lecteur (#9569) — le cumul SUIT le crédit.
 *
 * Les témoins passent par l'API publique (`EngagementService.recordActivity`,
 * `reclaimContent`) sur une base EN MÉMOIRE qui applique les contraintes
 * uniques comme Mongo : un plafond se prouve en rejouant le geste, une reprise
 * en la demandant, et la valeur attendue se lit dans ce qui a été RÉELLEMENT
 * crédité au compteur (`EngagementCounter.points`), jamais dans un nombre
 * recopié du barème.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { loadViewerPostPoints } from '../../../../services/engagement/viewerPostPoints';
import { purgePostPoints } from '../../../../services/engagement/PostPointsRecorder';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const READER = '68a000000000000000000011';
const AUTHOR = '68a000000000000000000012';
const OTHER_READER = '68a000000000000000000013';
const POST = '68c000000000000000000001';
const postId = (n: number) => `68c0000000000000000001${String(n).padStart(2, '0')}`;

type Emission = { readonly room: string | string[]; readonly event: string; readonly payload: unknown };

function setup(options: { readonly emitFails?: boolean } = {}) {
  const db = fakeGameDb();
  for (const id of [READER, AUTHOR, OTHER_READER]) {
    seedUser(db, { emailVerifiedAt: new Date('2026-01-01T00:00:00Z') }, id);
  }
  const emissions: Emission[] = [];
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        if (options.emitFails) throw new Error('adapter down');
        emissions.push({ room, event, payload });
      },
    }),
  };
  const service = new EngagementService(db.prisma, {
    scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE },
    emitIO: () => io as never,
  });
  return { db, service, emissions };
}

/** Ce que le barème a RÉELLEMENT crédité à `userId`, tous axes confondus (ou sur `axes`). */
const credited = (db: FakeGameDb, userId: string, axes?: readonly EngagementOperationKey[]): number =>
  db.engagementCounter.rows
    .filter((row) => row.userId === userId && (!axes || axes.includes(row.axisKey as EngagementOperationKey)))
    .reduce((sum, row) => sum + (row.points as number), 0);

const pointsOf = async (db: FakeGameDb, viewerId: string, id: string, authorId: string = AUTHOR): Promise<number | undefined> =>
  (await loadViewerPostPoints(db.prisma, viewerId, [{ id, authorId }])).get(id);

const postUpdates = (emissions: readonly Emission[]) =>
  emissions.filter((emission) => emission.event === SERVER_EVENTS.ENGAGEMENT_POST_UPDATED);

const onPost = (id: string = POST) => ({ postId: id, targetId: id, targetOwnerId: AUTHOR });

describe('un geste crédité sur un post', () => {
  it('ajoute ses points à ce que le post a rapporté au lecteur', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());

    expect(credited(db, READER)).toBeGreaterThan(0);
    expect(await pointsOf(db, READER, POST)).toBe(credited(db, READER));
  });

  it('s’additionne aux gestes précédents du même lecteur sur le même post', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());
    await service.recordActivity(READER, 'comment.text', { postId: POST });
    await service.recordActivity(READER, 'tool.post_bookmark', onPost());

    expect(credited(db, READER, ['tool.post_reaction', 'comment.text', 'tool.post_bookmark'])).toBe(credited(db, READER));
    expect(await pointsOf(db, READER, POST)).toBe(credited(db, READER));
  });

  it('ne rapporte qu’au post où il a eu lieu', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost(postId(1)));
    await service.recordActivity(READER, 'comment.text', { postId: postId(2) });

    expect(await pointsOf(db, READER, postId(1))).toBe(credited(db, READER, ['tool.post_reaction']));
    expect(await pointsOf(db, READER, postId(2))).toBe(credited(db, READER, ['comment.text']));
  });

  it('annonce la nouvelle valeur au crédité SEUL, dans sa room personnelle', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());

    expect(postUpdates(emissions)).toEqual([
      {
        room: ROOMS.user(READER),
        event: 'engagement:post-updated',
        payload: { postId: POST, viewerPoints: credited(db, READER) },
      },
    ]);
  });

  it('annonce la valeur ABSOLUE après chaque geste, jamais un écart', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());
    const first = credited(db, READER);
    await service.recordActivity(READER, 'comment.text', { postId: POST });

    expect(postUpdates(emissions).map((emission) => emission.payload)).toEqual([
      { postId: POST, viewerPoints: first },
      { postId: POST, viewerPoints: credited(db, READER) },
    ]);
  });
});

describe('un crédit refusé n’ajoute rien', () => {
  it('au-delà du plafond du jour, le geste ne rapporte rien au post et rien n’est annoncé', async () => {
    const { db, service, emissions } = setup();
    const cap = DEFAULT_ENGAGEMENT_SCALE.operations['tool.post_bookmark'].cap as number;

    for (let n = 0; n < cap; n += 1) {
      await service.recordActivity(READER, 'tool.post_bookmark', onPost(postId(n)));
    }
    const atCap = credited(db, READER);
    await service.recordActivity(READER, 'tool.post_bookmark', onPost());

    expect(credited(db, READER)).toBe(atCap);
    expect(await pointsOf(db, READER, POST)).toBe(0);
    expect(postUpdates(emissions).map((emission) => (emission.payload as { postId: string }).postId)).not.toContain(POST);
  });

  it('un geste sur son propre post ne rapporte rien', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(AUTHOR, 'tool.post_reaction', onPost());

    expect(await pointsOf(db, AUTHOR, POST)).toBe(0);
    expect(db.engagementPostPoints.rows).toEqual([]);
    expect(postUpdates(emissions)).toEqual([]);
  });

  it('une publication que le barème paie zéro n’écrit ni n’annonce rien — le nombre ne roule que s’il change', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(AUTHOR, 'content.post', { postId: POST, targetId: POST, variant: 'other' });

    expect(credited(db, AUTHOR)).toBe(0);
    expect(db.engagementPostPoints.rows).toEqual([]);
    expect(postUpdates(emissions)).toEqual([]);
  });

  it('un geste qui ne nomme aucun post n’écrit ni n’annonce rien de post', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(READER, 'tool.translation_request');

    expect(credited(db, READER)).toBeGreaterThan(0);
    expect(db.engagementPostPoints.rows).toEqual([]);
    expect(postUpdates(emissions)).toEqual([]);
  });
});

describe('le crédit de publication', () => {
  const publish = (service: EngagementService, variant: string, id: string = POST) =>
    service.recordActivity(AUTHOR, 'content.post', { postId: id, targetId: id, variant });

  it('d’un contenu lourd est rendu à son auteur, depuis sa mémoire par contenu', async () => {
    const { db, service, emissions } = setup();

    await publish(service, 'public');

    const publication = credited(db, AUTHOR, ['content.post']);
    expect(publication).toBeGreaterThanOrEqual(DEFAULT_ENGAGEMENT_SCALE.abuse.heavyPoints);
    expect(await pointsOf(db, AUTHOR, POST)).toBe(publication);
    expect(postUpdates(emissions)).toEqual([
      { room: ROOMS.user(AUTHOR), event: 'engagement:post-updated', payload: { postId: POST, viewerPoints: publication } },
    ]);
  });

  it('d’un contenu lourd ne s’écrit pas une seconde fois dans le cumul', async () => {
    const { db, service } = setup();

    await publish(service, 'public');

    expect(db.engagementPostPoints.rows).toEqual([]);
  });

  it('s’additionne aux autres crédits de la publication sans double compte', async () => {
    const { db, service } = setup();

    await publish(service, 'public');
    await service.recordActivity(AUTHOR, 'tool.direct_publish', { postId: POST, targetId: POST });

    expect(credited(db, AUTHOR, ['content.post', 'tool.direct_publish'])).toBe(credited(db, AUTHOR));
    expect(await pointsOf(db, AUTHOR, POST)).toBe(credited(db, AUTHOR));
  });

  it('qui n’est pas un contenu lourd — donc sans mémoire de reprise — entre dans le cumul', async () => {
    const { db, service } = setup();

    await publish(service, 'friends');

    const publication = credited(db, AUTHOR, ['content.post']);
    expect(publication).toBeGreaterThan(0);
    expect(publication).toBeLessThan(DEFAULT_ENGAGEMENT_SCALE.abuse.heavyPoints);
    expect(await pointsOf(db, AUTHOR, POST)).toBe(publication);
  });

  it('n’est rendu qu’à l’auteur', async () => {
    const { db, service } = setup();

    await publish(service, 'public');

    expect(await pointsOf(db, READER, POST)).toBe(0);
  });

  it('repris à la suppression est retiré de ce que le post a rapporté', async () => {
    const { db, service } = setup();
    await publish(service, 'public');
    await service.recordActivity(AUTHOR, 'tool.direct_publish', { postId: POST, targetId: POST });
    const publication = credited(db, AUTHOR, ['content.post']);
    const before = await pointsOf(db, AUTHOR, POST);

    const reclaimed = await service.reclaimContent(AUTHOR, 'content.post', POST);

    expect(reclaimed).toBe(publication);
    expect(await pointsOf(db, AUTHOR, POST)).toBe((before as number) - publication);
  });
});

describe('un post publié avant ce lot', () => {
  const LEGACY_POINTS = 99;
  const seedLegacyPublication = (db: FakeGameDb) =>
    db.engagementQuota.rows.push({
      id: 'legacy-quota',
      userId: AUTHOR,
      operationKey: 'content.post',
      bucket: `content:${POST}`,
      count: 1,
      points: LEGACY_POINTS,
      createdAt: new Date('2026-09-30T10:00:00Z'),
      updatedAt: new Date('2026-09-30T10:00:00Z'),
    });

  it('rend à son auteur le crédit de sa publication, sans aucune ligne de cumul', async () => {
    const { db } = setup();
    seedLegacyPublication(db);

    expect(db.engagementPostPoints.rows).toEqual([]);
    expect(await pointsOf(db, AUTHOR, POST)).toBe(LEGACY_POINTS);
  });

  it('ne compte pas sa publication deux fois une fois le cumul amorcé par un geste', async () => {
    const { db, service } = setup();
    seedLegacyPublication(db);

    await service.recordActivity(AUTHOR, 'comment.text', { postId: POST });

    const comment = credited(db, AUTHOR, ['comment.text']);
    expect(comment).toBeGreaterThan(0);
    expect(db.engagementPostPoints.rows).toHaveLength(1);
    expect(await pointsOf(db, AUTHOR, POST)).toBe(LEGACY_POINTS + comment);
  });

  it('annonce à son auteur publication ET geste, en une valeur', async () => {
    const { db, service, emissions } = setup();
    seedLegacyPublication(db);

    await service.recordActivity(AUTHOR, 'comment.text', { postId: POST });

    expect(postUpdates(emissions).map((emission) => emission.payload)).toEqual([
      { postId: POST, viewerPoints: LEGACY_POINTS + credited(db, AUTHOR, ['comment.text']) },
    ]);
  });
});

describe('les points d’un autre', () => {
  it('ne sont jamais ceux du lecteur', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());
    await service.recordActivity(READER, 'comment.text', { postId: POST });

    expect(await pointsOf(db, READER, POST)).toBeGreaterThan(0);
    expect(await pointsOf(db, OTHER_READER, POST)).toBe(0);
  });

  it('ne sont annoncés qu’à celui qui les a gagnés', async () => {
    const { service, emissions } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', onPost());
    await service.recordActivity(OTHER_READER, 'tool.post_bookmark', onPost());

    expect(postUpdates(emissions).map((emission) => emission.room)).toEqual([ROOMS.user(READER), ROOMS.user(OTHER_READER)]);
  });
});

describe('un cumul qui ne s’écrit pas', () => {
  it('ne défait pas le crédit, ne fait pas échouer le geste, et n’annonce rien', async () => {
    const { db, service, emissions } = setup();
    db.engagementPostPoints.upsert = async () => {
      throw new Error('mongo down');
    };

    await expect(service.recordActivity(READER, 'tool.post_reaction', onPost())).resolves.toBeUndefined();

    expect(credited(db, READER)).toBeGreaterThan(0);
    expect(postUpdates(emissions)).toEqual([]);
  });
});

describe('une annonce qui ne part pas', () => {
  it('ne défait ni le crédit ni le cumul, et ne fait pas échouer le geste', async () => {
    const { db, service } = setup({ emitFails: true });

    await expect(service.recordActivity(READER, 'tool.post_reaction', onPost())).resolves.toBeUndefined();

    expect(await pointsOf(db, READER, POST)).toBe(credited(db, READER));
    expect(credited(db, READER)).toBeGreaterThan(0);
  });
});

describe('un post qui disparaît', () => {
  it('emporte ce qu’il a rapporté à chacun de ses lecteurs, et rien d’autre', async () => {
    const { db, service } = setup();
    await service.recordActivity(READER, 'tool.post_reaction', onPost(postId(1)));
    await service.recordActivity(OTHER_READER, 'tool.post_bookmark', onPost(postId(1)));
    await service.recordActivity(READER, 'comment.text', { postId: postId(2) });
    const kept = await pointsOf(db, READER, postId(2));

    expect(await purgePostPoints(db.prisma, [postId(1)])).toBe(2);

    expect(db.engagementPostPoints.rows.map((row) => row.postId)).toEqual([postId(2)]);
    expect(await pointsOf(db, READER, postId(1))).toBe(0);
    expect(await pointsOf(db, READER, postId(2))).toBe(kept);
  });

  it('ne pose aucune question pour une liste vide', async () => {
    const { db } = setup();
    db.engagementPostPoints.deleteMany = async () => {
      throw new Error('aucune requête ne devait partir');
    };

    expect(await purgePostPoints(db.prisma, [])).toBe(0);
  });
});
