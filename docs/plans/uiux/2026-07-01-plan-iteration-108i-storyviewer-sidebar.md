# Plan — Itération 108i (iOS) : `StoryViewerView+Sidebar`

**Base** : `main` HEAD (`100e4725`, 0 PR ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (header du visualiseur de stories) — doctrine 82i/86i
**Gate** : CI `iOS Tests`

## Constat

106i pris (#1301), 107i mergé (#1302) → **108i**. Sidebar/header stories : boutons déjà bien
étiquetés VoiceOver ; restaient 10 `.system(size:)` non scalables.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Nom d'auteur (15 bold) | `relative(15,.bold)` |
| `timeAgo` (12 medium) | `relative(12,.medium)` |
| Glyphe repost `arrow.2.squarepath` (10) | `relative(10,.semibold)` |
| « via @… » (11 medium) | `relative(11,.medium)` |
| Glyphe `clock` (9) | `relative(9,.semibold)` |
| Temps restant (12 medium) | `relative(12,.medium)` |
| Drapeau langue (cercle 38×38) | **FIGÉ** + commentaire 86i |
| `plus` (cercle 38×38) | **FIGÉ** + commentaire 86i |
| `ellipsis` chrome (36×36) | **FIGÉ** + commentaire 82i |
| `xmark` chrome (36×36) | **FIGÉ** + commentaire 82i |

## Règles respectées

1. Glyphes en cadres de dimension fixe → figés (doctrine 82i/86i) ; déjà étiquetés au niveau bouton.
2. Palette + Liquid Glass déjà conformes → non touchés.
3. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (0 PR) ; surface `StoryViewerView+Sidebar` non réclamée ; numéro 108i.
2. [x] Migrer 6 textes header → `relative` ; figer 4 glyphes (cadres fixes) + commentaires.
3. [x] Vérifier : 4 `.system` figés + 6 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 109i+

`.accessibilityValue` timeAgo/expiry sur le bouton profil du header (le label override masque ces infos).
Candidats surfaces : `StoryTrayView` (9), `ReelsPlayerView` (7), `OnboardingStepViews` (7).
