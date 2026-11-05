import { useEffect, useRef } from 'react';

/**
 * UNE DEMANDE D'ÉCRITURE DANS LE COMPOSEUR DU FIL (#16338) — « dis-lui salut »
 * d'un avis d'arrivée y écrit les mentions des arrivants. Le composeur MONTÉ
 * s'abonne ; la rangée qui invite lit `available()` pour ne jamais offrir un
 * geste sans effet (loi 4) — un fil en lecture seule n'a pas de composeur.
 */
type Listener = (chunk: string) => void;

function createComposerInsertStore() {
  const listeners = new Set<Listener>();
  const watchers = new Set<() => void>();
  const changed = (): void => watchers.forEach((watch) => watch());
  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      changed();
      return () => {
        listeners.delete(listener);
        changed();
      };
    },
    request(chunk: string): void {
      listeners.forEach((listener) => listener(chunk));
    },
    available(): boolean {
      return listeners.size > 0;
    },
    /** `useSyncExternalStore` : la rangée apprend qu'un composeur s'est monté ou démonté. */
    watch(watcher: () => void): () => void {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
}

export const composerInsertStore = createComposerInsertStore();

/** Le texte reçu vient À LA SUITE de ce qui est écrit, séparé d'une espace. */
export function appendToComposerText(text: string, chunk: string): string {
  if (text === '' || text.endsWith(' ')) return text + chunk;
  return `${text} ${chunk}`;
}

/**
 * Le composeur s'abonne : le texte suivant est rendu à `onText`, puis le champ
 * prend le focus, le curseur en fin. `text` et `onText` sont lus au moment de
 * la demande (référence), l'abonnement ne se refait pas à chaque frappe.
 */
export function useComposerInserts(params: {
  readonly text: string;
  readonly fieldRef: { readonly current: HTMLTextAreaElement | null };
  readonly onText: (next: string) => void;
}): void {
  const latest = useRef(params);
  latest.current = params;
  useEffect(
    () =>
      composerInsertStore.subscribe((chunk) => {
        const { text, fieldRef, onText } = latest.current;
        const next = appendToComposerText(text, chunk);
        onText(next);
        queueMicrotask(() => {
          const field = fieldRef.current;
          if (field === null) return;
          field.focus();
          field.setSelectionRange(next.length, next.length);
        });
      }),
    [],
  );
}
