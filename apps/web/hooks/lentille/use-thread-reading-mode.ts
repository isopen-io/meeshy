'use client';

/**
 * `useThreadReadingMode` — REV-4bis/B2. Le point OÙ le fil ouvert obéit au
 * magasin autoritatif, et — depuis le 2026-08-17 — LE POINT DE DÉCISION du
 * défaut « Bulles » (voir `PROVISIONAL_DEFAULT_RENDER`, plus bas : décision
 * produit PROVISOIRE, datée, retirable d'une ligne).
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
 * Les modes que le fil sait RÉELLEMENT monter aujourd'hui. Toute entrée
 * nouvelle ici (une Rivière montée, un Résumé Vivant) est un changement de
 * comportement délibéré, pas un détail.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Q-142 / réserve REV-5 **R6-4** — `'bubbles'` ENTRE ICI, et voici pourquoi
 * ═══════════════════════════════════════════════════════════════════════════
 * Ce catalogue répond à UNE question : « qu'est-ce que cet ÉCRAN sait monter
 * aujourd'hui ». Jusqu'au 2026-08-17 la réponse était exactement
 * `['focal','script']` — les deux densités de `FocalThread`, et rien d'autre.
 *
 * La décision produit « Bulles par défaut » (le même jour,
 * `PROVISIONAL_DEFAULT_RENDER` plus bas) a rendu cette réponse FAUSSE sans
 * que ce tableau bouge : depuis elle, le mux monte la vue à bulles tous les
 * jours, drapeau ON, pour la branche `auto` — `ConversationMessages.tsx`,
 * `if (threadRender === 'bubbles') return renderHistorical('bubble')`. L'écran
 * SAIT monter les bulles ; c'est le catalogue qui l'ignorait.
 *
 * LA CONSÉQUENCE QUE R6-4 NOMME. `LensSwitcher` — l'en-tête du fil, monté
 * SANS drapeau par `ConversationView.tsx:326` — offre trois entrées : Focal,
 * Script, Bulles. La troisième écrit la préférence `bulles` (AMENDEMENT S1),
 * que ce hook passait à la loi avec un catalogue qui ne la contenait pas :
 * `clampToCapabilities` la rabattait sur `focal`/`clamped-unavailable`. Un
 * choix visible, offert, et sans le moindre effet.
 *
 * L'ARBITRAGE RENDU (Q-142), entre les deux remèdes possibles :
 *
 *   (a) MASQUER l'entrée « Bulles » du catalogue quand la Lentille est ON.
 *       C'était le remède attendu — et il est REFUSÉ, pour une raison qui
 *       tient en une phrase : tant que « Bulles par défaut » est une décision
 *       ACTIVE, masquer l'entrée fait du défaut un ALLER SIMPLE. Un lecteur
 *       qui choisit Focal une fois écrit `focal` dans le magasin ; `auto` est
 *       parti ; et depuis l'en-tête du fil — le seul menu qu'il ait sous la
 *       main, `ReadingModeMenu` et son entrée « Auto » vivant sur les rangs de
 *       la LISTE — plus rien ne le ramène aux bulles. On aurait échangé un
 *       choix mort contre une porte fermée : pire.
 *
 *   (b) BRANCHER l'entrée sur la préférence `bulles` LÉGALE — la rendre
 *       vivante au lieu de la rendre invisible. C'est ce qui est fait ici, et
 *       ça ne coûte qu'un mot : le catalogue dit enfin la vérité sur l'écran.
 *       La loi partagée n'est PAS touchée (`STICKY_MODE_BY_PREFERENCE` traduit
 *       déjà `bulles → 'bubbles'` depuis l'amendement S1) ; aucun mode neuf
 *       n'est atteignable ; `resume` et `riviere` restent rabattus sur `focal`,
 *       leurs écrans n'étant toujours pas montés (témoin de discrimination
 *       dans `__tests__/lentille/reading-mode-default-bubbles.test.tsx`).
 *
 * CE MOT SE RETIRE AVEC LE DÉFAUT PROVISOIRE, et pas avant : le jour où
 * `PROVISIONAL_DEFAULT_RENDER` disparaît, l'écran cesse de monter les bulles
 * de lui-même, et la question de savoir si « Bulles » doit rester au
 * sélecteur redevient une question produit ouverte — c'est ce jour-là que le
 * remède (a) redeviendra défendable.
 */
