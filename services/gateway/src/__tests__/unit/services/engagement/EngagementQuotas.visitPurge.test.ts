/**
 * LA PURGE DES EMPREINTES DE VISITEURS (#9225, conformité H-6) — les seaux
 * `visit:*` disparaissent à la fin de leur fenêtre ; les seaux de compte non.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { EngagementQuotas } from '../../../../services/engagement/EngagementQuotas';
import { fakeGameDb, USER } from '../../../../services/game/__tests__/fakeGameDb';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T00:00:00Z');

describe('EngagementQuotas.purgeVisitBuckets', () => {
  it('supprime les seaux visit:* anciens, garde les récents et tous les seaux de compte', async () => {
    const db = fakeGameDb();
    const old = new Date(NOW.getTime() - 10 * DAY);
    const fresh = new Date(NOW.getTime() - 1 * DAY);
    db.engagementQuota.rows.push(
      { id: '1', userId: USER, operationKey: 'social.link_visit', bucket: 'visit:L1:abc', updatedAt: old },
      { id: '2', userId: USER, operationKey: 'social.link_visit', bucket: 'visit:L1:def', updatedAt: fresh },
      { id: '3', userId: USER, operationKey: 'social.link_visit', bucket: 'link:L1', updatedAt: old },
      { id: '4', userId: USER, operationKey: 'social.link_visit', bucket: 'day:2026-10-01', updatedAt: old },
    );
    const removed = await new EngagementQuotas(db.prisma).purgeVisitBuckets(7 * DAY, NOW);
    expect(removed).toBe(1);
    expect(db.engagementQuota.rows.map((r) => r.id)).toEqual(['2', '3', '4']);
  });
});
