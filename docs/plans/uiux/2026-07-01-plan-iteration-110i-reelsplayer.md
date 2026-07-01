# Plan — Itération 110i (iOS) : `ReelsPlayerView`

**Base** : `main` HEAD (`6519f8ed`) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (lecteur de réels) — doctrine 74i/82i/86i
**Gate** : CI `iOS Tests`

## Constat

109i mergé (#1307) → **110i**. PR ouvertes = web/calls uniquement (disjointes) → 0 contention iOS.
Rail/scrub/back/meta déjà bien étiquetés ; restaient 7 `.system(size:)` (6 légitimement figés) +
héros décoratifs non masqués.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Glyphe inline `statInline` (10) | `relative(10,.semibold)` |
| Chrome back `chevron.backward` (cadre 40×40) | **FIGÉ** + commentaire 82i |
| Rail d'actions ×2 (26, colonne fixe width:48) | **FIGÉ** + commentaire 86i |
| Héros `play.rectangle.on.rectangle` (44, état-vide) | **FIGÉ** + `.accessibilityHidden` + commentaire 74i/86i |
| `waveform` watermark (220) | **FIGÉ** + `.accessibilityHidden` + commentaire |
| `waveform` hero (84) | **FIGÉ** + `.accessibilityHidden` + commentaire |

## Règles respectées

1. Glyphes en cadres fixes / rail à largeur fixe / héros décoratifs ≥40pt → figés (74i/82i/86i).
2. Héros décoratifs masqués du rotor VoiceOver ; le texte/rôle porte le sens.
3. Palette + Liquid Glass (`.adaptiveGlass`) déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (110i car 109i mergé) ; surface `ReelsPlayerView` non réclamée.
2. [x] 1 migration `relative` ; 6 gels commentés ; 3 masquages héros décoratifs.
3. [x] Vérifier : 6 `.system` figés + 1 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 111i+

`StatusBubbleOverlay` (7), `OnboardingStepViews` (7) ; différé 108i (`.accessibilityValue`
timeAgo/expiry header stories). Gros lots : `StoryViewerView+Content` (⚠️ i18n), `ConversationView+Composer`.
