# Iteration 135 — Plan d'implémentation (2026-07-08)

## Objectifs
Corriger le drift `locationCount` entre le chemin incrémental (`onNewMessage`/`onMessageDeleted`) et la
source de vérité `recompute` dans `ConversationMessageStatsService`. La localisation étant une dimension
de `messageType` (pas de pièce jointe), la compter par `messageType === 'location'` sur le chemin
incrémental, comme le fait déjà `recompute`.

## Modules affectés
- `services/gateway/src/services/ConversationMessageStatsService.ts` (production)
- `services/gateway/src/__tests__/unit/services/ConversationMessageStatsService.test.ts` (tests)

## Phases
1. **RED** : ajouter 2 tests de régression
   - `onNewMessage` avec `messageType='location'` → `update.data.locationCount === { increment: 1 }`.
   - `onMessageDeleted` avec `messageType='location'` → `update.data.locationCount === { decrement: 1 }`.
   Prouver l'échec sur le code actuel (`toBeUndefined`).
2. **GREEN** :
   - `onNewMessage` : ajouter `locationCount: messageType === 'location' ? { increment: 1 } : undefined`.
   - `onMessageDeleted` : ajouter `updateData.locationCount = { decrement: 1 }` si `messageType === 'location'`.
   - Retirer l'entrée morte `location: 'locationCount'` de `ATTACHMENT_TYPE_FIELDS` + commentaire.
3. **REFACTOR** : vérifier symétrie add/delete, cohérence avec `isTextMessageStat` (déjà par `messageType`).

## Dépendances
Aucune. Fonctions pures, pas de migration schema (`locationCount` existe déjà).

## Risques estimés
Faible. Aucune API/forme de réponse modifiée. Comptages existants inchangés.

## Stratégie de rollback
Revert du commit unique.

## Critères de validation
- Suite `ConversationMessageStatsService.test.ts` verte (nouveaux + existants).
- `bun run test` gateway sans régression.
- `contentTypes.location` inchangé en forme.

## Statut de complétion
- [x] Analyse rédigée
- [ ] RED
- [ ] GREEN
- [ ] Validation
- [ ] Merge

## Améliorations futures
- F100 : `isTextMessageStat` vs `recompute` (sémantique message texte vide).
- F101 : `clicksByHour` UTC.
