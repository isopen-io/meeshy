/**
 * @jest-environment node
 *
 * Revue de conformité O6 (#10499) — l'export (RGPD art. 15 et 20) rend la
 * télémétrie de lecture LIÉE au compte : impressions, sessions de lecture,
 * vues, événements v2 rattachés. Ce qui est rangé SANS acteur n'est lié à
 * personne et n'en fait pas partie.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { exportReadingActivity } from '../../../../routes/me/export-reading';
import { accountReaderKeyOf } from '../../../../services/posts/readerKey';

const USER = '507f1f77bcf86cd799439011';
const at = new Date('2026-10-13T10:00:00.000Z');

function fakePrisma() {
  const rows = (items: unknown[]) => jest.fn(async (args: { where: unknown; take: number }) => items.slice(0, args.take));
  return {
    postImpression: { findMany: rows([{ postId: 'p1', source: 'feed', surface: 'feed', position: 3, rankingSource: 'for_you', viewable: true, createdAt: at }]) },
    postEngagement: { findMany: rows([{ postId: 'p1', contentType: 'REEL', surface: 'reels', startedAt: at, dwellMs: 4000, watchMs: 3500, completed: true }]) },
    postView: { findMany: rows([{ postId: 'p1', viewedAt: at, duration: 1200, surface: 'detail', provenance: 'listing', origin: 'feed' }]) },
    contentEvent: { findMany: rows([{ type: 'screen_capture', action: 'screenshot', targetKind: 'post', targetId: 'p1', surface: 'detail', derivedAt: at, props: { captureKind: 'screenshot' } }]) },
  };
}

describe('exportReadingActivity', () => {
  it('rend les quatre listes du compte, bornées par la page, chacune filtrée par SON userId', async () => {
    const prisma = fakePrisma();
    const section = await exportReadingActivity(prisma as never, USER, { limit: 10, offset: 0 });

    expect(section.impressions[0]).toMatchObject({ postId: 'p1', position: 3, createdAt: at.toISOString() });
    expect(section.engagements[0]).toMatchObject({ dwellMs: 4000, startedAt: at.toISOString() });
    expect(section.views[0]).toMatchObject({ provenance: 'listing', viewedAt: at.toISOString() });
    expect(section.contentEvents[0]).toMatchObject({ type: 'screen_capture', derivedAt: at.toISOString() });
    // Une impression ou une session rangée sans consentement porte l'empreinte du compte, pas son id (#10771, #10773).
    const ofAccount = { OR: [{ userId: USER }, { readerKey: accountReaderKeyOf(USER) }] };
    for (const model of ['postImpression', 'postEngagement'] as const) {
      expect(prisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ofAccount, take: 11, skip: 0 }));
    }
    for (const model of ['postView', 'contentEvent'] as const) {
      expect(prisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER }, take: 11, skip: 0 }));
    }
  });
});
