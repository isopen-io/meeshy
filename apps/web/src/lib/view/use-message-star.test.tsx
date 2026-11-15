import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGES, VIEW_ONCE_WITNESS_ID, messagesOf, PROTECTION_CONVERSATION_ID } from '@/lib/api/fixtures';
import { resetStarredFixturesForTests } from '@/lib/api/fixtures-starred';
import { appQueryClient } from '@/lib/api/query-client';
import { STARRED_MEMBERSHIP_QUERY_KEY, applyStarredEvent, type StarredMembership } from '@/lib/api/starred-messages-cache';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useMessageStar, type MessageStarEntry } from './use-message-star';

/**
 * **L'ÉTAT « EN FAVORI » D'UN MESSAGE DU FIL EST CONNU, OU L'ENTRÉE N'EXISTE
 * PAS** (#7378). Le crochet lit l'ensemble des favoris (servi en fixtures par
 * `fixtures-starred.ts` : `m1` est en favori, `m2` ne l'est pas), le geste
 * l'écrit en optimiste, et l'écho d'un autre appareil le change.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
  resetStarredFixturesForTests();
});

const byId = (id: string): Message => {
  const found = [...MESSAGES, ...messagesOf(PROTECTION_CONVERSATION_ID)].find((m) => m.id === id);
  if (found === undefined) throw new Error(`message de fixture absent : ${id}`);
  return found;
};

type Probe = { entries: Record<string, MessageStarEntry | null>; announced: string[] };

async function mountProbe(options: { readonly enabled: boolean; readonly ids: readonly string[] }): Promise<Probe> {
  const probe: Probe = { entries: {}, announced: [] };
  function Harness() {
    const starOf = useMessageStar({ enabled: options.enabled, announce: (text) => probe.announced.push(text) });
    probe.entries = Object.fromEntries(options.ids.map((id) => [id, starOf(byId(id))]));
    return null;
  }
  await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <Harness />
    </QueryClientProvider>,
  );
  return probe;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

describe('useMessageStar — l’état est CONNU avant d’être proposé', () => {
  test('ensemble non chargé (lecteur sans compte) ⇒ aucune entrée, ni « Ajouter » ni « Retirer »', async () => {
    const probe = await mountProbe({ enabled: false, ids: ['m1', 'm2'] });
    await settle();
    expect(probe.entries).toEqual({ m1: null, m2: null });
  });

  test('ensemble chargé ⇒ « Retirer » sur un favori, « Ajouter » sur un autre', async () => {
    const probe = await mountProbe({ enabled: true, ids: ['m1', 'm2'] });
    await settle();
    expect(probe.entries.m1?.action).toBe('unstar');
    expect(probe.entries.m2?.action).toBe('star');
  });

  test('une vue unique n’offre pas « Ajouter aux favoris »', async () => {
    const probe = await mountProbe({ enabled: true, ids: [VIEW_ONCE_WITNESS_ID] });
    await settle();
    expect(probe.entries[VIEW_ONCE_WITNESS_ID]).toBeNull();
  });
});

describe('useMessageStar — le geste, optimiste et annoncé', () => {
  test('AJOUTER bascule l’entrée en « Retirer » et annonce « Ajouté aux favoris »', async () => {
    const probe = await mountProbe({ enabled: true, ids: ['m2'] });
    await settle();
    await act(async () => {
      probe.entries.m2?.onToggle();
    });
    await settle();
    expect(probe.entries.m2?.action).toBe('unstar');
    expect(probe.announced).toEqual(['Ajouté aux favoris']);
  });

  test('RETIRER bascule l’entrée en « Ajouter » et annonce « Retiré des favoris »', async () => {
    const probe = await mountProbe({ enabled: true, ids: ['m1'] });
    await settle();
    await act(async () => {
      probe.entries.m1?.onToggle();
    });
    await settle();
    expect(probe.entries.m1?.action).toBe('star');
    expect(probe.announced).toEqual(['Retiré des favoris']);
  });
});

describe('useMessageStar — un AUTRE appareil change l’état ici', () => {
  test('`message:starred` (retiré ailleurs) éteint l’étoile du fil sans rechargement', async () => {
    const probe = await mountProbe({ enabled: true, ids: ['m1'] });
    await settle();
    expect(probe.entries.m1?.action).toBe('unstar');

    await act(async () => {
      applyStarredEvent(appQueryClient, { messageId: 'm1', conversationId: 'c-deploiement', starred: false, starredAt: null });
    });
    await settle();
    expect(probe.entries.m1?.action).toBe('star');
    expect(appQueryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)?.m1).toBeUndefined();
  });
});
