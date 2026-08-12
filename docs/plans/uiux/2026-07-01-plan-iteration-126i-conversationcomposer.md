# Plan — Itération 126i (iOS) : `ConversationView+Composer`

**Base** : `main` HEAD (`3fa30792`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (composer de conversation) — doctrine 82i/86i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

125i mergé (#1384, `AttachmentLoadingTile`) → **126i**. `ConversationMediaGalleryView` écarté (déjà
soldé). `ConversationView+Composer` : **22 `.font(.system(size:))`** (bandeaux réponse/édition,
previews & tuiles d'attachments). Lot critique → traité en font-only, 0 logique.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Bandeau réponse : titre + emoji/date/preview + icône + preview (6) | `relative` |
| Bandeau édition : crayon + « Modifier » + contenu (3) | `relative` (crayon `accessibilityHidden`) |
| Libellé de tuile d'attachment (10 medium) | `relative(10, .medium)` |
| Croix annuler-réponse / annuler-édition / supprimer (cercles fixes 24/18) | **FIGÉES** + commentaires 82i |
| Overlays décoratifs play/eye/mappin/type/fallback (bornés tuiles 40/56) | **FIGÉS** + commentaires 86i + `accessibilityHidden` |

## Règles respectées

1. Glyphe dans cercle tap / borné par vignette-tuile de dimension fixe → figé (82i/86i).
2. Glyphes décoratifs bornés → masqués du rotor (libellés / nom de fichier portent le sens) ; croix déjà labellisées.
3. Palette (accent, warning/success/info/error) déjà conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès `@State private` (font-only → pas de piège cross-file), 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (126i car 125i mergé) ; `ConversationMediaGalleryView` écarté (soldé) ; `ConversationView+Composer` non réclamé.
2. [x] 10 migrations `relative` ; 12 gels commentés ; 9 masquages + crayon masqué.
3. [x] Vérifier : 12 `.system` figés (tous commentés) + 10 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 127i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : passe de revue state-of-the-art (palette hexes inline vs tokens — ex `F8B500`/`9B59B6` dans
FeedView, `9933CC` dans ConversationAnimatedBackground —, cohérence dark/light, gestes standards).
