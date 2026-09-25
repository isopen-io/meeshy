import { describe, expect, test } from 'bun:test';

import type { HttpTransport } from './http';
import {
  adminUserCommunitiesQueryKey,
  adminUserVoiceQueryKey,
  decodeAdminCommunities,
  decodeAdminVoiceProfile,
  loadAdminUserCommunities,
} from './admin-user-dossier';
import { estClefSouveraine } from './souverain';

const transport = (reponse: { readonly data: unknown; readonly pagination?: unknown }, vu: string[] = []) =>
  ({
    request: async (requete: { path: string }) => {
      vu.push(requete.path);
      return { ok: true as const, ...reponse };
    },
  }) as unknown as HttpTransport;

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

describe('ce qui nomme un tiers ne touche jamais le disque', () => {
  test('la voix et les communautés vivent sous le préfixe souverain', () => {
    expect(estClefSouveraine(adminUserVoiceQueryKey('u1'))).toBe(true);
    expect(estClefSouveraine(adminUserCommunitiesQueryKey('u1', 0))).toBe(true);
  });
});

describe('le chargement des communautés', () => {
  test('pagine l’adresse du membre, identifiant échappé', async () => {
    const vu: string[] = [];
    const resultat = await loadAdminUserCommunities({
      source: 'gateway',
      transport: transport({ data: [], pagination: { total: 0, hasMore: false } }, vu),
      userId: 'u 1',
      offset: 20,
    });
    expect(vu[0]).toBe('/api/v1/admin/users/u%201/communities?offset=20&limit=20');
    expect(resultat.ok && resultat.data).toEqual({ rows: [], total: 0, hasMore: false });
  });
});
