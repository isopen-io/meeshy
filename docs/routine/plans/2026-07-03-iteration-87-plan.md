# Iteration 87 — Plan d'implémentation (2026-07-03)

## Objectives
Compléter le fix badge F1 (`f2ee0d71`) pour Android : forwarder `payload.badge` comme
`AndroidNotification.notificationCount` dans `PushNotificationService.sendViaFCM`, afin que le
badge d'icône du launcher Android reste fidèle au compte unread quand l'app est fermée (parité iOS).

## Affected modules
- `services/gateway/src/services/PushNotificationService.ts` — branche `platform === 'android'`
  de `sendViaFCM` (production).
- `services/gateway/src/__tests__/unit/services/PushNotificationService.test.ts` — 3 tests neufs.

## Implementation phases
1. **RED** — 3 tests dans le bloc `sendViaFCM (via sendToUser)` :
   - badge présent (`7`) → `android.notification.notificationCount === 7`
   - badge zéro (`0`) → `notificationCount === 0` (recale explicite)
   - badge absent → `android.notification` sans propriété `notificationCount`
   Vérifié : les 2 premiers échouent sans le fix prod (RED prouvé).
2. **GREEN** — spread conditionnel `...(payload.badge !== undefined ? { notificationCount } : {})`
   dans la branche android + commentaire liant à la garantie F1 iOS.
3. **REFACTOR** — aucun (change minimal, self-documenting via commentaire).

## Dependencies
Aucune. `payload.badge` (`number?`) déjà présent sur `PushNotificationPayload` (l.39) et déjà
peuplé par `NotificationService.sendToUser` (F1).

## Estimated risks
TRÈS FAIBLE. Ajout conditionnel → payload inchangé sans badge (test d'égalité exacte existant
préservé). `notificationCount: 0` = entier FCM valide.

## Rollback strategy
Revert du commit (2 fichiers, ~15 lignes). Aucune migration, aucun état persistant.

## Validation criteria
- [x] `PushNotificationService.test.ts` : 73/73 verts.
- [x] RED prouvé (2 tests échouent sans le fix prod).
- [x] Suites `[Nn]otification` : 644/644 verts (29 suites).
- [x] `tsc --noEmit` gateway : exit 0.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc propre, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-87-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [x] Commit + push.

## Future improvements
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle, badge
  hardcodé `1`) — chantier de consolidation dédié.
