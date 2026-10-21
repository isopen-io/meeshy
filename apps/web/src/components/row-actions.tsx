import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';

import type { ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';

import type { Conversation } from '@/lib/api/types';
import { navigate } from '@/lib/router';
import { impact } from '@/lib/view/haptics';
import { isContextMenuKey } from '@/lib/view/long-press';
import { placeMessageMenuCluster, placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { safeAreaInsets } from '@/lib/view/safe-area';
import {
  rowMenuItems,
  rowSubmenuItems,
  type RowActionGlyph as RowActionGlyphName,
  type RowActionId,
  type RowMenuMore,
  type RowSubmenu,
  type RowSubmenuChoice,
} from '@/lib/view/row-actions';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import type { ConversationFlags } from '@/lib/api/preferences';
import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { href } from '@/routes/route-table';

import { Glyph, GlyphSvg } from './glyph';
import { CALLS_GLYPHS } from './glyphs-calls';
import { ROW_MENU_GLYPHS, type RowMenuGlyphName } from './glyphs-row-menu';

import '@/styles/conversation-peek.css';

/**
 * LES ACTIONS DE RANGÉE — bouton + popover (#5559 §5.6), l'ADAPTATION web du
 * couple swipe leading/trailing d'iOS (`ConversationListView.swift:945-1040`,
 * §1.5 de la spécification) : iOS sert déjà ces actions par MENU CONTEXTUEL
 * (`ConversationListView+Rows.swift:113-216`), un véhicule aussi conforme
 * que le swipe. Depuis #10580 la ligne se balaie AUSSI au doigt
 * (`conversation-row-swipe.tsx`, mêmes actions) ; ce menu reste le véhicule
 * de la souris, du clavier et du lecteur d'écran.
 *
 * Loi de PLACEMENT reprise de `ReadingModeChip` (`popover.ts`, le site
 * unique, y compris VERTICALEMENT — `placePopoverVertical`, #5559 défaut 7) ;
 * les LIBELLÉS et l'ID de chaque action viennent de `rowMenuItems`
 * (`lib/view/row-actions.ts`) — ce composant ne décide rien, il ROUTE le clic
 * vers `onAction`. La mécanique clavier/focus/fermeture (roving tabindex,
 * Échap, clic hors-menu) vient de `useRovingMenu` (`lib/view/roving-menu.ts`),
 * PARTAGÉE avec `ReadingModeChip` depuis #5559 défaut 4 — les deux menus du
 * dépôt écrivaient la même mécanique deux fois.
 *
 * POSITION DU BOUTON : SECOND enfant du `<li data-row>`, FRÈRE du `Link` —
 * jamais dedans (un élément interactif dans un lien est invalide, et la
 * scène de la Lentille n'anime QUE le `firstElementChild` de la rangée —
 * `scene.ts:104` — donc ce bouton échappe à la perspective par
 * construction). `position: absolute` retire le bouton du FLUX : aucune
 * propriété de mise en page n'est engagée, `check-lens.mjs` reste vert par
 * construction.
 *
 * LE MENU, LUI, EST UN PORTAIL (`createPortal`) — pas un enfant positionné du
 * bouton. Mesuré à la première version : une centaine de `<li>` SIBLINGS,
 * chacun `position: relative`, empilent leurs descendants absolus dans
 * l'ORDRE DU DOM — le menu ouvert sur une rangée du HAUT de la liste se
 * peignait donc SOUS le contenu des rangées qui la suivent (`z-index` ne
 * compare que dans le MÊME contexte d'empilement, et chaque `<li>` en ouvre
 * un). Le portail rend le menu enfant direct de `document.body`, en
 * `position: fixed`, aux coordonnées VIEWPORT du bouton
 * (`getBoundingClientRect()`) — indépendant de tout ancêtre, y compris de
 * l'opacité de sourdine (`opacity < 1` sur le `<li>` créerait sinon son
 * propre référentiel pour un `position: fixed` descendant).
 */
const MENU_WIDTH = 220;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
/**
 * LA HAUTEUR ESTIMÉE DU PANNEAU, sans mesure DOM — #5559 défaut 7 : `measure()`
 * s'exécute AVANT le montage du portail (elle décide où le monter), donc
 * aucune vraie hauteur n'est disponible à cet instant. Chaque ligne fait 44
 * (le plancher tactile, posé en `minHeight` sur les boutons) et le panneau
 * porte `py-1` (4 + 4 = 8) de rembourrage vertical.
 */
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;
/** Le filet de 1 px en haut et en bas (`border`) : sans lui, la hauteur
 * plafonnée (#10593) laissait 2 px à défiler dans un panneau qui tient. */
const MENU_BORDER = 2;

/**
 * LA TAILLE DESSINÉE, et pourquoi c'est 34 et non 32 : `tap-target-34`
 * (`app.css`) étend la zone tactile de 5 px sur chaque bord — 34 + 10 = 44,
 * le plancher du dépôt. Mesuré à 32 px de dessin, la cible réelle tombait à
 * 42×42, sous ce plancher, exactement comme le bouton de `message-blocks.tsx`
 * qui porte déjà `size-[34px]` pour la même raison.
 *
 * La RÉSERVE du `Link` voisin (`pe-12`, 48 px dans `lens-row.tsx`) est
 * dimensionnée sur ce débord : 8 (droite) + 34 (bouton) + 5 (débord) = 47 < 48
 * — le `::after` ne mord donc jamais sur le badge de non-lus, dont il volerait
 * sinon le clic (même défaut que le débord de `tap-target-22` corrigé en #5566).
 */
const BUTTON_SIZE = 34;

/**
 * LE GLYPHE D'UNE ACTION DE LIGNE — un site pour le menu et pour les actions
 * balayées (`conversation-row-swipe.tsx`, #10580) : la caméra et la corbeille
 * vivent dans la planche des appels, les autres dans la planche commune.
 */
const isRowMenuGlyph = (glyph: RowActionGlyphName): glyph is RowActionGlyphName & RowMenuGlyphName => glyph in ROW_MENU_GLYPHS;

export function RowActionGlyph({ glyph, size }: { readonly glyph: RowActionGlyphName; readonly size: number }) {
  if (glyph === 'videoCamera' || glyph === 'trash') return <GlyphSvg glyph={CALLS_GLYPHS[glyph]} size={size} />;
  if (isRowMenuGlyph(glyph)) return <GlyphSvg glyph={ROW_MENU_GLYPHS[glyph]} size={size} />;
  return <Glyph name={glyph} size={size} />;
}

/**
 * UNE LIGNE DU PANNEAU, quelle que soit sa nature (#10593) — une action, une
 * porte de sous-menu, le retour, ou un choix de sous-menu (coché quand c'est
 * la valeur courante). Le panneau ne connaît que cette forme : la navigation
 * clavier, le placement et le rendu ne se dédoublent pas pour les sous-menus.
 */
type PanelEntry = {
  readonly key: string;
  readonly label: string;
  readonly glyph?: RowActionGlyphName;
  readonly leading?: 'back';
  readonly destructive?: true;
  readonly submenu?: RowSubmenu;
  readonly checked?: boolean;
  readonly ariaLabel?: string;
  readonly select: () => void;
};

/**
 * LE RETOUR MATÉRIEL FERME LE MENU, PAS LA LISTE (#6357) — même loi que
 * l'échelle flottante (`LadderDismissLayer`, `floating-menus.tsx`) et que
 * `MessageMenu`. Mesuré sur l'émulateur Android contre staging : menu ouvert
 * sur `/`, un appui RETOUR fermait le menu ET quittait la liste.
 *
 * Un composant à part, monté DANS le portail : `useBackDismiss` pose son
 * entrée d'historique AU MONTAGE. Appelé dans `RowActions`, il en poserait une
 * par RANGÉE de la liste, menu fermé, et le retour serait avalé en permanence.
 */
function RowMenuBackDismiss({ onClose }: { readonly onClose: () => void }) {
  useBackDismiss(onClose);
  return null;
}

/**
 * LA GRAPPE DE L'APPUI LONG (#11211) — l'aperçu de la conversation au-dessus
 * de ses actions, comme le menu contextuel d'iOS. Ses cotes : 340 de large au
 * plus, 120 à 300 de haut, 16 des bords de l'écran, 8 entre la carte et la
 * liste. `placeMessageMenuCluster` (`popover.ts`), le site qui place déjà la
 * grappe d'un message, la tient dans l'écran ; son plancher d'échelle est 1 —
 * la carte ne se réduit JAMAIS, elle raccourcit, et reste nette.
 */
const PEEK_WIDTH = 340;
const PEEK_MAX_HEIGHT = 300;
const PEEK_MIN_HEIGHT = 120;
const PEEK_SIDE = 16;
const PEEK_GAP = 8;

/** La carte vient avec le premier appui : elle tire les rangées du fil, que la liste ne charge pas. */
const loadConversationPeek = () => import('./conversation-peek-card');
const ConversationPeekCard = lazy(loadConversationPeek);

/** Appelé au `pointerdown` d'une ligne : la carte se charge pendant les 350 ms de l'appui. */
export function preloadConversationPeek(): void {
  void loadConversationPeek().catch(() => undefined);
}

/** Ce que l'aperçu montre — la conversation de la ligne et son lecteur. */
export type RowPeek = {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly isAnonymous: boolean;
};

/** Le relais de l'appui long : `useLongPress`, posé sur la ligne par `LensRow`, ouvre la grappe par lui. */
export type RowPeekOpener = MutableRefObject<(() => boolean) | null>;

type PeekBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly cardHeight: number;
  readonly menuOffset: number;
  readonly menuMaxHeight: number;
};

/**
 * LE CLIC QUI SUIT L'OUVERTURE AU DOIGT EST AVALÉ — le relâcher d'un appui long
 * tombe sur le lien de la ligne, et l'ouvrirait sous la grappe. Un seul clic,
 * celui qui vient ; un nouvel appui lève l'avalement, et rien n'en reste au
 * démontage.
 */
function swallowNextClick(): () => void {
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    detach();
  };
  function detach(): void {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', detach, true);
  }
  window.addEventListener('click', swallow, true);
  window.addEventListener('pointerdown', detach, true);
  return detach;
}

