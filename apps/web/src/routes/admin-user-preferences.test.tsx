import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { pathOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserPreferencesPanel } from './admin-user-preferences';

/**
 * **ÉDITER LES PRÉFÉRENCES D'UN MEMBRE** (#7845 A/B) — ce qui se mesure au DOM :
 * chaque valeur est MONTRÉE, le contrôle suit le DESCRIPTEUR (interrupteur,
 * liste), une écriture part en `PATCH` avec les seules clés changées, l'écran
 * la montre AVANT la réponse, et la défait sur un refus — en le disant.
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

const CHARGE = {
  userId: 'u-membre',
  categories: {
    privacy: {
      values: { showOnlineStatus: true, encryptionPreference: 'optional', dataProcessingConsentAt: '2026-03-03T10:00:00.000Z' },
      stored: ['encryptionPreference'],
      fields: {
        showOnlineStatus: { type: 'boolean', default: true },
        encryptionPreference: { type: 'string', enum: ['optional', 'always', 'never'], default: 'optional' },
        dataProcessingConsentAt: { type: 'string' },
      },
      readOnly: ['dataProcessingConsentAt'],
    },
    audio: { values: { volume: 80 }, stored: [], fields: { volume: { type: 'integer', minimum: 0, maximum: 100, default: 80 } }, readOnly: [] },
  },
};

type Reponse = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly status: number; readonly error: string; readonly code?: string };

function transport(ecriture: Reponse | (() => Promise<Reponse>), charge: unknown = CHARGE) {
  return routedTransport((req: HttpRequest) => {
    if (req.method === 'GET' && pathOf(req).endsWith('/preferences')) return { ok: true, data: charge };
    if (req.method === 'PATCH' && pathOf(req).includes('/preferences/')) {
      return typeof ecriture === 'function' ? (ecriture() as never) : (ecriture as never);
    }
    return undefined;
  });
}

async function monter(t: ReturnType<typeof transport>) {
  const annonces: string[] = [];
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserPreferencesPanel
        userId="u-membre"
        language="fr"
        deps={{ source: 'gateway', transport: t.transport }}
        onAnnounce={(texte) => annonces.push(texte)}
      />
    </QueryClientProvider>,
  );
  return { host, annonces };
}

const valeurDe = (host: ParentNode, cle: string) => host.querySelector(`[data-admin-pref-value="${cle}"]`)?.textContent ?? '';

async function ouvrirConfidentialite(host: HTMLElement) {
  await mounter.click(host.querySelector('[data-admin-pref-edit="privacy"]') as HTMLElement | null);
}

describe('chaque valeur est MONTRÉE', () => {
  test('les catégories servies, chacune avec ses clés et leurs valeurs', async () => {
    const { host } = await monter(transport({ ok: true, data: {} }));
    expect(host.querySelector('[data-admin-pref-category="privacy"]')).not.toBe(null);
    expect(host.querySelector('[data-admin-pref-category="audio"]')).not.toBe(null);
    expect(valeurDe(host, 'showOnlineStatus')).toBe(translateAdmin('fr', 'admin.user.enabled'));
    expect(valeurDe(host, 'encryptionPreference')).toBe('optional');
    expect(valeurDe(host, 'volume')).toBe('80');
  });

  test('une date se LIT — jamais un ISO brut', async () => {
    const { host } = await monter(transport({ ok: true, data: {} }));
    expect(valeurDe(host, 'dataProcessingConsentAt')).not.toContain('T10:00:00');
  });

  test('ce qui est POSÉ se distingue du défaut', async () => {
    const { host } = await monter(transport({ ok: true, data: {} }));
    expect(host.querySelector('[data-admin-pref-field="encryptionPreference"] [data-admin-pref-badge]')?.textContent).toBe(
      translateAdmin('fr', 'admin.pref.custom'),
    );
    expect(host.querySelector('[data-admin-pref-field="showOnlineStatus"] [data-admin-pref-badge]')?.textContent).toBe(
      translateAdmin('fr', 'admin.pref.default'),
    );
  });
});

describe('le contrôle suit le descripteur', () => {
  test('un booléen est un INTERRUPTEUR, une liste fermée un <select> avec ses options', async () => {
    const { host } = await monter(transport({ ok: true, data: {} }));
    await ouvrirConfidentialite(host);
    const interrupteur = document.querySelector('[data-admin-pref-control="showOnlineStatus"]');
    expect(interrupteur?.getAttribute('role')).toBe('switch');
    expect(interrupteur?.getAttribute('aria-checked')).toBe('true');
    const liste = document.querySelector('[data-admin-pref-control="encryptionPreference"]');
    expect(liste instanceof HTMLSelectElement).toBe(true);
    expect([...(liste as HTMLSelectElement).options].map((o) => o.value)).toEqual(['optional', 'always', 'never']);
  });

  test('une liste fermée SANS valeur montre le tiret, et sa première option s’écrit', async () => {
    const sansValeur = {
      ...CHARGE,
      categories: { ...CHARGE.categories, privacy: { ...CHARGE.categories.privacy, values: { ...CHARGE.categories.privacy.values, encryptionPreference: null } } },
    };
    const t = transport({ ok: true, data: { category: 'privacy', values: { encryptionPreference: 'optional' }, stored: ['encryptionPreference'] } }, sansValeur);
    const { host } = await monter(t);
    await ouvrirConfidentialite(host);
    const liste = document.querySelector('[data-admin-pref-control="encryptionPreference"]') as HTMLSelectElement;
    expect(liste.value).toBe('');
    expect(liste.options[0]?.value).toBe('');
    typeInto(liste, 'optional');
    await mounter.click(document.querySelector('[data-admin-pref-save]') as HTMLElement | null);
    expect(t.calls().find((c) => c.method === 'PATCH')?.body).toEqual({ values: { encryptionPreference: 'optional' } });
  });

  test('un consentement n’a AUCUN contrôle — il est en lecture seule', async () => {
    const { host } = await monter(transport({ ok: true, data: {} }));
    await ouvrirConfidentialite(host);
    expect(document.querySelector('[data-admin-pref-control="dataProcessingConsentAt"]')).toBe(null);
    expect(document.querySelector('[data-admin-pref-sheet] [data-admin-pref-readonly="dataProcessingConsentAt"]')).not.toBe(null);
  });
});

describe('écrire', () => {
  test('basculer l’interrupteur envoie un PATCH avec la SEULE clé changée', async () => {
    const t = transport({ ok: true, data: { category: 'privacy', values: { showOnlineStatus: false }, stored: ['showOnlineStatus'] } });
    const { host, annonces } = await monter(t);
    await ouvrirConfidentialite(host);
    await mounter.click(document.querySelector('[data-admin-pref-control="showOnlineStatus"]') as HTMLElement | null);
    await mounter.click(document.querySelector('[data-admin-pref-save]') as HTMLElement | null);

    const ecriture = t.calls().find((c) => c.method === 'PATCH');
    expect(ecriture?.path).toBe('/api/v1/admin/users/u-membre/preferences/privacy');
    expect(ecriture?.body).toEqual({ values: { showOnlineStatus: false } });
    expect(valeurDe(host, 'showOnlineStatus')).toBe(translateAdmin('fr', 'admin.users.inactive'));
    expect(annonces).toContain(translateAdmin('fr', 'admin.pref.saved'));
  });

  test('l’écran montre la valeur AVANT la réponse (mise à jour optimiste)', async () => {
    let liberer: (r: Reponse) => void = () => undefined;
    const enVol = new Promise<Reponse>((resolve) => {
      liberer = resolve;
    });
    const { host } = await monter(transport(() => enVol));
    await ouvrirConfidentialite(host);
    typeInto(document.querySelector('[data-admin-pref-control="encryptionPreference"]') as HTMLSelectElement, 'always');
    await mounter.click(document.querySelector('[data-admin-pref-save]') as HTMLElement | null);

    expect(valeurDe(host, 'encryptionPreference')).toBe('always');
    liberer({ ok: true, data: { category: 'privacy', values: { encryptionPreference: 'always' }, stored: ['encryptionPreference'] } });
    await mounter.settle();
    expect(valeurDe(host, 'encryptionPreference')).toBe('always');
  });

  test('un refus de CONSENTEMENT défait l’écriture et le DIT', async () => {
    const t = transport({ ok: false, status: 403, error: 'CONSENT_REQUIRED', code: 'CONSENT_REQUIRED' });
    const { host, annonces } = await monter(t);
    await ouvrirConfidentialite(host);
    await mounter.click(document.querySelector('[data-admin-pref-control="showOnlineStatus"]') as HTMLElement | null);
    await mounter.click(document.querySelector('[data-admin-pref-save]') as HTMLElement | null);

    expect(valeurDe(host, 'showOnlineStatus')).toBe(translateAdmin('fr', 'admin.user.enabled'));
    expect(annonces).toContain(translateAdmin('fr', 'admin.pref.consent'));
  });

  test('rien de changé : aucun PATCH ne part', async () => {
    const t = transport({ ok: true, data: {} });
    const { host } = await monter(t);
    await ouvrirConfidentialite(host);
    const enregistrer = document.querySelector('[data-admin-pref-save]') as HTMLButtonElement | null;
    expect(enregistrer?.disabled).toBe(true);
    expect(t.calls().some((c) => c.method === 'PATCH')).toBe(false);
  });

  test('le motif saisi voyage avec l’écriture', async () => {
    const t = transport({ ok: true, data: { category: 'privacy', values: {}, stored: [] } });
    const { host } = await monter(t);
    await ouvrirConfidentialite(host);
    await mounter.click(document.querySelector('[data-admin-pref-control="showOnlineStatus"]') as HTMLElement | null);
    mounter.type(document.body, '[data-admin-pref-reason]', 'Demande du membre au support');
    await mounter.click(document.querySelector('[data-admin-pref-save]') as HTMLElement | null);
    expect(t.calls().find((c) => c.method === 'PATCH')?.body).toEqual({
      values: { showOnlineStatus: false },
      reason: 'Demande du membre au support',
    });
  });
});
