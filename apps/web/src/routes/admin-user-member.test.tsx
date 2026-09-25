import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserPreferencesTab, AdminUserStatsSection } from './admin-user-member';

/**
 * LES CHIFFRES ET LES PRÉFÉRENCES D'UN MEMBRE (#7845) — une préférence se
 * bascule tout de suite, revient en arrière sur un refus et dit pourquoi ; le
 * chiffrement se lit sans s'écrire.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const PREFS = {
  privacy: { showOnlineStatus: true, encryptionPreference: 'optional', extras: {} },
  audio: { transcriptionEnabled: false, ttsSpeed: 1 },
  application: { theme: 'auto' },
};

function transport(reponsePatch: ApiResult<unknown>, vu: HttpRequest[]): HttpTransport {
  const t = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  t.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    vu.push(req);
    if (req.method === 'PATCH') return reponsePatch;
    if (req.path.endsWith('/preferences')) return { ok: true, data: PREFS };
    if (req.path.endsWith('/stats')) return { ok: true, data: { messagesSent: 1200, friends: 4, reportsFiled: null } };
    return { ok: false, status: 404, error: req.path };
  }) as HttpTransport['request'];
  return t;
}

const attendre = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function monterPreferences(reponsePatch: ApiResult<unknown>, vu: HttpRequest[] = []) {
  const annonces: string[] = [];
  const hote = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserPreferencesTab
        userId="u1"
        language="fr"
        onAnnounce={(texte) => annonces.push(texte)}
        deps={{ source: 'gateway', transport: transport(reponsePatch, vu) }}
      />
    </QueryClientProvider>,
  );
  await attendre();
  return { hote, annonces };
}

const bascule = (hote: ParentNode, chemin: string) => hote.querySelector<HTMLButtonElement>(`[data-admin-preference-switch="${chemin}"]`);

describe('les préférences d’un membre, modifiables', () => {
  test('une bascule écrit la seule clé changée, et l’écran suit tout de suite', async () => {
    const vu: HttpRequest[] = [];
    const { hote } = await monterPreferences({ ok: true, data: { category: 'privacy', preferences: { showOnlineStatus: false } } }, vu);
    act(() => bascule(hote, 'privacy.showOnlineStatus')?.click());

    expect(bascule(hote, 'privacy.showOnlineStatus')?.getAttribute('aria-checked')).toBe('false');
    await attendre();
    const patch = vu.find((r) => r.method === 'PATCH');
    expect([patch?.path, patch?.body]).toEqual(['/api/v1/admin/users/u1/preferences/privacy', { showOnlineStatus: false }]);
  });

  test('un refus pour consentement manquant revient en arrière et dit pourquoi', async () => {
    const { hote, annonces } = await monterPreferences({ ok: false, status: 403, error: 'refus', code: 'CONSENT_REQUIRED' });
    act(() => hote.querySelector<HTMLButtonElement>('#admin-prefs-audio button, [data-collapsible-toggle="admin-prefs-audio"]')?.click());
    const transcription = bascule(hote, 'audio.transcriptionEnabled');
    act(() => transcription?.click());
    await attendre();

    expect(bascule(hote, 'audio.transcriptionEnabled')?.getAttribute('aria-checked')).toBe('false');
    expect(hote.querySelector('[data-admin-preferences-error]')?.textContent).toContain('consentement');
    expect(annonces.at(-1)).toContain('consentement');
  });

  test('le chiffrement se lit sans pouvoir s’écrire', async () => {
    const { hote } = await monterPreferences({ ok: true, data: {} });
    const liste = hote.querySelector<HTMLSelectElement>('[data-admin-preference-select="privacy.encryptionPreference"]');
    expect([liste?.value, liste?.disabled]).toEqual(['optional', true]);
    expect(hote.querySelector('[data-admin-preference="privacy.extras"]')).toBeNull();
  });
});

describe('les chiffres d’un membre', () => {
  test('montrent ce qui est servi, et taisent le chiffre que la passerelle retient', async () => {
    const hote = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserStatsSection userId="u1" language="fr" deps={{ source: 'gateway', transport: transport({ ok: true, data: {} }, []) }} />
      </QueryClientProvider>,
    );
    await attendre();
    expect(hote.querySelector('[data-admin-stat="messagesSent"]')?.textContent).toContain('1');
    expect(hote.querySelector('[data-admin-stat="friends"]')?.textContent).toContain('4');
    expect(hote.querySelector('[data-admin-stat="reportsFiled"]')).toBeNull();
  });
});
