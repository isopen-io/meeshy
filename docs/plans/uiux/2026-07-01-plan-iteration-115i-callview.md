# Plan — Itération 115i (iOS) : `CallView`

**Base** : `main` HEAD (`49d933d8`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (écran d'appel WebRTC) — doctrine 82i/86i
**Gate** : CI `iOS Tests`

## Constat

114i mergé (#1329, `StoryExportShareSheet`) → **115i**. Restaient **8 `.font(.system(size:))`**
dans l'écran d'appel : 7 glyphes de contrôle en cercles glass fixes + 1 glyphe de statut.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Chevron réduction PiP (16, `callControlGlass` ⌀40) | **FIGÉ** + commentaire 82i |
| `camera.badge.ellipsis` (22, ⌀56) | **FIGÉ** + commentaire 86i |
| Icône `callControlButton` (22, ⌀56) | **FIGÉ** + commentaire 86i |
| `effectsToggleButton` (24, ⌀64) | **FIGÉ** + commentaire 86i |
| `endCallButton` `phone.down.fill` (24, ⌀56) | **FIGÉ** + commentaire 86i |
| Initiale avatar « vidéo en pause » (24, cercle 56×56) | **FIGÉ** + commentaire 86i |
| Initiale `avatarCircle(size:)` (`size*0.4`) | **FIGÉ** + commentaire 86i |
| `video.slash.fill` overlay pause (18) | `relative(18, .semibold)` + `accessibilityHidden` |

## Règles respectées

1. Glyphe dans cercle glass/avatar de dimension fixe → figé (doctrine 82i/86i) ; la caption
   `.caption2` sous chaque bouton porte le Dynamic Type.
2. Glyphe de statut décoratif hors cadre fixe → migré + masqué du rotor (les libellés portent le sens).
3. Palette (indigo, brand gradient, warning/success) + glass sombre épinglé déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (115i car 114i mergé) ; surface `CallView` non réclamée.
2. [x] 7 gels commentés ; 1 migration `relative` + masquage.
3. [x] Vérifier : 7 `.system` figés (tous commentés) + 1 nouveau `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 116i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `OnboardingAnimations` (glyphes
d'animation décoratifs ≥40pt → gel + masquage), `StoryViewerView+Canvas` (nombreux petits
labels migrables + hero 100pt). `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
