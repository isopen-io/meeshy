import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { PlacedMessage } from '@/lib/grouping';
import { usesFlatRow } from '@/lib/reading-mode/decision';

/**
 * LE CHROME DU FIL (#5774, travail 3/3) — trois lois pures, MIROIR d'
 * `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`.
 *
 * Rien ici ne touche le DOM : `use-thread-chrome.ts` (le hook) projette le
 * verdict de `chromeHiding` sur deux attributs de données, hors React ; les
 * composants `src/components/thread-chrome.tsx` (pilule de jour, bouton
 * « revenir en bas ») consomment `stickyDayOf` / `scrollToBottomLabel` /
 * `unreadHeadline` / `lastMessageLine` comme des props ordinaires.
 */

// ---------------------------------------------------------------------------
// 1. L'ESCAMOTAGE DU CHROME — miroir `ConversationView.hidesHeaderActions` /
//    `.hidesEntireHeader` / `.hidesComposerChrome` (:2074-2141).
// ---------------------------------------------------------------------------

/** `'entire'` (rangée plate) · `'actions'` (Bulles, seule la grappe de boutons) · `'none'` (rien de caché). */
export type HeaderChromeVisibility = 'entire' | 'actions' | 'none';

export type ChromeHiding = {
  readonly header: HeaderChromeVisibility;
  readonly composer: boolean;
};

export type ChromeHidingInput = {
  readonly mode: ConversationReadingMode;
  /** Un geste UTILISATEUR est TENU — `sceneActivity.isGestureHeld` (`scene/activity.ts`). */
  readonly gesture: boolean;
  readonly searchOpen: boolean;
  /**
   * Le composeur est ENGAGÉ — équivalent structurel des exceptions
   * `isEmojiPanelOpen` / `hasMentionSuggestions` iOS (:2124-2141) : web-v3 n'a
   * ni panneau emoji ni suggestions de mention (`composer.tsx:24-31`), donc
   * « l'outil en main » se lit au FOCUS de l'enveloppe du composeur.
   */
  readonly composerEngaged: boolean;
};

/**
 * `chromeHiding` — la loi ENTIÈRE en une fonction, miroir des trois
 * fonctions Swift ci-dessus composées :
 *
 * - recherche ouverte, geste absent, ou Résumé Vivant ⇒ rien ne se cache
 *   (`searchOpen` échappe à la règle iOS ; `summary` n'a pas de liste qui
 *   défile sous le doigt, donc jamais de geste à honorer) ;
 * - rangée plate (`focal`/`script`) ⇒ l'en-tête ENTIER s'efface, et le
 *   composeur avec lui SAUF si engagé ;
 * - `bubbles` (et `river`, hors périmètre D-21 mais traité comme `bubbles`
 *   par défaut) ⇒ seule la grappe d'actions du header s'efface, le
 *   composeur reste toujours visible (miroir : `hidesComposerChrome` ne
 *   vaut jamais en dehors de `hidesEntireHeader`).
 */
export function chromeHiding(input: ChromeHidingInput): ChromeHiding {
  const { mode, gesture, searchOpen, composerEngaged } = input;
  if (searchOpen || !gesture || mode === 'summary') {
    return { header: 'none', composer: false };
  }
  const flatRow = usesFlatRow(mode);
  const header: HeaderChromeVisibility = flatRow ? 'entire' : 'actions';
  const composer = flatRow && !composerEngaged;
  return { header, composer };
}

// ---------------------------------------------------------------------------
// 2. « PRÈS DU BAS » — miroir `MessageListViewController.nearBottomFollowThreshold`
//    (:452) et son usage (:2886-2887).
// ---------------------------------------------------------------------------

export const NEAR_BOTTOM_THRESHOLD_PX = 200;

export type NearBottomInput = {
  readonly totalSize: number;
  /** `null` : le virtualiseur n'a pas encore mesuré (premier rendu) — un fil s'ouvre en bas. */
  readonly scrollOffset: number | null;
  readonly viewportHeight: number;
};

export function isNearBottom(input: NearBottomInput): boolean {
  if (input.scrollOffset === null) return true;
  const distanceFromBottom = input.totalSize - input.scrollOffset - input.viewportHeight;
  return distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
}

// ---------------------------------------------------------------------------
// 3. LA PILULE DE JOUR COLLANTE — miroir `updateStickyDayLabel` (:896-957).
// ---------------------------------------------------------------------------

/** La portion d'un `VirtualItem` TanStack dont `stickyDayOf` a besoin — pas plus. */
export type VirtualRowSpan = {
  readonly index: number;
  readonly start: number;
  readonly end: number;
};

/** Le premier item dont l'intervalle `[start, end)` couvre encore le bord haut du défileur. */
export function topVisibleIndex(items: readonly VirtualRowSpan[], scrollOffset: number): number | null {
  for (const item of items) {
    if (item.end > scrollOffset) return item.index;
  }
  return items.length === 0 ? null : (items[items.length - 1]?.index ?? null);
}

