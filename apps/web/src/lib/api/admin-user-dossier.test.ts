import { describe, expect, test } from 'bun:test';

import type { HttpTransport } from './http';
import {
  adminUserReportsReceivedQueryKey,
  adminUserSecurityQueryKey,
  adminUserSessionsQueryKey,
  adminUserVoiceQueryKey,
  decodeAdminActivity,
  decodeAdminCommunities,
  decodeAdminVoiceProfile,
  loadAdminUserReportsReceived,
  loadAdminUserSessions,
  revokeAdminUserSession,
  sessionStateOf,
  withoutSession,
} from './admin-user-dossier';
import { estClefSouveraine } from './souverain';

const transport = (reponse: { readonly data: unknown; readonly pagination?: unknown }, vu: string[] = []) =>
  ({
    request: async (requete: { path: string }) => {
      vu.push(requete.path);
      return { ok: true as const, ...reponse };
    },
  }) as unknown as HttpTransport;

describe('les contacts d’un membre', () => {
  test('fusionnent demandes envoyées et reçues, les plus récentes d’abord, avec l’autre personne', () => {
    const activite = decodeAdminActivity({
      shareLinks: [{}, {}],
      trackingLinks: [],
      affiliateTokens: [{}],
      contacts: {
        sent: [{ id: 'f1', status: 'accepted', createdAt: '2026-09-01T00:00:00Z', receiver: { id: 'u2', username: 'bob', displayName: 'Bob' } }],
        received: [{ id: 'f2', status: 'pending', createdAt: '2026-09-10T00:00:00Z', sender: { id: 'u3', username: 'eve', displayName: '' } }],
      },
    });

    expect(activite.contacts.map((c) => [c.id, c.direction, c.status, c.other.displayName])).toEqual([
      ['f2', 'received', 'pending', 'eve'],
      ['f1', 'sent', 'accepted', 'Bob'],
    ]);
    expect([activite.shareLinks, activite.trackingLinks, activite.affiliateTokens]).toEqual([2, 0, 1]);
    expect(activite.totals).toBeNull();
  });

  test('lisent les TOTAUX servis : la longueur d’une liste bornée à cinquante n’est pas le compte (audit 2026-10-04)', () => {
    const activite = decodeAdminActivity({
      shareLinks: Array.from({ length: 50 }, () => ({})),
      trackingLinks: [],
      affiliateTokens: [],
      contacts: { sent: [], received: [] },
      totals: { shareLinks: 212, trackingLinks: 3, affiliateTokens: 0, contactsSent: 140, contactsReceived: 61 },
    });
    expect([activite.shareLinks, activite.trackingLinks, activite.affiliateTokens]).toEqual([212, 3, 0]);
    expect(activite.totals).toEqual({ contactsSent: 140, contactsReceived: 61 });
  });
});

describe('les communautés d’un membre', () => {
  test('lisent l’adhésion et la communauté, qu’elles soient à plat ou imbriquées', () => {
    const page = decodeAdminCommunities(
      {
        data: {
          communities: [
            { id: 'k1', name: 'Club', identifier: 'club', memberCount: 12, role: 'admin', joinedAt: '2026-01-01T00:00:00Z', isActive: true, isCreator: true },
            { community: { id: 'k2', name: 'Autre', isPrivate: true }, membership: { role: 'member', isActive: false, leftAt: '2026-02-01T00:00:00Z' } },
          ],
          pagination: { total: 2, hasMore: false },
        },
      },
      0,
    );
    expect(page.rows.map((c) => [c.id, c.role, c.isCreator, c.isActive, c.isPrivate])).toEqual([
      ['k1', 'admin', true, true, false],
      ['k2', 'member', false, false, true],
    ]);
    expect(page.total).toBe(2);
  });

  test('lisent la forme SERVIE : data est le tableau, la pagination à côté (sendPaginatedSuccess)', () => {
    const page = decodeAdminCommunities(
      {
        data: [
          {
            id: 'k1',
            name: 'Club',
            identifier: 'club',
            avatar: null,
            isPrivate: false,
            memberCount: 8,
            isCreator: false,
            membership: { id: 'm1', role: 'moderator', joinedAt: '2026-03-01T00:00:00Z', isActive: true, leftAt: null },
          },
        ],
        pagination: { total: 41, hasMore: true },
      },
      0,
    );
    expect(page.rows.map((c) => [c.id, c.role, c.memberCount, c.joinedAt])).toEqual([['k1', 'moderator', 8, '2026-03-01T00:00:00Z']]);
    expect([page.total, page.hasMore]).toEqual([41, true]);
  });
});

