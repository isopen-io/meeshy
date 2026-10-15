import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Message } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useDeviceTranslation } from './use-device-translation';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, rerender, unmountAll, settle } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => unmountAll());
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Ports = NonNullable<Parameters<typeof useDeviceTranslation>[1]>;

/** Le consentement et le moteur de témoin : ce que le fil leur demande, dans l'ordre. */
const ports = (granted: boolean) => {
  const calls: string[] = [];
  const value: Ports = {
    granted: async () => {
      calls.push('granted?');
      return granted;
    },
    runtime: async () => {
      calls.push('runtime');
      return {
        offerToDevice: (_client, offer) =>
          void calls.push(`offer:${offer.messages.length}:${offer.viewerId}:${offer.preferredLanguages.join(',')}:${offer.conversationEncryptionMode ?? 'none'}`),
      };
    },
  };
  return { calls, value };
};

const messages = (count: number): readonly Message[] => Array.from({ length: count }, (_, index) => ({ id: `m${index}` }) as unknown as Message);

function Probe(props: { readonly messages: readonly Message[]; readonly ports: Ports; readonly conversationEncryptionMode?: string | null }) {
  useDeviceTranslation(
    { messages: props.messages, readerLanguages: ['fr', 'en'], viewerId: 'u-me', conversationEncryptionMode: props.conversationEncryptionMode ?? null },
    props.ports,
  );
  return null;
}

const provided = (client: QueryClient, props: Parameters<typeof Probe>[0]) => (
  <QueryClientProvider client={client}>
    <Probe {...props} />
  </QueryClientProvider>
);

describe('useDeviceTranslation — le fil confie ses messages à l’appareil, une fois le lecteur d’accord (#9898)', () => {
  test('avec le consentement : le moteur se charge et reçoit les messages du lecteur', async () => {
    const { calls, value } = ports(true);
    await mount(provided(new QueryClient(), { messages: messages(2), ports: value }));
    expect(calls).toEqual(['granted?', 'runtime', 'offer:2:u-me:fr,en:none']);
  });

  test('sans consentement : rien ne se charge', async () => {
    const { calls, value } = ports(false);
    await mount(provided(new QueryClient(), { messages: messages(2), ports: value }));
    expect(calls).toEqual(['granted?']);
  });

  test('chaque fenêtre chargée est offerte de nouveau', async () => {
    const { calls, value } = ports(true);
    const client = new QueryClient();
    const host = await mount(provided(client, { messages: messages(2), ports: value }));
    await rerender(host, provided(client, { messages: messages(3), ports: value }));
    expect(calls.filter((call) => call.startsWith('offer'))).toEqual(['offer:2:u-me:fr,en:none', 'offer:3:u-me:fr,en:none']);
  });

  test('le mode de chiffrement de la conversation part avec les messages ; qu’il arrive ou change, la fenêtre est offerte de nouveau', async () => {
    const { calls, value } = ports(true);
    const client = new QueryClient();
    const msgs = messages(2);
    const host = await mount(provided(client, { messages: msgs, ports: value, conversationEncryptionMode: null }));
    await rerender(host, provided(client, { messages: msgs, ports: value, conversationEncryptionMode: 'server' }));
    await rerender(host, provided(client, { messages: msgs, ports: value, conversationEncryptionMode: 'e2ee' }));
    expect(calls.filter((call) => call.startsWith('offer'))).toEqual(['offer:2:u-me:fr,en:none', 'offer:2:u-me:fr,en:server', 'offer:2:u-me:fr,en:e2ee']);
  });

  test('un fil fermé avant la réponse du consentement ne charge rien', async () => {
    const calls: string[] = [];
    let answer: (granted: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => {
      answer = resolve;
    });
    const value: Ports = {
      granted: () => pending,
      runtime: async () => {
        calls.push('runtime');
        return { offerToDevice: () => void calls.push('offer') };
      },
    };
    await mount(provided(new QueryClient(), { messages: messages(1), ports: value }));
    unmountAll();
    answer(true);
    await settle();
    expect(calls).toEqual([]);
  });

  test('un consentement ou un moteur qui ne se chargent pas ne remontent pas', async () => {
    const value: Ports = {
      granted: async () => {
        throw new Error('chunk introuvable');
      },
      runtime: async () => {
        throw new Error('chunk introuvable');
      },
    };
    await mount(provided(new QueryClient(), { messages: messages(1), ports: value }));
  });
});
