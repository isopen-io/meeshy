# Plan — Itération 220i : dernier `NavigationView` → `NavigationStack`

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposer-navigationstack.md`
**Base** : `main` HEAD `ffef133` · **Branche** : `claude/quirky-curie-52be0w`

## Objectif

Solder la piste n° 4 de 219i : migrer le dernier conteneur `NavigationView` de
l'app iOS et transformer le test de dette épinglée en interdiction générale.

## Étapes

- [x] Resynchroniser la branche de travail sur `origin/main` (`ffef133`).
- [x] Vérifier l'absence de collision essaim sur `StatusComposerView.swift` et
      `NavigationContainerMigrationTests.swift` (12 branches distantes les plus
      récentes).
- [x] Confirmer que les 5 PR iOS listées comme freins par 219i sont mergées
      (#2275, #2319, #2325, #2326, #2330).
- [x] `StatusComposerView.swift` : `NavigationView {` → `NavigationStack {`,
      avec commentaire gravant la raison (feuille + largeur regular).
- [x] `StatusComposerView.swift` : `.accessibilityLabel` sur
      `publishToolbarButton` (nom invariant pendant la publication ;
      réutilisation de `status.composer.publish`, 0 clé neuve).
- [x] `NavigationContainerMigrationTests.swift` : ajouter
      `test_statusComposer_usesNavigationStack()` (assertion positive via
      `assertMigrated`).
- [x] `NavigationContainerMigrationTests.swift` : attendu du balayage →
      `Set<String>()`, test renommé `test_noNavigationViewRemains`, en-tête de
      suite mise à jour.
- [x] Vérifier statiquement `grep -rn "NavigationView {"` sur les 3 cibles → 0.
- [x] Vérifier que le commentaire ajouté ne forme pas la sous-chaîne détectée
      (faux positif d'auto-déclenchement).
- [x] Rédiger l'analyse et ce plan.
- [x] Committer et pousser sur `claude/quirky-curie-52be0w`.

## Contraintes respectées

- 0 logique métier, 0 réseau, 0 clé i18n neuve, 0 changement de palette.
- 0 changement de rendu en largeur compacte (iPhone).
- 0 fichier neuf → 0 édition de `project.pbxproj` (XcodeGen non requis).
- Plancher iOS 16.0 → `NavigationStack` sans garde `@available`.

## Gate

CI `iOS Tests` (compile Xcode 26.1.1 / run simu iOS 18.2). Aucun toolchain Apple
dans l'environnement d'exécution de cette itération : la validation locale se
limite à la vérification statique décrite ci-dessus.
