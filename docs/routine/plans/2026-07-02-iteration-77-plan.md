# Iteration 77 — Plan d'implémentation (2026-07-02)

## Objectifs
Éliminer la race d'ordonnancement des réponses de retraduction ZMQ après édition de message
(#43 de l'audit realtime) : une réponse de traduction correspondant à un contenu périmé ne doit
jamais écraser la traduction du contenu courant (garantie Prisme Linguistique).

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (prod)
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.branches.test.ts` (tests)

## Phases d'implémentation
1. **Registre** — `latestRetranslationTask: Map<messageId, {taskId, ts}>` +
   `_registerLatestRetranslationTask()` (borné TTL 1 h + plafond FIFO 5000), appelé après le
   `sendTranslationRequest` de `_processRetranslationAsync`. ✅
2. **Garde** — `_isStaleTranslationResult()` + early-return dans `_handleTranslationCompleted`
   avant `_saveTranslationToDatabase`. ✅
3. **Borne mémoire** — balayage TTL greffé sur le timer `processedTasksCleanupInterval` existant
   (aucun nouveau timer). ✅
4. **Tests de régression** — 3 cas dans le fichier `branches` existant. ✅

## Dépendances
Aucune. N'entre en conflit avec aucune PR ouverte (#1335/#1337/#1338/#1339/#1341 ne touchent pas
`MessageTranslationService`).

## Risques estimés
Faible — registre alimenté seulement sur retraduction (messages édités), garde inerte pour les
messages jamais retraduits, TTL ≫ round-trip ZMQ. Voir l'analyse pour le détail des cas couverts.

## Stratégie de rollback
`git revert` du commit — 1 fichier de prod + 1 fichier de test, aucune migration, aucun changement
de contrat ZMQ/API.

## Critères de validation
- [x] `branches.test.ts` 44/44.
- [x] `MessageTranslationService*` + `MessageHandler*` 652/652 (11 suites), 0 régression.
- [x] `tsc --noEmit` 0 erreur neuve dans le fichier touché.

## Statut de complétion
**Terminé.** Prêt à commit/push sur `claude/brave-archimedes-ym9yvf`.

## Améliorations futures
- #41 `OfflineQueue`/`OutboxFlusher` reconciliation (iOS SDK).
- À terme : faire transporter par le translator un token d'édition (echo metadata) pour un garde
  end-to-end, si un cas d'usage exige de distinguer plus finement que par taskId.
