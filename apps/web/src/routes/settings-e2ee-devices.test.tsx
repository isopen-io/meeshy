import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { E2EE_DEVICES_QUERY_KEY, type E2eeDevice } from '@/lib/api/e2ee-devices';
import type { ApiResult } from '@/lib/api/http';
import { loadSessionsCatalog } from '@/lib/i18n-sessions-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SettingsE2eeDevicesScreen, type E2eeDevicesScreenDeps } from './settings-e2ee-devices';

/**
 * RÉGLAGES › SÉCURITÉ › MES APPAREILS CHIFFRÉS (#13013, jumelle web de #13009) —
 * la liste servie, le retrait optimiste qui se défait sur un refus, l'état
 * honnête de CE navigateur (ou de la coque), et les états dessinés.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSessionsCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const device = (overrides: Partial<E2eeDevice>): E2eeDevice => ({
  deviceId: 1,
  platform: 'ios',
  label: null,
  createdAt: '2026-10-20T09:00:00.000Z',
  lastSeenAt: '2026-10-25T08:00:00.000Z',
  current: false,
  ...overrides,
});

const served = (): readonly E2eeDevice[] => [
  device({ deviceId: 1, label: 'iPhone de Awa', lastSeenAt: '2026-10-25T08:00:00.000Z' }),
  device({ deviceId: 2, platform: 'macos', label: null, lastSeenAt: '2026-10-24T08:00:00.000Z' }),
];

function harness(overrides: Partial<E2eeDevicesScreenDeps> = {}, host: 'browser' | 'android-shell' = 'browser') {
  const calls: string[] = [];
  const server = { state: served() };
  const deps: E2eeDevicesScreenDeps = {
    load: async () => ({ ok: true, data: server.state, status: 200 }),
    retire: async (deviceId) => {
      calls.push(`retire:${deviceId}`);
      server.state = server.state.filter((row) => row.deviceId !== deviceId);
      return { ok: true, data: { deviceId, retired: true, signedOut: true }, status: 200 };
    },
    ...overrides,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (
    <SettingsE2eeDevicesScreen language="fr" deps={deps} queryClient={queryClient} host={host} now={() => new Date('2026-10-25T12:00:00.000Z')} />
  );
  return { element, calls, queryClient };
}

const confirmButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-confirm-dialog] button')].find((button) => button.textContent === label) ?? null;

describe('la liste', () => {
  test('chaque appareil se nomme — son nom déclaré, sinon sa plateforme — avec un retrait étiqueté', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    const cards = [...host.querySelectorAll('[data-e2ee-device]')];
    expect(cards.map((card) => card.getAttribute('data-e2ee-device'))).toEqual(['1', '2']);
    expect(cards[0]?.textContent).toContain('iPhone de Awa');
    expect(cards[1]?.textContent).toContain('Mac');
    expect(cards[0]?.querySelector('[data-e2ee-device-retire]')?.getAttribute('aria-label')).toBe('Retirer l’appareil iPhone de Awa');
  });

  test('chaque appareil dit sa plateforme, son numéro, quand le chiffrement a été activé et sa dernière activité', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    const fields = [...(host.querySelector('[data-e2ee-device="1"]')?.querySelectorAll('[data-e2ee-device-field]') ?? [])].map((field) =>
      field.getAttribute('data-e2ee-device-field'),
    );
    expect(fields).toEqual(['platform', 'number', 'enrolled', 'lastSeen']);
    expect(host.querySelector('[data-e2ee-device="1"] [data-e2ee-device-field="platform"]')?.textContent).toContain('iPhone ou iPad');
  });

  test('l’appareil de cette session est marqué et ne se retire pas d’ici', async () => {
    const { element } = harness({ load: async () => ({ ok: true, data: [device({ deviceId: 3, current: true })], status: 200 }) });
    const host = await mount(element);
    await settle();
    const card = host.querySelector('[data-e2ee-device="3"]');
    expect(card?.textContent).toContain('Cet appareil');
    expect(card?.querySelector('[data-e2ee-device-retire]')).toBeNull();
  });

  test('cache d’abord : une liste en cache se peint au premier rendu, sans squelette', async () => {
    const { element, queryClient } = harness({ load: () => new Promise<ApiResult<readonly E2eeDevice[]>>(() => undefined) });
    queryClient.setQueryData(E2EE_DEVICES_QUERY_KEY, served());
    const host = await mount(element);
    expect(host.querySelector('[data-e2ee-devices-loading]')).toBeNull();
    expect(host.querySelectorAll('[data-e2ee-device]')).toHaveLength(2);
  });
});

describe('ce navigateur', () => {
  test('dit qu’il ne lit pas les conversations chiffrées de bout en bout, et où les lire', async () => {
    const { element } = harness();
    const host = await mount(element);
    await settle();
    expect(host.querySelector('[data-e2ee-devices-here]')?.textContent).toBe(
      'Ce navigateur ne lit pas les conversations chiffrées de bout en bout — ouvrez-les dans l’application Meeshy installée.',
    );
  });

  test('dans la coque Android, parle de l’application, pas d’un navigateur', async () => {
    const { element } = harness({}, 'android-shell');
    const host = await mount(element);
    await settle();
    expect(host.querySelector('[data-e2ee-devices-here]')?.textContent).toContain('Cette application ne lit pas encore');
  });
});

describe('les états dessinés', () => {
  test('cache vide : un squelette annoncé', async () => {
    const { element } = harness({ load: () => new Promise<ApiResult<readonly E2eeDevice[]>>(() => undefined) });
    const host = await mount(element);
    expect(host.querySelector('[data-e2ee-devices-loading]')?.getAttribute('aria-label')).toBe('Chargement des appareils chiffrés…');
  });

  test('erreur : la cause et « Réessayer »', async () => {
    const { element } = harness({ load: async () => ({ ok: false, status: 500, error: 'panne' }) });
    const host = await mount(element);
    await settle();
    const error = host.querySelector('[data-e2ee-devices-error]');
    expect(error?.getAttribute('data-e2ee-devices-error')).toBe('unavailable');
    expect(error?.textContent).toContain('Réessayer');
  });

  test('session expirée : le dit, sans « Réessayer »', async () => {
    const { element } = harness({ load: async () => ({ ok: false, status: 401, error: 'expirée' }) });
    const host = await mount(element);
    await settle();
    const error = host.querySelector('[data-e2ee-devices-error]');
    expect(error?.textContent).toContain('Reconnectez-vous');
    expect(error?.querySelector('button')).toBeNull();
  });

  test('vide : dit comment activer le chiffrement, jamais une liste blanche', async () => {
    const { element } = harness({ load: async () => ({ ok: true, data: [], status: 200 }) });
    const host = await mount(element);
    await settle();
    expect(host.querySelector('[data-e2ee-devices-empty]')?.textContent).toContain('Aucun appareil chiffré');
  });
});

describe('retirer', () => {
  test('confirmation qui nomme l’appareil, retrait immédiat, appel, annonce', async () => {
    const { element, calls } = harness();
    const host = await mount(element);
    await settle();
    const retire = host.querySelector<HTMLButtonElement>('[data-e2ee-device="1"] [data-e2ee-device-retire]');
    if (retire !== null) await click(retire);
    expect(calls).toEqual([]);
    expect(document.querySelector('[data-confirm-dialog="retire-e2ee-device"]')?.textContent).toContain('iPhone de Awa sera déconnecté');
    const confirm = confirmButton('Retirer cet appareil');
    if (confirm !== null) await click(confirm);
    await settle();
    expect(calls).toEqual(['retire:1']);
    expect(host.querySelector('[data-e2ee-device="1"]')).toBeNull();
    expect(host.querySelector('[data-e2ee-devices-announce]')?.textContent).toBe('Appareil retiré');
  });

  test('un refus remet la ligne et le dit', async () => {
    const { element } = harness({ retire: async () => ({ ok: false, status: 500, error: 'panne' }) });
    const host = await mount(element);
    await settle();
    const retire = host.querySelector<HTMLButtonElement>('[data-e2ee-device="2"] [data-e2ee-device-retire]');
    if (retire !== null) await click(retire);
    const confirm = confirmButton('Retirer cet appareil');
    if (confirm !== null) await click(confirm);
    await settle();
    expect(host.querySelector('[data-e2ee-device="2"]')).not.toBeNull();
    expect(host.querySelector('[data-e2ee-devices-announce]')?.textContent).toBe('L’appareil n’a pas pu être retiré. Réessayez.');
  });

  test('un appareil déjà retiré ailleurs (404) est un succès', async () => {
    const { element } = harness({ retire: async () => ({ ok: false, status: 404, error: 'introuvable' }) });
    const host = await mount(element);
    await settle();
    const retire = host.querySelector<HTMLButtonElement>('[data-e2ee-device="2"] [data-e2ee-device-retire]');
    if (retire !== null) await click(retire);
    const confirm = confirmButton('Retirer cet appareil');
    if (confirm !== null) await click(confirm);
    await settle();
    expect(host.querySelector('[data-e2ee-devices-announce]')?.textContent).toBe('Appareil retiré');
  });
});
