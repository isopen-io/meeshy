import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { receiveBatteryState } from '@/lib/battery/battery-live';
import { loadBatteryCatalog } from '@/lib/i18n-battery-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationBatterySection, MeBatterySection, ProfileBatteryRow } from './battery-panel';

/**
 * LA BATTERIE D'UN PROCHE DANS LA FICHE ET LE PROFIL (#14147) — le web reçoit et affiche : le détail n'existe que
 * pendant un épisode, le relevé à la demande entre Sangs seulement, le partage proposé à un Proche sans être
 * coché, et chaque réglage bascule au geste puis revient si le serveur refuse.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadBatteryCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const ADA = 'b'.repeat(24);

type Route = (request: HttpRequest) => ApiResult<unknown> | undefined;

function gateway({ level, settings = { shared: false, receive: 'all' }, sharingEnabled = true, extra }: { readonly level: string; readonly settings?: Readonly<Record<string, unknown>>; readonly sharingEnabled?: boolean; readonly extra?: Route }) {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(request);
      const custom = extra?.(request);
      if (custom !== undefined) return custom as ApiResult<T>;
      if (request.path.endsWith('/battery/settings') && request.path.includes('/relations/')) return { ok: true, data: settings } as ApiResult<T>;
      if (request.path.endsWith('/device/battery/settings')) return { ok: true, data: { sharingEnabled } } as ApiResult<T>;
      if (request.method === 'GET' && /\/relations$/.test(request.path)) return { ok: true, data: [{ userId: ADA, effectiveLevel: level, grantedByMe: level }] } as ApiResult<T>;
      return { ok: false, status: 500, error: 'inattendu' };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, calls };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

const critical = (client: QueryClient) =>
  receiveBatteryState(client, { userId: ADA, phase: 'critical', level: 4, charging: false, lowPower: true, estimatedMinutes: 25, measuredAt: new Date().toISOString() }, Date.now());

describe('la fiche d’un direct', () => {
  test('un Sang en épisode : le détail, le relevé à la demande et ce que je reçois', async () => {
    const client = new QueryClient();
    critical(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationBatterySection userId={ADA} name="Ada" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-battery-detail="critical"]')?.textContent).toContain('Batterie critique');
    expect(host.textContent).toContain('Mode économie d’énergie activé');
    expect(host.querySelector('[data-battery-pull]')).not.toBeNull();
    expect(host.querySelector('[data-battery-receive="all"]')).not.toBeNull();
  });

  test('un Proche : ni relevé à la demande ; hors épisode, aucun détail', async () => {
    const client = new QueryClient();
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ConversationBatterySection userId={ADA} name="Ada" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-battery-pull]')).toBeNull();
    expect(host.querySelector('[data-battery-detail]')).toBeNull();
    expect(host.querySelector('[data-battery-receive]')).not.toBeNull();
  });

  test('sous Proche : rien', async () => {
    const client = new QueryClient();
    critical(client);
    const { deps } = gateway({ level: 'FRIEND' });
    const host = await mount(<ConversationBatterySection userId={ADA} name="Ada" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });

  test('choisir « Pastille seulement » bascule au geste, et revient si le serveur refuse', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'CLOSE', extra: (request) => (request.method === 'PUT' ? { ok: false, status: 0, error: 'hors ligne' } : undefined) });
    const host = await mount(<ConversationBatterySection userId={ADA} name="Ada" language="fr" deps={deps} client={client} />);
    await settle();
    const pill = host.querySelector<HTMLInputElement>('[data-battery-receive-mode="pill"]');
    await act(async () => pill?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ receive: 'pill' });
    expect(host.querySelector('[data-battery-receive="all"]')).not.toBeNull();
    expect(host.textContent).toContain('Hors ligne : le réglage n’a pas été enregistré.');
  });

  test('le relevé demandé trop tôt le dit par son nom', async () => {
    const client = new QueryClient();
    const { deps } = gateway({
      level: 'BLOOD',
      extra: (request) => (request.path.endsWith('/battery/pull') ? { ok: false, status: 429, code: 'BATTERY_PULL_TOO_SOON', error: 'trop tôt' } : undefined),
    });
    const host = await mount(<ConversationBatterySection userId={ADA} name="Ada" language="fr" deps={deps} client={client} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-battery-pull]')?.click());
    await settle();
    expect(host.querySelector('[data-battery-pull-notice]')?.getAttribute('data-battery-pull-notice')).toBe('too-soon');
    expect(host.textContent).toContain('moins de 5 minutes');
  });
});

describe('le profil d’une personne', () => {
  test('un Proche : le partage est proposé sans être coché, et le web dit qu’il n’envoie rien', async () => {
    const client = new QueryClient();
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ProfileBatteryRow language="fr" person={{ id: ADA, username: 'ada', displayName: 'Ada' }} deps={deps} client={client} />);
    await settle();
    const share = host.querySelector('[data-battery-share]');
    expect(share?.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('Rien n’est partagé tant que vous ne l’activez pas.');
    expect(host.querySelector('[data-battery-web-note]')).not.toBeNull();
    expect(host.querySelector('[data-battery-pull]')).toBeNull();
  });

  test('un Sang : partagé par défaut (servi), retirable, et le partage global coupé se dit', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'BLOOD', settings: { shared: true, receive: 'all' }, sharingEnabled: false, extra: (request) => (request.method === 'PUT' ? { ok: true, data: { shared: false, receive: 'all' } } : undefined) });
    const host = await mount(<ProfileBatteryRow language="fr" person={{ id: ADA, username: 'ada', displayName: 'Ada' }} deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-battery-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-battery-global-off]')).not.toBeNull();
    expect(host.querySelector('[data-battery-pull]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-battery-share]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: false });
    expect(host.querySelector('[data-battery-share]')?.getAttribute('aria-checked')).toBe('false');
  });
});

describe('mon profil', () => {
  test('la coupure globale se bascule, et le web dit qu’il n’envoie rien', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'NONE', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { sharingEnabled: false } } : undefined) });
    const host = await mount(<MeBatterySection language="fr" deps={deps} client={client} />);
    await settle();
    const global = host.querySelector<HTMLButtonElement>('[data-battery-global]');
    expect(global?.getAttribute('aria-checked')).toBe('true');
    await act(async () => global?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ sharingEnabled: false });
    expect(host.querySelector('[data-battery-global]')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[data-battery-web-note]')).not.toBeNull();
  });
});
