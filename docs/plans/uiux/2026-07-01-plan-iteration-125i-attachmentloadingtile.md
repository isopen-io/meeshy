# Plan — Itération 125i (iOS) : `AttachmentLoadingTile`

**Base** : `main` HEAD (`e027b523`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (tuile de chargement d'attachment) — doctrine 86i
**Gate** : CI `iOS Tests`

## Constat

124i mergé (#1383, `iPadRootView+Panels`) → **125i**. `AttachmentLoadingTile` : 6
`.font(.system(size:))` ; le fichier n'importait pas `MeeshyUI`. La tuile est un carré fixe
`size`×`size` (défaut 56) → seul le libellé SOUS la tuile peut scaler ; le reste est borné.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `import MeeshyUI` | Ajouté |
| Libellé sous la tuile (10 medium, hors carré) | `relative(10, .medium)` |
| Croix d'annulation (8 bold, cercle fixe 18×18) | **FIGÉ** + commentaire 86i |
| Label d'étape (8 semibold, borné par la tuile) | **FIGÉ** + commentaire 86i |
| Icône d'erreur (16 bold) + « Erreur » (8 semibold), bornés | **FIGÉS** + commentaires 86i ; icône `accessibilityHidden` |
| Glyphe play vidéo (20, borné) | **FIGÉ** + commentaire 86i + `accessibilityHidden` |

## Règles respectées

1. Contenu borné par un carré/cercle de dimension fixe → figé (doctrine 86i) ; seul le libellé hors tuile migre.
2. Glyphes décoratifs (erreur, play) → masqués du rotor (les libellés portent le sens).
3. Palette + label d'annulation déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (125i car 124i mergé) ; surface `AttachmentLoadingTile` non réclamée.
2. [x] `import MeeshyUI` ; 1 migration `relative` ; 5 gels commentés ; 2 masquages.
3. [x] Vérifier : 5 `.system` figés (commentés) + 1 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 126i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `ConversationMediaGalleryView` (6 mix, vérifier
contention). Ensuite : passe state-of-the-art (palette hexes inline vs tokens, dark/light, gestes).
