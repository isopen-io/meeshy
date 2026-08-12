# Itération 186i — Analyse UI/UX iOS : `AudioFullscreenView` sélecteurs (vitesse + langue)

**Date** : 2026-07-20
**Piste** : iOS (suffixe `i`) — indépendante des pistes web/Android.
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
**Base** : `main` HEAD (`f80d5fb`)
**Branche** : `claude/laughing-thompson-is8ph7`
**Gate** : CI `iOS Tests` (`ios-tests.yml`)

## Contexte

`AudioFullscreenView` = lecteur audio plein écran (pager horizontal multi-audios + dismiss
vertical). Chaque page contient deux **sélecteurs à choix unique** rendus comme des rangées
de capsules :

- **`speedRow`** — vitesse de lecture (`0.8×` … `2.25×`), la capsule active est remplie de
  l'accent (`accent`) avec texte noir.
- **`languagePill`** (dans `inlineLanguageFlags`) — version écoutée (original + versions
  traduites Prisme), la pill active est remplie de la couleur de langue et le texte passe en
  gras blanc.

## État constaté (avant 186i)

L'itération **104i** a soldé l'a11y VoiceOver de cette surface **côté boutons icône-seule**
(`.accessibilityLabel` sur close / download / −10 / play-pause / +10 / translate) et la
migration Dynamic Type du glyphe d'état vide. Elle a explicitement **différé** `seekBar`
(adjustable, risqué) et `authorInfoRow` (combine).

Un **troisième défaut**, distinct de ces deux différés, restait non traité : les deux
sélecteurs à choix unique signalaient leur **état sélectionné par la couleur seule** —
aucun `.accessibilityAddTraits(.isSelected)`. Conséquences VoiceOver :

1. **`speedRow`** : chaque capsule était lue « 1.5×, bouton » à l'identique, qu'elle soit
   la vitesse active ou non. Un utilisateur VoiceOver ne pouvait pas savoir quelle vitesse
   était en cours (l'unique signal — capsule accent + texte noir — est purement visuel).
2. **`languagePill`** : chaque pill était lue « 🇫🇷 Français, bouton » sans distinction de
   la langue actuellement écoutée (signal purement visuel : remplissage coloré + gras).

C'est la violation HIG classique « ne jamais reposer sur la couleur seule pour transmettre
un état » — même classe de défaut que celle corrigée en **184i** (`StatusComposerView`
pickers), **185i** (`MessageLanguageDetailView`) et **178i** (`MessageReportDetailView`).

## Corrections appliquées (voir plan 186i)

- **`speedRow`** : sur le `Button` de chaque vitesse →
  `.accessibilityLabel(speed.label)` (annonce explicite « 1.5× ») +
  `.accessibilityAddTraits(player.speed == speed ? [.isSelected] : [])`.
- **`languagePill`** : sur le `Button` de chaque pill →
  `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` (le libellé de langue est déjà
  porté par le `Text` intérieur → pas de label ajouté, seulement le trait).

VoiceOver annonce désormais « 1.5×, sélectionné, bouton » et « Français, sélectionné,
bouton » sur les éléments actifs, aligné sur le sibling prouvé `CallsTab.chip`
(`CallsTab.swift:60`, même `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`).

## Périmètre / non-régression

- **1 seul fichier**, **0 logique métier** modifiée, **0 changement visuel/layout**,
  **0 clé i18n neuve** (le libellé vitesse réutilise `PlaybackSpeed.label` du SDK,
  déjà localisé-agnostique), **0 test neuf**. Aucune `.system(size:)` touchée.
- Aucun test existant ne cible `AudioFullscreenView` (grep `MeeshyTests`/`MeeshyUITests`/
  `MeeshySDK` = vide) → 0 régression de suite.

## Statut

**TERMINÉE** — état sélectionné VoiceOver des sélecteurs vitesse + langue de
`AudioFullscreenView` soldé.

## Différé (inchangé depuis 104i, hors périmètre 186i)

- **`seekBar`** : slider custom (DragGesture) sans `.accessibilityValue` /
  `.accessibilityAdjustableAction` → non ajustable au VoiceOver. Nécessite un adaptateur
  adjustable (risque layout).
- **`authorInfoRow`** : double bouton (avatar + nom) ouvrant le même profil → fusion possible
  en un seul élément a11y.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `AudioFullscreenView` sélecteurs — `.isSelected` VoiceOver sur `speedRow` (+ label explicite
  `speed.label`) et `languagePill`. **SOLDÉ 186i.** Ne plus re-flagger l'état de sélection de
  ces deux pickers. Reste différé (104i) : `seekBar` adjustable, `authorInfoRow` combine.
