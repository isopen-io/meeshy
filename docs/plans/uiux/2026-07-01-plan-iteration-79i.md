# Plan — Iteration 79i (2026-07-01) — iOS complétude i18n lecteur de stories + palette co-localisée

## Objectif
Combler l'écart i18n du lecteur de stories : 8 clés `story.viewer.*` référencées en code mais
absentes du catalogue (affichées en français partout) + 1 bannière française figée non localisée,
et tokeniser la couleur d'erreur co-localisée.

## Base de départ
`main` HEAD `5967e2f` (post-#1167, resync avant démarrage ; branche `claude/upbeat-euler-zx9fwo`).
Piste iOS = 79i (78i = #1166 palette lot 2 ; 77i = #1162 i18n `SharePickerView`).

## Étapes
1. [x] Auditer les `String(localized: "story.viewer.…")` du fichier et vérifier leur absence du
   catalogue (`grep -c` = 0 pour les 8 clés).
2. [x] Vérifier `MeeshyColors.error` = `Color(hex: "F87171")` (`MeeshyColors.swift:44`) et l'import
   `MeeshyUI` du fichier.
3. [x] Code `StoryViewerView+Content.swift` :
   - Ligne 1221 : `Text("Story expirée — …")` → `Text(String(localized: "story.viewer.expiredBanner",
     defaultValue: "…", bundle: .main))`.
   - Ligne 1230 : `Color(hex: "F87171").opacity(0.32)` → `MeeshyColors.error.opacity(0.32)`.
4. [x] Catalogue `Localizable.xcstrings` : insérer 9 clés (`story.viewer.a11y.percent`,
   `.a11y.position`, `.a11y.storyText`, `.comments.beFirst`, `.comments.empty`, `.expiredBanner`,
   `.reply`, `.views.title`, `.viewsCount`) ×5 langues (de/en/es/fr/pt-BR), à la position
   alphabétique case-insensitive (entre `story.preview.username` et `Suggestions disponibles`),
   format Xcode exact (` : `, indent 2, sans `extractionState`). Interpolations : `%@`, `%lld`,
   `%1$lld`/`%2$lld`. → **diff pure-insertion 306 lignes, 0 suppression, JSON valide**.
5. [ ] Commit + push branche ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
6. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **Specifiers d'interpolation** : les `defaultValue` interpolés du code (`\(content)`,
  `\(viewers.count)`, `\(currentIndex+1) … \(count)`, `\(Int(progress*100))`) sont compilés en
  `%@`/`%lld`/`%1$lld %2$lld`. Les valeurs catalogue les reprennent à l'identique → substitution
  positionnelle correcte, aucun crash de format.
- **Ordre des args `a11y.position`** : index (`%1$lld`) puis total (`%2$lld`), conforme à l'ordre
  du code (`currentIndex + 1` puis `group?.stories.count`).
- **Insertion catalogue** : diff strictement additif (pas de réécriture/tri global du fichier),
  validé `json.load` OK.
- **Palette** : swap `Color(hex:"F87171")` → `MeeshyColors.error` à valeur **identique** — aucun
  changement visuel, aucune régression dark/light. Import `MeeshyUI` déjà présent.
- Pas de test neuf : ajout de données de traduction + swaps mécaniques ; couverture = compile CI.

## Vérification finale
- [x] `grep` : les 9 clés `story.viewer.*` présentes dans `Localizable.xcstrings` (5 langues chacune).
- [x] `grep` : plus de littéral français figé ni de `Color(hex: "F87171")` dans le fichier.
- [x] JSON catalogue valide.
- [ ] CI `ios-tests.yml` verte.
