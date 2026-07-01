# Plan — Iteration 78ib (2026-07-01) — iOS i18n `MessageOverlayMenu`

## Objectif
Localiser toutes les chaînes visibles français-en-dur de `MessageOverlayMenu.swift` (menu de
long-press d'un message : grille d'actions du panneau détail + en-tête d'aperçu + VoiceOver des
lecteurs audio/vidéo), en réutilisant les clés SSOT existantes quand elles existent, et
compléter le catalogue.

## Base de départ
`main` HEAD `90d2e672` (resync avant démarrage ; branche `claude/upbeat-euler-cj7lpu`).
Suffixe `b` car `78i` est pris par PR #1168 + #1166 (surfaces disjointes).

## Étapes
1. [x] Repérer les littéraux visibles : `overlayActions` (Repondre/Discussion/Copier/
   Epingler/Desepingler/favoris/Modifier/Supprimer le media), `previewSenderHeader` ("Moi"),
   `PreviewAudioPlayer`/`PreviewVideoPlayer` (labels + hint VoiceOver).
2. [x] Vérifier le SSOT : `action.reply`, `action.copy`, `context.pin`, `context.unpin`
   (existants, utilisés par les vues sœurs) → réutilisés tels quels.
3. [x] Ajouter 11 clés à `Localizable.xcstrings` ×5 langues (de/en/es/fr/pt-BR) :
   `message.action.{thread,star.add,star.remove,edit,deleteAttachment}`, `common.me`,
   `media.{pauseAudio,playAudio,audioHint,pauseVideo,playVideo}`. Sérialisation Xcode exacte
   (`json.dumps(..., ensure_ascii=False, indent=2, separators=(',',' : '))`, ordre d'insertion
   préservé — round-trip byte-for-byte validé).
4. [x] Migrer `MessageOverlayMenu.swift` :
   - `overlayActions` → clés (`action.reply`/`message.action.thread`/`action.copy`/
     `context.pin`+`context.unpin`/`message.action.star.*`/`message.action.edit`/
     `message.action.deleteAttachment`)
   - `previewSenderHeader` "Moi" → `common.me`
   - `PreviewAudioPlayer` → `media.pauseAudio`/`media.playAudio` + `media.audioHint` (`%@`)
   - `PreviewVideoPlayer` → `media.pauseVideo` + `media.playVideo` (réutilisée)
5. [x] "Audio"/"Normal" laissés intacts (termes universels identiques ×5 langues) — exclusion
   documentée dans l'analyse.
6. [x] Vérifier absence de résidu français visible hors `defaultValue:` (grep).
7. [ ] Commit + push branche + CI ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
8. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **SSOT** : réutiliser exactement `action.reply`/`action.copy`/`context.pin`/`context.unpin`
  évite la divergence avec la barre inline (`ConversationView+MessageRow`).
- **`media.playVideo`** était code-only (defaultValue EN) ; l'ajout au catalogue avec fr source
  = "Lire la vidéo" **améliore** aussi le bouton play overlay existant (ligne 1222), pas de
  régression (le `defaultValue` restait le fallback).
- **Collision `ContextActionMenu`** : PR #1157 en vol touche la quick-action bar — **fichier
  distinct**, non modifié ici.
- **Interpolation** : `media.audioHint` = `String(format: String(localized:defaultValue:), arg)`,
  pattern éprouvé.
- Pas de test neuf : swap mécanique, helpers `private` couplés à la View, couverture = compile CI.

## Vérification finale
- [x] `grep` : 0 littéral français visible hors `defaultValue:` (sauf "Audio"/"Normal" universels).
- [x] JSON `Localizable.xcstrings` valide (round-trip Python, +11 clés, 1010 total).
- [ ] CI `ios-tests.yml` verte.
