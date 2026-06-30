# Plan — Iteration 53i (2026-06-30)

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
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
</content>
