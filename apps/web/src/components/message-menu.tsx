import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { flag, languageName } from '@/lib/languages';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { projectMessagePreview } from '@/lib/view/message-preview';
import { previewSurfaceOf, readingModeOfRow } from '@/lib/view/message-preview-surface';
import { liftMotion, liftOffset, playLift, playReturn, type ReturnFlight } from '@/lib/view/message-menu-lift';
import { veilRow } from '@/lib/view/row-veil';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { piecePreviewBox, type PieceActionId, type PieceMenuItem } from '@/lib/view/message-piece';
import type { PieceMenuData } from '@/lib/view/use-piece-menu';
import { placeMessageMenuCluster } from '@/lib/view/popover';
import { safeAreaInsets } from '@/lib/view/safe-area';
import { isProgrammaticScroll } from '@/lib/view/programmatic-scroll';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import type { MessageActionId, MessageMenuItem, TranslationChoice } from '@/lib/view/message-actions';
import { revealFloor, revealRestingFactor, revealRise, revealSplit } from '@/lib/view/message-menu-reveal';
import {
  MENU_GAP,
  MENU_PADDING_Y,
  MENU_ROW_HEIGHT,
  MENU_WIDTH,
  menuListHeight,
  PREVIEW_CLIP_FADE,
  PREVIEW_MIN_VISIBLE,
  PREVIEW_SCALE_FLOOR,
  RAIL_GAP,
  RAIL_HEIGHT,
  RAIL_TILE_GAP,
  railBandWidth,
  SIDE_PADDING,
} from '@/lib/view/message-menu-metrics';

import { GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { MessageMenuPieces } from './message-menu-pieces';
import { quickReactionEmojis, RAIL_ITEM_COUNT, ReactionRailTiles } from './reaction-rail';

/**
 * LE MENU DU MESSAGE (#5814) — appui long / clic droit / `ContextMenu` sur
 * une rangée plate OU une bulle ouvrent CE composant : le rail de réactions,
 * l'APERÇU du message (soulevé, à sa place), la liste d'actions
 * (§ 5 étape 4 de la spécification).
 *
 * L'HÔTE (`routes/thread.tsx`) ne monte ce composant QUE quand un message
 * est ciblé (`menuTarget !== null`) — portail conditionnel, jamais gardé
 * ouvert vide : `target` est donc non-nullable ici.
 *
 * L'APERÇU EST UN CLONE DU DOM VIVANT (question 10 de la spécification,
 * tranchée) — jamais un second rendu React : pixels identiques par
 * construction (un message VOILÉ reste voilé, le clone copie le DOM déjà
 * voilé), zéro état dupliqué, zéro hook de plus. `data-message`/`data-row`/
 * `id`/`tabindex` sont RETIRÉS du clone pour que les gates gardent une
 * ancre UNIQUE par message dans le document.
 */

/** Un toucher sur le voile reste un toucher en deçà de ce parcours — miroir du
 * `minimumDistance: 12` du `DragGesture` de `MessageOverlayMenu.swift` (#9043). */
const TAP_SLOP = 12;

export type MessageMenuTarget = {
  readonly messageId: string;
  readonly element: HTMLElement;
  readonly isMine: boolean;
};

/**
 * LA PIÈCE VISÉE (#9907, #9908) — présente quand l'appui long a touché une
 * tuile d'un message à plusieurs pièces : l'aperçu montre cette pièce seule
 * (`MessageMenuPieces`), la liste offre les actions de la pièce, et « Tout le
 * message » rend le menu du message entier sans fermer le cluster.
 */
export type MessageMenuPiece = {
  readonly data: PieceMenuData;
  readonly onIndex: (index: number) => void;
  readonly onWholeMessage: () => void;
  readonly onAction: (id: Exclude<PieceActionId, 'wholeMessage'>) => void;
};

type ListItem = MessageMenuItem | PieceMenuItem;

/** Le libellé d'une entrée — celles d'une pièce vivent dans leur propre catalogue (`i18n-message-pieces-catalog`). */
const PIECE_ACTION_IDS: ReadonlySet<string> = new Set<PieceActionId>(['pieceReply', 'pieceSave', 'pieceForward', 'pieceDelete', 'wholeMessage']);
const isPieceItem = (item: ListItem): item is PieceMenuItem => PIECE_ACTION_IDS.has(item.id);
const labelOf = (language: InterfaceLanguage, item: ListItem): string => {
  if (isPieceItem(item)) return translateMessagePieces(language, item.labelKey);
  return item.catalog === 'pieces' ? translateMessagePieces(language, item.labelKey) : translate(language, item.labelKey);
};

/**
 * LES GROUPES SE VOIENT (#11210) — un trait sépare principal, organiser,
 * plus, modération et destructif ; la mention du bout en bout se lit sans se
 * toucher (ce n'est pas un geste), et « Supprimer » se dit dans la couleur de
 * l'erreur.
 */
const SEPARATOR_HEIGHT = 9;
const groupOf = (item: ListItem): string | null => (isPieceItem(item) ? null : item.group);
const isNotice = (item: ListItem): boolean => !isPieceItem(item) && item.id === 'e2eeNotice';
const separatorsOf = (items: readonly ListItem[]): number =>
  items.reduce((count, item, i) => (i > 0 && groupOf(item) !== groupOf(items[i - 1] as ListItem) ? count + 1 : count), 0);
const isDestructive = (item: ListItem): boolean => !isPieceItem(item) && item.group === 'destructive';

const isRtl = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

function stripPreviewIdentity(root: HTMLElement): void {
  const strip = (el: Element) => {
    el.removeAttribute('data-message');
    el.removeAttribute('data-row');
    el.removeAttribute('id');
    el.removeAttribute('tabindex');
  };
  strip(root);
  root.querySelectorAll('[data-message], [data-row], [id], [tabindex]').forEach(strip);
}

/**
 * L'ACCENT DE LA CONVERSATION, REPRIS DE L'ANCRE (revue #5814).
 *
 * `--accent` est posée par `routes/thread.tsx` sur la RACINE de l'écran
 * (`withAccent`) ; ce menu vit dans un PORTAIL sur `document.body`, donc HORS
 * de cette portée. Mesuré sur les captures : l'avatar du clone et les cinq
 * icônes du menu retombaient sur la valeur globale — un cluster gris au-dessus
 * d'un fil teinté, alors que la charte dit que TOUT composant de contexte
 * conversation porte l'accent (`CLAUDE.md` § « Conversation Accent Color »).
 * On lit la valeur RÉSOLUE sur l'ancre et on la repose sur le portail : une
 * seule source (celle de l'écran), jamais un second calcul de couleur.
 */
const CONVERSATION_SKIN_VARS = ['--accent', '--bubble-mine-personal', '--bubble-mine-personal-ink', '--bubble-mine-personal-meta'] as const;

/* La PEAU PERSONNELLE de la bulle envoyée (#10734) voyage avec l'accent : sans
   elle, l'aperçu cloné d'un message envoyé retombait sur l'indigo commun
   au-dessus d'un fil peint à l'accent choisi. */
function conversationSkinEntries(element: HTMLElement): Readonly<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const computed = getComputedStyle(element);
  return Object.fromEntries(
    CONVERSATION_SKIN_VARS.flatMap((name) => {
      const value = computed.getPropertyValue(name).trim();
      return value === '' ? [] : [[name, value] as const];
    }),
  );
}

