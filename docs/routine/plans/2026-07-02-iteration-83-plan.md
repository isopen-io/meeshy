# Iteration 83 — Plan d'implémentation (2026-07-02)

## Objectif
Fermer **F48** (résidu iter 82) : rendre atomiques les écritures de compteurs scalaires des hooks
`onMessageEdited` / `onMessageDeleted` de `ConversationMessageStatsService`, éliminant le
lost-update sous édition/suppression concurrentes. Propage l'idiome `{ increment }` déjà présent
dans `onNewMessage` aux deux hooks soeurs.

## Modules affectés
- `services/gateway/src/services/ConversationMessageStatsService.ts` (production)
- `services/gateway/src/__tests__/unit/services/ConversationMessageStatsService.test.ts` (tests)

## Phases
1. **RED/adaptation** — réécrire les assertions des tests scalaires edit/delete pour attendre des
   opérateurs atomiques (`{ increment: n }` / `{ decrement: n }`) au lieu des valeurs absolues +
   clamp. Ajouter 2 tests de régression lost-update (deux edits concurrents → deux increments
   indépendants ; delete → decrement indépendant de la lecture).
2. **GREEN** — dans `onMessageEdited` : `totalWords`/`totalCharacters` → `{ increment: diff }`.
   Dans `onMessageDeleted` : `totalMessages`/`totalWords`/`totalCharacters`/`textMessages`/
   compteurs de pièces jointes → `{ decrement: n }`. Mettre à jour le commentaire doctrine (l.84).
3. **VALIDATION** — jest sur la suite du service + toutes les suites `MessageHandler` (2 conventions
   de placement) + suites `stats`.

## Dépendances
Aucune (changement interne au service, aucune signature publique modifiée, `participantStats` JSON
laissé en RMW inchangé).

## Risques estimés
FAIBLE. Seul changement observable : disparition du plancher `Math.max(0, …)` au niveau DB
(remplacé par atomicité + self-heal `recompute()`). Documenté et testé.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucune donnée transformée.

## Critères de validation
- [x] `jest ConversationMessageStatsService` vert (61/61)
- [x] `jest MessageHandler` vert (7 suites / 420) — couvre les 2 conventions de placement
- [x] `jest stats` vert (13 suites / 277)
- [x] Aucune signature publique modifiée ; `onNewMessage` inchangé

## Statut de complétion
**COMPLET.** Les 3 hooks écrivent désormais leurs scalaires en atomique de façon homogène.

## Améliorations futures
Voir analyse iter 83 : F47 (cap affiliation TOCTOU), F49 (ConversationStats cache),
F50 (nouveau — agrégats JSON `participantStats`/… encore en RMW, recompute-corrigés).
