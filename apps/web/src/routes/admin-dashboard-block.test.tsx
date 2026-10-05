import { describe, expect, test } from 'bun:test';

import { useDashBlock, pageIsVisible, visibleInterval } from '@/lib/admin/dashboard-block';
import { ApiError } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { estClefNonPersistable } from '@/lib/api/souverain';
import { setupAdminKitTests } from '@/test-support/admin-harness';

/**
 * **L'ÉTAT D'UN BLOC** (#8876, § 4) — quatre états, un seul type, et la règle
 * qui les sépare : un refus (403) n'est pas une panne, des données en cache ne
 * redeviennent JAMAIS un squelette, et la relecture périodique se tait quand
 * l'onglet n'est pas regardé.
 */

const { mount, mounter } = setupAdminKitTests();

const served = (data: string): ApiResult<string> => ({ ok: true, data });
const refused = (status: number): ApiResult<string> => ({ ok: false, status, error: 'non' });

function Probe({ load, every }: { readonly load: () => Promise<ApiResult<string>>; readonly every?: (data: string | undefined) => number | false }) {
  const block = useDashBlock({ key: ['probe'], load, staleTime: 60_000, ...(every === undefined ? {} : { refetchEvery: every }) });
  return (
    <div data-probe={block.status}>
      {block.status === 'ready' ? <span data-data>{block.data}</span> : null}
      {block.status === 'error' ? (
        <button type="button" data-retry onClick={block.retry}>
          retry
        </button>
      ) : null}
    </div>
  );
}

const status = (host: HTMLElement): string | null => host.querySelector('[data-probe]')?.getAttribute('data-probe') ?? null;

describe('useDashBlock', () => {
  test('rien en cache : un squelette, puis les données', async () => {
    let release: (result: ApiResult<string>) => void = () => undefined;
    const pending = new Promise<ApiResult<string>>((resolve) => {
      release = resolve;
    });
    const host = await mount(<Probe load={() => pending} />);
    expect(status(host)).toBe('loading');

    release(served('bonjour'));
    await mounter.settle();
    expect(status(host)).toBe('ready');
    expect(host.querySelector('[data-data]')?.textContent).toBe('bonjour');
  });

  test('un cache non vide s’affiche TOUT DE SUITE — jamais de squelette (cache-first)', async () => {
    appQueryClient.setQueryData(['admin', 'dash', 'probe'], 'en cache');
    const host = await mount(<Probe load={() => new Promise(() => undefined)} />);
    expect(status(host)).toBe('ready');
    expect(host.querySelector('[data-data]')?.textContent).toBe('en cache');
  });

  test('une panne : « error » avec de quoi réessayer ; réessayer relit et rend les données', async () => {
    let calls = 0;
    const host = await mount(<Probe load={async () => (++calls === 1 ? refused(500) : served('rétabli'))} />);
    expect(status(host)).toBe('error');

    await mounter.click(host.querySelector<HTMLElement>('[data-retry]'));
    expect(calls).toBe(2);
    expect(status(host)).toBe('ready');
    expect(host.querySelector('[data-data]')?.textContent).toBe('rétabli');
  });

  test('un 403 est un REFUS : « denied », sans « Réessayer »', async () => {
    const host = await mount(<Probe load={async () => refused(403)} />);
    expect(status(host)).toBe('denied');
    expect(host.querySelector('[data-retry]')).toBeNull();
  });

  test('une relecture qui échoue garde les données déjà reçues', async () => {
    appQueryClient.setQueryData(['admin', 'dash', 'probe'], 'dernières reçues', { updatedAt: Date.now() - 10 * 60_000 });
    const host = await mount(<Probe load={async () => refused(500)} />);
    await mounter.settle();
    expect(status(host)).toBe('ready');
    expect(host.querySelector('[data-data]')?.textContent).toBe('dernières reçues');
  });

  test('la clé est sous `admin` et `dash` : jamais persistée sur le disque, invalidée d’un coup par son préfixe', async () => {
    await mount(<Probe load={async () => served('x')} />);
    const keys = appQueryClient.getQueryCache().findAll({ queryKey: ['admin', 'dash'] }).map((query) => query.queryKey);
    expect(keys).toEqual([['admin', 'dash', 'probe']]);
    expect(keys.every((key) => estClefNonPersistable(key))).toBe(true);
  });

  test('sans relecture demandée, aucun intervalle ; avec, la fonction de visibilité', async () => {
    await mount(<Probe load={async () => served('x')} />);
    const plain = appQueryClient.getQueryCache().find({ queryKey: ['admin', 'dash', 'probe'] });
    expect(plain?.observers[0]?.options.refetchInterval).toBeUndefined();

    mounter.unmountAll();
    appQueryClient.clear();

    await mount(<Probe load={async () => served('x')} every={() => 60_000} />);
    const timed = appQueryClient.getQueryCache().find({ queryKey: ['admin', 'dash', 'probe'] });
    expect(typeof timed?.observers[0]?.options.refetchInterval).toBe('function');
  });
});

describe('visibleInterval — la relecture périodique suit l’onglet', () => {
  const withVisibility = (state: DocumentVisibilityState, run: () => void) => {
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    try {
      run();
    } finally {
      if (original === undefined) Reflect.deleteProperty(document, 'visibilityState');
      else Object.defineProperty(document, 'visibilityState', original);
    }
  };
  const query = { state: { data: 'x' as string | undefined } };

  test('onglet visible : l’intervalle demandé', () => {
    withVisibility('visible', () => {
      expect(pageIsVisible()).toBe(true);
      expect(visibleInterval<string>(() => 60_000)(query)).toBe(60_000);
    });
  });

  test('onglet caché : aucune relecture', () => {
    withVisibility('hidden', () => {
      expect(pageIsVisible()).toBe(false);
      expect(visibleInterval<string>(() => 60_000)(query)).toBe(false);
    });
  });

  test('la décision peut dépendre des données (rien à suivre ⇒ suspendre)', () => {
    withVisibility('visible', () => {
      const every = visibleInterval<string>((data) => (data === undefined ? false : 15_000));
      expect(every({ state: { data: undefined } })).toBe(false);
      expect(every(query)).toBe(15_000);
    });
  });
});

describe('ApiError', () => {
  test('le bloc reconnaît un 403 à son statut, pas à son texte', () => {
    expect(new ApiError({ ok: false, status: 403, error: 'whatever' }).status).toBe(403);
  });
});
