# Itération 119i — Analyse UI/UX iOS : `BubbleStandardLayout+Media`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`
**Base** : `main` HEAD (`ed63724f`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

La grille média de la bulle de message (leaf view de liste, architecture `BubbleContent`) :
pastilles de réactions par-image, overlay de débordement `+N`, badge de vue-unique, overlay de
lecture vidéo, badge de durée, overlay de flou (contenu masqué / voir une fois), carrousel
plein écran (croix + indicateur de page), cellule image placeholder. **0 PR ouverte iOS sur
cette surface** au démarrage (seule #1355 gateway ouverte) → 0 contention. Numéro **119i**
(118i = `ConversationView+MessageRow` mergé #1346).

## Constat (avant 119i)

**12 `.font(.system(size:))`** : 9 sont du **texte/label réactif** (emojis + total de réactions,
`+N` de débordement, durée, glyphe + libellés de l'overlay de flou, indicateur de page `n / m`,
glyphe placeholder photo) ; 3 sont des glyphes en **pastille/cercle de dimension fixe**
(compteur vue-unique 18×18, glyphe play du cercle de lecture 48/36, croix du carrousel 26×26).

## Corrections appliquées (1 fichier, 0 logique)

- **9/12 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : emojis de réactions (11) + total
  (9 semibold), `+N` de débordement (24 bold), badge de durée (10 semibold monospaced),
  `eye.slash.fill` + « Voir une fois »/« Contenu masqué » (16 medium / 10 semibold) + « Maintenir
  pour voir » (9), indicateur de page `n / m` (12 bold monospaced), glyphe placeholder photo (28).
- **3/12 glyphes figés** + commentaires doctrine : compteur vue-unique (9, pastille circulaire
  fixe 18×18, doctrine 86i), glyphe play (18/12, cercle de lecture fixe 48/36, doctrine 86i),
  croix du carrousel (10, cadre tap fixe 26×26, doctrine 82i).
- **`.accessibilityLabel("common.close")`** sur la croix icon-only du carrousel ;
  **`.accessibilityHidden(true)`** sur le glyphe placeholder photo (fallback décoratif de chargement).

Palette (`contactColor` déterministe, `MeeshyColors.error`, `.ultraThinMaterial`), l'overlay de
flou (`accessibilityElement(children:.combine)` + label déjà présents) et le zéro-re-render de la
leaf view déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (`common.close`, `bubble.media.*`
  déjà présentes). Aucune mutation d'état / d'`@ObservedObject` → doctrine "Zero Unnecessary
  Re-render" de la leaf view préservée.

## Statut

**TERMINÉE** — `BubbleStandardLayout+Media` Dynamic Type + a11y soldé. Ne plus re-flagger les 3
glyphes figés (compteur 18×18, play du cercle de lecture, croix carrousel 26×26).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BubbleStandardLayout+Media` — 9 sites texte/label → `relative` ; 3 glyphes figés (compteur
  vue-unique 18×18, play cercle de lecture, croix carrousel 26×26) ; label VoiceOver croix +
  masquage placeholder photo. **SOLDÉ 119i.**
