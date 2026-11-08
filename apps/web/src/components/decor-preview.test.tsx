import { QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { loadPackPreviewCatalog } from '@/lib/i18n-pack-preview-catalog';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import type { DecorItem } from '@/lib/packs/decor-items';
import type { PackRef } from '@/lib/packs/use-pack-items';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DecorPreview, type DecorPreviewProps } from './decor-preview';
import type { PackAction } from './pack-shop';

/**
 * **LE PLEIN ÉCRAN D'UNE DÉCORATION** (#16267) — posée sur ce qu'elle décore,
 * parcourue élément par élément (n / N), zoomable (et zoomée, figée sur son
 * élément), équipée en un geste, refermée par ✕ ou Échap.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
  await loadPackPreviewCatalog('fr');
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

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 60 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return (await answer(request)) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const me = (decor: ServedProfileDecor): MyProfile => ({
  id: 'u1',
  username: 'ada',
  displayName: 'Ada Lovelace',
  firstName: null,
  lastName: null,
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  email: null,
  phone: null,
  createdAt: null,
  profileDecor: decor,
});

const TOGGLE: PackAction = { kind: 'toggle', label: 'Installer' };

type Harness = Partial<Omit<DecorPreviewProps, 'pack' | 'index' | 'onIndex'>> & {
  readonly pack: DecorPreviewProps['pack'];
  readonly deps: ConversationsDeps;
  readonly onIndexSeen?: (index: number) => void;
};

function Host(props: Harness & { readonly start: number }) {
  const [index, setIndex] = useState(props.start);
  return (
    <DecorPreview
      language="fr"
      packs={[]}
      action={TOGGLE}
      busy={false}
      notice=""
      onProposal={() => undefined}
      onAction={async () => true}
      onClose={() => undefined}
      {...props}
      index={index}
      onIndex={(next) => {
        props.onIndexSeen?.(next);
        setIndex(next);
      }}
    />
  );
}

const mount = (props: Harness, start = 0) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <Host {...props} start={start} />
    </QueryClientProvider>,
  );

const RINGS = { domain: 'avatar-ring', slug: 'contours-essentiels', title: 'Contours essentiels', installed: true } as const;

const dialog = () => document.querySelector<HTMLDialogElement>('dialog[data-decor-preview]');
const q = <E extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const key = async (name: string) => act(async () => void dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));

describe('DecorPreview', () => {
  test('un contour se pose sur MON avatar, nommé par le pack, avec « 1 / N »', async () => {
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: null, banner: null }));
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: RINGS });
    expect(dialog()?.getAttribute('aria-labelledby')).not.toBeNull();
    expect(document.getElementById(dialog()?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Contours essentiels');
    expect(q('[data-decor-stage="avatar-ring"]')).not.toBeNull();
    expect(q('[data-decor-position]')?.textContent).toContain('1 / 6');
    expect(q('[data-decor-position]')?.textContent).toContain('1 sur 6');
  });

  test('← → et les flèches parcourent tout le pack, en faisant le tour', async () => {
    const seen: number[] = [];
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: RINGS, onIndexSeen: (index) => seen.push(index) });
    await key('ArrowLeft');
    expect(q('[data-decor-position]')?.textContent).toContain('6 / 6');
    await key('ArrowRight');
    await mounter.click(q('[data-decor-next]'));
    await mounter.click(q('[data-decor-previous]'));
    expect(seen).toEqual([5, 0, 1, 0]);
  });

  test('zoomé, l’élément ne change pas ; le double-clic bascule ×2 puis ×1, + et − sont bornés', async () => {
    const seen: number[] = [];
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: RINGS, onIndexSeen: (index) => seen.push(index) });
    expect(q<HTMLButtonElement>('[data-decor-zoom-out]')?.disabled).toBe(true);
    await mounter.click(q('[data-decor-zoom-in]'));
    expect(q('[data-decor-stage-host]')?.getAttribute('data-zoom')).toBe('1.5');
    await key('ArrowRight');
    expect(q<HTMLButtonElement>('[data-decor-next]')?.disabled).toBe(true);
    expect(seen).toEqual([]);
    await act(async () => void q('[data-decor-stage-host]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(q('[data-decor-stage-host]')?.getAttribute('data-zoom')).toBe('1');
    await act(async () => void q('[data-decor-stage-host]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(q('[data-decor-stage-host]')?.getAttribute('data-zoom')).toBe('2');
    await act(async () => void q('[data-decor-stage-host]')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, bubbles: true, cancelable: true })));
    expect(q('[data-decor-stage-host]')?.getAttribute('data-zoom')).toBe('1');
  });

  test('Échap et ✕ rendent la boutique', async () => {
    let closed = 0;
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: RINGS, onClose: () => (closed += 1) });
    await key('Escape');
    await mounter.click(q('[data-decor-preview-close]'));
    expect(q('[data-decor-preview-close]')?.getAttribute('aria-label')).toBe('Retour à la boutique');
    expect(closed).toBe(2);
  });

  test('« Équiper » applique le contour tout de suite, puis le dit « Équipé »', async () => {
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: null, banner: null }));
    const answers: Array<(value: ApiResult<unknown>) => void> = [];
    const { deps, calls } = depsAnswering((request) => (request.method === 'PUT' ? new Promise((resolve) => answers.push(resolve)) : { ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: RINGS }, 1);
    const equip = q('[data-decor-equip]');
    expect(equip?.textContent).toBe('Équiper');
    await mounter.click(equip);
    expect(appQueryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.profileDecor?.avatarRing?.item).toBe('double-filet');
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ avatarRing: { pack: 'contours-essentiels', item: 'double-filet' } });
    await until(() => q('[data-decor-equipped]')?.textContent === 'Équipé');
    await act(async () => answers[0]?.({ ok: true, data: { avatarRing: { pack: 'contours-essentiels', item: 'double-filet', origin: 'builtin', contract: null }, banner: null } }));
    expect(q('[data-decor-equipped]')).not.toBeNull();
  });

  test('un refus rétablit le contour d’avant et le dit', async () => {
    const before = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } as const;
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: before, banner: null }));
    const { deps } = depsAnswering(() => ({ ok: false, status: 403, error: 'refusé', code: 'PACK_NOT_OWNED' }));
    await mount({ deps, pack: RINGS }, 2);
    await mounter.click(q('[data-decor-equip]'));
    await until(() => (q('[role="status"][aria-live]')?.textContent ?? '') !== '');
    expect(appQueryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.profileDecor?.avatarRing?.item).toBe('filet');
    expect(q('[role="status"][aria-live]')?.textContent).toBe('L’élément n’a pas pu être équipé — réessayez');
  });

  test('un pack gratuit pas encore installé s’installe d’abord, puis s’équipe ; un refus d’installation n’équipe rien', async () => {
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: null, banner: null }));
    const { deps, calls } = depsAnswering(() => ({ ok: true, data: { avatarRing: null, banner: null } }));
    const order: string[] = [];
    await mount({ deps, pack: { ...RINGS, installed: false }, onAction: async () => (order.push('install'), false) });
    await mounter.click(q('[data-decor-equip]'));
    expect(order).toEqual(['install']);
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
  });

  test('un fond se pose derrière des bulles, ne s’équipe pas ici et dit où il se choisit', async () => {
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: null, banner: null }));
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: { domain: 'wallpaper', slug: 'essentiels', title: 'Essentiels', installed: true } });
    expect(q('[data-decor-stage="wallpaper"]')?.textContent).toContain('Tu as vu ce nouveau fond ?');
    expect(q('[data-decor-equip]')).toBeNull();
    expect(q('[data-decor-wallpaper-hint]')).not.toBeNull();
  });

  test('une bannière se pose sur MA bannière, un cadre sur ma bannière telle qu’elle est', async () => {
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, me({ avatarRing: null, banner: null }));
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    await mount({ deps, pack: { domain: 'banner', slug: 'bannieres-essentielles', title: 'B', installed: true } });
    expect(q('[data-decor-stage="banner"] [data-banner-design="aurore"]')).not.toBeNull();
    mounter.unmountAll();
    await mount({ deps, pack: { domain: 'banner-frame', slug: 'cadres-haussmannien', title: 'C', installed: true } });
    expect(q('[data-decor-stage="banner-frame"]')).not.toBeNull();
  });

  test('« Autres propositions » montre les autres packs du même domaine ; en toucher un l’ouvre', async () => {
    const opened: DecorItem[] = [];
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'x' }));
    const packs: readonly PackRef[] = [
      { domain: 'avatar-ring', slug: 'contours-essentiels' },
      { domain: 'avatar-ring', slug: 'contours-animes' },
      { domain: 'banner', slug: 'bannieres-essentielles' },
    ];
    await mount({ deps, pack: RINGS, packs, onProposal: (item) => opened.push(item) });
    const proposals = Array.from(document.querySelectorAll<HTMLElement>('[data-decor-proposal]'));
    expect(proposals.map((node) => node.getAttribute('data-decor-proposal'))).toEqual(['contours-animes/halo-or', 'contours-animes/prisme-vivant', 'contours-animes/onde']);
    expect(document.body.textContent).toContain('Autres propositions');
    await mounter.click(proposals[1] ?? null);
    expect(opened.map((item) => `${item.pack}/${item.key}`)).toEqual(['contours-animes/prisme-vivant']);
  });

  test('un pack servi dessine son chargement pendant que son contrat arrive', async () => {
    const { deps } = depsAnswering(() => new Promise(() => undefined));
    await mount({ deps, pack: { domain: 'avatar-ring', slug: 'officiel', title: 'Officiel', installed: false } });
    expect(q('[data-decor-loading]')?.textContent).toContain('Chargement des éléments…');
    expect(q('[data-decor-position]')).toBeNull();
  });
});
