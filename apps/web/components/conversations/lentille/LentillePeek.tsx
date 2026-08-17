/**
 * `LentillePeek` — WL-106 (LWS-11).
 *
 * behaviour-matrix:L12 — les deux chemins de long press (preview/peek) sont
 * portés ici côté web : clic droit natif (`onContextMenu`) et appui long
 * pointer, tous deux ouvrant le même `ReadingModeMenu`. iOS porte L12 par
 * `.contextMenu`/`RowPressBounceModifier` (déjà couvert) ; ce fichier est la
 * couverture WEB du même id de matrice, jamais un id nouveau.
 *
 * LES TROIS chemins d'entrée du menu de mode vivent ICI depuis WL-108
 * (contrat LWS-11 — « trois points d'entrée, UNE préférence »), et
 * partagent LITTÉRALEMENT LA MÊME instance de `ReadingModeMenu`, donc le
 * même état d'ouverture, les mêmes capacités et le même `onSelect` :
 *   1. Le ⋮ au survol — RE-PROUVÉ ABSENT du rang Lentille avant ce commit
 *      (`LentilleRow.tsx`, WL-102..105, ne montait aucun menu d'actions ;
 *      `ConversationItemActions.tsx`, le dropdown ⋮ historique, n'est câblé
 *      QUE par `ConversationItem.tsx` — interdit d'édition, mission WL-106,
 *      et hors "Fichiers possédés" LWS-11). Le contrat suppose un ⋮
 *      « existant » à étendre ; ce n'est vrai nulle part sur le rang
 *      Lentille du web. Ce fichier livre donc le ⋮ Lentille-natif — même
 *      icône, même idiome hover-reveal que `ConversationItemActions` — sans
 *      toucher au dropdown historique. Écart documenté, pas contourné en
 *      silence (rapport de tâche WL-106).
 *   2. L'aperçu — clic droit ET appui long pointer 420 ms, annulé par un
 *      déplacement du pointeur ou un scroll de plus de quelques pixels.
 *
 *   3. L'encoche de la focus card (WL-108) — rendue seulement quand ce rang
 *      est l'ÉLU (`useLentillePerspective`/`LentilleFocusElection`) ou le rang
 *      sélectionné (behaviour-matrix:L11). Elle n'ouvre pas un second menu :
 *      elle bascule `peekOpen`, exactement comme le clic droit.
 *
 * ISOLATION DU PLAN DE PEINTURE (WL-108). Le fond de la focus card est un
 * frère `position: absolute` en `z-index: -1` — c'est ce qui le fait peindre
 * DERRIÈRE le contenu en flux du rang (avatar, nom, ligne 2) plutôt que
 * par-dessus. Pour que ce `-1` reste CONFINÉ à ce wrapper, celui-ci doit
 * créer un contexte d'empilement : `isolation: isolate` le garantit à toute
 * frame, y compris AVANT la première passe de perspective (une fois que
 * celle-ci écrit `opacity`/`transform`, ces propriétés en créeraient un
 * d'elles-mêmes — mais compter là-dessus rendrait le rendu initial différent
 * du rendu animé, et sous `prefers-reduced-motion` elles ne sont JAMAIS
 * écrites).
 *
 * TAP COURT JAMAIS INTERCEPTÉ : ce wrapper n'attache AUCUN `onClick` propre
 * — un tap/clic qui ne déclenche ni le seuil de 420 ms ni le clic droit
 * traverse intact jusqu'au gestionnaire du rang (`role="button"` racine de
 * `LentilleRow`). Seule une pression longue COMPLÈTE (ou un clic droit) pose
 * un `preventDefault`/`stopPropagation` — et seulement sur le PROCHAIN
 * `click` de synthèse, jamais par défaut.
 *
 * 420 ms — TODO CONTRACTUEL : aucune section `peek`/`press` n'existe dans
 * `packages/shared/design/lentille-tokens.json` au moment de ce commit
 * (RE-PROUVÉ : `list`/`thread` seulement — ni pilule ni rail n'y portent de
 * cote de pression). Constante locale documentée ci-dessous, en attendant
 * l'extension du fichier de tokens par un futur amendement (elle N'EST PAS
 * dans la liste des littéraux interdits R15 : `520/380/0.45/0.82/900/25/24`).
 *
 * ÉCRITURE : `useReadingModePreferenceActions().setReadingMode` —
 * `apps/web/stores/reading-mode-preference-store.ts` (WL-106, optimiste
 * versionnée, rollback sur échec — voir sa docstring pour le découplage
 * réseau E9/G-121). UNE préférence, écrite par LES DEUX chemins de ce
 * fichier via LA MÊME instance de `ReadingModeMenu` — WL-108 y branche le
 * troisième (l'encoche) sans en créer une seconde.
 *
 * @see tasks/lentille-implementation-contract.md LWS-11
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '@meeshy/shared/types';
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import { resolveCapabilities, resolveOrchestratorDecision } from '@meeshy/shared/utils/reading-modes';
import { isCurrentUserAnonymous } from '@/utils/auth';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { useRiverModeFlag } from '@/hooks/lentille/use-river-mode-flag';
import { useReadingModePreference, useReadingModePreferenceActions } from '@/stores/reading-mode-preference-store';
import { ConversationActionMenuItems } from '../conversation-item/ConversationItemActions';
import { useConversationItemActions } from '../conversation-item/use-conversation-item-actions';
import { LentilleFocusCard } from './LentilleFocusCard';
import { ReadingModeMenu } from './ReadingModeMenu';
import type { LentilleRowTranslate } from './LentilleRow';

/** Appui long — TODO contractuel, voir docstring de fichier. */
const LONG_PRESS_DURATION_MS = 420;
/** "Annulé par... mouvement (>quelques px)" — pas de cote normative connue ; seuil documenté ici. */
const LONG_PRESS_CANCEL_DISTANCE_PX = 8;

