import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import {
  decodeMyProfile,
  decodeMyStats,
  loadMyProfile,
  loadMyStats,
  maskEmail,
  maskPhone,
  patchMyImage,
  patchMyProfile,
  validateProfilePatch,
} from './profile';

/**
 * LE PORT DU PROFIL (#6289) — `GET /api/v1/me`, `GET /api/v1/users/me/stats`,
 * `PATCH /api/v1/users/me` et ses deux
 * jumelles d'image. Témoins écrits contre le transport RÉEL (`createHttpTransport`)
 * nourri d'un `fetch` bouchonné : la méthode, le chemin et le corps que la
 * passerelle reçoit sont mesurés, jamais supposés.
 */

const wireUser = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee0000000000abcd',
  username: 'ada',
  email: 'ada@meeshy.example',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada L.',
  bio: null,
  avatar: null,
  banner: null,
  phoneNumber: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  emailVerifiedAt: '2026-01-02T00:00:00.000Z',
  phoneVerifiedAt: null,
  lastLoginIp: '203.0.113.7',
  lastLoginLocation: 'Paris',
  createdAt: '2025-03-14T09:00:00.000Z',
  permissions: { canAccessAdmin: false },
  ...overrides,
});

type RecordedCall = { readonly url: string; readonly method: string; readonly body: unknown };

