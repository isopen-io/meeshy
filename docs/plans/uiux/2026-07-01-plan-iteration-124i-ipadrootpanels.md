# Plan — Itération 124i (iOS) : `iPadRootView+Panels`

**Base** : `main` HEAD (`e0e9b3a6`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (en-tête de panneau iPad) — doctrine 86i
**Gate** : CI `iOS Tests`

## Constat

123i mergé (#1370, `FeedView` chrome) → **124i**. `iPadRootView+Panels` : 6 `.font(.system(size:))`
(bouton Feed, titre, cloche+badge, engrenage) ; 2 boutons icon-only sans label VoiceOver.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Glyphe + libellé « Feed » (14 semibold) | `relative(14, .semibold)` |
| Titre du panneau (20 bold) | `relative(20, .bold)` + `accessibilityAddTraits(.isHeader)` |
| Cloche de notifications (16 medium) | `relative(16, .medium)` |
| Engrenage de réglages (16 medium) | `relative(16, .medium)` |
| Compteur du badge (9 bold, pastille fixe 16×16) | **FIGÉ** + commentaire 86i + `accessibilityHidden` |
| Bouton notifications (icon-only) | `accessibilityLabel(root.ipad.notifications)` + `accessibilityValue(count)` |
| Bouton réglages (icon-only) | `accessibilityLabel(root.ipad.settings)` |

## Règles respectées

1. Compteur dans pastille de dimension fixe (16×16) → figé (doctrine 86i) + masqué (value du bouton porte le compte).
2. Boutons icon-only → labels VoiceOver ; titre marqué header.
3. Palette (indigo, error) déjà conforme → non touchée.
4. 1 fichier, 0 logique, 0 test neuf, 2 clés i18n inline.

## Étapes

1. [x] Resync main (124i car 123i mergé) ; surface `iPadRootView+Panels` non réclamée.
2. [x] 5 migrations `relative` ; 1 gel commenté ; titre header ; 2 labels + 1 value.
3. [x] Vérifier : 1 `.system` figé (commenté) + 5 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 125i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `AttachmentLoadingTile` (6),
`ConversationMediaGalleryView` (6, mix — vérifier contention). Ensuite : passe state-of-the-art
(palette hexes inline vs tokens, dark/light, gestes).
