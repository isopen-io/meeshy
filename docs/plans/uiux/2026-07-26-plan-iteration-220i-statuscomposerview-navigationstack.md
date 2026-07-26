# Plan — Iteration 220i · StatusComposerView : dernier `NavigationView` + a11y du bouton Publier

**Date** : 2026-07-26
**Branche** : `claude/quirky-curie-v9zcp4` (resync depuis `origin/main` HEAD `ffef133`)
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposerview-navigationstack.md`

## Objectif

Solder le **dernier** `NavigationView` des cibles iOS compilées et réparer les deux
défauts VoiceOver du bouton d'action primaire du composeur d'humeur.

## Étapes

- [x] Resync `claude/quirky-curie-v9zcp4` sur `origin/main` HEAD `ffef133` (branche était
      137 commits en retard, 0 en avance → reset sans perte)
- [x] Re-vérifier les 5 pistes du pointeur 219i **contre `main` courant** (dépôt très
      mouvant : 6 PR iOS mergées depuis la rédaction du pointeur)
- [x] Écarter `TrackingLinkDetailView` (soldée par #2325), `StoryViewerView+Content`
      (surface story = 26/30 derniers commits iOS), `MeeshyShareExtension` (target **non
      embarqué** — `project.yml:151`, signature en attente → valeur utilisateur nulle)
- [x] **RED** : vérifier mécaniquement que les 6 assertions échouent contre `main`
- [x] `NavigationView {` → `NavigationStack {` (`StatusComposerView.swift:37`)
- [x] `.accessibilityLabel` + `.accessibilityValue` ternaire sur `publishToolbarButton`
      (patron `FeedView.swift:1266-1274`, label = clé du titre visible)
- [x] `NavigationContainerMigrationTests` : ajouter l'assertion positive
      `test_statusComposerView_usesNavigationStack`, réduire l'attendu du balayage à
      l'ensemble vide, renommer le test en `test_noNavigationViewRemains`
- [x] Suite neuve `StatusComposerAccessibilityTests` (4 tests / 6 assertions,
      source-introspection, fenêtre d'ancrage **mesurée** à 900 pour une portée de 731)
- [x] **GREEN** : 6/6 assertions vertes sur la branche
- [x] Balayage du prédicat `filesUsingDeprecatedContainer()` sur les 3 cibles → 0 offender
- [x] Tokenizer accolades / parenthèses / crochets sur les 3 fichiers → 0/0/0
- [x] Documenter analyse + plan, mettre à jour `branch-tracking.md`
- [x] Commit + push sur la branche assignée
- [ ] PR : **impossible depuis cette session** (ni MCP GitHub ni `gh` disponibles) —
      la branche est poussée, l'ouverture de PR revient au mainteneur ou à l'automation

## Contraintes respectées

- **0 édition de `Localizable.xcstrings`** — 2 clés inline `status.composer.*`
  (convention du fichier : ses 8 clés existantes n'ont aucune entrée catalogue),
  label réutilisant la clé du titre visible.
- **0 édition de `project.pbxproj`** — le fichier de test neuf est capté par le globbing
  récursif de `xcodegen generate`, que la CI lance avant de builder.
- **0 logique métier / 0 réseau / 0 layout / 0 changement visuel iPhone** — en largeur
  compacte `NavigationView` se rendait déjà comme une pile ; la correction ne se voit
  qu'en largeur regular, là où le rendu était cassé.
- **Pas de `@available`** — plancher iOS 16.0, `NavigationStack` disponible
  inconditionnellement.

## Gate

CI `iOS Tests` (environnement Linux sans toolchain Xcode ; fourchette normale du dépôt
22–35 min, ne pas conclure au blocage avant 35 min).
