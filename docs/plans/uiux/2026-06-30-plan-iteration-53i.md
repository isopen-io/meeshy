# Plan — Iteration 53i (2026-06-30)

## Objectif
Adopter le Liquid Glass natif iOS 26 sur la **capsule flottante du quick-reaction picker**
(`EmojiReactionPicker`, SDK `MeeshyUI`), en préservant le rendu actuel pré-iOS-26. Lot 3 de
la série Glass (51i → 52i → 53i). Borné, épuré, sans changement de comportement.

## Base de départ
- Branche : `claude/upbeat-euler-b625oe`, créée depuis `main` HEAD (resync au début).
- 52i (`MentionSuggestionPanel` + `MiniAudioPlayerBar`, commit `f777a95`) déjà mergé dans
  `main` mais son doc d'analyse/plan n'avait pas été committé et le tracking n'avait pas été
  mis à jour → corrigé dans cette itération (entrées History + Current State).

## Étapes
1. [x] Resync sur `main`, vérifier l'état réel du code (52i mergé : Mention/MiniAudio ont
       déjà `adaptiveGlass`).
2. [x] Identifier la cible propre restante : `EmojiReactionPicker.stripBackground`.
3. [x] Vérifier les 4 call-sites du picker (inline strip, overlay, story, attachment) et la
       sémantique du paramètre `style`.
4. [x] Refactor `EmojiReactionPicker.swift` :
       - `quickEmojiStrip` + `scrollableQuickEmojiStrip` : `.background(stripBackground)` →
         `.modifier(QuickReactionStripChrome(style:))`.
       - Nouveau `private struct QuickReactionStripChrome: ViewModifier` :
         iOS 26 → `.adaptiveGlass(in: Capsule())` neutre + ombre `style`-driven ;
         pré-26 → matériau/voile/liseré/ombre identiques à l'actuel (zéro régression).
       - Supprimer le computed `stripBackground` mort.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit, push `-u origin claude/upbeat-euler-b625oe`.
7. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main`, mettre à jour `branch-tracking.md`, supprimer la branche.

## Hors scope (différé volontaire)
- `EmojiFullPickerSheet.sheetBackground`, `EmojiKeyboardPanel` : surfaces de contenu, pas
  des chromes flottants (verre derrière scroll = anti-lisibilité HIG). Laissés en matériau.
- Wrapper `BubbleStandardLayout+Media` (réactions pièce jointe) : call-site, hors capsule.

## Vérification
- Pas de build SwiftUI local (Linux) → la CI `ios-tests.yml` (compile Xcode 26.1 + tests
  simu 18.2) est le gate. Le smoke test `CompatibilityLayerTests.test_adaptiveGlass_*` reste
  vert (API atome inchangée). Aucun test n'assied le rendu du strip ; comportement (onReact,
  haptique, entrée wave) inchangé.

## Risques
- `style` forcé `.dark` pré-26 sur fond clair système : couvert par le gate local (fallback
  conserve le matériau `style`-driven). iOS 26 : verre échantillonne le contenu → OK partout.
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
iOS only. **Adoption native iOS 26 Liquid Glass — lot 3** sur les **3 surfaces flottantes
sœurs de la couche `CallEffectsOverlay`** (effets pendant un appel), via l'atome SDK
`adaptiveGlass`. Itération bornée, « épurée » : 3 swaps 1:1 fidèles, aucune surcharge.

## Base
- Branche : `claude/upbeat-euler-8qmu0h` (resynchronisée sur `main` HEAD `a11d271`, post #1076/#1079).

## Changements

### 1. `apps/ios/.../Views/AudioEffectsPanel.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))`
      avant le `.clipShape(...)` existant. Neutre (chrome OS). Doc-comment inline.

### 2. `apps/ios/.../Views/VideoFiltersPanel.swift` (app)
- [x] Idem panneau parent. **`VideoFilterControlView` imbriqué laissé en `.ultraThinMaterial`**
      (matériau-sur-verre HIG ; jamais verre-dans-verre). Doc-comment inline.

### 3. `apps/ios/.../Views/CallEffectsOverlay.swift` (app — `secondaryToolbar`)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` avant le
      `.clipShape(Capsule())` existant (1:1 `FloatingCallPillView`/`MiniAudioPlayerBar`).
      Doc-comment inline.

## Vérification
- [x] Les 3 fichiers importent déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `VideoFilterControlView` n'est utilisé qu'au sein de `VideoFiltersPanel` (grep) →
      pas de régression de migration partielle.
- [x] 0 `ultraThinMaterial` résiduel hors commentaires dans les 3 fichiers.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
</content>
