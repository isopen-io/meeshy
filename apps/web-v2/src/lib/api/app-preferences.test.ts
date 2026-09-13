import { describe, expect, test } from 'bun:test';

import {
  APP_PREFERENCE_FIELDS,
  decodeAppPreferences,
  decodeServedPreferences,
  loadAppPreferences,
  patchAppPreferences,
  preferencesPatchBody,
  type AppPreferences,
} from './app-preferences';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * LE PORT DES RÉGLAGES D'USAGE (#5563) — `GET`/`PATCH /api/v1/me/preferences`
 * (`services/gateway/src/routes/me/preferences/unified-routes.ts`, #4181).
 *
 * Il ne lit et n'écrit QUE les réglages que l'écran montre, et que la
 * passerelle OBÉIT : le thème (relu par iOS, `ThemeManager.observeRemoteThemeSync`),
 * les notifications poussées et leur son (`PushNotificationService`), et les
 * quatre bascules de visibilité (`PresenceVisibilityService`,
 * `MeeshySocketIOManager`, `MessageReadStatusService`). Le cache de requêtes
 * est persisté : rien d'autre que ces sept valeurs n'y entre.
 */

const wire = (overrides: Record<string, Record<string, unknown>> = {}) => ({
  application: { theme: 'dark', interfaceLanguage: 'en', fontSize: 'medium', ...overrides.application },
  notification: { pushEnabled: false, soundEnabled: true, emailEnabled: true, dndEnabled: false, ...overrides.notification },
  privacy: {
    showOnlineStatus: false,
    showLastSeen: true,
    showReadReceipts: true,
    showTypingIndicator: false,
    allowAnalytics: true,
    ...overrides.privacy,
  },
});

const expected: AppPreferences = {
  theme: 'dark',
  pushEnabled: false,
  soundEnabled: true,
  showOnlineStatus: false,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: false,
};

const transportAnswering = (answer: ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return answer;
    },
  } as unknown as HttpTransport;
  return { calls, transport };
};

describe('decodeAppPreferences — une PROJECTION, jamais la charge reçue', () => {
  test('rend exactement les sept réglages de l’écran', () => {
    expect(decodeAppPreferences(wire())).toEqual(expected);
  });

  test('aucun champ voisin n’entre dans le cache persisté', () => {
    const decoded = decodeAppPreferences(wire());
    expect(Object.keys(decoded ?? {}).sort()).toEqual(Object.keys(APP_PREFERENCE_FIELDS).sort());
  });

  test('un réglage de mauvais type rend la lecture ILLISIBLE, jamais une valeur devinée', () => {
    expect(decodeAppPreferences(wire({ privacy: { showOnlineStatus: 'no' } }))).toBeNull();
    expect(decodeAppPreferences(wire({ application: { theme: 'sepia' } }))).toBeNull();
  });

  test('une catégorie absente rend la lecture illisible', () => {
    const { privacy: _privacy, ...partial } = wire();
    expect(decodeAppPreferences(partial)).toBeNull();
  });
});

describe('decodeServedPreferences — ce qu’une écriture rend, catégorie par catégorie', () => {
  test('ne rend que les réglages des catégories servies', () => {
    expect(decodeServedPreferences({ notification: { pushEnabled: true, soundEnabled: false, emailEnabled: true } })).toEqual({
      pushEnabled: true,
      soundEnabled: false,
    });
  });

  test('une catégorie servie mal formée est illisible', () => {
    expect(decodeServedPreferences({ notification: { pushEnabled: 1, soundEnabled: false } })).toBeNull();
  });
});

describe('preferencesPatchBody — un réglage retrouve SA catégorie', () => {
  test('les réglages se rangent sous la catégorie que la passerelle attend', () => {
    expect(preferencesPatchBody({ pushEnabled: false, showLastSeen: false, theme: 'light' })).toEqual({
      notification: { pushEnabled: false },
      privacy: { showLastSeen: false },
      application: { theme: 'light' },
    });
  });

  test('une catégorie que le geste ne touche pas ne part pas', () => {
    expect(Object.keys(preferencesPatchBody({ soundEnabled: true }))).toEqual(['notification']);
  });
});

describe('loadAppPreferences — une seule lecture, bornée à ce que l’écran montre', () => {
  test('demande les sept champs, et rien d’autre', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: wire() });
    const result = await loadAppPreferences({ source: 'gateway', transport });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    const url = new URL(calls[0]?.path ?? '', 'https://gate.example');
    expect(url.pathname).toBe('/api/v1/me/preferences');
    expect((url.searchParams.get('fields') ?? '').split(',').sort()).toEqual(
      Object.entries(APP_PREFERENCE_FIELDS)
        .map(([key, category]) => `${category}.${key}`)
        .sort(),
    );
    expect(result).toEqual({ ok: true, data: expected });
  });

  test('une charge illisible est un ÉCHEC, pas des valeurs par défaut', async () => {
    const { transport } = transportAnswering({ ok: true, data: { application: {} } });
    const result = await loadAppPreferences({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const refusal: ApiResult<unknown> = { ok: false, status: 503, error: 'Indisponible' };
    const { transport } = transportAnswering(refusal);
    expect(await loadAppPreferences({ source: 'gateway', transport })).toEqual(refusal);
  });
});

describe('patchAppPreferences — l’écriture fusionne, et rend ce que le serveur a retenu', () => {
  test('PATCH multi-catégories, corps rangé par catégorie', async () => {
    const { calls, transport } = transportAnswering({ ok: true, data: { privacy: wire().privacy } });
    const result = await patchAppPreferences({ source: 'gateway', transport }, { showTypingIndicator: true });
    expect([calls[0]?.method, calls[0]?.path]).toEqual(['PATCH', '/api/v1/me/preferences']);
    expect(calls[0]?.body).toEqual({ privacy: { showTypingIndicator: true } });
    expect(result).toEqual({
      ok: true,
      data: { showOnlineStatus: false, showLastSeen: true, showReadReceipts: true, showTypingIndicator: false },
    });
  });

  test('sous les fixtures, l’écriture est tenue en mémoire et relue', async () => {
    const { calls, transport } = transportAnswering({ ok: false, status: 0, error: 'jamais appelé' });
    const written = await patchAppPreferences({ source: 'fixtures', transport }, { soundEnabled: false });
    const read = await loadAppPreferences({ source: 'fixtures', transport });
    expect(calls).toHaveLength(0);
    expect(written.ok && written.data.soundEnabled).toBe(false);
    expect(read.ok && read.data.soundEnabled).toBe(false);
  });
});
