/**
 * La section `readingActivity` de `GET /me/export` (#10499, revue de
 * conformité O6 — RGPD art. 15 et 20) : ce que la passerelle garde de ce que
 * le compte a vu, lu, ouvert, fait défiler ou capturé.
 *
 *  - `impressions` : chaque listing d'un contenu (`PostImpression`) ;
 *  - `engagements` : chaque session de lecture (`PostEngagement`, `dwell`) ;
 *  - `views` : chaque contenu ouvert (`PostView`) ;
 *  - `contentEvents` : les événements v2 RATTACHÉS au compte — ceux qu'il a
 *    produits avec son consentement d'analyse. Ce qui est rangé sans acteur
 *    n'est lié à personne et n'en fait pas partie.
 *
 * Rien d'un autre compte : chaque ligne est filtrée par le `userId` du
 * demandeur — ou, pour une impression ou une session RÉDUITE écrite entre
 * #10771 et #10785, par l'EMPREINTE de son compte (`readerKey`).
 * Chaque liste est bornée par la page de la requête.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ExportPage } from './export-sections';
import { accountReaderKeyOf } from '../../services/posts/readerKey';

type Row = Record<string, unknown>;

type ReadingExportPrisma = {
  readonly [K in 'postImpression' | 'postEngagement' | 'postView' | 'contentEvent']: {
    readonly findMany: (args: never) => Promise<readonly Row[]>;
  };
};

const iso = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));

export async function exportReadingActivity(prisma: ReadingExportPrisma | PrismaClient, userId: string, page: ExportPage) {
  const db = prisma as unknown as ReadingExportPrisma;
  const take = page.limit + 1;
  const skip = page.offset;
  const ofAccount = { OR: [{ userId }, { readerKey: accountReaderKeyOf(userId) }] };
  const read = (model: keyof ReadingExportPrisma, select: Row, orderBy: Row, where: Row = { userId }) =>
    db[model].findMany({ where, select, orderBy, take, skip } as never);

  const [impressions, engagements, views, contentEvents] = await Promise.all([
    read('postImpression', {
      postId: true, source: true, surface: true, position: true, rankingSource: true,
      viewable: true, visibleFraction: true, visibleMs: true, platform: true, createdAt: true,
    }, { createdAt: 'desc' }, ofAccount),
    read('postEngagement', {
      postId: true, contentType: true, surface: true, startedAt: true, dwellMs: true, watchMs: true,
      mediaDurationMs: true, completed: true, actions: true,
      creditedOpen: true, creditedPlay: true, creditedQualified: true, createdAt: true,
    }, { createdAt: 'desc' }, ofAccount),
    read('postView', { postId: true, viewedAt: true, duration: true, surface: true, provenance: true, origin: true }, { viewedAt: 'desc' }),
    read('contentEvent', {
      type: true, action: true, targetKind: true, targetId: true, parentKind: true, parentId: true, surface: true,
      derivedAt: true, platform: true, appVersion: true, listing: true, prism: true, props: true,
    }, { derivedAt: 'desc' }),
  ]);

  const clip = (rows: readonly Row[]) => rows.slice(0, page.limit).map(iso);
  return {
    impressions: clip(impressions),
    engagements: clip(engagements),
    views: clip(views),
    contentEvents: clip(contentEvents),
    hasMore: {
      impressions: impressions.length > page.limit,
      engagements: engagements.length > page.limit,
      views: views.length > page.limit,
      contentEvents: contentEvents.length > page.limit,
    },
  };
}