describe('le profil vocal', () => {
  test('ne garde que des métadonnées, jamais les octets de l’empreinte', () => {
    const voix = decodeAdminVoiceProfile({
      voiceProfile: { audioCount: 3, totalDurationMs: 42000, embeddingModel: 'openvoice_v2', embedding: 'AAAA', chatterboxConditionals: 'BBBB' },
      consents: { voiceProfileConsentAt: '2026-05-01T00:00:00Z', voiceDataConsentAt: null },
    });
    expect(voix).toEqual({
      profile: { audioCount: 3, totalDurationMs: 42000, model: 'openvoice_v2', qualityScore: null, analysisAt: null, publicAt: null, createdAt: null, updatedAt: null },
      consents: { voiceProfile: '2026-05-01T00:00:00Z', voiceData: null, voiceCloning: null },
    });
  });

  test('lit la qualité, l’analyse et la publication servies (audit 2026-10-04)', () => {
    const voix = decodeAdminVoiceProfile({
      voiceProfile: { audioCount: 3, totalDurationMs: 42000, embeddingModel: 'openvoice_v2', qualityScore: 0.72, voiceAnalysisAt: '2026-06-01T00:00:00Z', voicePublicAt: '2026-06-02T00:00:00Z' },
      consents: {},
    });
    expect([voix.profile?.qualityScore, voix.profile?.analysisAt, voix.profile?.publicAt]).toEqual([0.72, '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z']);
  });

  test('un membre sans profil vocal le dit', () => {
    expect(decodeAdminVoiceProfile({ voiceProfile: null, consents: {} }).profile).toBeNull();
  });
});

describe('ce qui porte une empreinte d’un tiers ne touche jamais le disque', () => {
  test('sessions, sécurité, voix et messages signalés vivent sous le préfixe souverain', () => {
    expect(estClefSouveraine(adminUserSessionsQueryKey('u1', 0))).toBe(true);
    expect(estClefSouveraine(adminUserSecurityQueryKey('u1', 0))).toBe(true);
    expect(estClefSouveraine(adminUserVoiceQueryKey('u1'))).toBe(true);
    expect(estClefSouveraine(adminUserReportsReceivedQueryKey('u1', 0))).toBe(true);
  });
});

describe('les sessions', () => {
  test('composent l’appareil et le lieu, et lisent la pagination servie à côté de data', async () => {
    const vu: string[] = [];
    const resultat = await loadAdminUserSessions({
      source: 'gateway',
      transport: transport(
        {
          data: [
            {
              id: 's1',
              browserName: 'Chrome',
              browserVersion: '140',
              osName: 'Android',
              osVersion: '15',
              ipAddress: '10.0.0.1',
              city: 'Lyon',
              country: 'FR',
              isValid: true,
              lastActivityAt: '2026-09-20T00:00:00Z',
            },
          ],
          pagination: { total: 30, hasMore: true },
        },
        vu,
      ),
      userId: 'u 1',
      offset: 20,
    });

    expect(vu[0]).toBe('/api/v1/admin/users/u%201/sessions?offset=20&limit=20');
    expect(resultat.ok && resultat.data).toEqual({
      rows: [
        {
          id: 's1',
          device: 'Chrome 140 · Android 15',
          ipAddress: '10.0.0.1',
          place: 'Lyon, FR',
          isValid: true,
          isTrusted: false,
          createdAt: null,
          lastActivityAt: '2026-09-20T00:00:00Z',
          expiresAt: null,
          invalidatedAt: null,
          invalidatedReason: null,
        },
      ],
      total: 30,
      hasMore: true,
    });
  });
});

