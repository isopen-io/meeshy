# Plan — Iteration 54i (2026-06-30)

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
