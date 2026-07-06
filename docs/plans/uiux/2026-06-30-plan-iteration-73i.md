# Plan — Iteration 73i (2026-06-30)

## Objectif
iOS uniquement. Éliminer les **littéraux français codés en dur** dans les modificateurs
d'accessibilité (`accessibilityLabel`/`accessibilityHint`) — rupture Prisme + bug VoiceOver
(français annoncé à tous les utilisateurs). + Débloquer la compile iOS de `main` (code mort
`ReplyThreadOverlay`).

## Base de départ
`main` HEAD `a7eadac` (post #1136). Branche : `claude/upbeat-euler-fymio6` (resync sur `main`).

## Étapes
1. [x] Vérifier les PR iOS en vol (#1137 71i Dynamic Type 2FA, #1139 72i Dynamic Type comments)
   → choisir une surface orthogonale (i18n a11y littéraux).
2. [x] Confirmer la rupture de compile `main` : `ReplyThreadOverlay.swift:98` appelle
   `ReplyThreadLoader()` (type supprimé par 69i `7d26cd91`, jamais redéfini).
3. [x] Sweep complet des littéraux FR a11y → 7 sites / 6 fichiers.
4. [x] Convertir chaque littéral → `String(localized: "<clé>", defaultValue: "<EN>", bundle: .main)`
   (defaultValue anglais aligné sur les libellés frères du même contrôle). Hint de durée audio
   via `String(format:)`.
5. [x] Supprimer la vue morte `ReplyThreadOverlay.swift` (`git rm`) — pbxproj non édité
   (XcodeGen régénère par globbing en CI). Aucune référence externe/test restante.
6. [x] Docs analyse + plan + `branch-tracking.md`.
7. [ ] Commit, push `claude/upbeat-euler-fymio6`, ouvrir PR.
8. [ ] CI `iOS Tests` verte → merge dans `main`. Supprimer la branche après merge.

## Fichiers touchés (code)
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (hint blur-reveal)
- `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift` (label graphe)
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (hint navigation)
- `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift` (hint ouverture)
- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift` (2 hints)
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` (label play/pause + hint durée)
- **SUPPRIMÉ** : `apps/ios/Meeshy/Features/Main/Views/ReplyThreadOverlay.swift` (code mort, déblocage CI)

## Clés introduites (defaultValue EN, extractibles catalog)
`bubble.content.reveal.hint`, `stats.timeline.chart.a11y`, `story.viewer.navigation.hint`,
`story.repost.open.hint`, `composer.recording.cancel.hint`,
`composer.recording.stopAndAttach.hint`, `audio.pause`, `audio.play`, `audio.duration.hint`.

## Non-objectifs (explicitement hors périmètre)
- **Pas d'édition du String Catalog** (les clés sœurs des contrôles touchés n'y sont pas non plus
  → population uniforme du namespace a11y = itération dédiée). Voir Différés de l'analyse.
- Pas de changement de layout/Dynamic Type/glass/palette (orthogonal aux PR en vol).

## Gate
CI `iOS Tests` (compile Xcode 26.1.x + tests simulateur 18.2). SwiftUI ne compile pas sous Linux.
La suppression de code mort est couverte par la compile (déblocage). Sweep a11y = pas de test
unitaire isolable (parité 57i `InviteFriendsSheet`).