describe('les signalements reçus', () => {
  test('gardent la ligne quand la passerelle retient le texte du message', async () => {
    const resultat = await loadAdminUserReportsReceived({
      source: 'gateway',
      transport: transport({
        data: [{ id: 'r1', reportType: 'spam', reason: 'pub', status: 'pending', reporterName: 'Ana', message: { id: 'm1', content: null } }],
        pagination: { total: 1 },
      }),
      userId: 'u1',
      offset: 0,
    });

    expect(resultat.ok && resultat.data.rows[0]).toEqual({
      id: 'r1',
      subject: 'Ana',
      reportType: 'spam',
      reason: 'pub',
      status: 'pending',
      createdAt: null,
      excerpt: null,
      messageState: 'withheld',
      conversation: null,
      resolvedAt: null,
      actionTaken: null,
    });
  });

  test('un message DISPARU (`message: null`, ou `deletedAt` posé) se distingue d’un texte retenu (audit 2026-10-04)', async () => {
    const resultat = await loadAdminUserReportsReceived({
      source: 'gateway',
      transport: transport({
        data: [
          { id: 'r1', reportType: 'spam', status: 'pending', message: null, conversation: null },
          { id: 'r2', reportType: 'spam', status: 'resolved', resolvedAt: '2026-09-02T00:00:00Z', message: { id: 'm2', content: 'texte', deletedAt: '2026-09-01T00:00:00Z' }, conversation: { id: 'c1', title: ' Famille ' } },
          { id: 'r3', reportType: 'spam', status: 'pending', message: { id: 'm3', content: 'bonjour', deletedAt: null }, conversation: { id: 'c1', title: null } },
        ],
        pagination: { total: 3 },
      }),
      userId: 'u1',
      offset: 0,
    });
    const rows = resultat.ok ? resultat.data.rows : [];
    expect(rows.map((row) => [row.messageState, row.excerpt])).toEqual([
      ['deleted', null],
      ['deleted', null],
      ['shown', 'bonjour'],
    ]);
    expect(rows[1]?.conversation).toEqual({ id: 'c1', title: 'Famille' });
    expect(rows[1]?.resolvedAt).toBe('2026-09-02T00:00:00Z');
    expect(rows[2]?.conversation).toEqual({ id: 'c1', title: null });
  });
});

describe('l’état d’une session', () => {
  const NOW = new Date('2026-09-30T12:00:00Z');
  test('une session encore valide dont l’échéance est passée est EXPIRÉE, pas valide (audit 2026-10-04)', () => {
    expect(sessionStateOf({ isValid: true, expiresAt: '2026-09-01T00:00:00Z' }, NOW)).toBe('expired');
    expect(sessionStateOf({ isValid: true, expiresAt: '2026-10-30T00:00:00Z' }, NOW)).toBe('valid');
    expect(sessionStateOf({ isValid: true, expiresAt: null }, NOW)).toBe('valid');
    expect(sessionStateOf({ isValid: false, expiresAt: '2026-10-30T00:00:00Z' }, NOW)).toBe('closed');
  });
});

describe('révoquer une session', () => {
  test('DELETE sur la session nommée, par le catalogue — l’accusé ne porte rien de la charge', async () => {
    const calls: { path: string; method: string }[] = [];
    const recording = {
      request: async (requete: { path: string; method: string }) => {
        calls.push(requete);
        return { ok: true as const, data: { message: 'Session révoquée avec succès' } };
      },
    } as unknown as HttpTransport;

    const resultat = await revokeAdminUserSession({ source: 'gateway', transport: recording, userId: 'u1', sessionId: 's/1' });

    expect(calls).toEqual([{ method: 'DELETE', path: '/api/v1/admin/users/u1/sessions/s%2F1' }]);
    expect(resultat).toEqual({ ok: true, data: { acknowledged: true } });
  });

  test('un refus passe tel quel, avec son statut', async () => {
    const refusing = { request: async () => ({ ok: false as const, status: 403, error: 'Forbidden' }) } as unknown as HttpTransport;

    expect(await revokeAdminUserSession({ source: 'gateway', transport: refusing, userId: 'u1', sessionId: 's1' })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  test('l’effet immédiat retire la ligne et baisse le total ; une charge inconnue est rendue telle quelle', () => {
    const page = { rows: [{ id: 's1' }, { id: 's2' }], total: 7, hasMore: true };

    expect(withoutSession(page, 's1')).toEqual({ rows: [{ id: 's2' }], total: 6, hasMore: true });
    expect(withoutSession(page, 'inconnue')).toEqual(page);
    expect(withoutSession('autre chose', 's1')).toBe('autre chose');
    expect(withoutSession({ rows: [{ id: 's1' }], total: 0 }, 's1')).toEqual({ rows: [], total: 0 });
  });
});
