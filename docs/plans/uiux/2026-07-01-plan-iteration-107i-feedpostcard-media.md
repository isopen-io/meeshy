# Plan — Itération 107i (iOS) : `FeedPostCard+Media`

**Base** : `main` HEAD (`1e12f2d7`) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + VoiceOver (rendu média des posts feed) — doctrine 86i
**Gate** : CI `iOS Tests`

## Constat

106i pris (PR #1301 AudioEffectsPanel) → **107i**. `FeedPostCard+Media` non réclamé.
Grilles multi-images déjà labellisées ; restaient 13 `.system(size:)` non scalables + glyphes décoratifs non masqués.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Badge `+N` (22 bold) | `relative(22,.bold)` + `.accessibilityHidden` |
| Durée vidéo (10 mono) | `relative(10,.semibold,.monospaced)` |
| `play.fill` 12 (cercle 30/36) | **FIGÉ** + commentaire 86i ; overlay vidéo `.accessibilityHidden` |
| `waveform` 20 audio | `relative(20)` ; overlay audio `.accessibilityHidden` |
| Durée audio (10 mono) | `relative(10,.semibold,.monospaced)` |
| `doc.fill` 24 (cadre 48×56) | **FIGÉ** + commentaire 86i + `.accessibilityHidden` |
| Nom fichier (14) / taille (12) / pages (12) | `relative(...)` |
| `mappin.circle.fill` 28 (cadre 64×64) | **FIGÉ** + commentaire 86i + `.accessibilityHidden` |
| Nom lieu (14) / coordonnées (11) | `relative(...)` |
| `arrow.up.right.circle.fill` 28 | `relative(28)` + `.accessibilityHidden` (affordance décorative) |

## Règles respectées

1. Glyphes en cadres de dimension fixe → figés (doctrine 86i).
2. Overlays de `galleryImageView` masqués (cellule parente déjà labellisée).
3. Palette + Liquid Glass déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve. Cellule de liste : 0 `@ObservedObject` ajouté.

## Étapes

1. [x] Resync main (107i car 106i pris #1301) ; surface `FeedPostCard+Media` non réclamée.
2. [x] Migrer 10 sites → `relative` ; figer 3 glyphes (cadres fixes) + commentaires ; masquer 6 décoratifs.
3. [x] Vérifier : 3 `.system` figés + 10 `relative` = 13 ; 6 nouveaux `.accessibilityHidden`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 108i+

`StoryTrayView` (9), `StoryViewerView+Sidebar` (10), `ReelsPlayerView` (7), `OnboardingAnimations`
(17, prudence animations) ; gros lots `StoryViewerView+Content` (38, ⚠️ i18n), `ConversationView+Composer` (22).
