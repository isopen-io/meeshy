# Plan — Itération 109i (iOS) : `StoryTrayView`

**Base** : `main` HEAD (`fb5cc0e1`) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (tray de stories) — doctrine 86i
**Gate** : CI `iOS Tests`

## Constat

108i mergé (#1303) → **109i**. 1 PR ouverte (#1306 web/calls, disjointe) → 0 contention iOS.
Anneaux/boutons déjà bien étiquetés ; restaient 9 `.system(size:)` + un bouton mood non étiqueté
+ pastilles décoratives bruitées.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Nom d'utilisateur (9/10) | `relative(isCompact ? 9 : 10, weight:)` |
| « Moi » (10 semibold) | `relative(10,.semibold)` |
| « + » pastilles ×2 (8 bold) | `relative(8,.bold)` |
| 💭 mood (cercle 32×32) | **FIGÉ** + commentaire 86i + `.accessibilityLabel(changeMood)` |
| `plus` composer (cercle 40×40) | **FIGÉ** + commentaire 86i |
| `exclamationmark.triangle` upload (50×50) | **FIGÉ** + commentaire 86i |
| `%` upload (50×50) | **FIGÉ** + commentaire 86i |
| `plus` band épinglée (44×44) | **FIGÉ** + commentaire 86i |
| Clusters de pastilles ×2 | `.accessibilityHidden(true)` (décoratifs) |

## Règles respectées

1. Glyphes/textes en cercles de dimension fixe → figés (doctrine 86i).
2. Bouton mood étiqueté VoiceOver ; pastilles décoratives masquées.
3. Palette + Liquid Glass déjà conformes → non touchés. Cellule de liste : 0 `@ObservedObject` ajouté.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (109i car 108i mergé) ; surface `StoryTrayView` non réclamée.
2. [x] 4 migrations `relative` ; 5 gels commentés ; label mood ; 2 masquages.
3. [x] Vérifier : 5 `.system` figés + 4 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 110i+

`ReelsPlayerView` (7), `OnboardingStepViews` (7), `StatusBubbleOverlay` (7) ; amélioration différée 108i
(`.accessibilityValue` timeAgo/expiry du header stories).
