# Plan — Iteration 54i (2026-06-30)

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
</content>
iOS only. Épuration palette : consolider les teintes sémantiques « flat-UI » hors-charte
(`#2ECC71`, `#3498DB`, `#27AE60`) vers les tokens `MeeshyColors` (Single Source of Truth).
Itération bornée, « logique épurée », swap de tokens pur (zéro changement de comportement).
Continuité directe du différé « palette tokens » de 53i.

## Base
- Branche : `claude/upbeat-euler-1zicez` (resynchronisée sur `main` HEAD post-#1088).

## Changements

### 1. `apps/ios/.../Components/ContactCardView.swift`
- [x] Icône téléphone : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
- [x] Icône e-mail : `Color(hex: "3498DB")` → `MeeshyColors.info`.

### 2. `apps/ios/.../Views/AffiliateView.swift`
- [x] Bouton partager : `Color(hex: "2ECC71")` → `MeeshyColors.success` (paire cohérente avec
      le bouton supprimer adjacent déjà en `MeeshyColors.error`).

### 3. `apps/ios/.../Views/FeedView+Attachments.swift`
- [x] Dégradé vignette localisation : `[Color(hex: "2ECC71"), Color(hex: "27AE60")]` →
      `[MeeshyColors.success, MeeshyColors.successDeep]` (cohérence avec le bouton position
      du même composer, déjà en `MeeshyColors.success`).

### Exclus délibérément
- [x] Ladder catégoriel composer (emoji `#F8B500`, fichier `#9B59B6`) : **non touché** —
      couleurs par catégorie, décision de charte unique (différé).

## Vérification
- [x] `grep` : 0 occurrence résiduelle de `2ECC71`/`3498DB`/`27AE60` dans `apps/ios/Meeshy/`.
- [x] `MeeshyColors` accessible via `import MeeshySDK` (`@_exported MeeshyUI`) — déjà utilisé
      dans AffiliateView (`.error`) et FeedView+Attachments (`.success`).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build.

## Merge
- [ ] Push `claude/upbeat-euler-1zicez`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 55i = main post-merge 54i).
