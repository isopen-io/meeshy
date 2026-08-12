# Itération 123i — Analyse UI/UX iOS : `FeedView` (chrome)

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
**Base** : `main` HEAD (`bc59c0b6`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

L'écran de fil social (Feed) : FAB « ajouter du contenu » + toolbar du composer de publication
(photo / caméra / emoji / fichier / position / audio). **0 PR ouverte iOS sur cette surface** au
démarrage (3 PR ouvertes = calls/gateway/web + 1 fichier iOS SDK-persistence disjoint) → 0
contention. Numéro **123i** (122i = `EmojiPickerSheet` mergé #1366).

## Constat (avant 123i)

Le texte du Feed utilise déjà des styles sémantiques/`relative`. Restaient **7
`.font(.system(size:))`, toutes de la chrome / des affordances de contrôle** : 1 glyphe `plus`
du FAB dans un **cercle fixe 40×40**, et 6 glyphes d'action du composer (20pt) dans une **rangée
horizontale contrainte** (`HStack(spacing: 16)` + `Spacer`). Chaque bouton d'action porte déjà
son `.accessibilityLabel`.

*(`FeedView` = chrome d'action-bar → traité en gel documenté, comme prévu pour `FeedPostCard`
dans le pointeur de suivi.)*

## Corrections appliquées (1 fichier, 0 logique)

- **7/7 glyphes figés** + commentaires doctrine (aucune migration `relative` : ce sont des
  affordances de contrôle dans des cadres/rangées contraints, pas du texte) :
  - `plus` du FAB (18 bold, cercle fixe 40×40, doctrine 86i — ne doit pas déborder du bouton flottant) ;
  - 6 glyphes d'action du composer (20pt : photo/caméra/emoji/fichier/position/audio, doctrine 82i —
    rangée horizontale contrainte qui déborderait si les icônes scalaient en XXXL).
- a11y **déjà complète** : chaque bouton (FAB + 6 actions) porte déjà `.accessibilityLabel`
  → VoiceOver reste exhaustif malgré le gel visuel. **Intacte.**

Palette (`MeeshyColors.brandPrimary/error/success/errorStrong`, hex `F8B500`/`9B59B6` des icônes
d'action) déjà conforme → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Statut

**TERMINÉE** — chrome de `FeedView` : doctrine Dynamic Type documentée in-situ (FAB + 6 actions du
composer). Ne plus re-flagger ces 7 glyphes figés.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `FeedView` (chrome) — 7 glyphes figés documentés : FAB `plus` (cercle fixe 40×40) + 6 actions du
  composer (rangée contrainte), a11y de bouton déjà présente. **SOLDÉ 123i.**
