# Plan — Itération 123i (iOS) : `FeedView` (chrome)

**Base** : `main` HEAD (`bc59c0b6`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type — gel documenté de la chrome (FAB + toolbar composer) — doctrine 82i/86i
**Gate** : CI `iOS Tests`

## Constat

122i mergé (#1366, `EmojiPickerSheet`) → **123i**. `FeedView` : **7 `.font(.system(size:))`**,
toutes de la chrome (FAB + 6 actions du composer) ; texte du Feed déjà sémantique/`relative`.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Glyphe `plus` du FAB (18 bold, cercle fixe 40×40) | **FIGÉ** + commentaire 86i |
| 6 glyphes d'action du composer (20pt, rangée contrainte) | **FIGÉS** + commentaire doctrine 82i (bloc) |

## Règles respectées

1. Glyphe dans cadre fixe (FAB 40×40) / rangée horizontale contrainte → figés (doctrine 82i/86i) ;
   0 migration `relative` (affordances de contrôle, pas du texte).
2. a11y déjà exhaustive (chaque bouton labellisé) → non touchée.
3. Palette déjà conforme → non touchée.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (123i car 122i mergé) ; surface `FeedView` (chrome) non réclamée.
2. [x] 1 gel FAB commenté ; 1 commentaire bloc couvrant les 6 actions du composer.
3. [x] Vérifier : 7 `.system` figés documentés (0 migration justifiée).
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 124i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent). Fresh à texte réel possible :
`ConversationMediaGalleryView` (6, mix hero + labels — vérifier contention, un autre agent l'a
touché en ~103i), `AttachmentLoadingTile` (6), `iPadRootView+Panels` (6). Ensuite : passe de revue
state-of-the-art (palette hexes proches — ex `F8B500`/`9B59B6` inline dans FeedView à évaluer vs
tokens —, cohérence dark/light, gestes standards).
