# Plan — Iteration 71i (2026-06-30)

## Objectif
iOS exclusivement. Localiser **6 labels/hints VoiceOver figés en français** (bug Prisme +
a11y) via le pattern `String(localized:defaultValue:bundle:.main)` + entrées String Catalog
×5 langues. Swap d'i18n pur, aucune logique modifiée.

## Base de départ
`main` HEAD `bd7074cc` (resync effectué ; branche `claude/upbeat-euler-0qokek` recréée depuis
`origin/main`).

## Étapes
1. **[FAIT]** Audit `grep accessibility(Label|Hint|Value)("…")` filtré FR (accents + mots FR) →
   6 occurrences sur 5 fichiers (les autres sont déjà `String(localized:)` ou décoratifs).
2. **[FAIT]** Swap des 6 littéraux → `String(localized: "<clé>", defaultValue: "<FR accentué>",
   bundle: .main)` :
   - `BubbleStandardLayout.swift:471` → `bubble.content.hidden.hint`
   - `StatsTimelineChart.swift:54` → `stats.timeline.chart.a11y`
   - `StoryViewerView+Canvas.swift:91` → `story.viewer.navigation.hint`
   - `StoryRepostEmbedCell.swift:38` → `story.repost.open.hint`
   - `UniversalComposerBar+Recording.swift:135` → `composer.recording.cancel.hint`
   - `UniversalComposerBar+Recording.swift:194` → `composer.recording.stopAndAttach.hint`
3. **[FAIT]** Ajout des 6 clés dans `Meeshy/Localizable.xcstrings` (de/en/es/fr/pt-BR,
   `state: translated`, format Xcode `" : "` préservé, insertion triée → 210 lignes pure
   addition). Validité JSON vérifiée (`json.load`, 991 clés).
4. **[FAIT]** Docs analyse + plan 71i ; pointeur autoritaire iOS + ligne tracking MAJ.
5. **[EN COURS]** Commit, push `claude/upbeat-euler-0qokek`, PR, attendre CI `iOS Tests`,
   merger dans `main`.

## Vérification
- Gate = CI `iOS Tests` (compile Xcode 26.1.x + tests simu 18.2). Pas de SwiftUI sous Linux.
- Pas de test neuf : swap i18n pur sans fonction testable (précédent 56i/57i « 0 test neuf »).
- Catalog : JSON valide, 6 clés ×5 langues, diff = additions seules.

## Risques / non-régression
- `String(localized:defaultValue:bundle:)` = API Foundation déjà utilisée dans les 5 fichiers
  (labels adjacents) → aucun import neuf, aucun risque de compile.
- FR : seules les valeurs gagnent leurs accents manquants (amélioration, pas régression).
- Ordre des clés catalog : insertion alphabétique ; même si Xcode re-trie à la prochaine
  édition manuelle, sans impact build/runtime.

## Statut : ⏳ push + CI → merge main
