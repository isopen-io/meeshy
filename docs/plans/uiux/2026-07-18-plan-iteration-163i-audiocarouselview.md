# Plan Itération 163i — `AudioCarouselView` (Dynamic Type + VoiceOver)

**Date** : 2026-07-18 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `12bf80a`
**Branche** : `claude/laughing-thompson-rqaav8` · **Gate** : CI `iOS Tests`

## Objectif
Solder Dynamic Type + VoiceOver sur l'indicateur de page de `AudioCarouselView` (carrousel multi-pistes
audio d'une bulle), sans toucher la logique de paging/lecture.

## Étapes
1. [x] Repérer la surface fraîche (0 mention tracking, 0 contention PR ouverte).
2. [x] Migrer `.font(.system(size: 12, weight: .bold, design: .monospaced))` du compteur → `MeeshyFont.relative(...)`.
3. [x] Envelopper les deux variantes de l'indicateur (points ≤ 7 / compteur > 7) dans un `Group` portant
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel` « Piste X sur Y »
   (clé `bubble.audio.carousel.position`).
4. [x] Vérifier : 0 `.font(.system(size:))` restant, palette intacte, 0 logique modifiée.
5. [x] Analyse + tracking + commit + push + PR.

## Périmètre
1 fichier · 0 logique · 0 test neuf · 1 clé i18n (auto-extraite String Catalog). Gate = CI `iOS Tests`
(compile Xcode 26.1.1 / run simu iOS 18.2).
