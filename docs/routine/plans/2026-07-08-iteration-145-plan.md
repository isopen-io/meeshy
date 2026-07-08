# Iteration 145 — Plan d'implémentation (2026-07-08)

## Objectifs
Corriger **F113** : aligner le chemin incrémental de `ConversationMessageStatsService` sur l'`recompute()`
autoritaire pour le compteur `textMessages` (`contentTypes.text`), en supprimant la condition
`hasTextContent` divergente. Rétablir l'invariant documenté « incremental MUST mirror recompute ».

## Modules affectés
- `services/gateway/src/services/ConversationMessageStatsService.ts` (prod)
- `services/gateway/src/__tests__/unit/services/ConversationMessageStatsService.test.ts` (tests)

## Phases
1. **RED** — ajouter 3 tests (whitespace `onNewMessage`, empty `onNewMessage`, whitespace
   `onMessageDeleted`) asserting le comptage texte, + 1 test empty parity. Vérifier l'échec contre la
   source pré-fix (revert temporaire).
2. **GREEN** — `isTextMessageStat` : retirer `hasTextContent` + le paramètre `content` inutilisé ;
   mettre à jour les 2 sites d'appel (`onNewMessage` l.150, `onMessageDeleted` l.282) et le commentaire.
3. **REFACTOR** — commentaire explicite : émptiness du contenu délibérément non gardée (parité recompute).

## Dépendances
Aucune. Fonction pure, pas de changement de schéma/API/socket.

## Risques estimés
Très faible. Retrait d'une condition trop stricte (le compteur ne peut qu'augmenter sa couverture, jamais
compter à tort un non-texte). Symétrie ajout/suppression préservée (même prédicat).

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant modifié par le déploiement (le prochain
`recompute` réaligne de toute façon les lignes existantes).

## Critères de validation
- Suite `ConversationMessageStatsService.test.ts` : 71/71 verte.
- RED confirmé sur les 3 nouveaux tests avant fix.
- Aucune régression `tsc` nouvelle (seule erreur pré-existante : prisma client non généré en env).

## Statut de complétion
- [x] Phase 1 RED (3/4 nouveaux tests échouent pré-fix, confirmé)
- [x] Phase 2 GREEN (71/71)
- [x] Phase 3 REFACTOR (commentaire)
- [x] Analyse + plan documentés
- [ ] Commit + push + PR

## Améliorations futures
- Surface pure-helper épuisée (144 itérations). Les prochaines itérations devraient viser la couche
  **services métier** (agrégations, caches multi-niveaux, plans de transcodage) et les **hooks web**
  faisant des maths d'agrégation — pistes signalées par les deux agents Explore comme non entièrement
  balayées.
- Envisager de **supprimer le code mort** `services/TranslationCache.ts` (dupliqué, jamais utilisé en
  prod, seulement testé) et `translation-cleaner.ts` (`deep/cleanTranslationOutput` non importés) — pour
  éliminer des sources de confusion et des faux positifs de bug-hunting futurs.
