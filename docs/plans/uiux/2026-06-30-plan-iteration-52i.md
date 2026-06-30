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