const NO_CATEGORIES: readonly { readonly id: string; readonly name: string }[] = [];

export function RowActions({
  flags,
  unread,
  magnified,
  language,
  canCall = false,
  canDelete = false,
  more,
  categoryId,
  categories = NO_CATEGORIES,
  peek,
  actionsOf,
  peekOpener,
  onAction,
  onChoice,
}: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  /** La langue d'interface du lecteur : chaque libellé du menu la parle (#8150). */
  readonly language: InterfaceLanguage;
  /** Vrai quand l'appel est permis : le menu ouvre alors sur « Appel vocal » et « Appel vidéo » (#8109). */
  readonly canCall?: boolean;
  /** Vrai pour un compte : le menu se ferme sur « Supprimer », en rouge (#7285). */
  readonly canDelete?: boolean;
  /** Élue par la bande de focus — seule rangée où le bouton reste visible
   * SANS survol ni focus (`status.magnified` de `LensRow`). */
  readonly magnified: boolean;
  /** Les entrées d'iOS que le balayage ne porte pas (#10593). */
  readonly more?: RowMenuMore;
  /** La catégorie où la conversation est rangée — cochée dans « Déplacer vers… ». */
  readonly categoryId?: string | undefined;
  readonly categories?: readonly { readonly id: string; readonly name: string }[];
  /** Présent, l'appui long, le clic droit et la touche menu ouvrent l'aperçu au-dessus des actions (#11211). */
  readonly peek?: RowPeek;
  /** Les verdicts du rôle, lus À L'OUVERTURE — le rôle servi peut arriver après le rendu de la ligne. */
  readonly actionsOf?: () => ConversationActions;
  /** Le relais que `LensRow` remet à son `useLongPress`. */
  readonly peekOpener?: RowPeekOpener;
  readonly onAction: (id: RowActionId) => void;
  /** Un choix de sous-menu (favori, catégorie) part vers l'écran. */
  readonly onChoice?: (choice: RowSubmenuChoice) => void;
}) {
  const [verdict, setVerdict] = useState<ConversationActions | undefined>(undefined);
  const itemsFor = (actions: ConversationActions | undefined) =>
    rowMenuItems({ flags, unread, language, canCall, canDelete, ...(more === undefined ? {} : { more }), ...(actions === undefined ? {} : { actions }) });
  const items = itemsFor(verdict);
  const [submenu, setSubmenu] = useState<RowSubmenu | null>(null);
  const [mode, setMode] = useState<'panel' | 'peek'>('panel');
  const [peekBox, setPeekBox] = useState<PeekBox>({ top: 0, left: 0, width: PEEK_WIDTH, cardHeight: PEEK_MAX_HEIGHT, menuOffset: 0, menuMaxHeight: 0 });
  const submenuTitle = submenu === null ? undefined : items.find((item) => item.submenu === submenu)?.label;
  const menuLabel = submenuTitle ?? translate(language, 'rowActions.menu');
  const peekIds = useId();
  const [box, setBox] = useState<{ top: number; right: number; width: number; maxHeight: number }>({
    top: 0,
    right: 0,
    width: MENU_WIDTH,
    maxHeight: 0,
  });

  const entries: readonly PanelEntry[] =
    submenu === null
      ? items.map((item) => ({
          key: item.id,
          label: item.label,
          glyph: item.glyph,
          ...(item.destructive === true ? { destructive: true as const } : {}),
          ...(item.submenu === undefined ? {} : { submenu: item.submenu }),
          select: () => (item.submenu === undefined ? choose(item.id) : enter(item.submenu)),
        }))
      : [
          {
            key: 'back',
            label: submenuTitle ?? '',
            leading: 'back' as const,
            ariaLabel: `${rowMenuText(language, 'rowMenu.back')}, ${submenuTitle ?? ''}`,
            select: () => leave(),
          },
          ...rowSubmenuItems({ submenu, favorite: more?.favorite, categoryId, categories, language }).map((entry) => ({
            key: entry.key,
            label: entry.label,
            checked: entry.checked,
            ...(entry.destructive === true ? { destructive: true as const } : {}),
            select: () => pick(entry.choice),
          })),
        ];

  /**
   * `placePopover` rend `right` dans le REPÈRE DE L'ANCRE (0 = bord droit du
   * panneau aligné sur celui du bouton ; négatif = poussé vers la droite —
   * doc-comment de `popover.ts`). `position: fixed` mesure depuis le bord
   * droit du VIEWPORT, un repère différent : `viewportWidth − anchor.right`
   * est le `right` CSS qui ALIGNE le panneau sur le bouton dans CE repère ;
   * lui AJOUTER le delta de `placePopover` (négatif quand un débord force le
   * décalage) applique le MÊME ajustement, translaté. Preuve par les deux
   * bornes : delta = 0 ⇒ panneau aligné sur le bouton ; delta au plus négatif
   * (`anchorRight − width − margin`) ⇒ le bord GAUCHE du panneau retombe
   * exactement sur `margin`, quel que soit `anchor.right`.
   *
   * VERTICALEMENT (#5559 défaut 7) : `placePopoverVertical` retourne le
   * panneau AU-DESSUS de l'ancre dès qu'il déborderait du bas — sans mesure
   * DOM de sa propre hauteur, puisque le portail n'est pas encore monté à cet
   * instant (`MENU_ITEM_HEIGHT × items.length + MENU_PADDING`, déduit des
   * cotes réellement dessinées).
   */
  const measure = (count: number = items.length) => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: count * MENU_ITEM_HEIGHT + MENU_PADDING + MENU_BORDER,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    /* LE DERNIER RECOURS (#10593) : un sous-menu plus long que l'écran (vingt
       catégories) défile DANS le panneau plutôt que de sortir du cadre. */
    setBox({
      top: vertical.top,
      right: window.innerWidth - anchor.right + placement.right,
      width: placement.width,
      maxHeight: Math.max(MENU_ITEM_HEIGHT, window.innerHeight - vertical.top - MENU_MARGIN),
    });
  };

  /**
   * LA GRAPPE (#11211) — centrée sur la ligne, la carte au-dessus de la liste.
   * La hauteur de la carte est un PLAFOND (`cardHeight`) : une conversation de
   * deux messages donne une carte courte, et la liste la suit dans le flux.
   */
  const placeCluster = (count: number = items.length) => {
    const host = buttonRef.current?.closest('li') ?? buttonRef.current;
    const row = host?.getBoundingClientRect();
    if (row === undefined) return;
    const width = Math.min(PEEK_WIDTH, Math.max(0, window.innerWidth - 2 * PEEK_SIDE));
    const left = row.left + (row.width - width) / 2;
    const menuHeight = count * MENU_ITEM_HEIGHT + MENU_PADDING + MENU_BORDER;
    /* L'ENCOCHE ET L'INDICATEUR D'ACCUEIL (revue #11211) — lus comme le menu
       d'un message les lit : dans la PWA iPhone, la grappe ne passe ni sous
       l'île dynamique ni sous la barre du bas. */
    const safe = safeAreaInsets();
    const cluster = placeMessageMenuCluster({
      anchor: { top: row.top, bottom: row.top + PEEK_MAX_HEIGHT, left, right: left + width, width, height: PEEK_MAX_HEIGHT },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      safe,
      menuHeight,
      isMine: false,
      railHeight: 0,
      railGap: 0,
      menuGap: PEEK_GAP,
      sidePadding: PEEK_SIDE,
      menuWidth: MENU_WIDTH,
      railWidth: 0,
      previewScaleFloor: 1,
      previewMinHeight: PEEK_MIN_HEIGHT,
    });
    setPeekBox({
      top: cluster.previewTop,
      left: cluster.previewLeft,
      width: cluster.previewWidth,
      cardHeight: Math.max(PEEK_MIN_HEIGHT, cluster.previewHeight),
      menuOffset: Math.max(0, Math.min(cluster.menuLeft - cluster.previewLeft, cluster.previewWidth - MENU_WIDTH)),
      menuMaxHeight: Math.max(MENU_ITEM_HEIGHT, window.innerHeight - safe.bottom - cluster.menuTop - PEEK_SIDE),
    });
  };
  const place = (count?: number) => (mode === 'peek' ? placeCluster(count) : measure(count));

  /**
   * Le panneau est en `position: fixed`, donc ANCRÉ AU VIEWPORT : défiler la
   * liste ou redimensionner la fenêtre laisserait le menu immobile pendant
   * que sa rangée s'éloigne — un menu qui désigne alors une AUTRE
   * conversation que celle sur laquelle il agit. On le referme plutôt que de
   * le repositionner : rouvrir coûte un geste, agir sur la mauvaise rangée
   * coûte une archive qu'on n'a pas demandée. `capture: true` (dans le hook)
   * attrape le défilement du conteneur de liste, qui ne remonte pas jusqu'à
   * `window`.
   */
  const { open, setOpen, closeAndFocusButton, activeIndex, setActiveIndex, buttonRef, menuRef, itemRefs, handleKey } = useRovingMenu({
    itemCount: entries.length,
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  /* Refermé, le menu se rouvrira sur sa liste principale. */
  useEffect(() => {
    if (!open) setSubmenu(null);
  }, [open]);

  /**
   * ENTRER DANS UN SOUS-MENU, EN SORTIR (#10593) — le panneau se remplace et
   * le focus suit : sur la première entrée en entrant, sur la porte quittée
   * en sortant, pour qu'un lecteur d'écran ne perde jamais sa place.
   */
  const focusAt = (index: number) => {
    setActiveIndex(index);
    requestAnimationFrame(() => itemRefs.current[index]?.focus());
  };
  const enter = (next: RowSubmenu) => {
    const count = rowSubmenuItems({ submenu: next, favorite: more?.favorite, categoryId, categories, language }).length + 1;
    place(count);
    setSubmenu(next);
    focusAt(0);
  };
  const leave = () => {
    const from = submenu;
    place();
    setSubmenu(null);
    focusAt(Math.max(0, items.findIndex((item) => item.submenu === from)));
  };
  const pick = (choice: RowSubmenuChoice) => {
    onChoice?.(choice);
    closeAndFocusButton();
  };

  /** Flèche vers la fin de ligne : entrer ; vers le début : sortir — le sens
   * suit l'écriture (l'arabe lit de droite à gauche). */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    const active = entries[activeIndex];
    if (event.key === forward && active?.submenu !== undefined) {
      event.preventDefault();
      enter(active.submenu);
      return;
    }
    if (event.key === backward && submenu !== null) {
      event.preventDefault();
      leave();
      return;
    }
    if (handleKey(event.key)) event.preventDefault();
  };

  /**
   * OUVRIR — le panneau ancré au bouton ⋮, ou la grappe de l'aperçu. Les
   * verdicts du rôle se lisent ICI, à l'ouverture, et le panneau se mesure sur
   * le nombre d'entrées qu'ils donnent.
   */
  const openPanel = () => {
    const actions = actionsOf?.();
    setVerdict(actions);
    setMode('panel');
    measure(itemsFor(actions).length);
    setOpen(true);
  };
  const detachSwallow = useRef<(() => void) | null>(null);
  const openPeek = (fromPress: boolean): boolean => {
    if (peek === undefined) {
      openPanel();
      return true;
    }
    const actions = actionsOf?.();
    setVerdict(actions);
    setMode('peek');
    placeCluster(itemsFor(actions).length);
    setOpen(true);
    detachSwallow.current?.();
    detachSwallow.current = fromPress ? swallowNextClick() : null;
    return true;
  };
  useEffect(
    () => () => {
      detachSwallow.current?.();
    },
    [],
  );
  const openConversation = () => {
    if (peek === undefined) return;
    setOpen(false);
    navigate(href('thread', { conversation: peek.conversation.id }));
  };

  /**
   * L'APPUI LONG ET LE MENU CONTEXTUEL DE LA LIGNE (#8109, #11211) — iOS ouvre
   * son aperçu par l'appui long ; le web l'ouvre par le MÊME geste, que
   * `useLongPress` tient sur la ligne (`LensRow`) : Safari iOS et la PWA
   * iPhone n'émettent pas `contextmenu`, l'appui seul suffit donc. Le clic
   * droit, la touche menu et Maj+F10 restent écoutés ici, sur la ligne, par un
   * gestionnaire NATIF posé UNE fois et qui lit le dernier rendu par référence.
   * Natif, il passe AVANT les gestionnaires React d'un descendant (délégués à
   * la racine) : `defaultPrevented` n'y voit qu'un `preventDefault` NATIF
   * posé plus bas. Un hôte à menu qui entrerait dans la ligne (un avatar)
   * devra passer par l'arbitrage `claims()` de `long-press.ts` (D-210).
   */
  const gesture = useRef<(fromPress: boolean) => boolean>(openPeek);
  gesture.current = openPeek;
  if (peekOpener !== undefined) peekOpener.current = () => gesture.current(true);
  useEffect(() => {
    const row = buttonRef.current?.closest('li');
    if (row === null || row === undefined) return;
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      gesture.current(false);
      impact('medium');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isContextMenuKey(event)) return;
      event.preventDefault();
      gesture.current(false);
      impact('medium');
    };
    row.addEventListener('contextmenu', onContextMenu);
    row.addEventListener('keydown', onKeyDown);
    return () => {
      row.removeEventListener('contextmenu', onContextMenu);
      row.removeEventListener('keydown', onKeyDown);
    };
  }, [buttonRef]);

  const choose = (id: RowActionId) => {
    onAction(id);
    closeAndFocusButton();
  };

  const panelEntries = entries.map((entry, index) => (
    <button
      key={entry.key}
      ref={(el) => {
        itemRefs.current[index] = el;
      }}
      type="button"
      role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
      {...(entry.checked === undefined ? {} : { 'aria-checked': entry.checked })}
      {...(entry.submenu === undefined ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': false })}
      {...(entry.ariaLabel === undefined ? {} : { 'aria-label': entry.ariaLabel })}
      tabIndex={index === activeIndex ? 0 : -1}
      onFocus={() => setActiveIndex(index)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        entry.select();
      }}
      {...(entry.destructive === true ? { 'data-destructive': 'true' } : {})}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-title font-medium"
      style={
        entry.destructive === true
          ? { color: 'var(--color-error)', minHeight: 44, ...(entries[index - 1]?.destructive === true ? {} : { borderTop: '1px solid var(--color-edge)' }) }
          : entry.leading === 'back'
            ? { color: 'var(--color-ios-ink)', minHeight: 44, borderBottom: '1px solid var(--color-edge)', fontWeight: 700 }
            : { color: 'var(--color-ios-ink)', minHeight: 44 }
      }
    >
      {entry.leading === 'back' ? (
        <span className="grid place-items-center rtl:-scale-x-100" style={{ color: 'var(--color-ios-ink-2)' }}>
          <Glyph name="caretLeft" size={16} />
        </span>
      ) : entry.glyph === undefined ? null : (
        <span className="grid place-items-center" style={{ color: entry.destructive === true ? 'currentColor' : 'var(--color-ios-ink-2)' }}>
          <RowActionGlyph glyph={entry.glyph} size={16} />
        </span>
      )}
      {/* Le libellé reste un nœud de texte DIRECT du bouton : son nom
          accessible et les sélecteurs de texte des gates le lisent
          sur la ligne elle-même, jamais sur un enfant. */}
      {entry.label}
      {entry.submenu === undefined ? null : (
        <span className="ms-auto grid place-items-center rtl:-scale-x-100" style={{ color: 'var(--color-ios-ink-3)' }}>
          <GlyphSvg glyph={ROW_MENU_GLYPHS.caretRight} size={14} />
        </span>
      )}
      {entry.checked === true ? (
        <span className="ms-auto grid place-items-center" style={{ color: 'var(--color-ios-brand)' }}>
          <Glyph name="check" size={16} />
        </span>
      ) : null}
    </button>
  ));

  return (
    /**
     * `pointer-events-none` — #5559 défaut 6 (bloquant), second volet : tant
     * que le BOUTON est invisible et non cliquable (pointer-events: none),
     * ce conteneur, lui, restait à `auto` par défaut et occupait la même
     * boîte que le bouton — un doigt ou une souris qui tombait dans ce carré
     * de 34×34 heurtait donc ce `<div>` et n'atteignait NI le bouton NI le
     * lien de la rangée sous lui (`elementFromPoint` mesuré : `{tag:'DIV'}`).
     * Le conteneur laisse maintenant TOUJOURS passer le pointeur ; seul le
     * bouton le reprend, à `pointer-events: auto`, quand il est réellement
     * actionnable.
     */
    <div className="pointer-events-none absolute top-1/2 end-2 -translate-y-1/2">
      <button
        ref={buttonRef}
        type="button"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          // La rangée entière est un lien (`LensRow`) : sans ceci, le clic
          // navigue vers le fil AVANT que le menu n'ait pu s'ouvrir.
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          openPanel();
        }}
        /**
         * LE BOUTON EST TOUJOURS DANS L'ORDRE DE TABULATION ET JAMAIS
         * `aria-hidden` — c'était le défaut de la première forme : hors
         * magnification il portait `aria-hidden` et `tabIndex={-1}`, si bien
         * que le survol le rendait VISIBLE et CLIQUABLE tout en le laissant
         * invisible au clavier et au lecteur d'écran. Un contrôle qu'on voit
         * et qu'aucune technologie d'assistance ne peut atteindre est pire
         * qu'un contrôle absent : la magnification est élue par la POSITION DE
         * DÉFILEMENT, que personne ne pilote au clavier, donc les actions de
         * toutes les autres rangées n'existaient tout simplement pas pour qui
         * n'a pas de souris.
         *
         * Ce qui reste conditionnel est la seule APPARENCE : opacité 0 au
         * repos, 1 dès que la rangée est magnifiée, survolée, que le bouton a
         * le focus clavier, ou que son menu est ouvert. `pointer-events` suit
         * l'opacité pour qu'un bouton invisible ne vole pas au POINTEUR le
         * clic destiné à la rangée — le clavier, lui, active un bouton
         * `pointer-events: none` sans difficulté.
         *
         * `.row-action-button` (`app.css`) — #5559 défaut 6 (bloquant) : SUR
         * UN APPAREIL SANS SURVOL (`any-hover: none`, Android et Chromium
         * mobile mesurés), `group-hover` ne se déclenche JAMAIS — un doigt
         * n'a pas de position de survol à annoncer avant de taper. Le bouton
         * restait donc `opacity-0 pointer-events-none` en PERMANENCE sur
         * toute rangée non magnifiée : les actions de rangée n'existaient
         * tout simplement pas au doigt, alors que la place qu'elles occupent
         * est déjà réservée en permanence (`pe-12` constant, `lens-row.tsx`)
         * — les rendre visibles ne déplace donc rien. La règle vit HORS de
         * tout `@layer` (à la différence des `@utility` voisins) : un style
         * non calqué l'emporte toujours sur un style calqué, quels que soient
         * l'ordre et la spécificité — elle n'a donc pas à lutter avec les
         * classes Tailwind ci-dessous.
         */
        className={`row-action-button tap-target-34 grid place-items-center rounded-chip transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
          magnified || open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          /* `--color-ios-card`, l'alias, comme le panneau douze lignes plus
             bas — et non `--ios-surface-card`, la variable brute qu'il
             enveloppe : deux noms pour une même valeur dans un même fichier
             est la plus petite forme de la jumelle. */
          backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 92%, transparent)',
          color: 'var(--color-ios-ink-2)',
        }}
      >
        <Glyph name="dotsThreeVertical" size={18} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            mode === 'peek' && peek !== undefined ? (
              /**
               * LA GRAPPE EST UNE COUCHE MODALE, VOILE COMPRIS (revue #11211).
               * Le voile vit DANS `menuRef` : l'appui sur lui n'est plus un
               * « appui hors du menu » que `useRovingMenu` fermerait au
               * `pointerdown`. Il ferme au CLIC, le dernier événement du
               * toucher — retiré au `pointerdown`, Safari iOS synthétisait le
               * clic de compatibilité sur la ligne d'en dessous, qui s'ouvrait.
               * Le lecteur d'écran lit une seule couche (`aria-modal`), nommée
               * par la carte, et le menu se décrit par les derniers messages.
               */
              <div
                ref={menuRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${peekIds}-card`}
                data-conversation-peek-cluster
                className="conversation-peek-cluster"
                onKeyDown={onMenuKeyDown}
              >
                <div aria-hidden data-conversation-peek-veil className="conversation-peek-veil" onClick={closeAndFocusButton} />
                <div data-conversation-peek className="conversation-peek" style={{ top: peekBox.top, left: peekBox.left, width: peekBox.width }}>
                  <RowMenuBackDismiss onClose={closeAndFocusButton} />
                  <Suspense fallback={<div aria-hidden className="conversation-peek-card" style={{ height: PEEK_MIN_HEIGHT }} />}>
                    <ConversationPeekCard
                      conversation={peek.conversation}
                      viewerId={peek.viewerId}
                      languages={peek.languages}
                      isAnonymous={peek.isAnonymous}
                      interfaceLanguage={language}
                      maxHeight={peekBox.cardHeight}
                      onOpen={openConversation}
                      idBase={peekIds}
                    />
                  </Suspense>
                  <div
                    role="menu"
                    aria-label={menuLabel}
                    aria-describedby={`${peekIds}-body`}
                    className="overflow-hidden rounded-card py-1 shadow-cast"
                    style={{
                      width: MENU_WIDTH,
                      marginLeft: peekBox.menuOffset,
                      marginRight: 'auto',
                      maxHeight: peekBox.menuMaxHeight,
                      overflowY: 'auto',
                      backgroundColor: 'var(--color-ios-card)',
                      border: '1px solid var(--color-edge)',
                    }}
                  >
                    {panelEntries}
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={menuRef}
                role="menu"
                aria-label={menuLabel}
                onKeyDown={onMenuKeyDown}
                className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
                style={{
                  top: box.top,
                  right: box.right,
                  width: box.width,
                  maxHeight: box.maxHeight,
                  overflowY: 'auto',
                  backgroundColor: 'var(--color-ios-card)',
                  border: '1px solid var(--color-edge)',
                }}
              >
                <RowMenuBackDismiss onClose={() => setOpen(false)} />
                {panelEntries}
              </div>
            ),
            document.body,
          )
        : null}
    </div>
  );
}
