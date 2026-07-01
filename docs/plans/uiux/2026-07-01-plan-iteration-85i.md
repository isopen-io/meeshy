# Plan — Iteration 85i (2026-07-01) — iOS

## Objectif
Combler le gap a11y VoiceOver de sélection sur le picker de langue du Prisme Linguistique
(`ProfileLanguagePickerSheet`) + corriger 2 clés i18n référencées-mais-absentes du catalogue.

## Base
- Branche : `claude/upbeat-euler-814s32` resync sur `main` HEAD (`git checkout -B ... origin/main`).
- Gate : CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2).

## Étapes
1. [x] Vérifier les PRs ouvertes (`list_pull_requests`) → choisir surface orthogonale non prise.
2. [x] `LanguagePickerSheet.swift` — `clearRow` : label localisé + trait `.isSelected` conditionnel.
3. [x] `LanguagePickerSheet.swift` — `languageRow` : label `verbatim` (nativeName, name) sans
       drapeau + trait `.isSelected` + hint conditionnel.
4. [x] `Localizable.xcstrings` — insertion chirurgicale de `language-picker.none`,
       `.search`, `.select.hint` (×5 langues, format Xcode exact, 0 suppression).
5. [x] Valider JSON + diff minimal (112 insertions).
6. [ ] Commit + push branche.
7. [ ] Attendre CI verte → merge dans `main`.
8. [ ] Mettre à jour `branch-tracking.md` (pointeur iOS → 85i) + supprimer la branche mergée.

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift` (+7 lignes)
- `apps/ios/Meeshy/Localizable.xcstrings` (+105 lignes, 3 clés ×5 langues)

## Risques / mitigations
- **Contention xcstrings** (~10 agents parallèles) : insertion textuelle ancrée sur
  `"Langue regionale"`, namespace `language-picker.*` unique → risque de conflit minimal.
  L'ordre des clés JSON n'affecte pas la compile (Xcode re-trie sans casser).
- **SwiftUI non compilable sous Linux** : validation par CI uniquement (doctrine établie).

## Suite (différés 86i+)
- Répliquer le gabarit `.accessibilityAddTraits(.isSelected)` sur les autres pickers à
  checkmark (`PostTranslationSheet`, onglet Language `MessageDetailSheet`, `SharePickerView`).
- Dynamic Type grandes surfaces restantes (`CallView`, `StoryViewerView+Content`).
- Glass adoption (`MessageOverlayMenu` — lot dédié `AdaptiveGlassContainer`).
</content>
