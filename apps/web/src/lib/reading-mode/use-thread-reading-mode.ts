import { useMemo, useState } from 'react';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Conversation } from '@/lib/api/types';
import { unreadOf } from '@/lib/view/conversation';

import { menuRows, type MenuRow } from './catalog';
import {
  resolveThreadMode,
  threadCapabilities,
  toStickyPreference,
  type ThreadCapabilities,
  type ThreadModeDecision,
} from './decision';
import type { ReadingModeStore } from './store';
import { usePersistedReadingMode } from './use-persisted-mode';

/**
 * L'ORCHESTRATION DU MODE DE LECTURE DU FIL (#5566, extrait de
 * `routes/thread.tsx` au lot #7429, découpage sans changer un pixel) — même
 * doctrine qu'iOS (`Focal/Core/ReadingModeOrchestrator.swift`, « la loi vit
 * ailleurs, l'écran ne fait que la consommer ») : la LOI vit dans
 * `@meeshy/shared` (`decision.ts` ne fait que la consommer avec le catalogue
 * de cet écran, D-14), et ce hook ne fait que tenir l'`init` du contrôleur —
 * l'instant d'ouverture, la préférence collante, les capacités et les lignes
 * de menu — hors de l'écran.
 *
 * MÉMORISÉS, parce que le virtualiseur re-rend l'écran hôte à chaque image de
 * défilement : sans `useMemo`, la loi, les capacités et les CINQ lignes du
 * menu (objets neufs, libellés interpolés) seraient reconstruites soixante
 * fois par seconde pour un menu fermé. C'est aussi le motif que copieront les
 * surfaces à venir — il doit être juste maintenant.
 *
 * Figés à l'OUVERTURE (comme l'`init` du contrôleur iOS) : la branche
 * d'absence de la loi lit l'INSTANT de l'ouverture, pas un instant qui recule
 * à chaque rendu tant que l'écran reste monté — `useState(() => new Date())`,
 * INITIALISEUR PARESSEUX : l'argument n'est évalué qu'au premier rendu, pas
 * une `Date` allouée par image pour une valeur que `useRef` jetterait
 * aussitôt.
 */
export type ThreadReadingModeState = {
  readonly readingDecision: ThreadModeDecision;
  readonly readingCapabilities: ThreadCapabilities;
  readonly readingMenuRows: readonly MenuRow[];
  readonly currentRow: MenuRow | undefined;
  readonly selectReadingMode: (mode: ConversationReadingMode) => void;
  readonly resetReadingModeToAuto: () => void;
};

export function useThreadReadingMode(params: {
  readonly store: ReadingModeStore;
  /** `(lecteur, conversation)` — `readingModeScopeOf(viewer)`, calculé par l'hôte. */
  readonly scope: string;
  /** `conversation` ENTIÈRE, jamais un `conversationId` qui replierait sur le
   * paramètre de route (revue-correction #5793) — `usePersistedReadingMode`
   * n'en lit que `.id`, ici même. */
  readonly conversation: Conversation | undefined;
  readonly isAnonymous: boolean;
}): ThreadReadingModeState {
  const { store, scope, conversation, isAnonymous } = params;

  const [openedAt] = useState(() => new Date());
  /**
   * `usePersistedReadingMode` (revue-correction #5793, défaut majeur) — reçoit
   * `conversation?.id`, JAMAIS un repli sur le paramètre de route : sur un
   * lien `/c/<identifiant>`, lire ou écrire sous ce repli créait DEUX clés
   * `localStorage` pour une seule conversation. Le hook ne lit/n'écrit RIEN
   * tant que `conversation` est `undefined` : l'écran est de toute façon en
   * `pending` à cet instant (retour anticipé de `ThreadScreen`).
   */
  const { stickyMode, lastOpenedAt, selectMode, resetToAuto } = usePersistedReadingMode({
    store,
    scope,
    conversationId: conversation?.id,
    openedAt,
  });

  const readingDecision = useMemo(
    () =>
      resolveThreadMode({
        unreadCount: conversation === undefined ? 0 : unreadOf(conversation),
        lastOpenedAt,
        now: openedAt,
        sticky: toStickyPreference(stickyMode),
        // #5695 : `summary` est désormais dans le catalogue de rendu web —
        // `isAnonymous` a un effet OBSERVABLE ici (un invité perd `summary`,
        // la loi le retire de `threadCapabilities`).
        isAnonymous,
        conversationType: conversation?.type ?? 'direct',
        // #5696 : l'éligibilité de la Rivière lit `memberCount` comme iOS
        // (`ConversationView.swift:569`) — MÊME champ que celui affiché par
        // l'en-tête (« N participants »).
        memberCount: conversation?.memberCount ?? null,
      }),
    [conversation, lastOpenedAt, openedAt, stickyMode, isAnonymous],
  );
  const readingCapabilities = useMemo(
    () =>
      threadCapabilities({
        isAnonymous,
        conversationType: conversation?.type ?? 'direct',
        memberCount: conversation?.memberCount ?? null,
      }),
    [conversation?.type, conversation?.memberCount, isAnonymous],
  );
  const readingMenuRows = useMemo(
    () =>
      menuRows({
        availableModes: readingCapabilities.availableModes,
        riverEligibilityReason: readingCapabilities.riverEligibilityReason,
        currentMode: readingDecision.mode,
      }),
    [readingCapabilities, readingDecision.mode],
  );
  const currentRow = readingMenuRows.find((row) => row.mode === readingDecision.mode);

  return {
    readingDecision,
    readingCapabilities,
    readingMenuRows,
    currentRow,
    selectReadingMode: selectMode,
    resetReadingModeToAuto: resetToAuto,
  };
}
