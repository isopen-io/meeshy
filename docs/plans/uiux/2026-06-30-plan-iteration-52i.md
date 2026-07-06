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
# Plan — Iteration 52i (2026-06-30) — iOS Liquid Glass : surfaces flottantes content-agnostic (consolidé)

> **Note de consolidation (réconciliation 53i)** : deux agents iOS parallèles ont produit un
> « 52i » se chevauchant (`MentionSuggestionPanel`). Le merge a concaténé ce fichier et gardé
> silencieusement une version teintée du panneau de mentions, contredisant la décision
> documentée « neutre, pas de teinte ». Ce fichier est la version consolidée ; la divergence
> de teinte a été corrigée en 53i (voir `2026-06-30-plan-iteration-53i.md`).

## Objectif
iOS only. **Adoption native iOS 26 Liquid Glass** sur des surfaces flottantes
content-agnostic via l'atome SDK `adaptiveGlass` (établi 51i). Itération bornée, « épurée » :
swaps 1:1 fidèles, aucune surcharge.

## Surfaces livrées (mergées : #1075 + #1083)
1. `apps/ios/.../Components/MentionSuggestionPanel.swift` — barre d'autocomplétion `@mention`
   flottant au-dessus du composer : `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Rectangle())`.
   **Neutre, sans teinte** (chrome d'assistance saisie, comme la QuickType bar — une barre
   teintée accent lirait comme du contenu). Clip-shape vérifiée : aucune → `Rectangle()`.
   Skeleton rows marquées `.accessibilityHidden(true)` (décoratives).
2. `apps/ios/.../Components/MiniAudioPlayerBar.swift` — mini-lecteur capsule flottant :
   `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` avant le
   `.clipShape(Capsule())` existant (1:1 avec `FloatingCallPillView`, HIG glass-in-glass).
3. `apps/ios/.../Components/LocationPickerView.swift` — dropdown de résultats de recherche
   de lieu (flotte au-dessus de la carte) : `RoundedRectangle.fill(.ultraThinMaterial).shadow`
   → `.adaptiveGlass(in: RoundedRectangle(12))` + `.shadow` aval. **Neutre** (même famille
   « dropdown de suggestion = chrome » que le panneau de mentions).

## Règle de teinte dégagée (canonique)
- **Surface chrome d'assistance / suggestion flottante** (autocomplétion, dropdown de
  recherche, mini-lecteur) → glass **neutre** (pas de teinte accent).
- **Surface agissant sur un contenu précis** (menu long-press d'un message — `ContextActionMenu`,
  51i) → glass **teinté accent** de la conversation.

## Vérification
- Les fichiers importent déjà `MeeshyUI` (où vit `adaptiveGlass` + `Color(hex:)`).
- Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- Tests `MiniAudioPlayerBarTests` comportementaux inchangés.
- Gate = CI `ios-tests.yml` (compile Xcode 26.1.x — pas de build local Linux).

## Différés → 53i+
- `MessageOverlayMenu` (reaction picker, vérifier glass-in-glass), `MessageInfoSheet`,
  `InviteFriendsSheet`, `StatusBubbleOverlay`, `CallEffectsOverlay` toolbar pill,
  `GlobalSearchView` (famille recherche). Puis ladder catégoriel arc-en-ciel + grandes
  surfaces polices figées.
