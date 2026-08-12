# Iteration 92 — Plan d'implémentation (2026-07-04)

## Objectifs
Solder **F51** : retirer l'implémentation FCM morte `FirebaseNotificationService` (supplantée par la
vivante `PushNotificationService`) et neutraliser les docs de dossier périmées qui la référencent.

## Modules affectés
- `services/gateway/src/services/notifications/FirebaseNotificationService.ts` — **SUPPRIMÉ**
- `services/gateway/src/__tests__/unit/services/notifications/FirebaseNotificationService.test.ts` — **SUPPRIMÉ**
- `services/gateway/src/services/notifications/index.ts` — ré-export retirée
- `services/gateway/src/__tests__/unit/services/NotificationService.uncovered-paths.test.ts` — assertion retirée
- `services/gateway/src/services/notifications/FILES.txt` — **SUPPRIMÉ** (cruft)
- `services/gateway/src/services/notifications/{README,SUMMARY,ARCHITECTURE,MIGRATION}.md` — bannière obsolescence
- `notifications-firebase.test.ts` — **INCHANGÉ** (teste le chemin vivant, ne référence pas la classe morte)

## Phases
1. **Audit** (fait) : confirmer 0 instanciation prod de `FirebaseNotificationService` ; confirmer que
   `notifications-firebase.test.ts` ne référence pas la classe morte.
2. **Suppression code** : rm classe + son test unitaire ; éditer `index.ts` + `uncovered-paths.test.ts`.
3. **Docs** : rm `FILES.txt` ; bannière obsolescence en tête des 4 `.md`.
4. **Validation** : grep résiduel = 0 ; suites `notifications` vertes ; `tsc --noEmit` sans nouvelle erreur.

## Dépendances
Aucune. Pas de migration DB, pas de changement d'API.

## Risques estimés
TRÈS FAIBLE — code prouvablement mort. Seul risque = import résiduel (audité, corrigé dans le diff).

## Stratégie de rollback
`git revert` du commit — restaure la classe et ses tests à l'identique (aucun state runtime touché).

## Critères de validation
- [x] `grep FirebaseNotificationService/FirebaseStatusChecker` sur `src` (hors docs) = 0.
- [x] `uncovered-paths.test.ts` : 53/53 tests verts (3 assertions de ré-export restantes vertes).
- [x] Suites `[Nn]otification` du runner par défaut : **28 suites / 619 tests verts**, 0 régression.
- [x] `NotificationService.ts` / `SequenceService.ts` **non touchés** par le diff.

## Statut de complétion
- [x] Phase 2 (suppression code)
- [x] Phase 3 (docs)
- [x] Phase 4 (validation — 619 tests notifs verts, dont la suite éditée)
- [ ] Merge dans `main`

## Note d'environnement (validation)
Le sandbox n'a pas de client `@prisma/client` par défaut généré (le schema override l'output vers
`./client`), d'où le baseline TS2305 `SequenceService.ts` documenté it.87-91. Pour obtenir un signal
vert réel, un générateur `client_default` **transitoire** a été injecté puis **immédiatement retiré**
(schema `git diff` == vide) — il peuple `node_modules/.prisma/client` (gitignored). Le suite
`notifications-firebase.test.ts` (exclue du runner par défaut, `@ts-nocheck`) échoue alors sur un
TS2321 « Excessive stack depth » dans `NotificationService.ts:419` — artefact du double client généré
(types divergents), **sans rapport** avec ce diff (ni ce fichier ni `NotificationService.ts` ne sont
modifiés).

## Améliorations futures
- F51b (réécriture complète docs notifications), F55/F56/F57/F58/F59 — cf. analyse it.92.
