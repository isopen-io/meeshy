# Plan — Itération 90i (iOS)

**Date** : 2026-07-01
**Objectif** : Dynamic Type + VoiceOver `MagicLinkView` (flux auth lien magique)
**Base** : `main` HEAD `61e9d8e0` — **branche** `claude/upbeat-euler-0er1cp`

## Étapes

1. [x] Resync sur `main` HEAD ; vérifier PRs iOS ouvertes (0 → contention nulle).
2. [x] Constater 89i pris (`EffectsPickerView` mergé) → renumérotation **90i**.
3. [x] Confirmer le helper `MeeshyFont.relative` (public ext, `MeeshyUI` importé) + `common.close` (SSOT).
4. [x] 14 swaps `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/monospacedDigit préservés).
5. [x] 3 sites figés commentés : toolbar `xmark` (chrome), héros `wand.and.stars` 56 / `envelope.open.fill` 48 (décoratifs ≥40pt).
6. [x] a11y : `.accessibilityLabel(common.close)` sur fermeture + `.accessibilityHidden(true)` sur 2 héros.
7. [x] Analyse + plan + branch-tracking.
8. [ ] Commit, push, PR ; attendre CI `iOS Tests` ; merger dans `main` ; supprimer la branche mergée.

## Périmètre

- **1 fichier** : `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`
- 0 logique / 0 clé i18n / 0 test neuf. Gate = CI `ios-tests.yml`.

## Différé prioritaire iOS 91i+

Dynamic Type grandes surfaces restantes une par itération : `NewConversationView` (17),
`DataExportView` (17), `AffiliateView` (17), `AboutView` (16, 1 seul site restant → petit),
`StoryViewerView+Content` (31, coordonner i18n #1174), `FeedCommentsSheet` (28, re-vérifier
`429ad8b7`), `ConversationView+Composer` (22, lot prudent). Puis Glass adoption reste
(`MessageOverlayMenu` via `AdaptiveGlassContainer`). **NE PAS re-flagger** `MagicLinkView`
(soldé 90i) ni ses 3 `.system(size:)` figés à dessein.
