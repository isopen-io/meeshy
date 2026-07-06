# Iteration 113 — Plan d'implémentation (2026-07-06)

## Objectifs
Corriger **F84** : `languageDistribution` des statistiques de conversation gèle après la création de la
ligne de stats parce que `MessageHandler` transmet `null` comme langue du message aux deux sites d'appel
live de `onNewMessage`. Transmettre la langue réelle (`message.originalLanguage`), déjà en main.

## Modules affectés
- `services/gateway/src/socketio/handlers/MessageHandler.ts` (2 lignes : sites d'appel `onNewMessage`
  dans `handleMessageSend` l.320-322 et `handleMessageSendWithAttachments` l.523-525).
- Tests : `services/gateway/src/__tests__/unit/handlers/MessageHandler.core.test.ts` (assertions).
- Service inchangé (`ConversationMessageStatsService.ts`) — déjà correct pour le cas « langue fournie ».
- Endpoint hérité (non modifié) : `routes/conversations/stats.ts`.

## Phases d'implémentation
1. **RED** — assertions handler prouvant que la 6e position de `onNewMessage` reçoit `null` avant fix. ✅
2. **GREEN source** — `null` → `message.originalLanguage ?? null` aux 2 sites d'appel. ✅
3. **Tests** — augmenter le test de succès du chemin texte (assert `[5] === 'fr'`) ; ajouter un test
   dédié chemin attachments (assert `[5] === 'de'`). ✅
4. **Validation** — install bun (parité CI), Prisma generate + build shared, jest gateway sur
   `MessageHandler.core.test.ts` + `ConversationMessageStatsService.test.ts`, puis suite complète.
5. **Commit + push + PR**.

## Dépendances
- `bun install` requis (node_modules absent au démarrage) pour exécuter jest.
- `npx prisma generate --generator client` + `bun run build` dans `packages/shared` (parité CI gateway).

## Risques estimés
Très faibles. On transmet une valeur déjà lue au même endroit (pour `_notifyAgent`). Aucun changement de
signature, de forme de réponse, ni de schéma. Le garde `if (originalLanguage)` du service reste inchangé.

## Stratégie de rollback
Restaurer `null` aux 2 sites d'appel (trivialement réversible).

## Critères de validation
- [x] RED prouvé (assertion `[5]` = `null` sur code pré-fix).
- [x] GREEN source (2 lignes).
- [ ] jest gateway `MessageHandler.core.test.ts` vert (existants + 1 augmenté + 1 neuf).
- [ ] jest gateway `ConversationMessageStatsService.test.ts` vert (inchangé).
- [ ] Suite gateway complète sans nouvelle régression.
- [ ] CI verte après push.

## Statut de complétion
- Source : **fait**. Tests : **fait**. Validation locale : **en cours** (install bun).

## Progress tracking
- [x] Analyse écrite (`docs/routine/analyses/2026-07-06-iteration-113-analyse.md`).
- [x] Plan écrit (ce fichier).
- [x] Fix source + tests.
- [ ] Validation locale + push + PR.

## Améliorations futures
- **F84b** : `locationCount` incrémental (nécessite de faire remonter `messageType` au handler).
- **F84c** : `reactionSummary` posts/commentaires — recompute `groupBy` self-healing (comme
  `ReactionService` pour les messages).
</content>
