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
> **Renuméroté de 53i → 54i** après merge (PR #1089) pour résoudre une collision de label
> avec l'itération Liquid Glass `EmojiReactionPicker` (PR #1087, mergée en premier sous 53i).
> Le code est déjà dans `main` ; ce suivi ne corrige que les docs/ledger.

## Objectif
iOS only. **Accessibilité Dynamic Type** : migrer les `.font(.system(size:))` figés de
`GlobalSearchView` (surface de recherche primaire, jamais traitée) vers l'atome
`MeeshyFont.relative(...)` pour que le texte scale avec le réglage Dynamic Type.
Itération bornée, « épurée » : 1 fichier, swaps mécaniques 1:1, aucune surcharge ajoutée.

## Base
- Branche : `claude/upbeat-euler-891xaa` (resynchronisée sur `main` HEAD `6a2a8f6`, post #1075 / iter 52i).

## Changements

### `apps/ios/.../Views/GlobalSearchView.swift` (app)
- [x] 31 × `.font(.system(size: N, weight:))` → `.font(MeeshyFont.relative(N, weight:))`
      (header, onglets, états, lignes messages/conversations/utilisateurs, run surligné
      `AttributedString`, `ConversationTitleLabel(font:)`, libellés `lastMessage` *italic*).
- [x] 2 badges numériques laissés figés avec commentaire d'exception inline (badge onglet
      `size:9` à offset absolu ; badge non-lus `size:11` capsule compacte).

## Vérification
- [x] Le fichier importe déjà `MeeshyUI` (où vit `MeeshyFont.relative`).
- [x] Aucun label/hint a11y modifié (migration police uniquement).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] Grep de clôture : 2 `.font(.system(size:))` restants = les 2 badges documentés.
- [x] CI `ios-tests.yml` verte → PR #1089 mergée dans `main`.

## Suivi de-collision (cette PR)
- [x] Restaurer `2026-06-30-iteration-53i.md` / `plan-iteration-53i.md` au contenu canonique
      #1087 (EmojiReactionPicker) — retirer le contenu GlobalSearchView concaténé par le merge.
- [x] Recréer le contenu GlobalSearchView sous `2026-06-30-iteration-54i.md` / ce plan.
- [x] `branch-tracking.md` : ligne 53i = #1087 ✅ ; nouvelle ligne 54i = #1089 ✅ (GlobalSearchView).
- [ ] Commit + push, PR de suivi, merge dans `main`.
</content>
Accessibilité Dynamic Type : migrer la plus grosse surface iOS encore figée,
`ConversationInfoSheet` (fiche d'information de conversation), des `.font(.system(size:))`
codées en dur vers l'atome SDK `MeeshyFont.relative(...)`. Poursuite de 53i (`GlobalSearchView`).

## Périmètre
- **1 fichier** : `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`.
- iOS exclusivement (suffixe `i`). Aucune dépendance web/Android.

## Étapes
1. [x] Resync branche de travail sur `main` HEAD (53i déjà mergée → main `0d3498b`).
2. [x] Inventaire : 52 `.font(.system(size:))` figés, 0 `MeeshyFont.relative`.
3. [x] Swap mécanique 1:1 `.system(size: N, …)` → `MeeshyFont.relative(N, …)` (51 sites).
4. [x] Exception documentée inline : badge numérique de comptage d'onglet (`size:10`) gardé
       figé (pill compacte) — même classe que les exceptions 53i.
5. [x] Vérifs statiques : 51 `MeeshyFont.relative`, 1 figé restant, aucun double-paren,
       atome `MeeshyFont` exposé par MeeshyUI (déjà importé).
6. [x] Rédiger analyse `2026-06-30-iteration-54i.md` + ce plan.
7. [ ] Commit + push sur la branche assignée.
8. [ ] PR → attendre CI `iOS Tests` verte → merge dans `main`.
9. [ ] Mettre à jour `branch-tracking.md` (53i mergée, pointeur 54i, base 55i = main HEAD).
10. [ ] Supprimer la branche après merge.

## Vérification
- CI `ios-tests.yml` : compile Xcode 26.1.x (XcodeGen regen) + tests simulateur 18.2.
- Aucun changement de comportement attendu : swaps police uniquement, layout/couleur/a11y
  labels inchangés.

## Risques / mitigations
- Risque : régression visuelle si une taille mappe vers un TextStyle inattendu. Mitigation :
  mapping identique à 53i/`textStyle(for:)`, déjà éprouvé en prod sur d'autres surfaces.
- Risque : overflow d'un badge compact. Mitigation : seul badge numérique en pastille gardé figé.
