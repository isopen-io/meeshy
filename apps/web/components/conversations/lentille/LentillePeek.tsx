/**
 * `LentillePeek` — WL-106 (LWS-11).
 *
 * behaviour-matrix:L12 — les deux chemins de long press (preview/peek) sont
 * portés ici côté web : clic droit natif (`onContextMenu`) et appui long
 * pointer, tous deux ouvrant le même `ReadingModeMenu`. iOS porte L12 par
 * `.contextMenu`/`RowPressBounceModifier` (déjà couvert) ; ce fichier est la
 * couverture WEB du même id de matrice, jamais un id nouveau.
 *
 * DEUX des trois chemins d'entrée du menu de mode vivent ICI (contrat
 * LWS-11) :
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
 * Le 3ᵉ chemin (l'encoche de la focus card) est ABSENT côté web : WL-102..104
 * n'ont livré aucune focus card ni élection (re-prouvé — voir
 * `ReadingModeMenu.tsx`). Rien n'est simulé à sa place.
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
 * fichier via LA MÊME instance de `ReadingModeMenu`.
 *
 * @see tasks/lentille-implementation-contract.md LWS-11
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '@meeshy/shared/types';
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import { resolveCapabilities } from '@meeshy/shared/utils/reading-modes';
import { isCurrentUserAnonymous } from '@/utils/auth';
import { useReadingModePreference, useReadingModePreferenceActions } from '@/stores/reading-mode-preference-store';
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
  /** Drapeau `riviere_mode` — aucun résolveur web n'existe encore ; `false` documenté par défaut. */
  readonly isRiverFlagEnabled?: boolean;
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
  isRiverFlagEnabled = false,
}: LentillePeekProps) {
  const [peekOpen, setPeekOpen] = useState(false);
  const suppressNextClickRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  const currentPreference = useReadingModePreference(conversation.id);
  const { setReadingMode } = useReadingModePreferenceActions();

  const capabilities = useMemo(
    () =>
      resolveCapabilities({
        identity: { isAnonymous: isCurrentUserAnonymous() },
        // Ce composant n'est monté QUE sous drapeau Lentille actif
        // (LentilleConversationListMount, WL-101) — pas de résolveur ici.
        isFlagEnabled: true,
        conversationType: conversation.type,
        activeParticipantCount,
        isRiverFlagEnabled,
      }),
    [conversation.type, activeParticipantCount, isRiverFlagEnabled]
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
      style={style}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      {children}

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
      />
    </div>
  );
}

export default LentillePeek;
