import { describe, expect, test } from 'bun:test';

import type { HttpRequest, HttpTransport } from './http';
import {
  decodeAdminUserPreferences,
  decodeAdminUserStats,
  loadAdminUserStats,
  patchAdminUserPreferences,
} from './admin-user-member';

const transport = (data: unknown, vu: HttpRequest[] = []) =>
  ({
    request: async (requete: HttpRequest) => {
      vu.push(requete);
      return { ok: true as const, data };
    },
  }) as unknown as HttpTransport;

describe('les chiffres d’un membre', () => {
  test('un chiffre non servi n’est pas zéro : reportsFiled reste null', () => {
    const stats = decodeAdminUserStats({ messagesSent: 12, friends: 3, reportsFiled: null });
    expect([stats.messagesSent, stats.friends, stats.reportsFiled, stats.posts]).toEqual([12, 3, null, 0]);
  });

  test('visent la route du membre, identifiant encodé', async () => {
    const vu: HttpRequest[] = [];
    const resultat = await loadAdminUserStats({ source: 'gateway', transport: transport({ posts: 4 }, vu), userId: 'u 1' });
    expect(vu[0]?.path).toBe('/api/v1/admin/users/u%201/stats');
    expect(resultat.ok && resultat.data.posts).toBe(4);
  });
});

describe('les préférences d’un membre', () => {
  test('les sept catégories, une catégorie absente devient un document vide', () => {
    const prefs = decodeAdminUserPreferences({ privacy: { showOnlineStatus: false, extras: {} }, audio: { ttsSpeed: 1.2 } });
    expect(prefs.privacy).toEqual({ showOnlineStatus: false, extras: {} });
    expect(prefs.audio.ttsSpeed).toBe(1.2);
    expect(prefs.video).toEqual({});
    expect(Object.keys(prefs)).toEqual(['privacy', 'notification', 'message', 'audio', 'video', 'document', 'application']);
  });

  test('une écriture PATCH la catégorie avec les seules clés changées, et rend le document complet', async () => {
    const vu: HttpRequest[] = [];
    const resultat = await patchAdminUserPreferences({
      source: 'gateway',
      transport: transport({ category: 'privacy', preferences: { showOnlineStatus: false, showLastSeen: true } }, vu),
      userId: 'u1',
      category: 'privacy',
      changes: { showOnlineStatus: false },
    });
    expect([vu[0]?.method, vu[0]?.path, vu[0]?.body]).toEqual(['PATCH', '/api/v1/admin/users/u1/preferences/privacy', { showOnlineStatus: false }]);
    expect(resultat.ok && resultat.data).toEqual({ showOnlineStatus: false, showLastSeen: true });
  });
});
