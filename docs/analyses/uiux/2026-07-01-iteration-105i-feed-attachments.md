# Itération 105i — Analyse UI/UX iOS : `FeedView+Attachments` (tuiles de pièces jointes)

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`) — indépendante des pistes web/Android.
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
**Base** : `main` HEAD (`61257034`) — **0 PR ouverte au démarrage** (essaim au repos, aucune contention).
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests` (`ios-tests.yml`)

## Contexte

Fichier de la composition de post/réel du feed : le composer (`FeedComposerSheet`) + les
rangées de tuiles de pièces jointes en attente (`feedAttachmentTile` côté `FeedView`,
`sheetAttachmentTile` côté sheet). Chaque tuile = miniature (image/vidéo/lieu/fichier) +
bouton « retirer » (croix rouge) + libellé.

## État constaté (avant 105i)

La typographie était déjà largement conforme : libellés en `MeeshyFont.relative`, toolbar
du composer déjà étiquetée VoiceOver. Les 14 `.font(.system(size:))` restants sont
**exclusivement des glyphes de contrôle/décoratifs dans des cadres de dimension fixe**
(croix de suppression 28×28 / 20×20, miniatures 56×56 / 72×72, icônes toolbar 20pt) →
à garder figés par doctrine (déborderaient s'ils scalaient).

**Vrais défauts a11y identifiés :**
1. **Boutons « retirer » (croix) sans `.accessibilityLabel`** (défaut WCAG/HIG sur un bouton
   **destructif**) — sur les DEUX tuiles (`feedAttachmentTile` + `sheetAttachmentTile`).
   VoiceOver annonçait « xmark » ou rien → l'utilisateur ne savait pas qu'il supprimait une
   pièce jointe.
2. **Glyphes décoratifs non masqués** du rotor VoiceOver : indicateur vidéo `play.circle.fill`,
   glyphe lieu `mappin.circle.fill`, icône de type de fichier — redondants avec le libellé
   de tuile (« Photo » / « Vidéo » / « Position » / nom de fichier) juste en dessous.

## Corrections appliquées (1 fichier, 0 logique)

- **2 `.accessibilityLabel`** (`feed.attachment.remove` = « Retirer la pièce jointe ») sur les
  boutons croix des deux tuiles (`feedAttachmentTile` + `sheetAttachmentTile`).
- **6 `.accessibilityHidden(true)`** sur les glyphes décoratifs des deux tuiles
  (play.circle.fill vidéo, mappin.circle.fill lieu, icône de type) — le libellé porte le sens.
- **2 commentaires doctrine 82i** sur les croix figées (cadres de tap fixes 28×28 / 20×20).

Les 14 `.font(.system(size:))` restent **figés à dessein** (glyphes en cadres fixes / toolbar) —
la toolbar du composer était déjà étiquetée VoiceOver. Palette (sémantiques `MeeshyColors.error`/
`.success`, gradients de miniature) et Liquid Glass déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier, 0 test neuf. 1 clé i18n ajoutée via `defaultValue`
  inline (`feed.attachment.remove`, réutilisée sur les 2 tuiles).

## Statut

**TERMINÉE** — boutons « retirer » du feed désormais étiquetés VoiceOver, glyphes décoratifs
masqués. Ne plus re-flagger les 14 glyphes figés (cadres fixes / toolbar déjà labellisée).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `FeedView+Attachments` — 2 `.accessibilityLabel` sur boutons « retirer » (feed + sheet),
  6 `.accessibilityHidden` glyphes décoratifs de tuile, 14 glyphes figés (cadres fixes).
  **SOLDÉ 105i.** Différé : la toolbar du composer utilise des clés a11y = texte FR littéral
  (`String(localized: "Ajouter une photo", …)` sans bundle) → à normaliser en clés SSOT un jour.
