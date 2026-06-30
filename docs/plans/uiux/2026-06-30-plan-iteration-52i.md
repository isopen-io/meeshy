# Plan — Iteration 52i (2026-06-30) — iOS only

## Objectif
Poursuivre l'adoption Liquid Glass iOS 26 sur le chrome flottant, surface
`MentionSuggestionPanel` (différé 51i), + corriger l'exposition VoiceOver de son squelette.
Borné, épuré, orthogonal aux PR web/android en vol.

## Base de départ
`main` HEAD `769f55a` (resync de la branche `claude/upbeat-euler-q436x8` sur `origin/main`
avant de commencer — voir `branch-tracking.md`).

## Étapes
- [x] Resync branche sur `origin/main` HEAD.
- [x] Audit des candidats verre différés (51i) : `MentionSuggestionPanel`, `ContactCardView`,
      `LocationPickerView`. Choix `MentionSuggestionPanel` (clip-shape simple : panneau
      épinglé au-dessus du composer → coins hauts arrondis).
- [x] Vérifier l'API `adaptiveGlass(in:tint:)` + son fallback (façonné, clip OK).
- [x] Vérifier les 2 call-sites (`FeedCommentsSheet`, `PostDetailView`) : panneau full-width
      pinné au top du composer → `UnevenRoundedRectangle` top-rounded.
- [x] `.background(.ultraThinMaterial)` → `.clipShape(panelShape) + .adaptiveGlass(in: panelShape)`
      (neutre, non teinté : surface de lecture).
- [x] Squelette `mentionSkeletonRows` : `.accessibilityElement(children: .ignore)` +
      `accessibilityLabel` localisé `composer.mention.loading` (secours natif).
- [x] Vérifier qu'aucun test n'asserte `.ultraThinMaterial` / le panneau (aucun).
- [x] Rédiger analyse + plan + mettre à jour `branch-tracking.md`.
- [ ] Commit + push sur `claude/upbeat-euler-q436x8`.
- [ ] Ouvrir PR ; attendre CI `iOS Tests` verte (compile = build gate, pas de build Linux).
- [ ] Merger dans `main` ; mettre à jour `branch-tracking.md` (pointeur 52i mergé).

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift` (prod, ~+20 lignes).
- `docs/analyses/uiux/2026-06-30-iteration-52i.md`, `docs/plans/uiux/2026-06-30-plan-iteration-52i.md`,
  `docs/plans/uiux/branch-tracking.md`.

## Vérification
- CI `ios-tests.yml` : `xcodegen generate` + compile Xcode 26.1.x (gate). `UnevenRoundedRectangle`
  iOS 16+, `adaptiveGlass` exporté par MeeshyUI (déjà importé) → compile attendue.
- Pas de test neuf : swap visuel sans logique testable (cf. 51i). Les tests existants restent verts
  (aucun n'asserte cette surface).

## Risque / rollback
Diff confiné à 1 composant. Rollback = restaurer `.background(.ultraThinMaterial)`.
