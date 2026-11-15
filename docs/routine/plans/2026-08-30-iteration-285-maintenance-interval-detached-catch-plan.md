# Plan — Itération 285 : `MaintenanceService` arme ses tâches périodiques par la forme bénie (non-async + `.catch`)

## Objectifs

Retirer la dernière divergence du dépôt à la règle des promesses détachées
(leçon 230/307) : les deux `setInterval(async () => { await … })` de
`MaintenanceService` deviennent `setInterval(() => { void … .catch(…) })`, forme
déjà en production dans `ExpiredMessagesCleanupService` et `CallService`.

## Modules affectés

- `services/gateway/src/services/MaintenanceService.ts` (production — 2 callbacks)
- `services/gateway/src/__tests__/unit/services/MaintenanceService.test.ts` (tests)
- `docs/routine/analyses/…-iteration-285-…md`, `docs/routine/plans/…-iteration-285-…md`

## Phases

1. **RED** — ajouter, dans le fichier de tests, `captureUnhandledRejections` (le
   patron blessé du dépôt) + `captureIntervalCallbacks` (spy sur `setInterval`
   pour déclencher les callbacks à la main), puis deux témoins qui forcent
   `updateOfflineUsers` / `runDailyCleanup` à rejeter HORS de leur try interne et
   asserter (a) aucun rejet non gardé, (b) `logger.error` appelé. ✅ tombent sur
   le code courant.
2. **GREEN** — convertir les deux `setInterval(async)` en callback non-async +
   `void … .catch(err => logger.error(…))`. ✅ 28/28.
3. **Non-régression** — `detached-promise-catch-sweep.test.ts` (inventaire vide),
   `unit/MaintenanceService.test.ts` (sibling), `tsc --noEmit`. ✅
4. **Docs + commit + push + PR.**

## Dépendances

Aucune. Isolé à un service et à son fichier de tests.

## Risques estimés

Très faibles. Le comportement nominal (mêmes méthodes, mêmes intervalles) est
inchangé ; seul le chemin d'erreur passe de « arrêt du process » à « rejet
journalisé ». La forme retenue est déjà éprouvée en production sur deux services
frères.

## Stratégie de rollback

Revert du commit (deux lignes de production + un bloc de tests). Aucune migration,
aucun changement de contrat, aucun état persistant touché.

## Critères de validation

- RED prouvé au runtime (rejet capturé + `logger.error` non appelé sur le code courant).
- GREEN : suite `MaintenanceService.test.ts` 28/28.
- Cliquet `detached-promise-catch-sweep` toujours vert (inventaire vide).
- `tsc --noEmit -p services/gateway/tsconfig.json` EXIT=0.

## Statut d'achèvement

TERMINÉ — implémenté, testé (RED→GREEN prouvé), typecheck vert, docs écrites.

## Suivi / améliorations futures

- Pas de cliquet grep-able honnête pour la forme `set*(async () => { await … })`
  (un balayage naïf rend un faux positif sur le `setImmediate(async)` sûr de
  `MessageTranslationService`). La garde de cette itération est le témoin de
  comportement. À ré-outiller (typeur) si la forme réapparaît ailleurs.
