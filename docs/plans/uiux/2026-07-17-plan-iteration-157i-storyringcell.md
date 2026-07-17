# Plan — Iteration-157i — `StoryRingCell` VoiceOver actionability

**Date** : 2026-07-17 · **Branche** : `claude/laughing-thompson-vgt9db` · **Base** : `origin/main` HEAD `f9b7a78`

## Objectif

Rendre la cellule de story de la tray (`StoryRingCell`, atome partagé grande +
compacte) réellement actionnable et lisible sous VoiceOver.

## Étapes

- [x] Sync `main`, resync branche désignée (commit précédent mergé via #2003).
- [x] Repérer cible non réclamée par l'essaim (fleet en vol jusqu'à 156i,
      PRs 140i→156i) → `StoryRingCell` libre.
- [x] Confirmer le gap : `MeeshyAvatar` expose déjà `label=name`, `Text` nom en
      double, `.onTapGesture` racine non exposé, état non-lu couleur-only.
- [x] Ajouter `accessibilityLabelText` (username + état lu/non-lu).
- [x] Ajouter `.accessibilityElement(.combine)` + `.accessibilityLabel` +
      `.accessibilityAddTraits(.isButton)` + `.accessibilityHint`.
- [x] Ajouter 3 clés i18n `.a11y` (unread/read/open) × 5 langues, insertion
      chirurgicale dans `Localizable.xcstrings`.
- [x] Revue statique (pas de toolchain macOS local → gate CI `iOS Tests`).
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + (option) PR.

## Non-goals

- Aucune migration typographique (les 5 `.system(size:)` de `StoryTrayView` sont
  des glyphes en cercles fixes, figés & commentés doctrine 86i — soldé).
- Aucun changement de logique / layout / couleur visuelle.

## Base de départ 158i

`main` HEAD après merge 157i. Cibles a11y restantes candidates (vérifier
collision essaim) : `FeedView` (7 `.system(size:)`), `ReelsPlayerView` (6),
`FeedCommentsSheet` (5), `AttachmentLoadingTile` (5), `StoryViewerView+Sidebar` (4).
