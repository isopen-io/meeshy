import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Message } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useSharedTranslations } from './use-shared-translations';

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

type Call = { readonly kind: 'offer'; readonly conversationId: string; readonly viewerId: string; readonly count: number } | { readonly kind: 'watch' | 'release'; readonly conversationId: string };

/** Une session de témoin : ce que le fil lui demande, dans l'ordre. */
const recordingLoader = () => {
  const calls: Call[] = [];
  const load = async () => ({
    sharedTranslationSession: () => ({
      offer: (thread: { readonly conversationId: string; readonly viewerId: string; readonly messages: readonly Message[] }) =>
        void calls.push({ kind: 'offer', conversationId: thread.conversationId, viewerId: thread.viewerId, count: thread.messages.length }),
      watch: (conversationId: string) => {
        calls.push({ kind: 'watch', conversationId });
        return () => void calls.push({ kind: 'release', conversationId });
      },
    }),
  });
  return { calls, load };
};

const messages = (count: number): readonly Message[] => Array.from({ length: count }, (_, index) => ({ id: `m${index}` }) as unknown as Message);

function Probe(props: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly viewerId: string;
  readonly load: Parameters<typeof useSharedTranslations>[1];
}) {
  useSharedTranslations({ conversationId: props.conversationId, messages: props.messages, readerLanguages: ['fr'], viewerId: props.viewerId }, props.load);
  return null;
}

const provided = (client: QueryClient, props: Parameters<typeof Probe>[0]) => (
  <QueryClientProvider client={client}>
    <Probe {...props} />
  </QueryClientProvider>
);

describe('useSharedTranslations — le fil ouvert relit ce que les autres ont traduit (#9899)', () => {
  test('à l’ouverture : il s’abonne au direct et offre ses messages', async () => {
    const { calls, load } = recordingLoader();
    const client = new QueryClient();
    await mount(provided(client, { conversationId: 'c1', messages: messages(2), viewerId: 'u-me', load }));
    await settle();
    expect(calls).toEqual([
      { kind: 'watch', conversationId: 'c1' },
      { kind: 'offer', conversationId: 'c1', viewerId: 'u-me', count: 2 },
    ]);
  });

  test('chaque fenêtre chargée est offerte de nouveau, sans se réabonner', async () => {
    const { calls, load } = recordingLoader();
    const client = new QueryClient();
    const host = await mount(provided(client, { conversationId: 'c1', messages: messages(2), viewerId: 'u-me', load }));
    await settle();
    await rerender(host, provided(client, { conversationId: 'c1', messages: messages(3), viewerId: 'u-me', load }));
    await settle();
    expect(calls.map((call) => call.kind)).toEqual(['watch', 'offer', 'offer']);
  });

  test('à la fermeture : le direct est relâché', async () => {
    const { calls, load } = recordingLoader();
    const client = new QueryClient();
    await mount(provided(client, { conversationId: 'c1', messages: messages(1), viewerId: 'u-me', load }));
    await settle();
    unmountAll();
    expect(calls.map((call) => call.kind)).toEqual(['watch', 'offer', 'release']);
  });

  test('un autre fil : relâche l’ancien, s’abonne au nouveau', async () => {
    const { calls, load } = recordingLoader();
    const client = new QueryClient();
    const host = await mount(provided(client, { conversationId: 'c1', messages: messages(1), viewerId: 'u-me', load }));
    await settle();
    await rerender(host, provided(client, { conversationId: 'c2', messages: messages(1), viewerId: 'u-me', load }));
    await settle();
    expect(calls.filter((call) => call.kind !== 'offer')).toEqual([
      { kind: 'watch', conversationId: 'c1' },
      { kind: 'release', conversationId: 'c1' },
      { kind: 'watch', conversationId: 'c2' },
    ]);
  });

  test('un fil fermé avant que la session ne soit chargée ne s’abonne pas', async () => {
    const { calls, load: loaded } = recordingLoader();
    let open: () => void = () => undefined;
    const arrives = new Promise<void>((resolve) => {
      open = resolve;
    });
    const load = async () => {
      await arrives;
      return loaded();
    };
    const client = new QueryClient();
    await mount(provided(client, { conversationId: 'c1', messages: messages(1), viewerId: 'u-me', load }));
    unmountAll();
    open();
    await settle();
    expect(calls).toEqual([]);
  });

  test('sans lecteur identifié, rien n’est offert ; sans fil, rien du tout', async () => {
    const { calls, load } = recordingLoader();
    const client = new QueryClient();
    await mount(provided(client, { conversationId: 'c1', messages: messages(1), viewerId: '', load }));
    await mount(provided(client, { conversationId: '', messages: messages(1), viewerId: 'u-me', load }));
    await settle();
    expect(calls).toEqual([{ kind: 'watch', conversationId: 'c1' }]);
  });

  test('une session qui ne se charge pas ne remonte pas', async () => {
    const client = new QueryClient();
    await mount(
      provided(client, {
        conversationId: 'c1',
        messages: messages(1),
        viewerId: 'u-me',
        load: async () => {
          throw new Error('chunk introuvable');
        },
      }),
    );
    await settle();
  });
});