export interface LentillePeekProps {
  readonly conversation: Conversation;
  readonly t: LentilleRowTranslate;
  readonly children: React.ReactNode;
  /** Ref-setter transmis tel quel — même destinataire que `perspectiveRef` (WL-104), ce wrapper EST le wrapper interne, jamais la racine. */
  readonly wrapperRef?: (el: HTMLDivElement | null) => void;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly 'data-testid'?: string;
  /**
   * V4 : G-123 (compteur de participants actifs) n'existe pas côté client —
   * re-prouvé, aucune surface web ne le porte. `null` par défaut : jamais un
   * `0` fabriqué (amendement S1). Overridable pour les tests / un futur appelant.
   */
  readonly activeParticipantCount?: number | null;
  /**
   * R-135 — Drapeau `riviere_mode`. Omis (`undefined`) ⇒ résolu ICI par
   * `useRiverModeFlag()` (résolveur R-134, `?riviere_mode=`/cookie/env,
   * défaut OFF) : le SEUL appelant de ce hook, pour que les TROIS chemins
   * d'entrée du menu (⋮, aperçu, encoche — une seule instance de
   * `ReadingModeMenu`) lisent le VRAI drapeau plutôt que le `false` figé que
   * R-134 posait le temps que ce lot arrive. Override explicite conservé
   * pour les tests (et pour un futur appelant qui connaîtrait déjà la
   * résolution — même patron que `activeParticipantCount`).
   */
  readonly isRiverFlagEnabled?: boolean;
  /**
   * Ce rang porte-t-il la focus card ? (WL-108) — vrai pour l'ÉLU de
   * `LentilleFocusElection` et pour le rang sélectionné (L11). `false` par
   * défaut : une `LentilleRow` rendue hors liste n'a pas de carte.
   */
  readonly isFocused?: boolean;
  /**
   * REV-4/B3 — l'action « réglages » du menu de rang, remontée à l'appelant
   * exactement comme le fait le rang historique (`ConversationItem`). Absente
   * ⇒ l'entrée reste rendue mais inerte, comme dans le chemin OFF quand
   * l'appelant ne la fournit pas.
   */
  readonly onShowDetails?: (conversation: Conversation) => void;
}

/**
 * ÉCART CONTRAT↔CODE, signalé et non contourné (même classe que le
 * `activeParticipantCount: null` d'iOS) : le modèle `Conversation` du web ne
 * porte AUCUNE date de dernière lecture — re-prouvé, `packages/shared/types/
 * conversation.ts` n'expose `lastReadAt` que sur `ConversationReadCursor`, et
 * `apps/web/lib/conversations/delta-sync.ts` le dit noir sur blanc (« une
 * frontière LOCALE que le modèle web ne porte pas »). iOS lit
 * `conversation.userState.lastReadAt` (`LentilleReadingModeContext.swift`).
 *
 * Lu ici DÉFENSIVEMENT — exactement le patron de `resolveRowBridge`
 * (`LentilleConversationListMount.tsx`) pour le champ `bridge` : le jour où
 * le payload le porte, la valeur arrive sans qu'aucune signature ne change ;
 * d'ici là, `null`, que la loi traite comme une absence (documenté dans
 * `resolveOrchestratorDecision`). CONSÉQUENCE HONNÊTE, à porter en revue
 * REV-4 : `null` n'est PAS neutre pour cette loi — au-delà du plancher de
 * non-lus de la branche d'absence, l'encoche annoncera « AUTO · Résumé » là
 * où iOS, qui connaît la date, annoncerait « AUTO · Focal ». Aucune décision
 * de LECTURE n'en dépend aujourd'hui (le mux de fil web est un autre
 * chantier) : seul le LIBELLÉ prédictif est concerné.
 */
