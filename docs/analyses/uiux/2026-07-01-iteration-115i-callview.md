# Itération 115i — Analyse UI/UX iOS : `CallView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
**Base** : `main` HEAD (`49d933d8`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

L'écran d'appel plein écran (WebRTC) : barre de contrôles (mute / caméra / filtres /
raccrocher), avatars pulsants, affordance de réduction en PiP, overlay « vidéo en pause ».
**0 PR ouverte iOS** au démarrage (list_pull_requests vide) → 0 contention. Numéro **115i**
(114i = `StoryExportShareSheet` mergé #1329).

## Constat (avant 115i)

Les captions sous chaque bouton (`Caméra`, `Filtres`, `Raccrocher`…) utilisaient déjà
`.caption2` (sémantique, Dynamic-Type-conforme) avec `minimumScaleFactor(0.7)`, et les
labels VoiceOver étaient déjà exhaustifs (`callControlButton` sépare volontairement caption
courte + label long). Restaient **8 `.font(.system(size:))`** : **7 glyphes de contrôle**
vivant dans des cercles glass de **diamètre fixe** (`callControlGlass`/`endCallGlass`) ou des
initiales d'avatar dans des cercles fixes, et **1 glyphe de statut décoratif** (`video.slash.fill`).

## Corrections appliquées (1 fichier, 0 logique)

- **7/8 glyphes figés** + commentaires doctrine (un glyphe ne doit jamais déborder de son
  cercle glass de dimension fixe ; la caption sémantique sous le bouton porte le Dynamic Type) :
  - chevron de réduction PiP (16, `callControlGlass` ⌀40, doctrine 82i chrome) ;
  - `camera.badge.ellipsis` (22, ⌀56) ; icône `callControlButton` (22, ⌀56) ;
    `effectsToggleButton` (24, ⌀64) ; `endCallButton` `phone.down.fill` (24, ⌀56) — doctrine 86i ;
  - initiale d'avatar « vidéo en pause » (24, cercle fixe 56×56) et initiale
    `avatarCircle(size:)` (`size*0.4`, cercle fixe `size`) — doctrine 86i.
- **1/8 glyphe migré** : `video.slash.fill` de l'overlay « vidéo en pause » (18 semibold) →
  `MeeshyFont.relative(18, weight: .semibold)` (hors cadre fixe — il peut scaler) +
  `.accessibilityHidden(true)` (les libellés « Vidéo en pause » / « Reprise auto » adjacents
  portent le sens).

Palette (`indigo400/500`, brand gradient d'avatar, `warning`/`success` sémantiques),
`callBackground` sombre épinglé et style glass déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (toutes les chaînes déjà
  `String(localized:)`).

## Statut

**TERMINÉE** — `CallView` Dynamic Type + a11y soldé. Doctrine des 7 glyphes de contrôle en
cercles glass fixes désormais **commentée in-situ** : ne plus les re-flagger.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `CallView` — 7 glyphes de contrôle figés (cercles glass/avatars de dimension fixe, doctrine
  82i/86i, commentés), 1 glyphe de statut migré + masqué du rotor. **SOLDÉ 115i.**