function conversationSkinOf(element: HTMLElement): CSSProperties | undefined {
  const entries = conversationSkinEntries(element);
  return Object.keys(entries).length === 0 ? undefined : (entries as CSSProperties);
}

/** La couche du cluster (`thread-menu.css`, `.message-menu-cluster`) — celle
 * du fantôme qui redescend sur la rangée après le démontage. */
const CLUSTER_LAYER = 41;

/** Le transform de l'aperçu posé : AUCUN à l'échelle 1 (#11206) — un
 * `scale(1)` laissé en place garde un calque composité et floute le texte. */
const restTransform = (scale: number): string | undefined => (scale === 1 ? undefined : `scale(${scale})`);

/** `--safe-top`/`--safe-bottom` — posées par `thread-menu.css` depuis
 * `env(safe-area-inset-*)`, seule porte par laquelle une loi PURE
 * (`placeMessageMenuCluster`) reçoit une valeur qui dépend du DOM. */
export function MessageMenu({
  target,
  items,
  choices,
  subjectLabel,
  onClose,
  onReact,
  onExpandReactions,
  onAction,
  onPickLanguage,
  forwardItems = [],
  piece,
  canReact = true,
}: {
  readonly target: MessageMenuTarget;
  /** RÉAGIR EST-IL PERMIS (#11206) — la loi du double toucher
   * (`doubleTapReactable`) : faux, le rail n'est pas monté et le cluster se
   * place sans lui. */
  readonly canReact?: boolean;
  readonly piece?: MessageMenuPiece;
  readonly items: readonly MessageMenuItem[];
  readonly choices: readonly TranslationChoice[];
  /**
   * LE SOUS-MENU DE « TRANSFÉRER » (#9039, `forwardMenuItems`) — plus d'une
   * entrée : le tap sur Transférer l'ouvre, comme Traduire ouvre ses
   * langues ; sinon Transférer agit aussitôt.
   */
  readonly forwardItems?: readonly MessageMenuItem[];
  /** LE SUJET DU MENU (revue #5814, défaut majeur 13) — « Actions du
   * message de … : … », composé par l'hôte (`useMessageMenu`, protection
   * D-23 comprise) et posé en `aria-label` du `role="menu"` : un lecteur
   * d'écran entend enfin DE QUEL message il s'agit, comme la cible iOS. */
  readonly subjectLabel: string;
  readonly onClose: () => void;
  readonly onReact: (emoji: string) => void;
  readonly onExpandReactions: () => void;
  readonly onAction: (id: MessageActionId) => void;
  readonly onPickLanguage: (code: string) => void;
}) {
  const [panel, setPanel] = useState<'actions' | 'translate' | 'forward'>('actions');
  /* LA LANGUE D'INTERFACE, LUE UNE FOIS PAR RENDU (#7555) — `message-actions.ts`
     rend des CLÉS, ce composant les DIT. Même porte que le reste de l'écran
     (`currentInterfaceLanguage()`), jamais une seconde résolution. */
  const language = currentInterfaceLanguage();
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  /* L'ENVELOPPE DU CLONE (#11206) — c'est elle qui se tronque et porte le
     fondu : un `mask-image` posé sur l'hôte s'appliquerait APRÈS son `filter`
     et emporterait le halo et l'ombre de l'aperçu. */
  const previewClipRef = useRef<HTMLDivElement | null>(null);
  const shownItems: readonly ListItem[] = piece !== undefined ? piece.data.items : panel === 'forward' ? forwardItems : items;
  const listItems = shownItems.filter((item) => !isNotice(item));
  const notice = panel === 'actions' && piece === undefined ? items.find(isNotice) : undefined;
  const listRows = panel === 'translate' && piece === undefined ? choices.length : listItems.length;
  /* Les traits et la mention prennent leur place : la loi de placement la reçoit en lignes de menu. */
  const extraHeight = panel === 'translate' ? 0 : separatorsOf(shownItems) * SEPARATOR_HEIGHT + (notice === undefined ? 0 : MENU_ROW_HEIGHT);
  /* LA BOÎTE D'UNE PIÈCE (#9907) — stable pour tout le défilement, centrée. */
  const pieceBox =
    piece === undefined || typeof window === 'undefined'
      ? null
      : piecePreviewBox({ pieces: piece.data.pieces, viewport: { width: window.innerWidth, height: window.innerHeight }, sidePadding: SIDE_PADDING });
  /**
   * LA HAUTEUR RÉELLE DE L'APERÇU (#9907) — le clone déplie une grille en
   * colonne (`projectMessagePreview`), il est donc PLUS HAUT que la rangée
   * pressée. L'échelle se calculait sur la rangée, avant le dépliage, et
   * l'aperçu débordait de l'écran. Elle se calcule désormais sur le clone
   * mesuré (`useLayoutEffect` ci-dessous, avant la première peinture).
   */
  const [cloneHeight, setCloneHeight] = useState<number | null>(null);
  /* LE RAIL N'EXISTE QUE SI RÉAGIR EST PERMIS (#11206) — ses tuiles ouvrent
     l'ordre du parcours ; sans elles, la liste commence à l'index 0. */
  const railCount = canReact ? RAIL_ITEM_COUNT : 0;

  const computePlacement = (rows: number, height: number | null = cloneHeight) => {
    const rect = target.element.getBoundingClientRect();
    const safe = safeAreaInsets();
    const menuHeight = menuListHeight(rows) + extraHeight;
    const anchor =
      pieceBox !== null
        ? {
            top: rect.top,
            bottom: rect.top + pieceBox.height,
            left: (window.innerWidth - pieceBox.width) / 2,
            right: (window.innerWidth + pieceBox.width) / 2,
            width: pieceBox.width,
            height: pieceBox.height,
          }
        : ((height: number) => ({ top: rect.top, bottom: rect.top + height, left: rect.left, right: rect.right, width: rect.width, height }))(
            height ?? rect.height,
          );
    return placeMessageMenuCluster({
      anchor,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      safe,
      menuHeight,
      isMine: target.isMine,
      railHeight: canReact ? RAIL_HEIGHT : 0,
      railGap: canReact ? RAIL_GAP : 0,
      menuGap: MENU_GAP,
      sidePadding: SIDE_PADDING,
      menuWidth: MENU_WIDTH,
      railWidth: railBandWidth(window.innerWidth - 2 * SIDE_PADDING),
      previewScaleFloor: PREVIEW_SCALE_FLOOR,
      previewMinHeight: PREVIEW_MIN_VISIBLE,
    });
  };

  /**
   * LA MESURE — calculée SYNCHRONEMENT dès le premier rendu (initialiseur
   * paresseux) : le cluster (rail, aperçu, liste) est donc présent dans le
   * DOM DÈS le premier commit, ce qui permet à `useRovingMenu` d'y focaliser
   * sa première tuile ET à l'effet de clonage (ci-dessous) de trouver
   * `previewHostRef.current` déjà monté. Une mesure différée à un second
   * rendu (`useEffect` + `setState`) démonterait/remonterait le cluster une
   * frame plus tard — la fenêtre exacte où les deux effets rateraient leur
   * cible. Recalculée seulement quand le PANNEAU change (la liste change de
   * hauteur, § sous-menu Traduire) ; `scroll`/`resize` FERMENT déjà le menu
   * (`useRovingMenu`), remesurer un cluster qu'on démonte n'a aucun
   * spectateur.
   */
  const [placement, setPlacement] = useState(() => computePlacement(listRows));
  const [railEmojis] = useState(quickReactionEmojis);
  const pieceMode = piece !== undefined;
  useLayoutEffect(() => {
    setPlacement(computePlacement(listRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, pieceMode, cloneHeight, listRows]);

  /**
   * GLISSER VERS LE HAUT RÉDUIT L'APERÇU (#9043, `lib/view/message-menu-reveal.ts`).
   * `committedReveal` est l'état GARDÉ au relâchement (`null` : rien de
   * conclu). Pendant le geste, le rendu n'est PAS rejoué : la surface écrit
   * l'échelle de l'aperçu et la position de la liste directement sur leurs
   * nœuds, image par image — puis le relâchement les remet à React.
   */
  const [committedReveal, setCommittedReveal] = useState<number | null>(null);
  const dragRef = useRef<{ readonly id: number; readonly startY: number; factor: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * LE FIL QUI SE RÉ-ANCRE TOUT SEUL NE FERME PAS CE MENU (#7242).
   *
   * Un `scroll` du LECTEUR emporte la rangée sous le cluster : on ferme.
   * Un `scroll` que l'APPLICATION vient d'écrire — l'ancrage bas quand un
   * correspondant se met à écrire (`use-thread-typing.ts`), l'ancrage
   * d'ouverture du fil (`routes/thread.tsx`) — n'est l'intention de
   * personne, et le menu disparaissait pendant qu'on visait une entrée.
   * Mesuré sur `/c/c-deploiement` : treize millisecondes de vie sous charge,
   * `check-thread-states.mjs` § 6.2 rouge (« aucun cluster »).
   *
   * La distinction n'est pas devinée ici : `pinToBottom` DÉCLARE la position
   * qu'il vient d'écrire (`markProgrammaticScroll`), et la lecture la
   * CONSOMME — un seul `scroll` par écriture, donc le geste d'après referme
   * bien le menu.
   *
   * L'ÉVÉNEMENT ARRIVE DÉJÀ FILTRÉ (#7293) : `useRovingMenu` ne transmet que
   * les `scroll` qui ont RÉELLEMENT déplacé l'ancre, ce qui écarte ceux qui
   * étaient en vol au moment où le menu s'est ouvert. Restent ici les
   * défilements qui bougent la rangée — et parmi eux, ceux que
   * l'application a écrits elle-même.
   */
  /**
   * L'APERÇU RETOURNE À SA RANGÉE (#11206) — toute fermeture passe par
   * `close`, qui lance la descente d'un fantôme (`playReturn`) AVANT de rendre
   * la main à l'hôte : le menu se démonte aussitôt, la rangée ne réapparaît
   * qu'à l'arrivée du fantôme (`returning`, lu par le nettoyage du clone).
   * `close` est STABLE — `useRovingMenu` capture ses rappels à l'ouverture —
   * et lit la géométrie COURANTE par `latest`.
   */
  /* Le rembourrage de la surface de l'aperçu — retranché du FLIP pour que le
     contenu parte du contenu de la rangée (pas en mode pièce : aucune surface). */
  const previewInset = (): number => (pieceMode ? 0 : previewSurfaceOf(readingModeOfRow(target.element)).padding);
  const returning = useRef<ReturnFlight | null>(null);
  const returnPreview = (): ReturnFlight | null => {
    const host = previewHostRef.current;
    const anchor = target.element.getBoundingClientRect();
    if (host === null || anchor.width <= 0 || anchor.height <= 0) return null;
    return playReturn(host, {
      motion: liftMotion({
        direction: 'out',
        offset: liftOffset({ anchor, placement, isMine: target.isMine, inset: previewInset() }),
        rest: host.style.transform === '' ? 'none' : host.style.transform,
        reduced: prefersReducedMotion(),
      }),
      skin: conversationSkinEntries(target.element),
      layer: CLUSTER_LAYER,
    });
  };
  const latest = useRef({ onClose, returnPreview });
  latest.current = { onClose, returnPreview };
  const [close] = useState(() => () => {
    if (returning.current === null) returning.current = latest.current.returnPreview();
    latest.current.onClose();
  });

  /** L'ÉLÉVATION, UNE FOIS (#11206) — depuis la rangée vers la place FINALE,
   * calculée sur la hauteur que le clone vient de prendre. */
  const lifted = useRef(false);
  const liftOnce = (host: HTMLElement, height: number | null) => {
    if (lifted.current) return;
    lifted.current = true;
    const anchor = target.element.getBoundingClientRect();
    if (anchor.width <= 0 || anchor.height <= 0) return;
    const final = computePlacement(listRows, height);
    playLift(
      host,
      liftMotion({
        direction: 'in',
        offset: liftOffset({ anchor, placement: final, isMine: target.isMine, inset: previewInset() }),
        rest: restTransform(final.previewScale) ?? 'none',
        reduced: prefersReducedMotion(),
      }),
    );
  };

  const onScrollAway = (event: Event) => {
    if (isProgrammaticScroll(event.target)) return;
    close();
  };

  const roving = useRovingMenu({
    itemCount: railCount + listRows,
    returnFocusTo: () => target.element,
    /* L'ANCRE DU MENU EST LA RANGÉE, pas un bouton déclencheur : c'est elle
       que `useRovingMenu` interroge pour savoir si un `scroll` a réellement
       bougé quelque chose (#7293, § « un défilement déjà acquis »). */
    anchor: () => target.element,
    onScroll: onScrollAway,
    onResize: close,
    initialOpen: true,
  });

  // Le portail est monté DÉJÀ ouvert (`initialOpen: true`) — cet effet ferme
  // l'HÔTE (démonte le portail) quand `useRovingMenu` bascule `open` à
  // `false` (Échap, clic hors cluster, défilement, redimensionnement) —
  // jamais à l'ouverture initiale.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (roving.open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) close();
  }, [roving.open, close]);

  /**
   * LE RETOUR MATÉRIEL FERME LE MENU, PAS L'ÉCRAN (revue #5814, défaut
   * majeur 6) — sans cette ligne, un appui BACK Android depuis le menu
   * ouvert quittait le FIL (avec historique) ou L'APPLICATION (sans
   * historique) : mesuré sur `Meeshy_Poc_Web-v31` (`AND-9-back-…`), le menu
   * disparaissait avec l'écran plutôt qu'à cause de lui. Même geste que
   * `Sheet` (`components/sheet.tsx`), désormais extrait dans
   * `use-back-dismiss.ts` pour que les deux le partagent.
   */
  useBackDismiss(close);

  /**
   * L'APERÇU — un CLONE du DOM vivant, jamais un second rendu React. Et la
   * rangée SOURCE s'efface le temps du menu (revue #5814) : la loi de
   * placement RABAT le cluster pour le faire tenir à l'écran, donc l'aperçu
   * ne reste à la place de la rangée que lorsque rien ne le déplace — le cas
   * le PLUS RARE, puisque le fil est ancré en bas. Sans cet effacement, un
   * message pressé bas dans le fil se voyait DEUX FOIS : son clone net
   * au-dessus, sa rangée vive sous le voile. iOS efface la source pour la
   * même raison (`MessageListView` masque la cellule pendant l'overlay).
   *
   * `opacity: 0` et non `visibility: hidden` : la rangée doit rester
   * FOCALISABLE, c'est à elle qu'Échap rend le focus — et `closeAndFocusButton`
   * la focalise AVANT que ce nettoyage ne s'exécute.
   */
  useLayoutEffect(() => {
    const source = target.element;
    const host = previewHostRef.current;
    /* LA RANGÉE NE RÉAPPARAÎT QU'À L'ARRIVÉE DU FANTÔME (#11206) quand la
       fermeture a lancé un retour ; sinon, tout de suite. L'effacement est
       tenu par l'ÉLÉMENT (`row-veil.ts`) : un menu rouvert sur la même rangée
       avant l'arrivée ne prend jamais `'0'` pour l'opacité d'origine. */
    const veil = veilRow(source);
    const settle = () => veil.release(returning.current);
    /* EN MODE PIÈCE (#9907), l'aperçu est le défilement des pièces, rendu par
       React : aucun clone, et la rangée reste effacée. */
    if (host === null || pieceMode) {
      if (host !== null) liftOnce(host, null);
      return settle;
    }
    const clip = previewClipRef.current;
    if (clip === null) return settle;
    const clone = source.cloneNode(true) as HTMLElement;
    /* LE CLONE NE RECOPIE PAS L'EFFACEMENT (#10733) — il porte l'opacité
       d'ORIGINE, même quand un retour encore en vol tient la rangée à `'0'`. */
    clone.style.opacity = veil.original;
    stripPreviewIdentity(clone);
    /* LA FORME PROTÉGÉE, LA PROPORTION D'ORIGINE (#8008) ET LE MÉDIA TEL QU'IL
       EST À L'ÉCRAN (#11206) : le clone ne recopie jamais une fenêtre de
       lecture ouverte, ses pièces reprennent leur rapport d'aspect, une vidéo
       y montre sa frame visible — `lib/view/message-preview.ts`. */
    projectMessagePreview(clone, { source });
    clone.setAttribute('data-message-preview', '');
    clip.replaceChildren(clone);
    /* `scrollHeight` de l'enveloppe ignore la mise à l'échelle ET la
       troncature : c'est la hauteur du clone REFLUÉ à la largeur imposée, à
       laquelle s'ajoute le rembourrage de la surface — celle que la loi de
       placement doit faire tenir. Une mesure nulle (aucune mise en page) garde
       la rangée. */
    const padding = previewSurfaceOf(readingModeOfRow(source)).padding;
    const measured = clip.scrollHeight > 0 ? clip.scrollHeight + 2 * padding : null;
    setCloneHeight(measured);
    liftOnce(host, measured);
    return () => {
      clip.replaceChildren();
      settle();
    };
  }, [target.element, pieceMode]);

  const onTranslateChosen = (code: string) => {
    onPickLanguage(code);
    close();
  };

  const showPanel = (next: 'actions' | 'translate' | 'forward') => {
    setPanel(next);
    roving.setActiveIndex(railCount);
    requestAnimationFrame(() => {
      const el = roving.itemRefs.current[railCount];
      el?.focus();
    });
  };

  const onListItemChosen = (item: ListItem) => {
    if (isPieceItem(item)) {
      if (piece === undefined) return;
      if (item.id === 'wholeMessage') {
        piece.onWholeMessage();
        return;
      }
      piece.onAction(item.id);
      close();
      return;
    }
    if (item.id === 'translate' || item.id === 'translateOnDevice') {
      showPanel('translate');
      return;
    }
    if (item.id === 'forward' && panel === 'actions' && forwardItems.length > 1) {
      showPanel('forward');
      return;
    }
    onAction(item.id);
    close();
  };

  const returnToActions = () => showPanel('actions');

  /**
   * L'ADAPTATEUR CLAVIER — aucun SECOND gestionnaire : `useRovingMenu` reste
   * la SEULE mécanique de parcours, appelée par sa porte SANS événement
   * (`handleKey`, ajoutée en revue de #5814). Ce wrapper ne fait que
   * TRADUIRE des touches :
   *   (1) Échap tiré depuis le sous-menu Traduire rend la main à la liste
   *       principale, en stoppant sa PROPAGATION avant qu'elle n'atteigne le
   *       `document` (où `useRovingMenu` fermerait le cluster ENTIER) ;
   *   (2) ArrowLeft/ArrowRight quand le focus est SUR le rail
   *       (`activeIndex < RAIL_ITEM_COUNT`) — le rail est HORIZONTAL alors
   *       que la mécanique partagée ne connaît qu'un parcours VERTICAL ;
   *   (3) Tab / Shift+Tab PIÈGENT le focus dans le cluster. `aria-modal` ne
   *       retient rien par lui-même : sans ce piège, Tab sortait du menu
   *       vers les rangées du fil — qui sont focalisables (`tabIndex=0`) et
   *       pourtant DERRIÈRE un voile opaque, donc invisibles et inatteignables
   *       à la souris. iOS retire l'arbre entier (`.isModal`,
   *       `MessageOverlayMenu.swift:468-470`) ; le web fait tenir le focus.
   *
   * Une touche se passe par sa VALEUR : recopier l'événement
   * (`{ ...event, key }`) perdait `preventDefault` — méthode de PROTOTYPE —
   * et levait `TypeError` (mesuré en revue ; le rail était inerte au clavier).
   */
  const onClusterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (panel !== 'actions' && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      returnToActions();
      return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && roving.activeIndex < railCount) {
      if (roving.handleKey(event.key === 'ArrowRight' ? 'ArrowDown' : 'ArrowUp')) event.preventDefault();
      return;
    }
    /* LES FLÈCHES DÉFILENT LES PIÈCES (#9907) depuis la liste — le sens suit
       la lecture : en arabe, la flèche gauche mène à la pièce SUIVANTE. */
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && piece !== undefined) {
      const forward = (event.key === 'ArrowRight') !== isRtl();
      const next = piece.data.index + (forward ? 1 : -1);
      if (next >= 0 && next < piece.data.pieces.length) piece.onIndex(next);
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      if (roving.handleKey(event.shiftKey ? 'ArrowUp' : 'ArrowDown')) event.preventDefault();
      return;
    }
    roving.onMenuKeyDown(event);
  };

  if (typeof document === 'undefined') return null;

  const railWidthUsed = railBandWidth(window.innerWidth - 2 * SIDE_PADDING);

  // Le VOILE est purement visuel. Depuis #9043, la SURFACE DU GLISSEMENT le
  // couvre, DANS `roving.menuRef` : un toucher sans glisser y ferme le menu
  // (`onSurfacePointerUp`) ; `useRovingMenu` ferme toujours sur tout
  // `pointerdown` hors du cluster (document-level, § roving-menu.ts).
  const skin = conversationSkinOf(target.element);

  /**
   * LA SURFACE SUIT LE MODE DE LECTURE (revue #5814, défaut majeur 11 ;
   * décision #11204) — la rangée plate n'a ni fond ni rayon et se confondait
   * avec le voile flouté (mesuré : `backgroundColor: "rgba(0, 0, 0, 0)"`) :
   * iOS pose son `ThemedMessageBubble` OPAQUE même en Focal
   * (`MessageOverlayMenu.swift:414-441`). Le mode se LIT sur le DOM cloné
   * (`readingModeOfRow`), jamais redécidé ici ; la table dit le reste.
   */
  const surface = previewSurfaceOf(readingModeOfRow(target.element));

  /* LA RÉDUCTION (#9043) — la hauteur VISIBLE de l'aperçu au repos est ce qui
     se réduit ; ce que la liste perd sous le bas utile, ce qu'il faut dégager. */
  const shrinkableHeight = placement.previewHeight;
  const floor = revealFloor({ hiddenHeight: placement.menuHiddenHeight, shrinkableHeight });
  const committed = Math.min(1, Math.max(floor, committedReveal ?? revealRestingFactor({ floor, assistiveReveal: false })));
  const previewTransform = (factor: number) => restTransform(placement.previewScale * factor);
  const listTop = (factor: number) => placement.menuTop - revealRise({ factor, shrinkableHeight });
  const paintReveal = (factor: number) => {
    const host = previewHostRef.current;
    if (host !== null) host.style.transform = previewTransform(factor) ?? '';
    const list = listRef.current;
    if (list !== null) list.style.top = `${listTop(factor)}px`;
  };
  const onSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { id: event.pointerId, startY: event.clientY, factor: committed };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId) return;
    drag.factor = revealSplit({ translation: event.clientY - drag.startY, committed, floor, shrinkableHeight }).factor;
    paintReveal(drag.factor);
  };
  const onSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId) return;
    dragRef.current = null;
    /* UN TOUCHER HORS DU MENU FERME — la surface couvre le voile, elle hérite
       de ce que `useRovingMenu` faisait au `pointerdown` du document. */
    if (Math.abs(event.clientY - drag.startY) < TAP_SLOP) {
      close();
      return;
    }
    setCommittedReveal(drag.factor);
  };
  const onSurfacePointerCancel = () => {
    dragRef.current = null;
    paintReveal(committed);
  };
  /* LE MENU RESTE ATTEIGNABLE SANS LE GESTE — un focus qui ENTRE dans la liste
     (clavier, lecteur d'écran) la dégage d'office : l'aperçu se réduit au
     plancher. */
  const onListFocus = () => {
    if (committed > floor) setCommittedReveal(revealRestingFactor({ floor, assistiveReveal: true }));
  };

  return createPortal(
    <div className="message-menu-backdrop" style={skin}>
      <div
        ref={roving.menuRef}
        role="menu"
        aria-modal="true"
        aria-label={piece === undefined ? subjectLabel : `${piece.data.positionLabel}, ${subjectLabel}`}
        className="message-menu-cluster"
        onKeyDown={onClusterKeyDown}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      >
        <div
          aria-hidden
          data-message-menu-drag-surface
          className="message-menu-drag-surface"
          style={{ position: 'fixed', inset: 0, pointerEvents: 'auto' }}
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
          onPointerCancel={onSurfacePointerCancel}
        />
        {canReact ? (
        <div
          role="group"
          aria-label={translate(language, 'message.menu.react')}
          /* UN GATE N'ÉPINGLE PAS UNE CHAÎNE TRADUISIBLE (#7141, appliqué ici
             par #7555) — depuis que ce cluster lit le catalogue, son nom
             accessible suit la langue du LECTEUR, et la CI tourne en `en-US`.
             Ces marqueurs sont posés POUR être trouvés et ne changent avec
             aucune langue ; le nom accessible, lui, reste ce que le lecteur
             d'écran entend. */
          data-message-menu-rail
          className="message-menu-rail"
          style={{
            position: 'fixed',
            top: placement.railTop,
            left: placement.railLeft,
            width: railWidthUsed,
            height: RAIL_HEIGHT,
            gap: RAIL_TILE_GAP,
            pointerEvents: 'auto',
          }}
        >
          <ReactionRailTiles
            emojis={railEmojis}
            language={language}
            activeIndex={roving.activeIndex}
            itemRef={(index, el) => {
              roving.itemRefs.current[index] = el;
            }}
            onPick={(emoji) => {
              onReact(emoji);
              close();
            }}
            onExpand={() => {
              onExpandReactions();
              close();
            }}
          />
        </div>
        ) : null}

        {piece !== undefined && pieceBox !== null ? (
          <div
            ref={previewHostRef}
            data-message-menu-preview-host
            data-message-menu-piece-host
            style={{
              position: 'fixed',
              top: placement.previewTop,
              left: placement.previewLeft,
              width: pieceBox.width,
              height: pieceBox.height,
              transform: previewTransform(committed),
              transformOrigin: 'top center',
              pointerEvents: 'auto',
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: 'var(--color-media-backdrop)',
              filter: `drop-shadow(0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)) drop-shadow(0 16px 16px color-mix(in srgb, var(--color-scrim-soft) 65%, transparent))`,
            }}
          >
            <MessageMenuPieces
              pieces={piece.data.pieces}
              index={piece.data.index}
              onIndex={piece.onIndex}
              positionLabel={piece.data.positionLabel}
              language={language}
              rtl={isRtl()}
            />
          </div>
        ) : (
        <div
          ref={previewHostRef}
          aria-hidden
          /* `inert` (revue #5814, défaut majeur 13), PAS SEULEMENT
             `aria-hidden` — le clone conserve des `<button>` natifs (les
             drapeaux du pied) : `stripPreviewIdentity` retire `tabindex`,
             pas la focalisabilité NATIVE d'un `<button>`. Sous
             `aria-hidden="true"` seul, la tabulation les atteignait quand
             même (mesuré, `recette3.mjs` § H, 16 Tab) — la violation
             `aria-hidden-focus` que tout outil d'audit signale. `inert`
             neutralise la focalisabilité de TOUT ce que le clone porte, y
             compris un futur `<a>`/`<video controls>`/`<input>` — pas
             seulement les deux boutons trouvés en revue. */
          inert
          data-message-menu-preview-host
          className={surface.glass ? 'glass' : undefined}
          style={{
            position: 'fixed',
            top: placement.previewTop,
            /* LA LARGEUR IMPOSÉE, BORNÉE AUX MARGES (revue #5814, #11206) —
               sans largeur, l'hôte fixe laisse le clone se re-disposer à sa
               largeur MAX-CONTENT (une rangée plate en `grid 41px 1fr` y
               étalait sa tuile média sur tout l'écran). La largeur est celle
               de l'ancre, ramenée à l'écran moins deux marges : une rangée
               pleine largeur se REFLUE à 16 px des bords, à la taille de son
               texte, au lieu d'être réduite. `height` reste libre. */
            left: placement.previewLeft,
            width: placement.previewWidth,
            boxSizing: 'border-box',
            transform: previewTransform(committed),
            transformOrigin: target.isMine ? 'top right' : 'top left',
            pointerEvents: 'none',
            /* L'ÉLÉVATION (revue #5814, défaut majeur 11) — posée sur
               l'HÔTE du clone, JAMAIS sur le clone lui-même (qui doit rester
               pixel pour pixel la rangée pressée) : `drop-shadow`, pas
               `box-shadow`, parce que le clone n'est pas rectangulaire en
               peau Bulles (rayon 18). Deux passes, miroir iOS : un halo
               teinté à l'accent DÉJÀ résolu (`conversationSkinOf`, jamais un second
               calcul de couleur) et une ombre noire — l'aperçu se décolle
               ainsi du voile flouté sur les DEUX peaux et les DEUX schémas. */
            filter: `drop-shadow(0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)) drop-shadow(0 16px 16px color-mix(in srgb, var(--color-scrim-soft) 65%, transparent))`,
            /* LA SURFACE DU MODE (`message-preview-surface.ts`) : carte opaque
               en Focal, verre à marges en Script, rien sur une bulle, qui
               porte déjà la sienne. */
            ...(surface.padding > 0 ? { padding: surface.padding } : {}),
            ...(surface.background !== null ? { backgroundColor: surface.background } : {}),
            ...(surface.radius > 0 ? { borderRadius: surface.radius } : {}),
          }}
        >
          {/* SOUS LE PLANCHER, TRONQUÉ AVEC UN FONDU (#11206) — jamais un texte
              réduit au-delà de 0,75 pour tout faire tenir. Sur l'ENVELOPPE, pas
              sur l'hôte : l'hôte garde son élévation. */}
          <div
            ref={previewClipRef}
            data-message-menu-preview-clip
            style={
              placement.previewClipHeight !== null
                ? {
                    maxHeight: Math.max(0, placement.previewClipHeight - 2 * surface.padding),
                    overflow: 'hidden',
                    maskImage: `linear-gradient(to bottom, black calc(100% - ${PREVIEW_CLIP_FADE}px), transparent)`,
                    WebkitMaskImage: `linear-gradient(to bottom, black calc(100% - ${PREVIEW_CLIP_FADE}px), transparent)`,
                  }
                : undefined
            }
          />
        </div>
        )}

        {panel !== 'translate' ? (
          <div
            ref={listRef}
            className="message-menu-list"
            {...(panel === 'forward' ? { 'data-message-menu-forward': '' } : {})}
            onFocus={onListFocus}
            style={{
              position: 'fixed',
              top: listTop(committed),
              left: placement.menuLeft,
              width: MENU_WIDTH,
              paddingBlock: MENU_PADDING_Y,
              pointerEvents: 'auto',
            }}
          >
            {listItems.map((item, i) => {
              const index = railCount + i;
              const previous = listItems[i - 1];
              const tone = isDestructive(item) ? 'var(--color-error)' : undefined;
              return (
                <Fragment key={item.id}>
                  {previous !== undefined && groupOf(previous) !== groupOf(item) ? (
                    <div role="separator" aria-hidden data-message-menu-separator className="message-menu-separator" />
                  ) : null}
                  <button
                    ref={(el) => {
                      roving.itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    data-action={item.id}
                    {...(groupOf(item) === null ? {} : { 'data-group': groupOf(item) })}
                    {...(tone === undefined ? {} : { 'data-variant': 'destructive' })}
                    tabIndex={index === roving.activeIndex ? 0 : -1}
                    className="flex w-full items-center gap-2.5 px-3 text-start text-title font-medium"
                    style={{ minHeight: MENU_ROW_HEIGHT, color: tone ?? 'var(--color-ios-ink)' }}
                    onClick={() => onListItemChosen(item)}
                  >
                    <GlyphSvg glyph={THREAD_MENU_GLYPHS[item.glyph]} size={18} style={{ color: tone ?? 'var(--accent)' }} />
                    <span className="flex-1">{labelOf(language, item)}</span>
                    {item.id === 'more' || (item.id === 'forward' && panel === 'actions' && forwardItems.length > 1) ? (
                      <GlyphSvg
                        glyph={{ viewBox: '0 0 256 256', body: '<path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>' }}
                        size={14}
                        style={{ color: 'var(--color-ios-ink-3)' }}
                      />
                    ) : null}
                  </button>
                </Fragment>
              );
            })}
            {notice === undefined ? null : (
              <p data-message-menu-notice className="message-menu-notice flex items-center gap-2.5 px-3 text-caption" style={{ minHeight: MENU_ROW_HEIGHT }}>
                {isPieceItem(notice) ? null : <GlyphSvg glyph={THREAD_MENU_GLYPHS[notice.glyph]} size={14} />}
                <span className="flex-1">{labelOf(language, notice)}</span>
              </p>
            )}
          </div>
        ) : (
          /* UN SEUL `role="menu"` DANS LE DOCUMENT (revue #5814) — un `menu`
             IMBRIQUÉ dans un `menu` est invalide en ARIA (un sous-menu doit
             pendre d'un `menuitem` porteur d'`aria-haspopup`) et faisait de
             plus mentir le critère de fin (« UN menu `role=menu` »). Le
             panneau de langues est un GROUPE de `menuitemradio` — la
             structure que la norme attend pour un ensemble de choix
             exclusifs, et celle que la liste d'actions remplace le temps du
             sous-menu. */
          <div
            role="group"
            aria-label={translate(language, 'message.menu.translate')}
            ref={listRef}
            data-message-menu-languages
            className="message-menu-list"
            onFocus={onListFocus}
            style={{
              position: 'fixed',
              top: listTop(committed),
              left: placement.menuLeft,
              width: MENU_WIDTH,
              paddingBlock: MENU_PADDING_Y,
              pointerEvents: 'auto',
            }}
          >
            {choices.map((choice, i) => {
              const index = railCount + i;
              return (
                <button
                  key={choice.code}
                  ref={(el) => {
                    roving.itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice.isServed}
                  tabIndex={index === roving.activeIndex ? 0 : -1}
                  className="flex w-full items-center gap-2.5 px-3 text-start text-title font-medium"
                  style={{ minHeight: MENU_ROW_HEIGHT, color: 'var(--color-ios-ink)' }}
                  onClick={() => onTranslateChosen(choice.code)}
                >
                  <span aria-hidden>{flag(choice.code)}</span>
                  <span className="flex-1">
                    {choice.isOriginal
                      ? translate(language, 'message.detail.language.original', { language: languageName(choice.code) })
                      : languageName(choice.code)}
                  </span>
                  {/* LA LANGUE SERVIE SE VOIT (revue #5814) — `aria-checked`
                      seul ne dit rien à l'ŒIL : le panneau montrait deux
                      langues sans jamais désigner celle qu'on lit, alors que
                      la feuille « Détails du message » la coche déjà. Un
                      radio dont l'état courant est invisible n'est pas un
                      choix, c'est une devinette. */}
                  {choice.isServed ? (
                    <span aria-hidden style={{ color: 'var(--accent)' }}>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
