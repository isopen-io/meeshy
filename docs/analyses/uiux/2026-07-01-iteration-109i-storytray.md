# Itération 109i — Analyse UI/UX iOS : `StoryTrayView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`
**Base** : `main` HEAD (`fb5cc0e1`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Tray de stories en tête de feed (`StoryTrayView` + `StoryRingCell` + `MyStoryButton` +
`StoryUploadOverlay` + `PinnedStoryTrailBand`). **1 seule PR ouverte** (#1306 web/calls, disjointe)
→ 0 contention iOS. Numéro **109i** (108i = `StoryViewerView+Sidebar` mergé #1303).

## Constat (avant 109i)

Les anneaux (`MeeshyAvatar`) et les boutons « + » portaient déjà de bons libellés VoiceOver.
Défauts restants :
- **9 `.font(.system(size:))`** non scalables. Répartition : 4 textes (nom d'utilisateur sous
  l'anneau, « Moi », « + » des 2 clusters de pastilles de comptage) ; 5 glyphes/textes dans des
  cercles de dimension fixe (💭 mood 32×32, `plus` composer 40×40, `exclamationmark.triangle` +
  `%` d'upload 50×50, `plus` band épinglée 44×44).
- **Bouton mood 💭 sans `.accessibilityLabel`** (bouton overlay imbriqué, geste `onAddStatus`
  invisible au lecteur d'écran).
- **Pastilles de comptage** (`storyCountDots` + variante « ma story ») annoncées « + » par
  VoiceOver alors qu'elles sont purement décoratives (l'anneau porte déjà le sens).

## Corrections appliquées (1 fichier, 0 logique)

- **4/9 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) : nom
  d'utilisateur (`isCompact ? 9 : 10`), « Moi » (10), « + » des 2 clusters de pastilles (8).
- **5/9 glyphes/textes figés** + commentaires doctrine 86i (cercles de dimension fixe) :
  💭 mood (32×32), `plus` composer (40×40), `exclamationmark.triangle` + `%` upload (50×50),
  `plus` band épinglée (44×44).
- **1 `.accessibilityLabel`** sur le bouton mood 💭 (`story.tray.a11y.changeMood`, clé SSOT réutilisée).
- **2 `.accessibilityHidden(true)`** sur les clusters de pastilles de comptage (décoratifs).

Palette (indigo, `MeeshyColors.brandGradient`, accent déterministe `DynamicColorGenerator`) et
Liquid Glass déjà conformes → **intacts**. Vue à cellules de liste : 0 `@ObservedObject` ajouté.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (labels existants réutilisés).

## Statut

**TERMINÉE** — `StoryTrayView` Dynamic Type + a11y soldé. Ne plus re-flagger les 5 glyphes figés.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StoryTrayView` — 4 textes → `relative`, 5 glyphes figés (cercles fixes), label mood 💭,
  2 masquages pastilles décoratives. **SOLDÉ 109i.**
