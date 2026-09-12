import type { Ref } from 'react';

import { TypingDots } from './typing-dots';
import type { ListPaginationState } from '@/lib/lens/pagination';

export type LensPaginationFooterProps = {
  readonly state: ListPaginationState;
  /** `false` masque `exhausted` — iOS n'affiche « tout chargé » qu'au-delà de
   * 30 conversations (`ConversationListView+Rows.swift:557`). */
  readonly showsAllLoadedHint: boolean;
  readonly onRetry: () => void;
  /** La sentinelle 1 px de l'état `idle` — réf de RAPPEL de
   * `useLoadMoreSentinel`. */
  readonly sentinelRef: Ref<HTMLLIElement>;
};

/**
 * L'ENCRE INDIGO DU PIED, LISIBLE DANS LES DEUX SCHÉMAS (revue-correction
 * #6195). `--ios-indigo-400` (#818cf8) servi TEL QUEL mesure **2,98:1** sur
 * la surface claire (`--ios-surface: #ffffff`, `packages/design-tokens/
 * ios.css:122`) — sous AA pour du texte (4,5:1) ET sous 3:1 pour un élément
 * non textuel. C'est EXACTEMENT le défaut que la revue #5935 (défaut majeur 2)
 * a déjà payé sur le nom de soi, et que le dépôt corrige partout de la même
 * façon : indigo400 en sombre, indigo600 (#4f46e5, **6,29:1** sur blanc) en
 * clair — la paire de `--ios-read-receipt` (`ios.css:110,131`) et les DEUX
 * classes déjà servies par la feuille (`routes/signup.tsx:54`).
 *
 * Les POINTS la prennent par `currentColor` plutôt qu'une seconde valeur : une
 * seule encre pour le pied, quel que soit son état.
 */
const FOOTER_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';

/**
 * `LensPaginationFooter` (#6195) — le pied de la Lentille, PUR, miroir des
 * quatre cas de `ConversationPaginationFooter`
 * (`ConversationListView+Rows.swift:541-601`) : `loading-more` (spinner —
 * ici `TypingDots`, la charte n'admettant qu'une seule `@keyframes`, Q2),
 * `exhausted` (caption, seulement au-delà de 30), `error` (caption +
 * Réessayer, cible ≥ 44 px), `idle` (sentinelle invisible 1 px).
 * `data-pagination-footer="<state>"` est la prise des gates.
 */
export function LensPaginationFooter({ state, showsAllLoadedHint, onRetry, sentinelRef }: LensPaginationFooterProps) {
  if (state === 'loading-more') {
    return (
      /**
       * `role="status"` vit sur un ENFANT, jamais sur le `<li>`
       * (revue-correction #6195) : posé sur l'élément de liste, il ÉCRASE son
       * rôle `listitem` et retire la ligne du décompte que le lecteur d'écran
       * annonce sur `<ul id="contenu">`. Et la région porte un TEXTE
       * visuellement masqué plutôt qu'un `aria-label` : une région live
       * annonce son CONTENU qui change, pas son nom calculé — avec le seul
       * `aria-label`, l'arrivée du pied ne se disait pas.
       */
      <li data-pagination-footer="loading-more" className="grid place-items-center py-4">
        <span role="status" className={`inline-flex items-center ${FOOTER_INK}`}>
          <TypingDots color="currentColor" />
          <span className="sr-only">Chargement de la suite</span>
        </span>
      </li>
    );
  }

  if (state === 'exhausted') {
    if (!showsAllLoadedHint) return null;
    return (
      <li data-pagination-footer="exhausted" className="py-4 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        Toutes les conversations sont chargées
      </li>
    );
  }

  if (state === 'error') {
    return (
      <li data-pagination-footer="error" className="grid justify-items-center gap-1.5 py-4">
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Impossible de charger plus
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`grid place-items-center text-caption font-medium ${FOOTER_INK}`}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          Réessayer
        </button>
      </li>
    );
  }

  // `idle` — la sentinelle invisible dont l'intersection charge la suite.
  return <li data-pagination-footer="idle" data-load-more-sentinel aria-hidden="true" ref={sentinelRef} style={{ height: 1, flexShrink: 0 }} />;
}
