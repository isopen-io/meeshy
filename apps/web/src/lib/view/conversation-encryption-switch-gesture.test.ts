import { afterEach, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { conversationQueryKey, type ConversationsDeps } from '@/lib/api/conversations';
import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { encryptionModeSwitchGesture } from './conversation-encryption-switch-gesture';

/**
 * **LE GESTE « CHANGER DE MODE », CÂBLÉ À LA PASSERELLE** (#14648) — la lecture
 * de l'état servi et le POST du mode, sur les adresses partagées.
 */

afterEach(() => endToEndRegimeLedger.getState().reset());

const depsAnswering = (answer: (request: HttpRequest) => unknown, source: 'gateway' | 'fixtures' = 'gateway') => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (request: HttpRequest) => {
      requests.push(request);
      return Promise.resolve({ ok: true, data: answer(request) });
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source, transport };
  return { deps, requests };
};

describe('le geste câblé', () => {
  test('en fixtures, aucun geste : la fiche explique sans rien proposer', () => {
    const { deps } = depsAnswering(() => ({}), 'fixtures');
    expect(encryptionModeSwitchGesture({ deps, queryClient: new QueryClient(), conversationId: 'c1', online: () => true })).toBeUndefined();
  });

  test('lit l’état servi sur encryption-status', async () => {
    const { deps, requests } = depsAnswering(() => ({ mode: 'server', canToggleEncryption: true }));
    const gesture = encryptionModeSwitchGesture({ deps, queryClient: new QueryClient(), conversationId: 'c1', online: () => true });
    expect(await gesture?.readStatus()).toEqual({ mode: 'server', canToggleEncryption: true });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /api/v1/conversations/c1/encryption-status']);
  });

  test('un état servi e2ee scelle la conversation pour ce compte (#12949)', async () => {
    const { deps } = depsAnswering(() => ({ mode: 'e2ee', canToggleEncryption: true }));
    await encryptionModeSwitchGesture({ deps, queryClient: new QueryClient(), conversationId: 'c-e2ee', online: () => true })?.readStatus();
    expect(endToEndRegimeLedger.getState().sealed['c-e2ee']).toBe(true);
  });

  test('POST du mode demandé, et rien d’autre', async () => {
    const { deps, requests } = depsAnswering(() => ({ isEncrypted: true, mode: 'hybrid', canToggleEncryption: true }));
    const gesture = encryptionModeSwitchGesture({ deps, queryClient: new QueryClient(), conversationId: 'c1', online: () => true });
    expect(await gesture?.switchTo({ servedMode: 'server', target: 'hybrid' })).toEqual({ kind: 'switched', mode: 'hybrid' });
    expect(requests).toEqual([{ method: 'POST', path: '/api/v1/conversations/c1/encryption', body: { mode: 'hybrid' } }]);
  });

  test('une réponse forgée « server » ne rouvre pas une conversation que le cache sait e2ee', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(conversationQueryKey('c-forged'), { id: 'c-forged', type: 'direct', encryptionMode: 'e2ee' });
    const { deps } = depsAnswering(() => ({ isEncrypted: true, mode: 'server', canToggleEncryption: true }));
    const gesture = encryptionModeSwitchGesture({ deps, queryClient, conversationId: 'c-forged', online: () => true });
    await gesture?.switchTo({ servedMode: 'hybrid', target: 'server' });
    expect(queryClient.getQueryData<{ encryptionMode: string }>(conversationQueryKey('c-forged'))?.encryptionMode).toBe('e2ee');
  });

  test('un mode servi en majuscules et espacé scelle comme e2ee', async () => {
    const { deps } = depsAnswering(() => ({ mode: ' E2EE ', canToggleEncryption: true }));
    await encryptionModeSwitchGesture({ deps, queryClient: new QueryClient(), conversationId: 'c-upper', online: () => true })?.readStatus();
    expect(endToEndRegimeLedger.getState().sealed['c-upper']).toBe(true);
  });
});
