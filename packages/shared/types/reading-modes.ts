/**
 * Modes de lecture des conversations — La Lentille.
 *
 * Contrat gelé, définitions reprises mot pour mot.
 * @see tasks/lentille-implementation-contract.md §3.1
 */
import { z } from 'zod'

/**
 * export type ConversationReadingMode =
 *   | 'focal'    // rangée plate + perspective — défaut sous drapeau
 *   | 'script'   // même rangée plate, densité uniforme, aucune perspective
 *   | 'summary'  // Résumé Vivant — l'état d'abord, la preuve à un tap
 *   | 'river'    // en sursis : présent au catalogue, jamais sélectionnable
 *   | 'bubbles'; // rendu bulle historique — uniquement drapeau éteint
 */
export const ConversationReadingModeSchema = z.enum([
  'focal',
  'script',
  'summary',
  'river',
  'bubbles',
])
export type ConversationReadingMode = z.infer<typeof ConversationReadingModeSchema>

/**
 * Ce que l'utilisateur a choisi. `auto` rend la main à l'orchestrateur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AMENDEMENT S1 (REV-4bis/B2, 2026-08-17) — `bulles` entre au vocabulaire
 * ═══════════════════════════════════════════════════════════════════════════
 * L'énumération portait cinq valeurs depuis le gel S1. La sixième, `bulles`,
 * est ajoutée ici, et la raison doit rester lisible longtemps après que le
 * motif aura disparu — c'est la contrepartie d'un gel qu'on rouvre (même
 * discipline que l'AMENDEMENT S1 de la trifurcation Rivière, REV-3/B3, dans
 * `utils/reading-modes.ts`).
 *
 * RE-PREUVE DE L'ABSENCE DE CHEMIN LÉGAL (faite avant d'amender, pas après) :
 * le mot « Bulles » EXISTE déjà côté utilisateur — c'est la troisième entrée
 * du sélecteur web historique (`apps/web/components/conversations/reading/
 * LensSwitcher.tsx`, « l'ancien rendu, gardé à un tap le temps de la
 * transition »). Le mode RENDU correspondant existe aussi
 * (`ConversationReadingMode.bubbles`). Ce qui n'existait pas, c'est le PONT :
 *   1. `resolveOrchestratorDecision` ne produit `'bubbles'` que sur la branche
 *      `isFlagEnabled === false` — jamais depuis un choix collant.
 *   2. `resolveCapabilities` ne sert `'bubbles'` que sur cette même branche
 *      (`FLAG_DISABLED_AVAILABLE_MODES`) ; AUCUN catalogue drapeau-on ne le
 *      contient.
 *   3. Rabattre « Bulles » sur `auto` était impossible : `auto` est DÉJÀ la
 *      valeur de « rien n'a été choisi », dont le rendu par défaut doit rester
 *      `focal`. Une même valeur ne peut pas signifier à la fois « focal par
 *      défaut » et « bulles ».
 * Les deux seules issues restantes étaient donc : (a) un SECOND magasin de
 * persistance pour cette unique valeur — exactement le défaut que la façade
 * REV-4bis/B2 referme — ou (b) retirer « Bulles » du monde drapeau-éteint,
 * c'est-à-dire régresser le chemin OFF que le contrat promet bit-à-bit. Ni
 * l'une ni l'autre n'était acceptable ; l'amendement l'est.
 *
 * CE QUE `bulles` NE CHANGE PAS. L'énumération des modes RENDUS
 * (`ConversationReadingModeSchema`) est INTACTE : `bulles` (le mot du choix)
 * et `bubbles` (le mode rendu) restent deux mots distincts, exactement comme
 * `resume`/`summary` et `riviere`/`river`. Et le POUVOIR de `bulles` est nul
 * drapeau-on : son image `'bubbles'` n'appartenant à aucun catalogue, la loi
 * la rabat sur `focal`/`'clamped-unavailable'` — le traitement même que
 * reçoit un `riviere` mémorisé avant l'ouverture de la Rivière.
 *
 * MIROIRS (« des deux côtés du gel ») : `ReadingModeOrchestrator
 * .ReadingModePreference` (Swift, `apps/ios/.../Focal/Core/`) porte le sixième
 * cas et ses quatre `switch` exhaustifs le traitent ; aucune nouvelle clé i18n
 * n'a été créée — iOS réutilise `lentille.mode.name.bubbles`, le web
 * `lentille.modes.bubbles`, toutes deux préexistantes. `bulles` n'est OFFERT
 * dans aucun menu iOS (`LentilleModeMenu.build`, ordre inchangé) : le cas y
 * existe pour la fidélité de décodage et le rejeu des vecteurs partagés.
 *
 * @see packages/shared/utils/reading-modes.ts (STICKY_MODE_BY_PREFERENCE)
 * @see apps/web/lib/conversations/reading-mode.ts (la traduction web ↔ rendu)
 */
export const ReadingModePreferenceSchema = z.enum([
  'auto',
  'focal',
  'script',
  'resume',
  'riviere',
  'bulles',
])
export type ReadingModePreference = z.infer<typeof ReadingModePreferenceSchema>
