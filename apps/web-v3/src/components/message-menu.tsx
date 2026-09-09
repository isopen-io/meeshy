import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { flag, languageName } from '@/lib/languages';
import { placeMessageMenuCluster } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import {
  QUICK_REACTIONS,
  type MessageActionId,
  type MessageMenuItem,
  type TranslationChoice,
} from '@/lib/view/message-actions';
import {
  MENU_CHROME,
  MENU_GAP,
  MENU_ROW_HEIGHT,
  MENU_WIDTH,
  PREVIEW_SCALE_FLOOR,
  RAIL_GAP,
  RAIL_HEIGHT,
  RAIL_TILE,
  RAIL_TILE_GAP,
  RAIL_WIDTH,
  SIDE_PADDING,
} from '@/lib/view/message-menu-metrics';

import { GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';

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

const RAIL_ITEM_COUNT = QUICK_REACTIONS.length + 1; // 6 emojis + « Ajouter ».

export type MessageMenuTarget = {
  readonly messageId: string;
  readonly element: HTMLElement;
  readonly isMine: boolean;
};

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
function accentOf(element: HTMLElement): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = getComputedStyle(element).getPropertyValue('--accent').trim();
  return value === '' ? undefined : value;
}

/** `--safe-top`/`--safe-bottom` — posées par `thread-menu.css` depuis
 * `env(safe-area-inset-*)`, seule porte par laquelle une loi PURE
 * (`placeMessageMenuCluster`) reçoit une valeur qui dépend du DOM. */
