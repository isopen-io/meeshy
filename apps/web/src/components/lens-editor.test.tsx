import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { CameraEffectsPort } from '@/lib/calls/camera-effects';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { lensEditorTextKeysOf } from '@/lib/lens-packs/editor-texts';
import type { Digest } from '@/lib/lens-packs/submission';
import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { CameraPreviewPort } from './lens-camera-preview';
import { LensSubmit } from './lens-submit';

/**
 * W16 (#11322) — COMPOSER UNE LENS SANS CODE : le partenaire nomme sa lens,
 * signe, ajoute ses couches (texte, sticker, particules, étalonnage) et
 * « Proposer » envoie le document composé et ses fichiers par
 * `POST /packs/lens/submissions`. L'aperçu caméra joue le brouillon EN COURS.
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

const digest: Digest = async (bytes) => new TextDecoder().decode(bytes).padEnd(64, '0');

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

const fakeTrack = (): MediaStreamTrack => ({ kind: 'video', readyState: 'live', stop: () => undefined }) as unknown as MediaStreamTrack;

const previewHarness = () => {
  const seen: { read: () => LensSettings | undefined; refreshed: number } = { read: () => undefined, refreshed: 0 };
  const port: CameraPreviewPort = {
    acquire: async () => fakeTrack(),
    effects: (lens): CameraEffectsPort => {
      seen.read = lens;
      return {
        wrap: async (track) => track,
        refresh: async (track) => {
          seen.refreshed += 1;
          return track;
        },
        release: () => undefined,
        used: () => [],
      };
    },
    attach: () => undefined,
  };
  return { port, seen };
};

const pack = { slug: 'aurore-polaire', name: 'Aurore polaire', status: 'pending' };

const mount = (deps: ReturnType<typeof gateway>['deps'], preview: CameraPreviewPort = previewHarness().port) =>
  mounter.mount(
    <QueryClientProvider client={new QueryClient()}>
      <LensSubmit language="fr" deps={deps} digest={digest} preview={preview} today="2026-10-24" />
    </QueryClientProvider>,
  );

describe('LensSubmit — composer sans code', () => {
  test('nommer, signer, poser un texte et un sticker : le document composé et le fichier nommé partent', async () => {
    const { calls, deps } = gateway((request) => (request.method === 'POST' ? { ok: true, data: pack } : { ok: true, data: [] }));
    const host = await mount(deps);
    expect(host.querySelector('[data-lens-editor]')).not.toBeNull();

    typeInto(host.querySelector<HTMLInputElement>('[data-lens-name]'), 'Aurore Polaire');
    typeInto(host.querySelector<HTMLInputElement>('[data-lens-author]'), 'Studio Nord');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-add="text"]'));
    typeInto(host.querySelector<HTMLInputElement>('[data-lens-layer-text]'), 'Joyeux Noël');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-add="sticker"]'));
    await choose(host.querySelector<HTMLInputElement>('[data-lens-layer-file]'), [new File(['aaaaaaaaaaaaaaaa'], 'couronne.png', { type: 'image/png' })]);

    await until(() => host.querySelector<HTMLButtonElement>('[data-lens-compose-submit]')?.disabled === false);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-compose-submit]'));
    await until(() => host.querySelector('[data-lens-submitted]') !== null);

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe('/api/v1/packs/lens/submissions');
    const body = post?.body as { readonly document: Record<string, unknown>; readonly assets: Record<string, string> };
    expect(body.document).toMatchObject({
      schema: 1,
      id: 'aurore-polaire',
      name: 'Aurore Polaire',
      cost: 'light',
      credits: { author: 'Studio Nord', createdAt: '2026-10-24' },
      layers: [
        { kind: 'text', text: { fr: 'Joyeux Noël' } },
        { kind: 'sticker', asset: 'aaaaaaaaaaaaaaaa.png' },
      ],
    });
    expect(body.assets).toEqual({ 'aaaaaaaaaaaaaaaa.png': btoa('aaaaaaaaaaaaaaaa') });
  });

  test('tant que le brouillon est incomplet, « Proposer » attend et dit ce qui manque', async () => {
    const { calls, deps } = gateway(() => ({ ok: true, data: [] }));
    const host = await mount(deps);
    expect(host.querySelector<HTMLButtonElement>('[data-lens-compose-submit]')?.disabled).toBe(true);
    expect(host.querySelector('[data-lens-problem="name"]')).not.toBeNull();
    expect(host.querySelector('[data-lens-problem="layers"]')).not.toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-add="particles"]'));
    expect(host.querySelector('[data-lens-problem="layers"]')).toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-layer-remove]'));
    expect(host.querySelector('[data-lens-problem="layers"]')).not.toBeNull();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  test('l’aperçu caméra joue le brouillon en cours, et chaque retouche y est reposée', async () => {
    const { deps } = gateway(() => ({ ok: true, data: [] }));
    const { port, seen } = previewHarness();
    const host = await mount(deps, port);
    typeInto(host.querySelector<HTMLInputElement>('[data-lens-name]'), 'Aurore');
    typeInto(host.querySelector<HTMLInputElement>('[data-lens-author]'), 'Studio Nord');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-add="text"]'));
    typeInto(host.querySelector<HTMLInputElement>('[data-lens-layer-text]'), 'Bonjour');
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    await until(() => seen.read()?.lens.layers[0]?.kind === 'text');
    expect(seen.read()?.lens.layers[0]).toMatchObject({ text: { fr: 'Bonjour' } });

    typeInto(host.querySelector<HTMLInputElement>('[data-lens-layer-text]'), 'Bonsoir');
    await until(() => {
      const layer = seen.read()?.lens.layers[0];
      return layer?.kind === 'text' && layer.text.fr === 'Bonsoir';
    });
    expect(seen.refreshed).toBeGreaterThan(0);
  });

  test('le document MeeshyLens s’importe encore, pour qui l’a écrit à la main', async () => {
    const { deps } = gateway(() => ({ ok: true, data: [] }));
    const host = await mount(deps);
    expect(host.querySelector('[data-lens-document]')).toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-mode="import"]'));
    expect(host.querySelector('[data-lens-document]')).not.toBeNull();
    expect(host.querySelector('[data-lens-editor]')).toBeNull();
  });

  test('les textes de l’éditeur existent dans les sept langues', () => {
    const source = [...lensEditorTextKeysOf('fr')].sort();
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) expect([...lensEditorTextKeysOf(language)].sort()).toEqual(source);
  });
});
