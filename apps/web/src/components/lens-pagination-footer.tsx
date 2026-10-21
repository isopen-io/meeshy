import type { ReactNode, Ref } from 'react';

import { TypingDots } from './typing-dots';
import type { ListPaginationState } from '@/lib/lens/pagination';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

export type LensPaginationFooterProps = {
  readonly state: ListPaginationState;
  /** `false` masque `exhausted` — iOS n'affiche « tout chargé » qu'au-delà de
   * 30 conversations (`ConversationListView+Rows.swift:557`). */
  readonly showsAllLoadedHint: boolean;
  readonly onRetry: () => void;
  /** La sentinelle 1 px de l'état `idle` — réf de RAPPEL de
   * `useLoadMoreSentinel`. */
  readonly sentinelRef: Ref<HTMLLIElement>;
  /**
   * LE LIBELLÉ DE L'ÉTAT `exhausted` (#5893) — PARAMÉTRÉ plutôt que dupliqué :
   * le fil des publications réutilise ce même pied (mêmes quatre cas, même
   * encre) pour un corpus de PUBLICATIONS, pas de conversations. Défaut
   * INCHANGÉ pour tout appelant antérieur à ce lot.
   */
  readonly exhaustedLabel?: string;
  /**
   * CE QUI TIENT LA PLACE DE LA PAGE SUIVANTE (#6987) — PARAMÉTRÉ comme le
   * libellé : la Lentille garde ses points, le fil des publications pose des
   * cartes fantômes de la hauteur des vraies, là où les posts vont apparaître
   * — jamais du fond nu sous un indicateur (même loi qu'iOS,
   * `SkeletonFeedList` pendant `isLoadingMore`). Défaut INCHANGÉ : les points.
   */
  readonly loadingMoreContent?: ReactNode;
  /**
   * UNE SEULE HAUTEUR DANS LES QUATRE ÉTATS (#8760, miroir iOS
   * `ConversationPaginationFooterContent.slotHeight`, #8759). Ce qui suit le
   * pied — « Et maintenant ? » sous la liste des conversations — ne bouge plus
   * quand une page se charge. Réservé aux listes qui posent quelque chose
   * dessous : le fil des publications garde ses cartes fantômes.
   */
  readonly fixedSlot?: boolean;
};

/** La place la plus haute — l'erreur : libellé, 6 px, bouton de 44 px. */
const SLOT_HEIGHT = '4.25rem';
const SLOT = { height: SLOT_HEIGHT, flexShrink: 0 } as const;


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
export function LensPaginationFooter({
  state,
  showsAllLoadedHint,
  onRetry,
  sentinelRef,
  exhaustedLabel,
  loadingMoreContent,
  fixedSlot = false,
}: LensPaginationFooterProps) {
  const slot = fixedSlot ? SLOT : undefined;
  const language = currentInterfaceLanguage();
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
      <li data-pagination-footer="loading-more" style={slot} className={loadingMoreContent ? 'py-1' : `grid place-items-center ${fixedSlot ? '' : 'py-4'}`}>
        <span role="status" className={loadingMoreContent ? 'block' : `inline-flex items-center ${FOOTER_INK}`}>
          {loadingMoreContent ?? <TypingDots color="currentColor" />}
          <span className="sr-only">{translate(language, 'list.footer.loadingMore')}</span>
        </span>
      </li>
    );
  }

  if (state === 'exhausted') {
    if (!showsAllLoadedHint) return fixedSlot ? <li data-pagination-footer="exhausted" aria-hidden="true" style={SLOT} /> : null;
    return (
      <li data-pagination-footer="exhausted" className={`${fixedSlot ? 'grid place-items-center' : 'py-4'} text-center text-caption`} style={{ ...slot, color: 'var(--color-ios-ink-2)' }}>
        {exhaustedLabel ?? translate(language, 'list.footer.exhausted')}
      </li>
    );
  }

  if (state === 'error') {
    return (
      <li data-pagination-footer="error" style={slot} className={`grid justify-items-center gap-1.5 ${fixedSlot ? 'content-center' : 'py-4'}`}>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'list.footer.failed')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`grid place-items-center text-caption font-medium ${FOOTER_INK}`}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          {translate(language, 'common.retry')}
        </button>
      </li>
    );
  }

  // `idle` — la sentinelle invisible dont l'intersection charge la suite.
  return <li data-pagination-footer="idle" data-load-more-sentinel aria-hidden="true" ref={sentinelRef} style={slot ?? { height: 1, flexShrink: 0 }} />;
}
