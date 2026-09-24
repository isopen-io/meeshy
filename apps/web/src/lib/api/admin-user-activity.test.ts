import { describe, expect, test } from 'bun:test';

import {
  adminUserActivityQueryKey,
  adminUserReportedMessagesQueryKey,
  adminUserReportsQueryKey,
  decodeAdminReportPage,
  decodeAdminReportedMessagePage,
  decodeAdminUserActivity,
  loadAdminUserActivity,
  loadAdminUserReportedMessages,
  loadAdminUserReports,
} from './admin-user-activity';
import { pageServie } from './admin';
import type { HttpTransport } from './http';
import { persistableQuery } from './query-client';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * L'ACTIVITÉ D'UN MEMBRE (#7845) — trois lectures déjà servies et jamais
 * consommées : les signalements qu'il a ÉMIS (`/reports`), ses messages
 * SIGNALÉS (`/reported-messages`), et ce qu'il a créé ou demandé (`/activity` :
 * liens de partage, liens de suivi, affiliations, demandes d'amis).
 *
 * Toutes trois sous une clé `admin-souverain` : un motif de signalement, un
 * extrait de message signalé ou la liste de ses demandes d'amis ne sont pas des
 * agrégats — ils n'ont rien à faire sur le disque de l'administrateur.
 */

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string }) => {
      appels.push({ path: requete.path, method: requete.method });
      return ok ? resultatServi(reponse) : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });
const servie = (enveloppe: unknown) => pageServie(resultatServi(enveloppe));

const SIGNALEMENT = {
  id: 'r-1',
  reportedType: 'user',
  reportedEntityId: 'u-9',
  reportType: 'spam',
  reason: 'Envoie des liens en boucle',
  status: 'pending',
  actionTaken: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  resolvedAt: null,
  moderatorNotes: 'interne',
};

const MESSAGE_SIGNALE = {
  id: 'r-2',
  reportedEntityId: 'm-1',
  reportType: 'harassment',
  reason: 'Insulte',
  status: 'resolved',
  reporterId: 'u-7',
  reporterName: 'Kwame',
  createdAt: '2026-09-18T10:00:00.000Z',
  resolvedAt: '2026-09-19T10:00:00.000Z',
  message: { id: 'm-1', content: null, conversationId: 'c-1', messageType: 'text', createdAt: '2026-09-18T09:00:00.000Z', deletedAt: null },
};

const ACTIVITE = {
  shareLinks: [
    {
      id: 'sl-1',
      name: 'Invitation',
      description: 'Pour l’équipe',
      maxUses: 10,
      currentUses: 3,
      isActive: true,
      expiresAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      conversation: { id: 'c-1', identifier: 'mshy_abc' },
      linkId: 'secret',
    },
  ],
  trackingLinks: [
    {
      id: 'tl-1',
      token: 'tok',
      name: 'Campagne',
      campaign: 'rentree',
      source: 'x',
      medium: 'social',
      originalUrl: 'https://meeshy.me',
      shortUrl: 'https://meeshy.me/l/tok',
      totalClicks: 40,
      uniqueClicks: 30,
      isActive: true,
      expiresAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      lastClickedAt: '2026-09-23T00:00:00.000Z',
    },
  ],
  affiliateTokens: [
    { id: 'at-1', name: 'Parrainage', maxUses: null, currentUses: 2, clickCount: 9, isActive: false, expiresAt: null, createdAt: '2026-09-03T00:00:00.000Z', _count: { affiliations: 2 } },
  ],
  contacts: {
    sent: [{ id: 'fr-1', status: 'pending', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: null, receiver: { id: 'u-2', username: 'kwame', displayName: 'Kwame', avatar: null } }],
    received: [{ id: 'fr-2', status: 'accepted', createdAt: '2026-09-05T00:00:00.000Z', updatedAt: null, sender: { id: 'u-3', username: 'awa', displayName: '', avatar: 'a.png' } }],
  },
};

describe('decodeAdminReportPage — les signalements émis', () => {
  test('décode le signalement, sans notes internes', () => {
    const page = decodeAdminReportPage(servie({ data: [SIGNALEMENT], pagination: { total: 5, offset: 0, limit: 20, hasMore: true } }), 0);

    expect(page.total).toBe(5);
    expect(page.reports[0]).toEqual({
      id: 'r-1',
      reportedType: 'user',
      reportedEntityId: 'u-9',
      reportType: 'spam',
      reason: 'Envoie des liens en boucle',
      status: 'pending',
      actionTaken: null,
      createdAt: '2026-09-20T10:00:00.000Z',
      resolvedAt: null,
    });
    expect(Object.keys(page.reports[0] ?? {})).not.toContain('moderatorNotes');
  });
});

