# Plan — Iteration 57i (2026-06-30)

## Objectif
iOS only. **i18n/a11y** : localiser 3 `accessibilityLabel` figés en français dans
`InviteFriendsSheet` (+ entrées catalog ×5 langues). Bornée, **orthogonale** au storm glass
en vol (toutes surfaces glass restantes prises ou complexes — cf. analyse § Contention).

## Base
- Branche : `claude/upbeat-euler-q2nl32` (resync sur `main` HEAD `6a32e26`, post #1086/53i).

## Changements

### 1. `apps/ios/.../Components/InviteFriendsSheet.swift` (app)
- [x] L.223/310/341 : littéraux FR → `String(localized: "invite.a11y.{copyLink,shareLink,
      customizeOptions}", defaultValue: "<EN>", bundle: .main)` (pattern a11y du fichier).

### 2. `apps/ios/Meeshy/Localizable.xcstrings` (catalog)
- [x] 3 clés `invite.a11y.*` ajoutées, traduites ×5 langues (de/en/es/fr/pt-BR) ;
      `fr` = littéral d'origine exact. Format Xcode préservé (ordre + `" : "`), diff minimal.

## Vérification
- [x] JSON catalog valide ; clés présentes ×5 langues ; valeurs `fr` exactes.
- [x] `Text("·")` décoratifs laissés ; aucun test ne référence ces labels ; aucune édition pbxproj.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 54i ; **consolider le doublon de pointeur iOS**
      (lignes 39-41 périmées 52i) ; base suivante 55i = main post-merge.