/** En remontant depuis `fromIndex`, le premier index dont `opensDay` n'est pas nul. */
export function dayOpenerIndexOf(placed: readonly PlacedMessage[], fromIndex: number): number | null {
  for (let i = fromIndex; i >= 0; i -= 1) {
    if (placed[i]?.opensDay !== null && placed[i]?.opensDay !== undefined) return i;
  }
  return null;
}

export type StickyDayInput = {
  readonly placed: readonly PlacedMessage[];
  readonly items: readonly VirtualRowSpan[];
  readonly scrollOffset: number;
};

/**
 * LA HAUTEUR DU SÉPARATEUR EN FLUX (revue #5774, défaut majeur 5) — MESURÉE
 * au navigateur (`thread-modes.tsx`, l'enveloppe `flex justify-center py-1.5`
 * du séparateur — le `className` n'est PAS cité en entier ici : replié sur
 * deux lignes, l'étoile de continuation du bloc entrait dans la citation et
 * `check-utilities.mjs` la lisait comme une classe `*` sans règle, un ÉCHEC
 * de gate né d'un commentaire) qui précède chaque rangée dont `opensDay`
 * n'est pas nul : `getBoundingClientRect().height` du pourtour de la pastille,
 * relative au haut de sa `<li>`) : 40px, stable (police/rayons du design
 * system, jamais un contenu qui varie en hauteur — le libellé tient sur une
 * seule ligne). C'est cette valeur, et non le SEUL bord haut de la rangée,
 * qui décide quand la sticky peut réapparaître sans doublonner le
 * séparateur encore visible — voir `stickyDayOf` ci-dessous.
 */
export const DAY_SEPARATOR_HEIGHT_PX = 40;

/**
 * Le libellé de la pilule collante, ou `null` quand rien ne doit s'afficher
 * — miroir `.dayHeader ⇒ nil` ET « le séparateur du jour, déjà visible EN
 * FLUX, ne doit pas être doublonné » (:919-923).
 */
export function stickyDayOf(input: StickyDayInput): string | null {
  const topIndex = topVisibleIndex(input.items, input.scrollOffset);
  if (topIndex === null) return null;
  const row = input.placed[topIndex];
  if (row === undefined) return null;

  if (row.opensDay === null) {
    const openerIndex = dayOpenerIndexOf(input.placed, topIndex);
    return openerIndex === null ? null : (input.placed[openerIndex]?.opensDay ?? null);
  }

  /*
   * Cette rangée OUVRE elle-même un jour : la sticky doublonnerait tant que
   * son propre séparateur EN FLUX reste (même partiellement) VISIBLE.
   *
   * CORRECTION revue #5774, défaut majeur 5 — la loi précédente comparait le
   * bord HAUT de la rangée à `scrollOffset` (`item.start >= scrollOffset`) :
   * elle démasquait la sticky dès que ce bord haut franchissait le sommet du
   * défileur, alors que le séparateur — qui n'occupe que les 40 premiers
   * pixels de la rangée, le message suit dessous — restait VISIBLE encore
   * `DAY_SEPARATOR_HEIGHT_PX` pixels de plus. Fenêtre mesurée du doublon :
   * ~40px de défilement à CHAQUE frontière de jour, sur les deux schémas et
   * les trois peaux (le défaut ne dépend ni de l'un ni des autres). La loi
   * compare désormais le BORD BAS du séparateur — pas de la rangée entière,
   * qui peut être bien plus haute qu'un message — au même seuil, comme le
   * fait `.dayHeader ⇒ nil` côté iOS (l'item du haut y EST le séparateur,
   * jamais une rangée composite).
   */
  const item = input.items.find((candidate) => candidate.index === topIndex);
  if (item !== undefined && item.start + DAY_SEPARATOR_HEIGHT_PX > input.scrollOffset) return null;
  return row.opensDay;
}

// ---------------------------------------------------------------------------
// 4. LE BOUTON « DÉFILER VERS LE BAS » — miroir
//    `ConversationView+ScrollIndicators.swift:88-104` et
//    `ConversationScrollControlsView.swift:311-322`.
// ---------------------------------------------------------------------------

/** `'Défiler vers le bas'` / `'N message(s) non lu(s), Défiler vers le bas'`. */
export function scrollToBottomLabel(unreadCount: number): string {
  const action = 'Défiler vers le bas';
  if (unreadCount <= 0) return action;
  const plural = unreadCount > 1 ? 's' : '';
  return `${unreadCount} message${plural} non lu${plural}, ${action}`;
}

/** Le format condensé « N messages non lus » n'apparaît qu'au-delà de 5 (#3921). */
export function unreadHeadline(unreadCount: number): boolean {
  return unreadCount > 5;
}

/** `"Auteur : contenu"` en groupe, `"contenu"` seul, `null` sans contenu. */
export function lastMessageLine(input: {
  readonly senderName?: string | null | undefined;
  readonly text?: string | null | undefined;
}): string | null {
  const { senderName, text } = input;
  if (text === null || text === undefined || text === '') return null;
  if (senderName === null || senderName === undefined || senderName === '') return text;
  return `${senderName} : ${text}`;
}
