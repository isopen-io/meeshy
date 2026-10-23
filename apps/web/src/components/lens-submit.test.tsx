import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Digest } from '@/lib/lens-packs/submission';
import { lensSubmitTextKeysOf } from '@/lib/lens-packs/submit-texts';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensSubmit } from './lens-submit';

/**
 * W16 (#11322) — PROPOSER UNE LENS, la surface : le document et ses fichiers
 * partent par `POST /packs/lens/submissions`, un refus se dit par sa cause, et
 * « Mes propositions » relit l'état et le mot de la modération.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
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

const lensDocument = {
  schema: 1,
  id: 'aurore-polaire',
  name: 'Aurore polaire',
  credits: { author: 'Studio Nord', createdAt: '2026-10-01' },
  surfaces: ['capture'],
  cost: 'standard',
  window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z' },
  layers: [{ kind: 'lut', id: 'grade', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 0.8 }],
};

const digest: Digest = async (bytes) => new TextDecoder().decode(bytes).padEnd(64, '0');

const pack = (extra: Record<string, unknown> = {}) => ({ slug: 'aurore-polaire', name: 'Aurore polaire', status: 'pending', ...extra });

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

const choose = async (input: HTMLInputElement | null, files: readonly File[]) => {
  if (input === null) throw new Error('champ absent');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const mount = (deps: ReturnType<typeof gateway>['deps']) =>
  mounter.mount(
    <QueryClientProvider client={new QueryClient()}>
      <LensSubmit language="fr" deps={deps} digest={digest} />
    </QueryClientProvider>,
  );

describe('LensSubmit', () => {
  test('« Mes propositions » dit l’état et le mot de la modération', async () => {
    const { deps } = gateway(() => ({ ok: true, data: [pack({ status: 'rejected', reviewNote: 'Trop sombre' })] }));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-submission="aurore-polaire"]') !== null);
    const row = host.querySelector('[data-lens-submission="aurore-polaire"]')!;
    expect(row.textContent).toContain('Refusée');
    expect(row.querySelector('[data-lens-review-note]')?.textContent).toBe('Mot de la modération : Trop sombre');
  });

  test('proposer : le document et le fichier nommé partent, la proposition entre dans la liste', async () => {
    const { calls, deps } = gateway((request) => (request.method === 'POST' ? { ok: true, data: pack() } : { ok: true, data: [] }));
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-submissions-empty]') !== null);
    await choose(host.querySelector<HTMLInputElement>('[data-lens-document]'), [new File([JSON.stringify(lensDocument)], 'lens.json', { type: 'application/json' })]);
    await choose(host.querySelector<HTMLInputElement>('[data-lens-assets]'), [new File(['aaaaaaaaaaaaaaaa'], 'grade.png', { type: 'image/png' })]);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-submit-button]'));
    await until(() => host.querySelector('[data-lens-submitted]') !== null);
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe('/api/v1/packs/lens/submissions');
    expect(post?.body).toEqual({ document: lensDocument, assets: { 'aaaaaaaaaaaaaaaa.png': btoa('aaaaaaaaaaaaaaaa') } });
    expect(host.querySelector('[data-lens-submission="aurore-polaire"]')).not.toBeNull();
  });

  test('un fichier manquant se dit avant le réseau ; un refus du serveur se dit par sa cause', async () => {
    const { calls, deps } = gateway((request) =>
      request.method === 'POST' ? { ok: false, status: 409, error: 'taken', code: 'LENS_SLUG_TAKEN' } : { ok: true, data: [] },
    );
    const host = await mount(deps);
    await until(() => host.querySelector('[data-lens-submissions-empty]') !== null);
    await choose(host.querySelector<HTMLInputElement>('[data-lens-document]'), [new File([JSON.stringify(lensDocument)], 'lens.json')]);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-submit-button]'));
    await until(() => host.querySelector('[data-lens-refusal="missing-asset"]') !== null);
    expect(host.querySelector('[data-lens-refusal]')?.textContent).toBe('Il manque le fichier aaaaaaaaaaaaaaaa.png.');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await choose(host.querySelector<HTMLInputElement>('[data-lens-assets]'), [new File(['aaaaaaaaaaaaaaaa'], 'grade.png')]);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-submit-button]'));
    await until(() => host.querySelector('[data-lens-refusal="slug-taken"]') !== null);
  });

  test('les textes existent dans les sept langues', () => {
    const source = [...lensSubmitTextKeysOf('fr')].sort();
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) expect([...lensSubmitTextKeysOf(language)].sort()).toEqual(source);
  });
});
