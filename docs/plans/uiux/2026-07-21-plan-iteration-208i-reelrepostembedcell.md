# Plan Iteration-208i — ReelRepostEmbedCell VoiceOver caption + likes

**Date**: 2026-07-21 · **Branch**: `claude/laughing-thompson-ku262q` · **Base**: `main` `22465a5`

## Objectif
Restaurer pour VoiceOver la légende (`repost.content`) et le compteur de j'aime de
la carte réel repostée, jetés par `.accessibilityElement(children: .ignore)` +
label partiel « Réel de {auteur} » (WCAG 1.3.1, doctrine 207i). Design
bouton-unique préservé.

## Étapes
1. [x] Resync branche depuis `origin/main` HEAD.
2. [x] Audit du pattern `children: .ignore/.combine` + label écrasant → cible
   `ReelRepostEmbedCell` (absente des PR ouvertes ; peripheral).
3. [x] Helper pur `static reelCardAccessibilityLabel(for:)` (réutilise 2 clés
   existantes, 0 clé neuve).
4. [x] Rebrancher `.accessibilityLabel` sur le helper.
5. [x] 2 tests unitaires (`ReelRepostEmbedCellTests`).
6. [x] Analyse + plan docs.
7. [x] Tracking + commit + push.

## Contraintes
- iOS-only. 2 fichiers (1 prod, 1 test). 0 clé i18n neuve / 0 `.xcstrings`.
- 0 logique / 0 visuel / 0 réseau. `children: .ignore` + `.isButton` conservés.
- Gate = CI `iOS Tests` (pas de toolchain Swift sur hôte Linux).

## Différé
- `StoryRepostEmbedCell`, `repostView` générique — même audit `.ignore` + label
  partiel.
