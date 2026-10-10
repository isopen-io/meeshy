import { useCallback, useEffect, useState } from 'react';

import {
  afterFlameDismissed,
  afterHeaderToggle,
  headerMemory,
  type HeaderMemory,
  type HeaderMemoryState,
} from './header-memory';

/**
 * L'en-tête d'UNE conversation et sa mémoire (#9031) : l'état déplié et la
 * flamme masquée, relus à l'ouverture et retenus à chaque GESTE du lecteur.
 * L'aperçu tiré d'une bannière a sa propre disposition : il ne lit ni n'écrit
 * rien.
 */
export function useHeaderMemory({
  scope,
  conversationId,
  preview,
  memory = headerMemory,
}: {
  readonly scope: string;
  readonly conversationId: string | undefined;
  readonly preview: boolean;
  readonly memory?: HeaderMemory;
}): HeaderMemoryState & { readonly toggleExpanded: () => void; readonly dismissFlame: () => void } {
  const remembered = preview || conversationId === undefined || conversationId === '' ? null : conversationId;
  const recall = (): HeaderMemoryState =>
    remembered === null ? { expanded: false, flameDismissed: false } : memory.read(scope, remembered);
  const [state, setState] = useState<HeaderMemoryState>(recall);

  useEffect(() => {
    setState(recall());
    // `recall` lit exactement ces deux entrées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, remembered]);

  const commit = useCallback(
    (step: (previous: HeaderMemoryState) => HeaderMemoryState) => {
      setState((previous) => {
        const next = step(previous);
        if (remembered !== null) memory.write(scope, remembered, next);
        return next;
      });
    },
    [memory, remembered, scope],
  );

  const toggleExpanded = useCallback(() => commit((previous) => afterHeaderToggle(previous, !previous.expanded)), [commit]);
  const dismissFlame = useCallback(() => commit(afterFlameDismissed), [commit]);

  return { ...state, toggleExpanded, dismissFlame };
}
