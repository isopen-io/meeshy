import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { messageReactorsQueryKey, type ReactorGroup } from '@/lib/api/reactors';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageReactors, MessageReactorsSheet, type ReactorsFetcher } from './message-reactors';

/**
 * LA LISTE « QUI A RÉAGI » (#10583) — cache-first : les comptes déjà connus
 * (`reactionSummary`) se peignent tout de suite, les noms arrivent ensuite.
 * Trois états en plus du nominal : chargement, erreur, vide. Rien que la
 * passerelle ne sert n'est affiché.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadMessagePiecesCatalog('fr');
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

const MESSAGE_ID = '66f0a1b2c3d4e5f6a7b8c9d0';
const COUNTS = [
  ['❤️', 2],
  ['👍', 1],
] as const;
const GROUPS: readonly ReactorGroup[] = [
  {
    emoji: '❤️',
    reactors: [
      { name: 'Awa', avatar: null },
      { name: 'Malik', avatar: null },
    ],
  },
  { emoji: '👍', reactors: [{ name: 'Lina', avatar: null }] },
];

type Deferred = { readonly fetcher: ReactorsFetcher; readonly calls: () => number; readonly settle: (result: ApiResult<readonly ReactorGroup[]>) => Promise<void> };

function deferredFetcher(): Deferred {
  const pending: ((result: ApiResult<readonly ReactorGroup[]>) => void)[] = [];
  let calls = 0;
  return {
    fetcher: () => {
      calls += 1;
      return new Promise((resolve) => pending.push(resolve));
    },
    calls: () => calls,
    settle: async (result) => {
      await act(async () => {
        pending.splice(0).forEach((resolve) => resolve(result));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

const monte = (fetcher: ReactorsFetcher, options: { readonly messageId?: string; readonly reactions?: readonly (readonly [string, number])[] } = {}) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ul>
        <MessageReactors messageId={options.messageId ?? MESSAGE_ID} reactions={options.reactions ?? COUNTS} fetchReactors={fetcher} />
      </ul>
    </QueryClientProvider>,
  );

const namesOf = (host: ParentNode): readonly string[] =>
  [...host.querySelectorAll('[data-message-reactor]')].map((row) => `${row.getAttribute('data-message-reactor')}:${row.querySelector('[data-message-reactor-name]')?.textContent}`);

const countsOf = (host: ParentNode): readonly string[] =>
  [...host.querySelectorAll('[data-message-reactors-group]')].map((row) => `${row.getAttribute('data-message-reactors-group')}:${row.querySelector('[data-message-reactors-count]')?.textContent}`);

describe('MessageReactors — les comptes d’abord, les noms ensuite', () => {
  test('CHARGEMENT : les comptes connus sont là avant toute réponse, avec une ligne d’attente et aucun nom', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    expect(countsOf(host)).toEqual(['❤️:2', '👍:1']);
    expect(host.querySelector('[data-message-reactors-loading]')?.getAttribute('role')).toBe('status');
    expect(namesOf(host)).toEqual([]);
    await pending.settle({ ok: true, data: [], status: 200 });
  });

  test('NOMINAL : les noms servis se rangent sous leur emoji, l’attente disparaît', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
    expect(namesOf(host)).toEqual(['❤️:Awa', '❤️:Malik', '👍:Lina']);
    expect(countsOf(host)).toEqual(['❤️:2', '👍:1']);
    expect(host.querySelector('[data-message-reactors-loading]')).toBeNull();
  });

  test('CACHE-FIRST : des noms déjà en cache s’affichent au premier rendu, sans attente, et se revalident', async () => {
    appQueryClient.setQueryData(messageReactorsQueryKey(MESSAGE_ID), GROUPS, { updatedAt: Date.now() - 60_000 });
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    expect(namesOf(host)).toEqual(['❤️:Awa', '❤️:Malik', '👍:Lina']);
    expect(host.querySelector('[data-message-reactors-loading]')).toBeNull();
    expect(pending.calls()).toBe(1);
    await pending.settle({ ok: true, data: [{ emoji: '❤️', reactors: [{ name: 'Awa', avatar: null }] }], status: 200 });
    expect(namesOf(host)).toEqual(['❤️:Awa']);
  });

  test('ERREUR : les comptes restent, l’échec se dit, « Réessayer » relance et finit par nommer', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    await pending.settle({ ok: false, status: 500, error: 'Erreur 500' });
    expect(countsOf(host)).toEqual(['❤️:2', '👍:1']);
    expect(host.querySelector('[data-message-reactors-error]')?.getAttribute('role')).toBe('alert');
    expect(namesOf(host)).toEqual([]);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-message-reactors-retry]')?.click();
    });
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
    expect(host.querySelector('[data-message-reactors-error]')).toBeNull();
    expect(namesOf(host)).toEqual(['❤️:Awa', '❤️:Malik', '👍:Lina']);
  });

  test('NOMS NON SERVIS : la passerelle ne nomme personne ⇒ les comptes seuls, ni attente ni erreur ni nom inventé', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    await pending.settle({ ok: true, data: [{ emoji: '❤️', reactors: [] }], status: 200 });
    expect(countsOf(host)).toEqual(['❤️:2', '👍:1']);
    expect(namesOf(host)).toEqual([]);
    expect(host.querySelector('[data-message-reactors-loading]')).toBeNull();
    expect(host.querySelector('[data-message-reactors-error]')).toBeNull();
  });

  test('les noms d’un emoji qui n’est plus compté ne s’affichent pas — les comptes font foi', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher, { reactions: [['👍', 1]] });
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
    expect(namesOf(host)).toEqual(['👍:Lina']);
  });

  test('un message encore optimiste (`cid_…`) n’existe pas côté serveur : aucune requête, les comptes seuls', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher, { messageId: 'cid_2f1c8b0e-4a6d-4c11-9b5e-0f9a7c3d2e18' });
    expect(pending.calls()).toBe(0);
    expect(countsOf(host)).toEqual(['❤️:2', '👍:1']);
    expect(host.querySelector('[data-message-reactors-loading]')).toBeNull();
  });

  test('des comptes qui changent pendant que la liste est ouverte relancent la lecture des noms', async () => {
    const pending = deferredFetcher();
    const host = await monte(pending.fetcher);
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
    expect(pending.calls()).toBe(1);
    await mounter.rerender(
      host,
      <QueryClientProvider client={appQueryClient}>
        <ul>
          <MessageReactors messageId={MESSAGE_ID} reactions={[['❤️', 3], ['👍', 1]]} fetchReactors={pending.fetcher} />
        </ul>
      </QueryClientProvider>,
    );
    expect(pending.calls()).toBe(2);
    expect(countsOf(host)).toEqual(['❤️:3', '👍:1']);
    expect(namesOf(host)).toEqual(['❤️:Awa', '❤️:Malik', '👍:Lina']);
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
  });
});

describe('MessageReactorsSheet — la feuille ouverte depuis une pilule', () => {
  const monteFeuille = (fetcher: ReactorsFetcher, reactions: readonly (readonly [string, number])[]) =>
    mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <MessageReactorsSheet messageId={MESSAGE_ID} reactions={reactions} fetchReactors={fetcher} onClose={() => undefined} />
      </QueryClientProvider>,
    );

  test('elle porte le titre « Réactions » et la liste nominative', async () => {
    const pending = deferredFetcher();
    const host = await monteFeuille(pending.fetcher, COUNTS);
    await pending.settle({ ok: true, data: GROUPS, status: 200 });
    const dialog = host.ownerDocument.querySelector('dialog');
    expect(dialog?.textContent).toContain('Réactions');
    expect(namesOf(host.ownerDocument)).toEqual(['❤️:Awa', '❤️:Malik', '👍:Lina']);
  });

  test('VIDE : plus aucune réaction ⇒ « Aucune réaction », et aucune requête', async () => {
    const pending = deferredFetcher();
    const host = await monteFeuille(pending.fetcher, []);
    expect(host.ownerDocument.querySelector('[data-message-reactors-empty]')?.textContent).toBe('Aucune réaction');
    expect(pending.calls()).toBe(0);
  });
});
