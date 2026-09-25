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
      profile: { audioCount: 3, totalDurationMs: 42000, model: 'openvoice_v2', createdAt: null, updatedAt: null },
      consents: { voiceProfile: '2026-05-01T00:00:00Z', voiceData: null, voiceCloning: null },
    });
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
    });
  });
});