function safeAreaInsets(): { readonly top: number; readonly bottom: number } {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 };
  const style = getComputedStyle(document.documentElement);
  const top = Number.parseFloat(style.getPropertyValue('--safe-top')) || 0;
  const bottom = Number.parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
  return { top, bottom };
}

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
}: {
  readonly target: MessageMenuTarget;
  readonly items: readonly MessageMenuItem[];
  readonly choices: readonly TranslationChoice[];
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
  const [panel, setPanel] = useState<'actions' | 'translate'>('actions');
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const listRows = panel === 'actions' ? items.length : choices.length;

  const computePlacement = (rows: number) => {
    const rect = target.element.getBoundingClientRect();
    const safe = safeAreaInsets();
    const menuHeight = rows * MENU_ROW_HEIGHT + MENU_CHROME;
    return placeMessageMenuCluster({
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      safe,
      menuHeight,
      isMine: target.isMine,
      railHeight: RAIL_HEIGHT,
      railGap: RAIL_GAP,
      menuGap: MENU_GAP,
      sidePadding: SIDE_PADDING,
      menuWidth: MENU_WIDTH,
      railWidth: RAIL_WIDTH,
      previewScaleFloor: PREVIEW_SCALE_FLOOR,
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
  useEffect(() => {
    setPlacement(computePlacement(listRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const roving = useRovingMenu({
    itemCount: RAIL_ITEM_COUNT + listRows,
    returnFocusTo: () => target.element,
    onScroll: onClose,
    onResize: onClose,
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
    if (wasOpen.current) onClose();
  }, [roving.open, onClose]);

  /**
   * LE RETOUR MATÉRIEL FERME LE MENU, PAS L'ÉCRAN (revue #5814, défaut
   * majeur 6) — sans cette ligne, un appui BACK Android depuis le menu
   * ouvert quittait le FIL (avec historique) ou L'APPLICATION (sans
   * historique) : mesuré sur `Meeshy_Poc_Web-v31` (`AND-9-back-…`), le menu
   * disparaissait avec l'écran plutôt qu'à cause de lui. Même geste que
   * `Sheet` (`components/sheet.tsx`), désormais extrait dans
   * `use-back-dismiss.ts` pour que les deux le partagent.
   */
  useBackDismiss(onClose);

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
  useEffect(() => {
    const host = previewHostRef.current;
    if (host === null) return;
    const source = target.element;
    const clone = source.cloneNode(true) as HTMLElement;
    stripPreviewIdentity(clone);
    clone.setAttribute('data-message-preview', '');
    host.replaceChildren(clone);
    const previousOpacity = source.style.opacity;
    source.style.opacity = '0';
    return () => {
      host.replaceChildren();
      source.style.opacity = previousOpacity;
    };
  }, [target.element]);

  const onTranslateChosen = (code: string) => {
    onPickLanguage(code);
    onClose();
  };

  const onListItemChosen = (item: MessageMenuItem) => {
    if (item.id === 'translate') {
      setPanel('translate');
      roving.setActiveIndex(RAIL_ITEM_COUNT);
      requestAnimationFrame(() => {
        const el = roving.itemRefs.current[RAIL_ITEM_COUNT];
        el?.focus();
      });
      return;
    }
    onAction(item.id);
    onClose();
  };

  const returnToActions = () => {
    setPanel('actions');
    roving.setActiveIndex(RAIL_ITEM_COUNT);
    requestAnimationFrame(() => {
      const el = roving.itemRefs.current[RAIL_ITEM_COUNT];
      el?.focus();
    });
  };

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
    if (panel === 'translate' && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      returnToActions();
      return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && roving.activeIndex < RAIL_ITEM_COUNT) {
      if (roving.handleKey(event.key === 'ArrowRight' ? 'ArrowDown' : 'ArrowUp')) event.preventDefault();
      return;
    }
    if (event.key === 'Tab') {
      if (roving.handleKey(event.shiftKey ? 'ArrowUp' : 'ArrowDown')) event.preventDefault();
      return;
    }
    roving.onMenuKeyDown(event);
  };

  if (typeof document === 'undefined') return null;

  const railTiles = [...QUICK_REACTIONS, '+'] as const;
  const railWidthUsed = Math.min(RAIL_WIDTH, window.innerWidth - 2 * SIDE_PADDING);
  // UNE mesure par rendu — deux `getBoundingClientRect()` en ligne dans le
  // JSX forçaient deux recalculs de layout pour la même ancre.
  const anchorRect = target.element.getBoundingClientRect();

  // Le VOILE est purement visuel — `useRovingMenu` ferme déjà sur tout
  // `pointerdown` HORS de `roving.menuRef` (document-level, § roving-menu.ts) ;
  // un second gestionnaire ici referait la même chose deux fois.
  const accent = accentOf(target.element);

  /**
   * LA RANGÉE PLATE (Focal/Script) N'A NI FOND NI RAYON (revue #5814,
   * défaut majeur 11) — `FocalRow` pose `data-reading-mode` sur SA racine
   * (`focal-row.tsx`), `Bubble` ne le pose PAS : c'est la seule marque déjà
   * présente dans le DOM cloné qui distingue les deux peaux SANS dupliquer
   * la décision « quelle peau est active » ici. En Focal, l'aperçu se
   * confondait avec le voile flouté (mesuré, schéma clair, `boxShadow:
   * "none"`, `backgroundColor: "rgba(0, 0, 0, 0)"`) : iOS pose un halo
   * d'accent (0,28, rayon 22) et une ombre noire (0,26, rayon 16) sur son
   * `ThemedMessageBubble`, OPAQUE même en Focal (`MessageOverlayMenu.swift
   * :414-441, :605-616`) — « pour que le preview semble décollé de la
   * liste ». Une bulle a déjà sa propre surface ; SEULE la rangée plate en
   * a besoin ici.
   */
  const isFlatRow = target.element.querySelector('[data-reading-mode]') !== null;

  return createPortal(
    <div className="message-menu-backdrop" style={accent === undefined ? undefined : ({ '--accent': accent } as CSSProperties)}>
      <div
        ref={roving.menuRef}
        role="menu"
        aria-modal="true"
        aria-label={subjectLabel}
        className="message-menu-cluster"
        onKeyDown={onClusterKeyDown}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
      >
        <div
          role="group"
          aria-label="Réagir"
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
          {railTiles.map((tile, index) => {
            const isPlus = tile === '+';
            return (
              <button
                key={isPlus ? 'plus' : tile}
                ref={(el) => {
                  roving.itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === roving.activeIndex ? 0 : -1}
                aria-label={isPlus ? 'Ajouter une réaction' : tile}
                className="tap-target-34 grid place-items-center rounded-full"
                style={{ width: RAIL_TILE, height: RAIL_TILE, fontSize: 22 }}
                onClick={() => {
                  if (isPlus) {
                    onExpandReactions();
                    onClose();
                    return;
                  }
                  onReact(tile);
                  onClose();
                }}
              >
                {isPlus ? (
                  <GlyphSvg glyph={{ viewBox: '0 0 256 256', body: '<path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/>' }} size={16} />
                ) : (
                  tile
                )}
              </button>
            );
          })}
        </div>

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
          style={{
            position: 'fixed',
            top: placement.previewTop,
            left: target.isMine ? undefined : anchorRect.left,
            right: target.isMine ? window.innerWidth - anchorRect.right : undefined,
            /* LA LARGEUR DE L'ANCRE, REPRISE (revue #5814) — sans elle,
               l'hôte fixe n'a aucune contrainte et le clone se re-dispose à
               sa largeur MAX-CONTENT : une rangée plate en `grid
               41px 1fr` y étalait sa tuile média sur toute la hauteur de
               l'écran, et l'aperçu ne ressemblait plus au message pressé —
               alors que la promesse du clone est justement « les mêmes
               pixels ». `height` reste libre : le clone la retrouve seul
               une fois la largeur imposée. */
            width: anchorRect.width,
            transform: `scale(${placement.previewScale})`,
            transformOrigin: target.isMine ? 'top right' : 'top left',
            pointerEvents: 'none',
            /* L'ÉLÉVATION (revue #5814, défaut majeur 11) — posée sur
               l'HÔTE du clone, JAMAIS sur le clone lui-même (qui doit rester
               pixel pour pixel la rangée pressée) : `drop-shadow`, pas
               `box-shadow`, parce que le clone n'est pas rectangulaire en
               peau Bulles (rayon 18). Deux passes, miroir iOS : un halo
               teinté à l'accent DÉJÀ résolu (`accentOf`, jamais un second
               calcul de couleur) et une ombre noire — l'aperçu se décolle
               ainsi du voile flouté sur les DEUX peaux et les DEUX schémas. */
            filter: `drop-shadow(0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)) drop-shadow(0 16px 16px rgba(0, 0, 0, 0.26))`,
            /* LA SURFACE (revue #5814, défaut majeur 11) — SEULE la rangée
               plate (Focal/Script) en a besoin : elle n'a ni fond ni rayon
               propres, et se confondait avec le voile flouté. Une bulle
               porte déjà son fond ; lui en ajouter un second, carré, aurait
               débordé de ses coins arrondis. */
            ...(isFlatRow
              ? { backgroundColor: 'var(--color-ios-surface)', borderRadius: 10 }
              : {}),
          }}
        />

        {panel === 'actions' ? (
          <div
            className="message-menu-list"
            style={{
              position: 'fixed',
              top: placement.menuTop,
              left: placement.menuLeft,
              width: MENU_WIDTH,
              pointerEvents: 'auto',
            }}
          >
            {items.map((item, i) => {
              const index = RAIL_ITEM_COUNT + i;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    roving.itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={index === roving.activeIndex ? 0 : -1}
                  className="flex w-full items-center gap-2.5 px-3 text-left text-title font-medium"
                  style={{ minHeight: MENU_ROW_HEIGHT, color: 'var(--color-ios-ink)' }}
                  onClick={() => onListItemChosen(item)}
                >
                  <GlyphSvg glyph={THREAD_MENU_GLYPHS[item.glyph]} size={18} style={{ color: 'var(--accent)' }} />
                  <span className="flex-1">{item.label}</span>
                  {item.id === 'more' ? (
                    <GlyphSvg
                      glyph={{ viewBox: '0 0 256 256', body: '<path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>' }}
                      size={14}
                      style={{ color: 'var(--color-ios-ink-3)' }}
                    />
                  ) : null}
                </button>
              );
            })}
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
            aria-label="Traduire"
            className="message-menu-list"
            style={{
              position: 'fixed',
              top: placement.menuTop,
              left: placement.menuLeft,
              width: MENU_WIDTH,
              pointerEvents: 'auto',
            }}
          >
            {choices.map((choice, i) => {
              const index = RAIL_ITEM_COUNT + i;
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
                  className="flex w-full items-center gap-2.5 px-3 text-left text-title font-medium"
                  style={{ minHeight: MENU_ROW_HEIGHT, color: 'var(--color-ios-ink)' }}
                  onClick={() => onTranslateChosen(choice.code)}
                >
                  <span aria-hidden>{flag(choice.code)}</span>
                  <span className="flex-1">
                    {languageName(choice.code)}
                    {choice.isOriginal ? ' (original)' : ''}
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
