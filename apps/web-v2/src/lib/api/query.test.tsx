import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { useThreadData } from './query';

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
