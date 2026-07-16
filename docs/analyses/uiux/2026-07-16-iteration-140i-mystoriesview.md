# Itération 140i — Analyse UI/UX iOS : `MyStoriesView`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
**Base** : `main` HEAD
**Branche** : `claude/laughing-thompson-yagq11`
**Gate** : CI `iOS Tests`

## Contexte

`MyStoriesView` est l'écran « Mes stories » (liste des stories publiées par l'utilisateur, avec
sélection multiple, suppression groupée, swipe-to-delete, context menu, export). Chaque rangée
(`MyStoryRow`) = vignette + `timeAgo` + 3 métriques (vues / réactions / commentaires) + affordance
`ellipsis`. Surface **fraîche** : 6 `.font(.system(size:))`, **0** `MeeshyFont.relative`, 0 commentaire
doctrine. Numéro **140i** (139i = `MentionSuggestionPanel` soldé ; le lot des fichiers frais à 6
`.system` est entamé — `MyStoriesView` en fait partie).

## Constat (avant 140i)

**6 `.font(.system(size:))`** — aucun cadre de dimension fixe (aucune `.frame(width:height:)` figée autour
d'un des libellés) :
- `bulkDeleteBar` — texte du bouton « Supprimer (N) » (15 semibold) ;
- `timeAgo` — libellé temps de la rangée (15 semibold) ;
- `ellipsis` — glyphe SF Symbol, indice visuel du menu (16 semibold) ;
- `selectionCircle` — glyphe checkmark/circle de sélection (22) ;
- `metric` icon — glyphe SF Symbol (eye/heart/bubble, 11) ;
- `metric` value — compteur numérique (13 medium).

**Lacune VoiceOver réelle** : `MyStoryRow` n'avait **aucun** libellé d'accessibilité regroupé. Les 3
métriques sont des glyphes SF Symbol **décoratifs** (`eye.fill`/`heart.fill`/`bubble.left.fill`) sans
label ; lues une par une, VoiceOver annonçait des fragments ambigus (« il y a 2 h, 5, 3, 2 ») sans dire
ce que chaque nombre représente. Seule la trait `.isSelected` était transmise.

## Corrections appliquées (1 fichier, 0 logique)

- **6/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) : les 2 vrais libellés
  texte (bouton bulk-delete, `timeAgo`) et le compteur de métrique scalent désormais sous Dynamic Type ;
  les 3 glyphes SF Symbol (ellipsis, cercle de sélection, icône de métrique) scalent aussi, en cohérence
  avec le texte adjacent. **Aucun gel** : aucune de ces vues n'a de cadre de dimension fixe.
- **VoiceOver — rangée en 1 seul élément** : `MyStoryRow` devient
  `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(accessibilityDescription)` — un
  libellé unique explicite « Story <timeAgo>, <N> vues, <N> réactions, <N> commentaires » (nouvelle clé
  i18n `story.mine.row.a11y`, format positionnel `%1$@…%4$@`, localization-ready). La trait `.isSelected`
  conditionnelle est **préservée**. Les glyphes décoratifs (dont ellipsis) sont désormais couverts par le
  `children: .ignore` — plus de fragments ambigus lus par VoiceOver.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf. `import MeeshyUI` déjà présent.
  Palette déjà tokenisée (`MeeshyColors.indigo950`/`.error`, `.secondary`, `accentColor`) → **0 swap**.
- **1 clé i18n neuve** (`story.mine.row.a11y`) — libellé VoiceOver positionnel, aucune chaîne visible
  neuve.
- Les 3 suites existantes (`MyStoriesCreateStoryGuardTests`, `StoryTrayMyStoryTapGuardTests`,
  `MyStoriesBulkDeleteGuardTests`) testent la **logique** (guards create/tap/bulk-delete) — non touchée.
  Aucune régression de test.

## Statut

**TERMINÉE** — `MyStoriesView` Dynamic Type + VoiceOver soldés (6/6 `.system` → `relative` ; rangée en
1 élément VoiceOver avec libellé métriques explicite ; trait `.isSelected` préservée). Ne plus re-flagger
cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MyStoriesView` — 6/6 `.font(.system(size:))` → `MeeshyFont.relative` (2 libellés texte + compteur +
  3 glyphes SF Symbol, aucun gel) ; VoiceOver = rangée `children: .ignore` + libellé unique
  « Story <timeAgo>, N vues, N réactions, N commentaires » (clé `story.mine.row.a11y`), trait
  `.isSelected` préservée ; palette tokenisée 0 swap ; 1 clé i18n neuve. **SOLDÉ 140i.**
