'use client';

/**
 * `useThreadReadingMode` — REV-4bis/B2. Le point OÙ le fil ouvert obéit au
 * magasin autoritatif.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL RÉSOUT, ET POURQUOI PAR LA LOI PLUTÔT QU'À LA MAIN
 * ═══════════════════════════════════════════════════════════════════════════
 * Le lecteur choisit une PRÉFÉRENCE (`auto/focal/script/resume/riviere/bulles`,
 * les mots du menu) ; l'écran, lui, monte un mode RENDU. Traduire l'un en
 * l'autre est déjà écrit, une seule fois, pour les trois frontends :
 * `resolveOrchestratorDecision` (`packages/shared/utils/reading-modes.ts`).
 * Ce hook l'APPELLE — il ne réécrit ni la table des choix collants, ni le
 * clamp au catalogue, ni le repli. C'est ce que fait déjà la liste
 * (`LentillePeek`) pour prédire son encoche, et ce que fait iOS à l'ouverture
 * d'un fil ; le fil web était le seul à ne consulter personne.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CATALOGUE PASSÉ À LA LOI EST CELUI DU FIL, PAS CELUI DE L'IDENTITÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * `resolveCapabilities` répond « qu'est-ce que ce LECTEUR a le droit de
 * choisir » (le Résumé Vivant est masqué à un invité, etc.). La question du
 * mux est différente et plus étroite : « qu'est-ce que cet ÉCRAN sait
 * monter aujourd'hui ». La réponse, re-prouvée dans `ConversationMessages.tsx`
 * au moment de ce lot, est `FocalThread` — et rien d'autre : ni l'écran de la
 * Rivière (sa peau vit sous `components/conversations/riviere/` et n'a AUCUN
 * site de montage dans le fil — R-135 a dégrisé la Rivière dans les MENUS,
 * pas monté son écran ; `riviere-screen-not-mounted.test.ts` en garde la
 * preuve, et ce fichier-ci ne doit donc pas même NOMMER cet hôte), ni le
 * Résumé Vivant (l'API observer `assist:*` n'existe pas). `FocalThread` porte
 * en revanche NATIVEMENT ses deux densités (`FocalDensity = 'focal' | 'script'`),
 * qui sont exactement les deux crans plats de la loi.
 *
 * Passer ce catalogue-là — et non celui du lecteur — a une conséquence qu'il
 * faut nommer : toute préférence que l'écran ne sait pas monter est rabattue
 * par `clampToCapabilities` sur `focal`, avec la raison `clamped-unavailable`,
 * au lieu de produire un mode que personne ne dessinerait. C'est la même
 * discipline que l'invariant REV-1/blocage 3, appliquée au bon catalogue.
 *
 * Et comme `['focal','script']` est inclus dans TOUS les catalogues
 * drapeau-on (inscrit comme invité), ce mux n'a AUCUN branchement
 * invité/inscrit à faire — ce que `ReadingModeIdentity` interdit justement de
 * multiplier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES ENTRÉES NUMÉRIQUES SONT INERTES ICI — ET C'EST PROUVÉ, PAS SUPPOSÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * `resolveOrchestratorDecision` consomme aussi `unreadCount` et `lastOpenedAt`.
 * `ConversationMessages` ne les connaît ni l'un ni l'autre — et surtout,
 * les DEUX branches qu'ils commandent (plafond de non-lus, absence du lecteur)
 * produisent l'une comme l'autre `'summary'`, qui n'appartient PAS au
 * catalogue du fil : elles sont donc rabattues sur `focal`, exactement comme
 * la branche par défaut. Le résultat ne dépend que de la préférence, quelles
 * que soient ces deux valeurs. Elles sont passées à leur valeur NEUTRE plutôt
 * qu'inventées, et un témoin dédié rejoue la plage entière pour que cette
 * démonstration reste vraie si la loi bouge
 * (`__tests__/lentille/reading-mode-thread-render.test.tsx`).
 *
 * @see apps/web/stores/reading-mode-preference-store.ts (le magasin autoritatif)
 * @see packages/shared/utils/reading-modes.ts (la loi appelée, jamais recopiée)
 */

import { useMemo } from 'react';
import {
  resolveOrchestratorDecision,
  type ReadingModeCapabilities,
} from '@meeshy/shared/utils/reading-modes';
import { useReadingModePreference } from '@/stores/reading-mode-preference-store';
import type { FocalDensity } from '@/components/conversations/focal/FocalRow';

/**
 * Les modes que le fil sait RÉELLEMENT monter aujourd'hui — les deux densités
 * de `FocalThread`. Toute entrée nouvelle ici (une Rivière montée, un Résumé
 * Vivant) est un changement de comportement délibéré, pas un détail.
 */
const THREAD_MOUNTABLE_MODES = ['focal', 'script'] as const;

/**
 * `riverEligibilityReason` n'alimente QUE le libellé grisé du menu ; le mux ne
 * l'affiche nulle part. Elle est servie parce que le type de la loi l'exige,
 * avec le compte `null` — INCONNU, jamais un `0` fabriqué (amendement S1,
 * G-123 n'existe pas côté client).
 */
const THREAD_CAPABILITIES: ReadingModeCapabilities = {
  availableModes: THREAD_MOUNTABLE_MODES,
  riverEligible: false,
  riverEligibilityReason: { threshold: 0, current: null, riverReason: 'belowThreshold' },
};

/** Entrées numériques neutres — voir la docstring de fichier : inertes, prouvées telles. */
const NEUTRAL_UNREAD_COUNT = 0;
const NEUTRAL_LAST_OPENED_AT = null;

/**
 * La densité que le fil ouvert doit rendre pour cette conversation.
 *
 * `conversationId` absent ⇒ `'focal'`, le plancher de la loi : un fil sans
 * identité n'a pas de préférence à porter, et surtout pas celle d'un autre.
 */
export function useThreadReadingDensity(conversationId: string | undefined): FocalDensity {
  const preference = useReadingModePreference(conversationId ?? '');

  return useMemo(() => {
    if (!conversationId) return 'focal';

    const decision = resolveOrchestratorDecision({
      unreadCount: NEUTRAL_UNREAD_COUNT,
      lastOpenedAt: NEUTRAL_LAST_OPENED_AT,
      now: 0,
      stickyChoice: preference,
      capabilities: THREAD_CAPABILITIES,
      // Ce hook n'est CONSULTÉ que dans la branche drapeau-on du mux
      // (`ConversationMessages.tsx`) : le drapeau y est déjà résolu, et le
      // repasser ici ferait de ce fichier un second lecteur du drapeau —
      // exactement ce que la garde d'occurrence unique interdit.
      isFlagEnabled: true,
    });

    return decision.mode === 'script' ? 'script' : 'focal';
  }, [conversationId, preference]);
}
