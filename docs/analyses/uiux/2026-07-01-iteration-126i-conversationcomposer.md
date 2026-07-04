# Itération 126i — Analyse UI/UX iOS : `ConversationView+Composer`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift`
**Base** : `main` HEAD (`3fa30792`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le composer de conversation : bandeau de réponse (`composerReplyBanner`), bandeau d'édition
(`composerEditBanner`), preview riche d'attachment de réponse (vidéo/audio/location/fichier), tuiles
d'attachments en attente d'envoi (`attachmentPreviewTile` + fallbacks audio/location). Lot **critique
mais traité prudemment** : édits **`.font()`-only**, aucune touche à la logique / aux `@State`. **0 PR
ouverte iOS** au démarrage → 0 contention. Numéro **126i** (125i = `AttachmentLoadingTile` mergé #1384).
`ConversationMediaGalleryView` inspecté d'abord puis écarté (déjà soldé : commentaires doctrine
minuscules « doctrine 82i/86i » que le grep sensible à la casse avait manqués).

## Constat (avant 126i)

**22 `.font(.system(size:))`** : **10 de texte/glyphe réactif** (titre + contenu du bandeau de
réponse, emoji/date/preview de mood, icône + preview d'attachment, crayon + libellés du bandeau
d'édition, libellé de tuile d'attachment) ; **12 bornés par des cadres/tuiles de dimension fixe**
(croix d'annulation/édition/suppression dans des cercles fixes 24×24 / 18×18 ; glyphes décoratifs
d'overlay play/eye/mappin/type bornés par des vignettes/tuiles fixes 40×40 / 56×56).

## Corrections appliquées (1 fichier, 0 logique)

- **10/22 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : titre de réponse (12 semibold),
  emoji de mood (12), date relative (11), preview (12), icône d'attachment inline (10 medium),
  preview (12), crayon d'édition (14 semibold), « Modifier le message » (12 semibold), contenu
  édité (12), libellé de tuile d'attachment (10 medium).
- **12/22 glyphes figés** + commentaires doctrine : 3 croix (annuler réponse / annuler édition /
  supprimer attachment) dans des cercles tap fixes 24×24 / 18×18 (82i) ; 9 glyphes décoratifs
  (overlays play/eye, mappin, icônes de type/fallback) bornés par des vignettes/tuiles fixes 40×40 /
  56×56 (86i).
- **`.accessibilityHidden(true)`** sur les 9 glyphes décoratifs bornés (les libellés adjacents /
  le nom de fichier sous la tuile portent le sens) + le crayon du bandeau d'édition. Les 3 croix
  portent déjà leur `.accessibilityLabel` ; les bandeaux réponse/édition ont déjà
  `.accessibilityElement(children:.combine)` + label.

Palette (`accentColor`, `MeeshyColors.warning/success/info/error`, couleurs d'auteur déterministes)
déjà conforme → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (toutes déjà
  `String(localized:)`). Fichier d'extension → **aucun accès à un `@State private`** (édits `.font()`
  uniquement, donc pas de risque du piège cross-file documenté).

## Statut

**TERMINÉE** — `ConversationView+Composer` Dynamic Type + a11y soldé. Ne plus re-flagger les 12
glyphes figés (crois fixes + glyphes bornés par tuiles).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationView+Composer` — 10 sites texte/glyphe → `relative` ; 12 glyphes figés (3 croix
  cercles fixes 24/18, 9 décoratifs bornés par tuiles 40/56) ; 9 masquages décoratifs. **SOLDÉ 126i.**
- `ConversationMediaGalleryView` — déjà soldé (7 `relative` + 6 figés commentés « doctrine 82i/86i »
  minuscule) → **ne pas reprendre.**