const THREAD_MOUNTABLE_MODES = ['focal', 'script', 'bubbles'] as const;

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
 * Ce que le fil ouvert MONTE — les deux densités plates de `FocalThread`, ou
 * la vue à bulles historique (`MessagesDisplay` en lentille `bubble`).
 */
export type ThreadReadingRender = FocalDensity | 'bubbles';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DÉCISION PRODUIT PROVISOIRE — 2026-08-17
 * ═══════════════════════════════════════════════════════════════════════════
 * « Mettre le mode Bulle par défaut POUR LE MOMENT. »
 *
 * Sans choix explicite du lecteur, le fil rend « Bulles » — au lieu de la
 * résolution `auto → focal` que l'orchestrateur produit. C'est un DÉFAUT DE
 * RENDU, pas une préférence : RIEN n'est écrit dans le magasin (le magasin
 * continue de répondre `auto`, et la Lentille continue d'afficher « Auto »).
 * La préférence stockée `bulles` — amendement S1, un mot que le lecteur peut
 * réellement choisir — reste une chose DISTINCTE, qui passe par la loi comme
 * avant.
 *
 * POUR LA RETIRER : supprimer cette constante et la branche `auto` ci-dessous.
 * Le hook redevient un pur appel à `resolveOrchestratorDecision`, et le
 * comportement d'avant le 2026-08-17 revient sans autre geste. Aucune loi
 * partagée n'a été amendée pour cette décision — c'est précisément pourquoi
 * elle se retire d'une ligne.
 *
 * CE QU'ELLE NE TOUCHE PAS :
 *   - le chemin drapeau ÉTEINT, qui rendait DÉJÀ les bulles et reste
 *     bit-à-bit identique (il ne consulte même pas ce hook) ;
 *   - un choix EXPLICITE (`focal`, `script`, `resume`, `riviere`, `bulles`),
 *     qui garde exactement le pouvoir qu'il avait ;
 *   - iOS, qui n'est pas concerné.
 */
const PROVISIONAL_DEFAULT_RENDER: ThreadReadingRender = 'bubbles';

/**
 * Ce que le fil ouvert doit rendre pour cette conversation.
 *
 * `conversationId` absent ⇒ le défaut : un fil sans identité n'a pas de
 * préférence à porter, et surtout pas celle d'un autre.
 */
export function useThreadReadingRender(conversationId: string | undefined): ThreadReadingRender {
  const preference = useReadingModePreference(conversationId ?? '');

  return useMemo(() => {
    if (!conversationId) return PROVISIONAL_DEFAULT_RENDER;

    // Décision produit provisoire 2026-08-17 — voir PROVISIONAL_DEFAULT_RENDER.
    // `auto` EST l'absence de choix : c'est la valeur que le magasin rend
    // quand rien n'a été mémorisé pour cette conversation
    // (`DEFAULT_PREFERENCE`, `reading-mode-preference-store.ts`).
    if (preference === 'auto') return PROVISIONAL_DEFAULT_RENDER;

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

    // Q-142/R6-4 — trois images, plus deux. `'bubbles'` n'arrive ici que par
    // un CHOIX collant `bulles` (la branche drapeau-éteint de la loi n'est
    // jamais empruntée : `isFlagEnabled` vaut `true` juste au-dessus) ; tout
    // le reste — `summary` d'un `resume` ou d'une branche numérique, `river`
    // d'un `riviere` — reste rabattu sur `focal` par `clampToCapabilities`.
    if (decision.mode === 'bubbles') return 'bubbles';
    return decision.mode === 'script' ? 'script' : 'focal';
  }, [conversationId, preference]);
}
