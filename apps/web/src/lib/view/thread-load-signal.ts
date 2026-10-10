import { useEffect, useState } from 'react';

import type { ListPaginationState } from '@/lib/lens/pagination';

/**
 * **LE FIL DIT QU'IL CHARGE** (#9302) — miroir de `isSearchingQuotedMessage`
 * iOS (`ConversationViewModel+JumpToMessage.swift`), qui fait pulser le
 * bouton « revenir en bas » pendant que la fenêtre autour d'un message
 * arrive (`ConversationScrollControlsView.quotedMessageSearchContent`).
 *
 * Deux natures, une seule place — le bouton :
 *  - `seeking` : la fenêtre `?around=` est en vol (un favori, une citation,
 *    une adresse `?message=` hors des pages chargées) ; elle prime, c'est elle
 *    qui décide de ce que le fil va montrer ;
 *  - `newer` : la page plus récente d'une fenêtre détachée est en vol
 *    (`useNewerMessages`), le lecteur redescend vers le présent.
 *
 * `windowLoading` ne vaut vrai que sur un appel RÉSEAU sans donnée servie
 * (`useAnchoredThread`) : une fenêtre déjà en cache n'est jamais « en vol ».
 */
export type ThreadLoadSignal = 'seeking' | 'newer';

/**
 * Le SEUIL avant de signaler — iOS n'en pose aucun (la recherche s'affiche
 * dès l'appel réseau, le chemin du cache ne l'allume jamais). Le web le pose
 * parce qu'un appel servi en quelques dizaines de millisecondes ferait
 * clignoter le bouton sans rien dire : sous ce seuil, le chargement n'a pas
 * eu le temps d'être une attente.
 */
export const THREAD_LOAD_SIGNAL_DELAY_MS = 200;

export function threadLoadSignalOf(input: {
  readonly windowLoading: boolean;
  readonly newerState: ListPaginationState;
}): ThreadLoadSignal | null {
  if (input.windowLoading) return 'seeking';
  return input.newerState === 'loading-more' ? 'newer' : null;
}

/**
 * Le signal, une fois qu'il a DURÉ `delayMs` sans interruption. Il s'éteint
 * dans le rendu même où le chargement aboutit (jamais un bouton qui pulse une
 * image de trop), et deux chargements qui s'enchaînent sans repos gardent le
 * signal allumé, à la nature du second.
 */
export function useDelayedSignal<T extends string>(signal: T | null, delayMs: number): T | null {
  const active = signal !== null;
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return undefined;
    }
    const handle = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(handle);
  }, [active, delayMs]);
  return active && elapsed ? signal : null;
}
