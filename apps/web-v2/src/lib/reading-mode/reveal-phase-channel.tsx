import { createContext, useContext, type ReactNode } from 'react';

import type { RevealPhase } from './protection';

/**
 * **LE CANAL PAR LEQUEL UNE PHASE DE RÉVÉLATION REMONTE** (#7142).
 *
 * `protection.ts` est le seul domicile du CYCLE ; `ProtectedContent` est le
 * seul porteur de l'ÉTAT. Ce fichier n'ajoute ni l'un ni l'autre : il ne
 * transporte qu'une émission, du composant qui sait vers l'hôte qui compose le
 * nom accessible de la rangée (`thread-modes.tsx`, `aria-label` sur
 * `[data-row]`).
 *
 * ## POURQUOI UN CONTEXTE ET NON UNE PROP
 *
 * Entre `ThreadModes` et `ProtectedContent` il y a DEUX peaux, `FocalRow` et
 * `Bubble`, toutes deux `memo`. Un rappel passé en prop devrait être relayé par
 * chacune : deux relais à tenir en accord, c'est-à-dire deux chemins qui
 * divergeront — la forme même que le critère 3 de #7142 interdit (« la phase
 * remonte par UN SEUL mécanisme, partagé par les deux peaux »). Par le
 * contexte, les deux peaux restent INCHANGÉES et ne peuvent donc pas diverger.
 *
 * ## CE QUI NE TRAVERSE PAS CE CANAL
 *
 * Le REGISTRE. Le canal ne porte que `publish`, une fonction : sa valeur est
 * stable, donc publier ne re-rend aucun consommateur. L'état vit chez l'hôte,
 * qui est seul à se re-rendre — trois fois par révélation, mesuré.
 *
 * ## SON DÉFAUT EST LE SILENCE, PAS LA PANNE
 *
 * `ProtectedContent` est aussi monté par des hôtes sans nom accessible à tenir
 * (`protection-notice.test.tsx` le monte nu ; la lecture souveraine le monte
 * sans avoir de phase à afficher). Un canal absent doit donc être un no-op —
 * sans quoi ce mécanisme devrait être câblé partout où le composant apparaît,
 * et le premier hôte oublié planterait.
 */
const PublishContext = createContext<(messageId: string, phase: RevealPhase) => void>(() => {});

export function RevealPhaseChannel({
  publish,
  children,
}: {
  /**
   * STABLE, à la charge de l'hôte (`useCallback` avec un `setState`
   * fonctionnel). Une identité qui change à chaque rendu re-monterait l'effet
   * de publication de chaque `ProtectedContent` visible.
   */
  readonly publish: (messageId: string, phase: RevealPhase) => void;
  readonly children: ReactNode;
}) {
  return <PublishContext.Provider value={publish}>{children}</PublishContext.Provider>;
}

export function useRevealPhasePublisher(): (messageId: string, phase: RevealPhase) => void {
  return useContext(PublishContext);
}
