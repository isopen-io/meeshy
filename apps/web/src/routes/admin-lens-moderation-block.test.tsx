import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { lensModerationTextKeysOf } from '@/lib/lens-packs/moderation-texts';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminLensModerationPanel } from './admin-lens-moderation-block';

/**
 * W16 (#11322) — LA MODÉRATION DES LENS : la file, le document servi relu par
 * `parseLens`, publier en fixant fenêtre et communautés, refuser avec un mot,
 * retirer une lens publiée ; un refus se dit par sa cause (auto-revue, journal
 * indisponible), une saisie invalide ne part pas.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
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

const pack = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: `Lens ${slug}`, author: 'studio-nord', status: 'pending', cost: 'standard', ...extra });
const lensDocument = {
  schema: 1,
  id: 'aurore',
  name: 'Aurore',
  credits: { author: 'Studio Nord', createdAt: '2026-10-01' },
  surfaces: ['capture', 'live'],
  cost: 'standard',
  window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
  layers: [{ kind: 'lut', id: 'grade', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 0.8 }],
};

type Router = (request: HttpRequest) => ApiResult<unknown> | undefined;

const gateway = (route: Router) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      const answered = route(request);
      if (answered !== undefined) return answered as ApiResult<T>;
      if (request.path.endsWith('/pending')) return { ok: true, data: [pack('aurore')] } as ApiResult<T>;
      if (request.path === '/api/v1/packs/lens') return { ok: true, data: [pack('neige', { status: 'approved' })] } as ApiResult<T>;
      if (request.path.endsWith('/document')) return { ok: true, data: lensDocument } as ApiResult<T>;
      return { ok: true, data: pack('aurore', { status: 'approved' }) } as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

const mount = (deps: ReturnType<typeof gateway>['deps']) =>
  mounter.mount(
    <QueryClientProvider client={new QueryClient()}>
      <AdminLensModerationPanel language="fr" deps={deps} />
    </QueryClientProvider>,
  );

const type = async (input: HTMLInputElement | null, value: string) => {
  typeInto(input, value);
  await act(settle);
};

describe('AdminLensModerationPanel', () => {
  test('la file et les publiées ; le document servi se résume', async () => {
    const { calls, deps } = gateway(() => undefined);
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-pending="aurore"]') !== null);
    await until(() => host.querySelector('[data-lens-published="neige"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-document-open="aurore"]'));
    await until(() => host.querySelector('[data-lens-document-summary="ok"]') !== null);
    expect(host.querySelector('[data-lens-document-summary]')?.textContent).toBe('1 couches (lut), 0 déclencheurs, surfaces : capture, live');
    expect(calls.some((call) => call.path === '/api/v1/packs/lens/aurore/document')).toBe(true);
  });

  test('publier en fixant la fenêtre et une communauté', async () => {
    const { calls, deps } = gateway(() => undefined);
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-pending="aurore"]') !== null);
    const row = host.querySelector('[data-lens-pending="aurore"]')!;
    await type(row.querySelector('input[name="startsAt"]'), '2026-12-01T00:00');
    await type(row.querySelector('input[name="endsAt"]'), '2026-12-31T23:59');
    await type(row.querySelector('input[name="communities"]'), '64b7f0c2a1b2c3d4e5f60718');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-approve="aurore"]'));
    await until(() => host.querySelector('[data-lens-done="approved"]') !== null);
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({
      path: '/api/v1/packs/lens/aurore/review',
      body: { decision: 'approve', window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:00Z' }, communities: ['64b7f0c2a1b2c3d4e5f60718'] },
    });
  });

  test('une fenêtre à moitié ne part pas ; une auto-revue se dit', async () => {
    const { calls, deps } = gateway((request) => (request.method === 'POST' ? { ok: false, status: 403, error: 'x', code: 'LENS_SELF_REVIEW' } : undefined));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-pending="aurore"]') !== null);
    const row = host.querySelector('[data-lens-pending="aurore"]')!;
    await type(row.querySelector('input[name="startsAt"]'), '2026-12-01T00:00');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-approve="aurore"]'));
    await until(() => host.querySelector('[data-lens-refusal="invalid"]') !== null);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-reject="aurore"]'));
    await until(() => host.querySelector('[data-lens-refusal="self-review"]') !== null);
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ decision: 'reject' });
  });

  test('retirer une lens publiée, avec un mot', async () => {
    const { calls, deps } = gateway(() => undefined);
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-published="neige"]') !== null);
    await type(host.querySelector('[data-lens-published="neige"] input[name="note"]'), 'Signalée');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-withdraw="neige"]'));
    await until(() => host.querySelector('[data-lens-done="withdrawn"]') !== null);
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({ path: '/api/v1/packs/lens/neige/withdraw', body: { note: 'Signalée' } });
  });

  test('les textes existent dans les quatre langues de l’administration', () => {
    const source = [...lensModerationTextKeysOf('fr')].sort();
    for (const language of ['en', 'es', 'pt'] as const) expect([...lensModerationTextKeysOf(language)].sort()).toEqual(source);
  });
});
