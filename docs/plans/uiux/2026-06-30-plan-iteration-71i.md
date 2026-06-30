# Plan — Iteration 71i (2026-06-30)

## Objectif
Corriger l'i18n + l'accessibilité VoiceOver des onglets de catégorie de l'emoji picker :
ces boutons **icône-seule** annonçaient des libellés **français figés** (`rawValue`) à tous
les utilisateurs. Introduire un helper d'affichage localisé découplé de l'identité.

## Périmètre (1 fichier de prod + 1 catalogue + 1 test)
1. `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`
   - Ajouter `EmojiGridCategory.localizedName: String` (helper pur, `switch` exhaustif,
     `String(localized:defaultValue:bundle:.main)` par case).
   - Ligne 223 : `.accessibilityLabel(category.rawValue)` → `.accessibilityLabel(category.localizedName)`.
   - `rawValue` (identité/`id`/comparaison) **inchangé**.
2. `apps/ios/Meeshy/Localizable.xcstrings`
   - Ajouter 10 clés `emoji.category.{recent,smileys,people,animals,food,activities,travel,objects,symbols,flags}`.
   - Chaque clé traduite ×5 langues (`fr` source + `en`, `es`, `de`, `pt-BR`).
   - Insertion en bloc contigu, format Xcode préservé (round-trip byte-exact validé).
3. `apps/ios/MeeshyTests/Unit/Components/EmojiGridCategoryTests.swift` (nouveau)
   - Locale-résilient : non-vide pour chaque case, unicité inter-cases, `rawValue` stable,
     couverture des 10 cases.

## Étapes
- [x] Audit usages `EmojiGridCategory` (local au fichier ; `rawValue` = identité + label a11y).
- [x] Ajouter `localizedName` + brancher sur l'`accessibilityLabel`.
- [x] Ajouter les 10 clés traduites au catalogue (diff propre +350/−1, JSON valide).
- [x] Écrire `EmojiGridCategoryTests`.
- [x] Anti-repetition check (aucune itération antérieure sur cette surface).
- [ ] Commit + push branche `claude/upbeat-euler-dk3bod`.
- [ ] CI `iOS Tests` verte.
- [ ] Merge dans `main`, supprimer la branche, MAJ `branch-tracking.md`.

## Risques / mitigations
- **Risque layout** : nul — aucun changement visuel (onglets = icônes), seul le label
  VoiceOver et son contenu changent.
- **Risque identité** : nul — `rawValue` préservé, seule la couche d'affichage est ajoutée.
- **Risque CI compile** : `localizedName` est un `switch` exhaustif sur un enum `CaseIterable` ;
  le test n'importe que `@testable import Meeshy`. Auto-inclus par le globbing XcodeGen du
  target `MeeshyTests`.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x Swift 6.2 + tests simu iOS 18.2).