const gatewayReplying = (replies: ReadonlyArray<{ readonly status: number; readonly body: unknown }>) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawBody = init?.body;
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody,
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? { status: 500, body: {} };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const transport = createHttpTransport({
    base: 'https://gate.test',
    fetchImpl: fetchImpl as typeof fetch,
    timeoutMs: 0,
  });
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('le décodage de soi — une PROJECTION, jamais la charge reçue', () => {
  test('les champs nuls deviennent des valeurs lisibles, les contacts arrivent masqués', () => {
    const profile = decodeMyProfile(wireUser());
    expect(profile).toEqual({
      id: '64f0c0ffee0000000000abcd',
      username: 'ada',
      displayName: 'Ada L.',
      firstName: 'Ada',
      lastName: 'Lovelace',
      bio: '',
      avatar: null,
      banner: null,
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
      email: { masked: 'a•••@meeshy.example', verified: true },
      phone: null,
      createdAt: '2025-03-14T09:00:00.000Z',
    });
  });

  test('rien de ce que la passerelle sert À CÔTÉ ne survit : ni adresse, ni IP, ni lieu, ni permissions', () => {
    const serialized = JSON.stringify(decodeMyProfile(wireUser({ phoneNumber: '+33612345678' })));
    for (const leaked of ['ada@meeshy.example', '+33612345678', '203.0.113.7', 'Paris', 'permissions', 'canAccessAdmin']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  test('un téléphone vérifié ou non se lit masqué, avec son état', () => {
    expect(decodeMyProfile(wireUser({ phoneNumber: '+33612345678', phoneVerifiedAt: null }))?.phone).toEqual({
      masked: '+33 •••• 78',
      verified: false,
    });
  });

  test('une langue vide sert d’absence, jamais d’une langue « » au Prisme', () => {
    const profile = decodeMyProfile(wireUser({ regionalLanguage: '', customDestinationLanguage: 'es' }));
    expect(profile?.regionalLanguage).toBeNull();
    expect(profile?.customDestinationLanguage).toBe('es');
  });

  test('FAIL-CLOSED : une charge sans identité rend null', () => {
    expect(decodeMyProfile(null)).toBeNull();
    expect(decodeMyProfile('ada')).toBeNull();
    expect(decodeMyProfile(wireUser({ id: '' }))).toBeNull();
    expect(decodeMyProfile(wireUser({ username: undefined }))).toBeNull();
  });
});

describe('le masquage', () => {
  test('une adresse garde sa première lettre et son domaine', () => {
    expect(maskEmail('ada@meeshy.example')).toBe('a•••@meeshy.example');
    expect(maskEmail('a@x.io')).toBe('•@x.io');
    expect(maskEmail('pas-une-adresse')).toBe('•••');
  });

  test('un numéro garde son indicatif et ses deux derniers chiffres — jamais sa longueur', () => {
    expect(maskPhone('+33612345678')).toBe('+33 •••• 78');
    expect(maskPhone('+2250700000012')).toBe('+22 •••• 12');
    expect(maskPhone('12')).toBe('••••');
  });
});

describe('les statistiques', () => {
  test('les six compteurs, un absent vaut zéro, un illisible aussi', () => {
    expect(
      decodeMyStats({ totalMessages: 1204, totalConversations: 18, totalTranslations: 356, languagesUsed: 4, memberDays: -3 }),
    ).toEqual({
      totalMessages: 1204,
      totalConversations: 18,
      totalTranslations: 356,
      languagesUsed: 4,
      memberDays: 0,
      friendRequestsReceived: 0,
    });
    expect(decodeMyStats(null)).toBeNull();
  });
});

describe('les lectures parlent aux vraies routes', () => {
  test('GET /api/v1/me, projeté', async () => {
    const { calls, deps } = gatewayReplying([{ status: 200, body: { success: true, data: { user: wireUser() } } }]);
    const result = await loadMyProfile(deps);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET https://gate.test/api/v1/me']);
    expect(result.ok && result.data.username).toBe('ada');
  });

  test('une charge de soi illisible est un ÉCHEC, jamais un profil vide', async () => {
    const { deps } = gatewayReplying([{ status: 200, body: { success: true, data: { user: { id: 'x' } } } }]);
    expect((await loadMyProfile(deps)).ok).toBe(false);
  });

  test('GET /api/v1/users/me/stats', async () => {
    const { calls, deps } = gatewayReplying([{ status: 200, body: { success: true, data: { totalMessages: 7 } } }]);
    const result = await loadMyStats(deps);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET https://gate.test/api/v1/users/me/stats']);
    expect(result.ok && result.data.totalMessages).toBe(7);
  });

  test('la source fixtures sert le lecteur de recette par le MÊME chemin', async () => {
    const result = await loadMyProfile({ source: 'fixtures', transport: gatewayReplying([]).deps.transport });
    expect(result.ok && result.data.username).toBe('vous');
  });
});

describe('la frontière d’écriture — validée avant tout octet', () => {
  test('les refus nomment le champ, dans les bornes de la passerelle', () => {
    expect(validateProfilePatch({ bio: 'x'.repeat(501) })).toEqual({ ok: false, field: 'bio' });
    expect(validateProfilePatch({ systemLanguage: 'xx' })).toEqual({ ok: false, field: 'systemLanguage' });
    expect(validateProfilePatch({ displayName: '   ' })).toEqual({ ok: false, field: 'displayName' });
    expect(validateProfilePatch({ email: 'ada@meeshy.example' })).toEqual({ ok: false, field: 'email' });
    expect(validateProfilePatch({ regionalLanguage: '' })).toEqual({ ok: true, patch: { regionalLanguage: '' } });
    expect(validateProfilePatch({ bio: 'x'.repeat(500), customDestinationLanguage: 'es' }).ok).toBe(true);
  });

  test('PATCH /api/v1/users/me porte EXACTEMENT le corps demandé, et la réponse est projetée', async () => {
    const { calls, deps } = gatewayReplying([
      { status: 200, body: { success: true, data: { user: wireUser({ bio: 'Pionnière' }), message: 'Profile updated successfully' } } },
    ]);
    const result = await patchMyProfile(deps, { bio: 'Pionnière' });
    expect(calls).toEqual([{ url: 'https://gate.test/api/v1/users/me', method: 'PATCH', body: { bio: 'Pionnière' } }]);
    expect(result.ok && result.data.bio).toBe('Pionnière');
  });

  test('un corps invalide ne part JAMAIS', async () => {
    const { calls, deps } = gatewayReplying([]);
    const result = await patchMyProfile(deps, { bio: 'x'.repeat(501) });
    expect(calls).toHaveLength(0);
    expect(result.ok ? null : { status: result.status, field: result.field }).toEqual({ status: 0, field: 'bio' });
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const { deps } = gatewayReplying([{ status: 400, body: { success: false, error: 'Invalid data', code: 'BAD_REQUEST' } }]);
    const result = await patchMyProfile(deps, { displayName: 'Ada' });
    expect(result.ok ? null : { status: result.status, error: result.error }).toEqual({ status: 400, error: 'Invalid data' });
  });

  test('l’avatar et la bannière ont chacun leur route, et une data: URI est refusée localement', async () => {
    const { calls, deps } = gatewayReplying([
      { status: 200, body: { success: true, data: { user: wireUser({ avatar: 'https://static.test/a.webp' }) } } },
      { status: 200, body: { success: true, data: { user: wireUser({ banner: 'https://static.test/b.webp' }) } } },
    ]);
    expect((await patchMyImage(deps, 'avatar', 'https://static.test/a.webp')).ok).toBe(true);
    expect((await patchMyImage(deps, 'banner', 'https://static.test/b.webp')).ok).toBe(true);
    expect((await patchMyImage(deps, 'avatar', 'data:image/png;base64,AAAA')).ok).toBe(false);
    expect(calls).toEqual([
      { url: 'https://gate.test/api/v1/users/me/avatar', method: 'PATCH', body: { avatar: 'https://static.test/a.webp' } },
      { url: 'https://gate.test/api/v1/users/me/banner', method: 'PATCH', body: { banner: 'https://static.test/b.webp' } },
    ]);
  });
});