function resolveLastOpenedAt(conversation: Conversation): Date | null {
  return (conversation as { lastReadAt?: Date }).lastReadAt ?? null;
}

export function LentillePeek({
  conversation,
  t,
  children,
  wrapperRef,
  className,
  style,
  'data-testid': dataTestId,
  activeParticipantCount = null,
  isRiverFlagEnabled,
  isFocused = false,
  onShowDetails,
}: LentillePeekProps) {
  const [peekOpen, setPeekOpen] = useState(false);
  const suppressNextClickRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  const currentPreference = useReadingModePreference(conversation.id);
  const { setReadingMode } = useReadingModePreferenceActions();
  const reducedMotion = useReducedMotion();

  // R-135 — résolution RÉELLE du drapeau `riviere_mode`, prop non fournie
  // par défaut (voir la docstring de `isRiverFlagEnabled` ci-dessus).
  const riverModeFlag = useRiverModeFlag();
  const resolvedIsRiverFlagEnabled = isRiverFlagEnabled ?? riverModeFlag.active;

  /**
   * REV-4/B3 — les SIX actions historiques du rang (behaviour-matrix L07),
   * inatteignables sous drapeau ON tant que le ⋮ Lentille ne montait que le
   * catalogue de modes. Le hook est celui de `ConversationItem`, pas un
   * jumeau : même magasin de préférences, mêmes bascules, mêmes toasts. La
   * peau ne connaît donc RIEN de ces actions — elle les monte.
   */
  const rowActions = useConversationItemActions({
    conversation,
    t: t as (key: string) => string,
    onShowDetails,
  });

  // `now` FIGÉ au montage (jamais un `new Date()` de rendu) : sans cela, la
  // décision affichée dépendrait de l'instant du rendu, donc changerait au
  // gré de re-rendus sans rapport — et le libellé de l'encoche cesserait
  // d'être une fonction de ses seules entrées. Même discipline que le `now`
  // injecté de `LentilleReadingModeContext.decision` côté iOS.
  const now = useMemo(() => new Date(), []);

  const capabilities = useMemo(
    () =>
      resolveCapabilities({
        identity: { isAnonymous: isCurrentUserAnonymous() },
        // Ce composant n'est monté QUE sous drapeau Lentille actif
        // (LentilleConversationListMount, WL-101) — pas de résolveur ici.
        isFlagEnabled: true,
        conversationType: conversation.type,
        activeParticipantCount,
        isRiverFlagEnabled: resolvedIsRiverFlagEnabled,
      }),
    [conversation.type, activeParticipantCount, resolvedIsRiverFlagEnabled]
  );

  /**
   * La décision de l'orchestrateur pour CETTE conversation — calculée
   * SEULEMENT pour le rang qui porte la carte : la liste en monte vingt, et
   * dix-neuf n'ont aucun libellé à afficher.
   */
  const decision = useMemo(
    () =>
      isFocused
        ? resolveOrchestratorDecision({
            unreadCount: conversation.unreadCount ?? 0,
            lastOpenedAt: resolveLastOpenedAt(conversation),
            now,
            stickyChoice: currentPreference,
            capabilities,
            // Ce composant n'est monté que sous drapeau Lentille actif — même
            // constat que pour `resolveCapabilities` ci-dessus.
            isFlagEnabled: true,
          })
        : null,
    [isFocused, conversation, now, currentPreference, capabilities]
  );

  const detachScrollCancel = useCallback(() => {
    if (scrollListenerRef.current) {
      window.removeEventListener('scroll', scrollListenerRef.current, true);
      scrollListenerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
    detachScrollCancel();
  }, [detachScrollCancel]);

  /**
   * `arm` : seule la pression tactile qui COMPLÈTE ses 420 ms doit armer la
   * suppression du prochain clic — c'est ce clic-là (le `click` de synthèse
   * que le navigateur émet après un `pointerup` tactile) qu'il faut avaler
   * pour que le rang ne navigue pas EN PLUS d'ouvrir le peek. Un clic droit
   * n'émet JAMAIS de `click` de synthèse ensuite (spécification navigateur :
   * le bouton droit ne déclenche pas `click`) — l'armer quand même
   * suppression le PROCHAIN clic sans distinction, y compris un clic
   * DÉLIBÉRÉ sur une entrée du menu qui vient de s'ouvrir (bug re-prouvé par
   * test : `onClickCapture` vit sur ce même wrapper, qui contient aussi le
   * contenu du menu — React fait remonter les événements d'un portail à
   * travers l'arbre REACT, pas l'arbre DOM, donc `onClickCapture` voit aussi
   * les clics sur les items du menu).
   */
  const openPeek = useCallback((arm: boolean) => {
    if (arm) suppressNextClickRef.current = true;
    setPeekOpen(true);
  }, []);

  const attachScrollCancel = useCallback(() => {
    const onScroll = () => clearLongPressTimer();
    scrollListenerRef.current = onScroll;
    // capture:true — un scroll dans N'IMPORTE QUEL conteneur descendant du
    // document (la liste de conversations comprise) traverse la phase de
    // capture depuis `window`, sans avoir à connaître l'ancêtre défilant précis.
    window.addEventListener('scroll', onScroll, true);
  }, [clearLongPressTimer]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      attachScrollCancel();
      longPressTimerRef.current = setTimeout(() => {
        openPeek(true);
        clearLongPressTimer();
      }, LONG_PRESS_DURATION_MS);
    },
    [attachScrollCancel, openPeek, clearLongPressTimer]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = pointerStartRef.current;
      if (!start) return;
      const dx = Math.abs(event.clientX - start.x);
      const dy = Math.abs(event.clientY - start.y);
      if (dx > LONG_PRESS_CANCEL_DISTANCE_PX || dy > LONG_PRESS_CANCEL_DISTANCE_PX) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer]
  );

  const handlePointerEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      clearLongPressTimer();
      openPeek(false);
    },
    [clearLongPressTimer, openPeek]
  );

  const handleClickCapture = useCallback((event: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
    // Sinon : rien — le tap/clic court n'est JAMAIS intercepté (contrat LWS-11).
  }, []);

  const handleSelect = useCallback(
    (preference: ReadingModePreference) => {
      void setReadingMode(conversation.id, preference);
    },
    [setReadingMode, conversation.id]
  );

  return (
    <div
      ref={wrapperRef}
      data-testid={dataTestId ?? 'lentille-peek'}
      className={cn('relative', className)}
      // `isolation: isolate` — voir « ISOLATION DU PLAN DE PEINTURE » en tête
      // de fichier. Étalé APRÈS `style` pour que le wrapper reste maître de
      // son propre plan quoi que l'appelant passe.
      style={{ ...style, isolation: 'isolate' }}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      {children}

      {isFocused && decision && (
        <LentilleFocusCard
          conversation={conversation}
          preference={currentPreference}
          decision={decision}
          t={t}
          reducedMotion={reducedMotion}
          // Troisième point d'entrée — la MÊME instance de menu que le ⋮ et
          // l'aperçu, donc la MÊME préférence (contrat LWS-8/LWS-11).
          onNotchTap={() => openPeek(false)}
        />
      )}

      <ReadingModeMenu
        trigger={
          <button
            type="button"
            data-testid="lentille-peek-more-trigger"
            aria-label={t('lentille.modes.title')}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full',
              'opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 transition-opacity'
            )}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        }
        currentPreference={currentPreference}
        capabilities={capabilities}
        onSelect={handleSelect}
        t={t}
        open={peekOpen}
        onOpenChange={setPeekOpen}
        data-testid="lentille-peek-menu"
        // Le MÊME menu porte le catalogue de modes ET les actions du rang —
        // une instance, trois déclencheurs (⋮, aperçu, encoche), et rien de
        // recopié : `ConversationActionMenuItems` EST la section du rang
        // historique.
        actionsSection={
          <ConversationActionMenuItems
            isPinned={rowActions.isPinned}
            isMuted={rowActions.isMuted}
            isArchived={rowActions.isArchived}
            reaction={rowActions.reaction}
            onTogglePin={rowActions.onTogglePin}
            onToggleMute={rowActions.onToggleMute}
            onToggleArchive={rowActions.onToggleArchive}
            onSetReaction={rowActions.onSetReaction}
            onShowDetails={rowActions.onShowDetails}
            onShareConversation={rowActions.onShareConversation}
            t={t as (key: string) => string}
          />
        }
      />
    </div>
  );
}

export default LentillePeek;
