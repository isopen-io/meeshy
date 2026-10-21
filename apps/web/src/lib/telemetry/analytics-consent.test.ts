import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { appPreferencesQueryOptions, decodeAppPreferences } from '@/lib/api/app-preferences';
import { consentsQueryOptions } from '@/lib/api/consents';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createSessionStore, type SessionStorage } from '@/lib/api/session';
import { liveSocialEventsContext, noteAnalyticsConsent } from '@/lib/view/telemetry-context';

import { analyticsConsentOf, refreshAnalyticsConsentSources, syncAnalyticsConsent } from './analytics-consent';

/**
 * LE CONSENTEMENT D'ANALYSE QUE LE WEB DÉCLARE (#10502) — même règle qu'iOS
 * (`AnalyticsConsentStanding.consent(allowAnalytics:serverGranted:)`) : la
 * bascule coupée refuse toujours, seule la passerelle fait accorder, et tout
 * ce qui n'est pas su reste `unknown`.
 */

describe('analyticsConsentOf — la bascule refuse, la passerelle accorde', () => {
  test('bascule coupée ⇒ denied, même quand la passerelle a confirmé un accord', () => {
    expect(analyticsConsentOf({ allowAnalytics: false, serverGranted: true })).toBe('denied');
    expect(analyticsConsentOf({ allowAnalytics: false, serverGranted: false })).toBe('denied');
    expect(analyticsConsentOf({ allowAnalytics: false })).toBe('denied');
  });

  test('bascule active sans confirmation de la passerelle ⇒ unknown', () => {
    expect(analyticsConsentOf({ allowAnalytics: true, serverGranted: false })).toBe('unknown');
    expect(analyticsConsentOf({ allowAnalytics: true })).toBe('unknown');
  });

  test('bascule active et accord confirmé par la passerelle ⇒ granted', () => {
    expect(analyticsConsentOf({ allowAnalytics: true, serverGranted: true })).toBe('granted');
  });

  test('bascule inconnue (réglages non chargés, ancien serveur) ⇒ unknown, quoi que dise la passerelle', () => {
    expect(analyticsConsentOf({})).toBe('unknown');
    expect(analyticsConsentOf({ serverGranted: true })).toBe('unknown');
  });
});

const memoryStorage = (): SessionStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const preferencesWire = (allowAnalytics: boolean | undefined) => ({
  application: { theme: 'auto' },
  notification: { pushEnabled: true, soundEnabled: true, contactActivityEnabled: true },
  privacy: {
    showOnlineStatus: true,
    showLastSeen: true,
    showReadReceipts: true,
    showTypingIndicator: true,
    hideProfileFromSearch: false,
    acceptCallsFromNonContacts: true,
    notifyContactsOnReturn: true,
    ...(allowAnalytics === undefined ? {} : { allowAnalytics }),
  },
});

const consentsWire = (analyticsGranted: boolean) => ({
  consents: [
    { purpose: 'data-processing', granted: true, grantedAt: '2026-10-01T00:00:00.000Z', policyVersion: '2026-08-30', source: 'server' },
    analyticsGranted
      ? { purpose: 'analytics', granted: true, grantedAt: '2026-10-01T00:00:00.000Z', policyVersion: '2026-08-30', source: 'server' }
      : { purpose: 'analytics', granted: false, revokedAt: null, policyVersion: '2026-08-30', source: 'server' },
  ],
  gameConsents: [],
  derived: { canTranscribeAudio: false, canTranslateAudio: false, canUseVoiceCloning: false, canCollectAnalytics: analyticsGranted },
});

type Served = { preferences: ApiResult<unknown>; consents: ApiResult<unknown> };

/** Une passerelle simulée : chaque lecture rend ce que `served` dit À CET INSTANT. */
const gateway = (initial: Served) => {
  const state: { served: Served; calls: HttpRequest[] } = { served: initial, calls: [] };
  const transport = {
    request: async (request: HttpRequest) => {
      state.calls.push(request);
      return request.path.startsWith('/api/v1/me/consents') ? state.served.consents : state.served.preferences;
    },
  } as unknown as HttpTransport;
  return { state, transport };
};

