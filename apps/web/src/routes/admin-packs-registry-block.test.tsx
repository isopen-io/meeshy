import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminPacksRegistryPanel } from './admin-packs-registry-block';

/**
 * W17 (#11323) — LA CONSOLE DU REGISTRE DES PACKS : la liste servie, publier
 * et retirer d'un geste avec la révision lue, modifier par le formulaire,
 * revenir au dépôt quand une surcharge existe, un refus dit en mots, et la
 * piste d'audit (la révision sur la ligne, le lien vers le journal pour qui le
 * lit).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadAdminInterfaceCatalog('fr');
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 60 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const editable = (extra: Record<string, unknown> = {}) => ({ hidden: false, order: 10, price: null, availability: null, targeting: null, ...extra });
const row = (slug: string, extra: Record<string, unknown> = {}) => ({
  domain: 'wallpaper',
  slug,
  origin: 'official',
  revision: 0,
  base: editable(),
  override: null,
  effective: editable(),
  ...extra,
});

const gateway = (answer: (request: HttpRequest) => ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

const mount = (deps: ReturnType<typeof gateway>['deps'], auditHref: string | null = null) =>
  mounter.mount(
    <QueryClientProvider client={new QueryClient()}>
      <AdminPacksRegistryPanel language="fr" deps={deps} auditHref={auditHref} />
    </QueryClientProvider>,
  );

describe('AdminPacksRegistryPanel', () => {
  test('la liste servie, rangée par domaine, avec son état et sa révision', async () => {
    const { deps } = gateway(() => ({ ok: true, data: [row('aurore', { revision: 3, override: { price: 30 }, effective: editable({ price: 30 }) })] }));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-packs-registry-row="wallpaper:aurore"]') !== null);
    const text = host.querySelector('[data-packs-registry-row="wallpaper:aurore"]')?.textContent ?? '';
    expect(text).toContain('Publié');
    expect(text).toContain('30 Meeshes');
    expect(text).toContain('Surchargé · révision 3');
    expect(host.querySelector('[data-packs-registry-reset="wallpaper:aurore"]')).not.toBeNull();
    expect(host.querySelector('[data-packs-registry-audit]')).toBeNull();
  });

  test('retirer : PUT avec la révision lue, la ligne suit la réponse', async () => {
    const { calls, deps } = gateway((request) =>
      request.method === 'PUT'
        ? { ok: true, data: row('aurore', { revision: 1, override: { hidden: true }, effective: editable({ hidden: true }) }) }
        : { ok: true, data: [row('aurore')] },
    );
    const host = await mount(deps);
    await until(() => host.querySelector('[data-packs-registry-toggle="wallpaper:aurore"]') !== null);
    expect(host.querySelector('[data-packs-registry-reset="wallpaper:aurore"]')).toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-packs-registry-toggle="wallpaper:aurore"]'));
    await until(() => host.querySelector('[data-packs-registry-row="wallpaper:aurore"]')?.getAttribute('data-packs-registry-hidden') === 'true');
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({ path: '/api/v1/admin/packs/registry/wallpaper/aurore', body: { expectedRevision: 0, hidden: true } });
    expect(host.querySelector('[data-packs-registry-toggle="wallpaper:aurore"]')?.textContent).toBe('Publier');
  });

  test('une révision périmée se dit, et le registre est relu', async () => {
    const { calls, deps } = gateway((request) => (request.method === 'PUT' ? { ok: false, status: 409, error: 'revision-conflict' } : { ok: true, data: [row('aurore')] }));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-packs-registry-toggle="wallpaper:aurore"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-packs-registry-toggle="wallpaper:aurore"]'));
    await until(() => host.querySelector('[data-packs-registry-failure="conflict"]') !== null);
    await until(() => calls.filter((call) => call.method === 'GET').length === 2);
  });

  test('une surcharge illégale est refusée en mots, sans relecture', async () => {
    const { calls, deps } = gateway((request) => (request.method === 'PUT' ? { ok: false, status: 422, error: 'PACK_OVERRIDE_UNLAWFUL' } : { ok: true, data: [row('aurore')] }));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-packs-registry-toggle="wallpaper:aurore"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-packs-registry-toggle="wallpaper:aurore"]'));
    await until(() => host.querySelector('[data-packs-registry-failure="unlawful"]') !== null);
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  test('revenir au dépôt : DELETE avec la révision, puis relecture', async () => {
    const { calls, deps } = gateway((request) =>
      request.method === 'DELETE' ? { ok: true, data: { domain: 'wallpaper', slug: 'aurore' } } : { ok: true, data: [row('aurore', { revision: 4, override: { hidden: true } })] },
    );
    const host = await mount(deps);
    await until(() => host.querySelector('[data-packs-registry-reset="wallpaper:aurore"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-packs-registry-reset="wallpaper:aurore"]'));
    await until(() => calls.some((call) => call.method === 'DELETE'));
    expect(calls.find((call) => call.method === 'DELETE')?.path).toBe('/api/v1/admin/packs/registry/wallpaper/aurore?expectedRevision=4');
    await until(() => calls.filter((call) => call.method === 'GET').length === 2);
  });

  test('qui lit le journal voit le lien vers la famille « Packs »', async () => {
    const { deps } = gateway(() => ({ ok: true, data: [row('aurore')] }));
    const host = await mount(deps, '/admin/audit?family=packs');
    await until(() => host.querySelector('[data-packs-registry-audit]') !== null);
    expect(host.querySelector('[data-packs-registry-audit]')?.getAttribute('href')).toBe('/admin/audit?family=packs');
  });
});
