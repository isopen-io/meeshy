import { InfiniteQueryObserver, focusManager, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';

import { createOutboxStore } from '@/lib/send/outbox-store';
import { listPage, row, settle, socketMessage } from '@/test-support/live-relecture';
import { liveQueryClient } from '@/test-support/live-query-client';
import { routedTransport } from '@/test-support/routed-transport';

import { CONVERSATIONS_QUERY_KEY, conversationsQuery } from './conversations';
import type { HttpRequest } from './http';
import type { Conversation } from './types';
import { applyMessageNew } from './realtime-apply';

/**
 * **REVENIR SUR UNE LISTE QUE LE TEMPS RÉEL VIENT D'ÉCRIRE NE LA RELIT PAS EN
 * ENTIER** (#19117, réserve C5 de l'audit de #19081). Le lot #18914 a cessé de
 * rajeunir `dataUpdatedAt` à chaque écriture temps réel (WEB-08) — juste pour
 * la fraîcheur, mais, tant que le delta de la liste est mort (#9638, la
 * passerelle ne sert pas `updatedAt`), chaque retour sur la liste lue il y a
 * plus de 30 s la relisait page après page, même si un `message:new` l'avait
 * mise à jour une seconde plus tôt. Une liste écrite par le temps réel depuis
 * moins de 30 s n'est plus relue au remontage ni au retour d'onglet ; une
 * reconnexion la relit toujours (des évènements ont pu se perdre).
 */

const T0 = Date.UTC(2026, 10, 17, 10, 0, 0);

/** La ligne telle que la production la sert aujourd'hui : SANS `updatedAt` (#9638) — le delta ne s'active pas, chaque relecture est complète. */
const served = (): Conversation => {
  const { updatedAt: _updatedAt, ...rest } = row();
  return rest as Conversation;
};

function gateway() {
  const { transport, calls } = routedTransport((req: HttpRequest) =>
    req.method === 'GET' && req.path.includes('/conversations') ? { ok: true, data: [served()], pagination: listPage([served()]).pagination } : undefined,
  );
  return { transport, reads: () => calls().filter((call) => call.method === 'GET').length };
}

const mountList = (queryClient: QueryClient, transport: ReturnType<typeof gateway>['transport']) => {
  const observer = new InfiniteQueryObserver(queryClient, conversationsQuery({ source: 'gateway', transport }));
  return observer.subscribe(() => undefined);
};

/** La liste lue il y a une minute — périmée (`staleTime` de 30 s) —, puis quittée. */
async function staleList() {
  const queryClient = liveQueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  const api = gateway();
  setSystemTime(new Date(T0 - 60_000));
  const unmount = mountList(queryClient, api.transport);
  await settle(queryClient);
  unmount();
  setSystemTime(new Date(T0));
  return { queryClient, api };
}

afterEach(() => {
  setSystemTime();
  focusManager.setFocused(undefined);
});

describe('une liste tenue à jour par le temps réel ne se relit pas en entier au retour (#19117)', () => {
  test('retour sur la liste 1 s après un message:new : aucune relecture', async () => {
    const { queryClient, api } = await staleList();
    const readsBefore = api.reads();
    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-1'));

    setSystemTime(new Date(T0 + 1_000));
    const unmount = mountList(queryClient, api.transport);
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(0);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.dataUpdatedAt).toBe(T0 - 60_000);
    unmount();
  });

  test('retour d’onglet 1 s après un message:new, la liste restée ouverte : aucune relecture', async () => {
    const queryClient = liveQueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    queryClient.mount();
    const api = gateway();
    setSystemTime(new Date(T0 - 60_000));
    const unmount = mountList(queryClient, api.transport);
    await settle(queryClient);
    setSystemTime(new Date(T0));
    const readsBefore = api.reads();
    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-1'));

    setSystemTime(new Date(T0 + 1_000));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(0);
    unmount();
    queryClient.unmount();
  });

  test('sans écriture temps réel récente, la liste périmée se relit au retour, comme avant', async () => {
    const { queryClient, api } = await staleList();
    const readsBefore = api.reads();

    const unmount = mountList(queryClient, api.transport);
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(1);
    unmount();
  });

  test('passé 30 s depuis la dernière écriture temps réel, la liste se relit de nouveau', async () => {
    const { queryClient, api } = await staleList();
    applyMessageNew(queryClient, createOutboxStore(), socketMessage('m-1'));
    const readsBefore = api.reads();

    setSystemTime(new Date(T0 + 31_000));
    const unmount = mountList(queryClient, api.transport);
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(1);
    unmount();
  });
});
