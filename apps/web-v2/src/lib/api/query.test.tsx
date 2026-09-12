import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { conversationQueryKey } from './conversations';
import { messagesQueryKey } from './messages';
import { useThreadData } from './query';
import type { Conversation } from './types';

/**
 * `useThreadData` — testé par `renderToStaticMarkup` (motif
 * `auth-screens.test.tsx`) : l'ÉTAT INITIAL d'un rendu synchrone, sous
 * `QueryClientProvider`. La source ici est `fixtures` (`bun test` ne pose
 * pas `VITE_DATA_SOURCE`), donc `loadConversation`/`loadMessages` résolvent
 * SYNCHRONEMENT dans leur micro-tâche — mais `renderToStaticMarkup` ne
 * relance pas de second rendu après la résolution : ce test capture l'état
 * `pending` du premier rendu, jamais le `success` qui suivrait un second
 * passage React (que ce runtime sans DOM ne produit pas). C'est le F8 qui
 * compte ici : AUCUN repli sur une autre conversation, quel que soit l'état.
 */
function Probe({ id }: { readonly id: string }) {
  const data = useThreadData(id);
  return <span data-status={data.status}>{data.conversation?.title ?? 'aucune'}</span>;
}

function renderProbe(id: string): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe id={id} />
    </QueryClientProvider>,
  );
}

describe('useThreadData — F8 (#5650), jamais de repli sur une autre conversation', () => {
  test('id inconnu : le rendu ne montre jamais le titre d’une autre conversation', () => {
    const html = renderProbe('c-inexistant-xyz');
    expect(html).toContain('aucune');
    expect(html).not.toContain('Équipe déploiement');
  });

  test('id connu (fixtures) : le rendu ne rejette pas au premier passage', () => {
    expect(() => renderProbe('c-deploiement')).not.toThrow();
  });
});

/**
 * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — un lien
 * direct `/c/<identifiant>` (forme réelle des chemins de recette des coques,
 * `MEESHY_SHELL_START_PATH="/c/salon..riviere/x"`) charge par l'identifiant
 * mais doit exposer l'ObjectId CANONIQUE dès que `GET /conversations/:id`
 * (qui accepte les deux formes, `core-detail.ts:250`) l'a rendu : c'est CETTE
 * valeur, jamais le paramètre de route, que `message:new`/
 * `conversation:updated`/`message:translation` portent
 * (`normalizeConversationId`, `MeeshySocketIOManager.ts:2879`).
 */
describe('useThreadData — `conversationId` (#5793, revue-correction défaut 3)', () => {
  const canonical = (partial: Partial<Conversation>): Conversation =>
    ({
      id: 'canonical-abc',
      type: 'group',
      status: 'active',
      visibility: 'public',
      isActive: true,
      memberCount: 3,
      participants: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    }) as Conversation;

  test('un id de ROUTE non canonique (identifiant) résout `conversationId` sur `conversation.id`', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(conversationQueryKey('salon-riviere'), canonical({}));
    queryClient.setQueryData(messagesQueryKey('canonical-abc'), { messages: [], hasOlder: false });

    function Probe() {
      const data = useThreadData('salon-riviere');
      return <span data-conversation-id={data.conversationId} data-status={data.status} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="canonical-abc"');
    expect(html).toContain('data-status="success"');
  });

  test('un id de ROUTE DÉJÀ canonique ne change pas de clé — `conversationId` reste l’id de route', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(conversationQueryKey('canonical-abc'), canonical({}));
    queryClient.setQueryData(messagesQueryKey('canonical-abc'), { messages: [], hasOlder: false });

    function Probe() {
      const data = useThreadData('canonical-abc');
      return <span data-conversation-id={data.conversationId} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="canonical-abc"');
  });

  test('avant résolution (conversation pas encore en cache) : `conversationId` retombe sur l’id de ROUTE', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Probe() {
      const data = useThreadData('salon-riviere');
      return <span data-conversation-id={data.conversationId} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="salon-riviere"');
  });
});
