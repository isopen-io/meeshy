/**
 * TrackingLinkService — clicksByHour / clicksByDate, cohérence UTC
 *
 * getTrackingLinkStats dérive deux histogrammes temporels du MÊME jeu de clics :
 *   - clicksByDate  → le jour calendaire
 *   - clicksByHour  → l'heure
 *
 * Les deux DOIVENT bucketer dans le même référentiel (UTC) pour rester
 * cohérents quel que soit le fuseau de la machine qui exécute. Une version
 * antérieure utilisait `getHours()` (heure LOCALE du serveur) pour l'heure —
 * masqué en production (node:22-slim tourne en TZ=UTC, où getHours() ===
 * getUTCHours()) mais silencieusement faux sur tout hôte non-UTC.
 *
 * Depuis #4391 le bucketing n'est plus fait en JavaScript sur des lignes
 * rapatriées : il est fait par MongoDB, dans le `$facet` de
 * `clickStatsPipeline`. Le référentiel n'est donc plus une propriété du pliage
 * mais une DÉCLARATION du pipeline — `$dateToString` prend son fuseau du champ
 * `timezone`, et l'OMETTRE le ferait retomber sur un défaut implicite. Ces
 * témoins gardent donc les deux moitiés qui restent du dépôt :
 *   1. les deux tranches temporelles déclarent explicitement `timezone: 'UTC'` ;
 *   2. le dépouillement reporte les clés que Mongo a produites, sans les
 *      retraduire (une seconde conversion rouvrirait exactement le défaut).
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { TrackingLinkService } from '../../../services/TrackingLinkService';
import { clickStatsPipeline, foldClickStatsFacet } from '../../../services/trackingLinkClickAggregation';

const LINK_FIXTURE = {
  id: '507f1f77bcf86cd799439099',
  token: 'AbCd12',
  shortUrl: '/l/AbCd12',
  originalUrl: 'https://example.com/page',
  isActive: true,
  expiresAt: null,
  totalClicks: 0,
  uniqueClicks: 0,
  createdBy: 'user_001',
  conversationId: null,
  messageId: null,
  targetType: 'URL',
  targetId: null,
  name: null,
  campaign: null,
  source: null,
  medium: null,
  createdAt: new Date('2024-01-01'),
  lastClickedAt: null,
};

type TrancheDate = { $group: { _id: { $dateToString: { format: string; date: string; timezone?: string } } } };

function trancheTemporelle(nom: 'hour' | 'date'): TrancheDate['$group']['_id']['$dateToString'] {
  const pipeline = clickStatsPipeline({ trackingLinkId: LINK_FIXTURE.id }) as unknown as Array<{
    $facet?: Record<string, TrancheDate[]>;
  }>;
  const facet = pipeline[1].$facet!;
  return facet[nom][0].$group._id.$dateToString;
}

describe('clickStatsPipeline — les deux histogrammes temporels bucketent en UTC', () => {
  it("déclare explicitement timezone: 'UTC' sur l'heure", () => {
    expect(trancheTemporelle('hour')).toEqual({
      format: '%H',
      date: '$clickedAt',
      timezone: 'UTC',
    });
  });

  it("déclare explicitement timezone: 'UTC' sur le jour — même référentiel que l'heure", () => {
    const heure = trancheTemporelle('hour');
    const jour = trancheTemporelle('date');

    expect(jour).toEqual({ format: '%Y-%m-%d', date: '$clickedAt', timezone: 'UTC' });
    expect(jour.timezone).toBe(heure.timezone);
    expect(jour.date).toBe(heure.date);
  });
});

describe('foldClickStatsFacet — reporte les clés produites par Mongo sans les retraduire', () => {
  it("garde l'heure telle quelle, sur deux chiffres", () => {
    const stats = foldClickStatsFacet({
      hour: [{ _id: '23', n: 1 }],
      date: [{ _id: '2024-06-01', n: 1 }],
    });

    expect(stats.clicksByHour).toEqual({ '23': 1 });
    expect(stats.clicksByDate).toEqual({ '2024-06-01': 1 });
  });

  it('agrège plusieurs heures distinctes', () => {
    const stats = foldClickStatsFacet({
      hour: [{ _id: '00', n: 2 }, { _id: '15', n: 1 }],
    });

    expect(stats.clicksByHour).toEqual({ '00': 2, '15': 1 });
  });
});

describe('getTrackingLinkStats — sert les histogrammes du facet', () => {
  it('rend clicksByHour et clicksByDate cohérents pour un même instant', async () => {
    const prisma = {
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
      trackingLinkClick: {
        aggregateRaw: jest.fn().mockResolvedValue([
          { total: [{ n: 1 }], hour: [{ _id: '23', n: 1 }], date: [{ _id: '2024-06-01', n: 1 }] },
        ]),
        findMany: jest.fn(),
      },
      conversationShareLink: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    const stats = await new TrackingLinkService(prisma).getTrackingLinkStats('AbCd12');

    expect(stats.clicksByHour).toEqual({ '23': 1 });
    expect(stats.clicksByDate).toEqual({ '2024-06-01': 1 });
    expect(prisma.trackingLinkClick.findMany).not.toHaveBeenCalled();
  });
});
