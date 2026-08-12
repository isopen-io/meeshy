# Plan — Iteration-220i · `StatusComposerView` : `NavigationStack`, localisation, nom VoiceOver du bouton Publier

**Date :** 2026-07-26 · **Piste :** iOS (suffixe `i`)
**Branche :** `claude/quirky-curie-mw3wap` (recréée depuis `origin/main` HEAD `ffef133`)
**Essaim :** `list_pull_requests` (open) = **0 PR** → 0 collision possible.
**Analyse :** `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposerview-navstack-i18n.md`

## Déclencheurs

Trois pistes 219i+ étaient bloquées sur des PR en vol, toutes mergées depuis :
#2275 (`131f793`), #2319 (`26b8ef1`), #2325 (`ffef133`). La piste (d) —
« `StatusComposerView` `NavigationView`→`NavigationStack` dès #2275 mergée/close,
puis réduire l'attendu de `NavigationContainerMigrationTests` à l'ensemble vide » —
est donc exécutable, et l'audit du fichier a fait surgir deux défauts adjacents.

## Étapes

- [x] Resynchroniser la branche sur `origin/main` HEAD `ffef133`
- [x] Vérifier l'absence de collision (`list_pull_requests` open → 0)
- [x] **A.** `NavigationView { … }` → `NavigationStack { … }` + commentaire de justification
- [x] **A.** `NavigationContainerMigrationTests` : assertion de fichier migré pour
      `StatusComposerView`, ensemble épinglé → `∅`, test renommé
      `test_noNavigationViewRemains`
- [x] **B.** Mesurer la couverture i18n réelle de l'écran (6 clés absentes du catalogue)
- [x] **B.** Ajouter 8 clés à `Localizable.xcstrings`, traduites dans les 7 locales
      (`ar/de/en/es/fr/it/pt-BR`), terminologie alignée sur `content.kind.mood`
      et `a11y.feed.compose.publish` — diff purement additif
- [x] **C.** `publishToolbarButton` : `.accessibilityLabel` stable + `.accessibilityValue`
      portant l'état (publication en cours / indisponible), doctrine `FeedView:1266`
- [x] **D.** Étendre `LocalizationConsistencyTests` (réutiliser son scanner, ne PAS
      créer un second) : liste additive d'écrans soldés + plafond de backlog à 1 669
- [x] Prouver RED/GREEN hors Xcode par portage fidèle du scanner Swift
- [x] Contrôles : JSON du catalogue revalidé, 0 clé orpheline, 0 clé sans `en`,
      équilibrage accolades/parenthèses/crochets, 0 édition de `project.pbxproj`
- [x] Analyse + plan + mise à jour de `branch-tracking.md`
- [x] Commit et push sur `claude/quirky-curie-mw3wap`

## Décisions structurantes

1. **Étendre `LocalizationConsistencyTests` plutôt que créer une suite jumelle.**
   Un premier jet créait `LocalizationCatalogCoverageTests` avec son propre
   scanner par regex. Supprimé : la suite existante possède déjà un scanner
   supérieur (balayage de parenthèses tenant compte des chaînes, donc immunisé
   aux littéraux imbriqués) et la notion de clé identifiant. Deux scanners
   concurrents auraient divergé à la première évolution.

2. **Le plafond de backlog est un `<=`, pas un `==`.** Le but est d'empêcher la
   croissance, pas d'obliger chaque PR à toucher le nombre. Le message d'échec
   ordonne explicitement d'ajouter les traductions plutôt que de relever le
   plafond — sans quoi le ratchet se désarme au premier contournement.

3. **Locales requises lues dans `Info.plist`, jamais codées en dur.** Ajouter une
   locale à l'app resserre mécaniquement les deux tests, au lieu de créer un
   angle mort silencieux.

4. **Aucun changement visuel.** La grille d'emoji (`MeeshyFont.relative(36)` dans
   un cadre `56×56`) est un vrai risque Dynamic Type mais un correctif visuel :
   laissé à une itération dédiée plutôt que mêlé à un lot 0-régression.

## Portée

3 fichiers Swift (1 production, 2 tests) + 1 catalogue de chaînes.
0 logique · 0 réseau · 0 layout · 0 visuel · 0 SDK · 0 Android/Web/backend.
Gate = CI `iOS Tests`.