describe('decodeAdminReportedMessagePage — les messages signalés', () => {
  test('un `content` masqué reste NULL, et la ligne demeure', () => {
    const ligne = decodeAdminReportedMessagePage(servie({ data: [MESSAGE_SIGNALE] }), 0).reports[0];

    expect(ligne?.reporterName).toBe('Kwame');
    expect(ligne?.message?.content).toBeNull();
    expect(ligne?.message?.conversationId).toBe('c-1');
  });

  test('un message introuvable devient `message: null`', () => {
    const ligne = decodeAdminReportedMessagePage(servie({ data: [{ ...MESSAGE_SIGNALE, message: null }] }), 0).reports[0];

    expect(ligne?.message).toBeNull();
  });
});

describe('decodeAdminUserActivity — liens et demandes d’amis', () => {
  test('décode les quatre familles', () => {
    const activite = decodeAdminUserActivity(ACTIVITE);

    expect(activite.shareLinks[0]).toEqual({
      id: 'sl-1',
      name: 'Invitation',
      description: 'Pour l’équipe',
      maxUses: 10,
      currentUses: 3,
      isActive: true,
      expiresAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      conversationId: 'c-1',
      conversationIdentifier: 'mshy_abc',
    });
    expect(activite.trackingLinks[0]?.shortUrl).toBe('https://meeshy.me/l/tok');
    expect(activite.trackingLinks[0]?.totalClicks).toBe(40);
    expect(activite.affiliateTokens[0]?.maxUses).toBeNull();
    expect(activite.affiliateTokens[0]?.affiliations).toBe(2);
    expect(activite.affiliateTokens[0]?.isActive).toBe(false);
    expect(activite.friendRequests.map((r) => [r.id, r.direction, r.status])).toEqual([
      ['fr-1', 'sent', 'pending'],
      ['fr-2', 'received', 'accepted'],
    ]);
    expect(activite.friendRequests[0]?.other).toEqual({ id: 'u-2', username: 'kwame', displayName: 'Kwame', avatar: null });
    // Un nom affiché vide retombe sur le pseudo — jamais une demande sans nom.
    expect(activite.friendRequests[1]?.other?.displayName).toBe('awa');
  });

  test('aucune clé de jointure ne ressort', () => {
    const activite = decodeAdminUserActivity(ACTIVITE);

    expect(Object.keys(activite.shareLinks[0] ?? {})).not.toContain('linkId');
    expect(Object.keys(activite.trackingLinks[0] ?? {})).not.toContain('token');
  });

  test('une charge illisible donne des listes VIDES', () => {
    expect(decodeAdminUserActivity(null)).toEqual({ shareLinks: [], trackingLinks: [], affiliateTokens: [], friendRequests: [] });
  });
});

describe('les lectures', () => {
  test('signalements émis : GET …/reports, identifiant encodé, offset', async () => {
    const { transport, appels } = transportEspion({ data: [SIGNALEMENT] });

    const resultat = await loadAdminUserReports({ ...deps(transport), userId: 'u 1', offset: 20 });

    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/reports?offset=20&limit=20`);
    expect(resultat.ok && resultat.data.reports).toHaveLength(1);
  });

  test('messages signalés : GET …/reported-messages', async () => {
    const { transport, appels } = transportEspion({ data: [MESSAGE_SIGNALE] });

    await loadAdminUserReportedMessages({ ...deps(transport), userId: 'u-1', offset: 0 });

    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1/reported-messages?offset=0&limit=20');
  });

  test('activité : GET …/activity, et un refus passe tel quel', async () => {
    const { transport, appels } = transportEspion(ACTIVITE);
    const resultat = await loadAdminUserActivity({ ...deps(transport), userId: 'u-1' });

    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1/activity');
    expect(resultat.ok && resultat.data.trackingLinks).toHaveLength(1);

    const refus = { ok: false as const, status: 403, error: 'Forbidden' };
    const { transport: refusant } = transportEspion(refus, false);
    expect(await loadAdminUserActivity({ ...deps(refusant), userId: 'u-1' })).toEqual(refus);
  });
});

describe('les clés ne touchent pas le disque', () => {
  test('les trois descendent de `admin-souverain`', () => {
    for (const clef of [adminUserReportsQueryKey('u-1', 0), adminUserReportedMessagesQueryKey('u-1', 0), adminUserActivityQueryKey('u-1')]) {
      expect(clef[0]).toBe('admin-souverain');
      expect(persistableQuery({ state: { status: 'success' }, queryKey: clef })).toBe(false);
    }
  });
});
