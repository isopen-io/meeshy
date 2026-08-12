# Plan — Itération 101i (iOS) : Dynamic Type + VoiceOver `TrackingLinksView`

**Base** = `main` HEAD `bb1ca52e` (post-99i mergé #1272). **Branche** : `claude/upbeat-euler-l5yima`. **Gate** : CI `iOS Tests`.

## Objectif
Rendre l'écran « Liens de tracking » conforme Dynamic Type + VoiceOver, sans changer layout, logique, palette ni i18n. Jumeau de `CommunityLinksView` (91i).

## Étapes
1. [x] Resync `main` HEAD (post-99i #1272 mergé).
2. [x] `list_pull_requests` : 87i–100i saturés sur d'autres fichiers → `TrackingLinksView` FREE → label **101i**.
3. [x] Migrer 5/7 `.font(.system(size:))` → `MeeshyFont.relative`.
4. [x] Garder 2 glyphes figés (héros 40pt + glyphe 16pt cercle 40×40) + commentaire + `.accessibilityHidden`.
5. [x] VoiceOver : `.isHeader` ×2, `.combine` stat card + état vide, `.accessibilityHidden` glyphes décoratifs.
6. [x] Docs + `branch-tracking.md`.
7. [ ] Commit + push + PR ; CI iOS verte → merge `main` (Build bun non-requis) ; supprimer la branche.

## Contraintes respectées
- 1 fichier prod, 0 logique / 0 clé i18n / 0 test neuf. SDK non touché.

## Différé
- `TrackingLinkDetailView`, `ShareLinksView` (7), `EditPostSheet` (9), `StoryTrayView` (9).
