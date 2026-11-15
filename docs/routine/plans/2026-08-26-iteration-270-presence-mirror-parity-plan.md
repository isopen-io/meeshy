# Itération 270 — Plan : témoin de parité du barème de présence 1/3/5

## Objectifs

Fermer le trou « 0 sur 3 » de couverture de parité sur le barème de présence
1/3/5, invariant documenté à trois miroirs (TS SSOT, Swift iOS/SDK, Kotlin
Android) sans aucun test cross-plateforme.

## Modules affectés

- `packages/shared/__tests__/presence-mirror-parity.test.ts` (nouveau, seul
  fichier de production/test ajouté)
- Sources LUES sans modification :
  - `packages/shared/utils/user-presence.ts` (import des constantes)
  - `packages/MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift` (regex)
  - `apps/android/core/model/.../Presence.kt` (regex)

## Phases d'implémentation

1. **RED** — écrire le test qui extrait les seuils des trois sources et prouve
   leur égalité. Vérifier qu'il ROUGIT en injectant une dérive dans chacun des
   trois miroirs.
2. **GREEN** — état d'origine des trois sources → test vert.
3. **Validation** — suite `packages/shared` complète verte.

## Dépendances

Aucune. `bun install --ignore-scripts` suffit (les tests `packages/shared`
tournent sous vitest sans build préalable pour ce fichier).

## Risques estimés

Minimal : test seul, aucune source de production modifiée. Risque résiduel =
fragilité de l'extraction regex si la forme d'un site change ; mitigé par un
message d'erreur explicite (« la déclaration a-t-elle changé de forme ? ») qui
transforme un refactor de forme en échec lisible plutôt qu'en faux positif
silencieux.

## Stratégie de rollback

Suppression du fichier de test — aucun impact runtime.

## Critères de validation

- Test vert sur l'état d'origine.
- Test rouge sur dérive injectée dans iOS, Android et TS (prouvé).
- Suite `packages/shared` verte (2633 tests).
- CI vert après push.

## Statut de complétion

- [x] Phase 1 (RED prouvé sur les trois miroirs)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (suite complète verte, 2633)
- [ ] Merge dans `main`

## Suivi de progression

Livré sur `claude/brave-archimedes-97k30v`.

## Améliorations futures

- Étendre le témoin de parité aux COULEURS de présence (`PRESENCE_HEX` TS vs
  `MeeshyColors.success/.warning/.neutral400` iOS vs `MeeshyPalette` Android vs
  classes web `PRESENCE_DOT_CLASS`) — même invariant à trois/quatre miroirs, non
  gardé. Reporté ici pour garder l'itération 270 focalisée sur le barème
  temporel (le seul qui change l'ÉTAT rendu ; la couleur en découle).
- Recenser les autres règles à N miroirs documentées dans CLAUDE.md encore sans
  témoin de parité (`resolveUserLanguage`, `resolveLastMessagePreview`).