/** Les notifications du cache de requêtes partent en lot, au tour suivant de la boucle : quelques tours suffisent. */
const settle = async () => {
  for (const _turn of [1, 2, 3, 4, 5]) await new Promise((resolve) => setTimeout(resolve, 0));
};

const harness = (initial: Served) => {
  const { state, transport } = gateway(initial);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sessionStore = createSessionStore({ storage: memoryStorage(), now: () => 0 });
  const refresh = () =>
    refreshAnalyticsConsentSources({
      queryClient,
      preferences: appPreferencesQueryOptions({ source: 'gateway', transport }),
      consents: consentsQueryOptions({ transport }),
    });
  const stop = syncAnalyticsConsent({ sessionStore, queryClient, refresh, note: noteAnalyticsConsent });
  const signIn = (id: string) =>
    sessionStore.getState().establish({
      user: { id, username: `u-${id}` },
      token: `jwt-${id}`,
      sessionToken: `s-${id}`,
      expiresIn: 3600,
    });
  return { state, queryClient, sessionStore, stop, signIn };
};

describe('syncAnalyticsConsent — le contexte de lot suit les réglages, les consentements et la session', () => {
  test('une charge allowAnalytics:false fait déclarer denied au contexte de lot', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(false) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('denied');
    h.stop();
  });

  test('bascule activée et accord confirmé par la passerelle ⇒ granted ; déconnexion ⇒ unknown', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('granted');

    h.sessionStore.getState().clearSession();
    expect(liveSocialEventsContext().consent).toBe('unknown');
    h.stop();
  });

  test('bascule activée sans accord de la passerelle ⇒ unknown', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(false) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('unknown');
    h.stop();
  });

  test('une lecture des consentements en échec ne fait jamais accorder', async () => {
    const h = harness({
      preferences: { ok: true, data: preferencesWire(true) },
      consents: { ok: false, status: 503, error: 'Indisponible' },
    });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('unknown');
    h.stop();
  });

  test('un ancien serveur qui ne sert pas allowAnalytics ⇒ unknown, même avec un accord serveur', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(undefined) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('unknown');
    h.stop();
  });

  test('un réglage changé dans le cache (bascule coupée depuis les réglages) passe aussitôt en denied', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('granted');

    const current = h.queryClient.getQueryData<Record<string, unknown>>(['me', 'app-preferences']);
    h.queryClient.setQueryData(['me', 'app-preferences'], { ...current, allowAnalytics: false });
    expect(liveSocialEventsContext().consent).toBe('denied');
    h.stop();
  });

  test('des réglages en cache, FRAIS mais lus par une version qui ignorait la bascule, sont relus aussitôt', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(false) }, consents: { ok: true, data: consentsWire(true) } });
    const { allowAnalytics: _absent, ...olderProjection } = decodeAppPreferences(preferencesWire(false)) ?? {};
    h.queryClient.setQueryData(['me', 'app-preferences'], olderProjection);
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('denied');
    h.stop();
  });

  test('aucune requête tant que le visiteur n’est pas connecté', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(true) } });
    await settle();
    expect(h.state.calls).toHaveLength(0);
    expect(liveSocialEventsContext().consent).toBe('unknown');
    h.stop();
  });

  test('un jeton renouvelé pour le même compte ne relit rien', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    const reads = h.state.calls.length;
    h.signIn('a');
    await settle();
    expect(h.state.calls).toHaveLength(reads);
    expect(liveSocialEventsContext().consent).toBe('granted');
    h.stop();
  });

  test('le changement de compte relit les réglages du compte arrivé', async () => {
    const h = harness({ preferences: { ok: true, data: preferencesWire(true) }, consents: { ok: true, data: consentsWire(true) } });
    h.signIn('a');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('granted');

    h.queryClient.clear();
    h.state.served = { preferences: { ok: true, data: preferencesWire(false) }, consents: { ok: true, data: consentsWire(true) } };
    h.signIn('b');
    expect(liveSocialEventsContext().consent).not.toBe('granted');
    await settle();
    expect(liveSocialEventsContext().consent).toBe('denied');
    h.stop();
  });
});
