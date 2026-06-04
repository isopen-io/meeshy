# Feed/Posts — auto-download progressif des médias (iOS)

**Branche** : `feat/ios-feed-posts-auto-download`
**Date** : 2026-06-04

## Demande
Dans les Feeds et Postes : télécharger AUTOMATIQUEMENT tous les médias (images,
vidéos, audio), PAS de bouton de téléchargement, cascade progressive
thumbHash → thumbnail → contenu, en ignorant la préférence réseau (toujours
auto-DL sauf hors-ligne).

## Décisions de périmètre (arbitrées avec l'utilisateur)
- Plateforme : **iOS uniquement**
- Médias : **tous** (images, vidéos, audio)
- Préférence réseau : **toujours auto-DL** (ignore WiFi-only / data-saver), sauf offline

## Constat
- **Images** feed/posts : déjà conformes (`ProgressiveCachedImage(autoLoad: true)`).
- **Vidéos** feed/posts : gated par `MediaDownloadPolicyEngine` → peut afficher
  un overlay/badge « Télécharger » = le bouton à éliminer.
- **Audio** feed/posts : pas de bouton mais pas d'auto-DL (joue au tap, fetch on play).
- **Icône document** (`arrow.down.circle.fill`) : faux bouton décoratif sans action.

## Contrainte SDK Purity
La décision « feed/posts → toujours auto-DL » reste **app-side** (flag sur les
resolvers). Le `MediaDownloadPolicyEngine` SDK reste intact.

## Plan (TDD)
- [x] 1. [RED] Tests `shouldAutoStart` (video + audio) dans `AttachmentDownloaderTests.swift`
      (nouvelle classe `MediaAutoDownloadDecisionTests`, pas de modif pbxproj)
- [x] 2. [GREEN] `VideoAvailabilityResolver` : prop `autoDownload` (def. false) + init
      param + helper `shouldAutoStart(autoDownload:condition:prefs:)` + `.task` câblé
- [x] 3. [GREEN] `AudioAvailabilityResolver` : idem (kind `.audio`)
- [x] 4. `FeedPostCard+Media.swift` : video `autoDownload: true` ; wrapper audio dans
      `AudioAvailabilityResolver(autoDownload: true)` ; retirer l'icône doc morte
- [x] 5. `PostDetailView.swift` : video `autoDownload: true` ; wrapper audio
      (détail + repost legacy) ; retirer l'icône doc morte
- [x] 6. Build OK (76s) + 8 nouveaux tests verts + 7 AttachmentDownloaderTests intacts
- [x] 7. Review + smoke notes

## Bulles de conversation = INCHANGÉES
Les 4 call sites `VideoAvailabilityResolver` + 1 `AudioAvailabilityResolver` des
bulles gardent `autoDownload` au défaut `false` → politique réseau respectée.

## Review

### Livré
- `VideoAvailabilityResolver` + `AudioAvailabilityResolver` : flag `autoDownload`
  (def. `false`) + helper pur `shouldAutoStart(autoDownload:condition:prefs:)`.
  Hors-ligne → jamais ; sinon `autoDownload` force, ou la politique réseau autorise.
- Call sites feed/posts (5) passent `autoDownload: true` ; les 5 call sites bulle
  de conversation gardent le default → politique réseau respectée.
- Audio feed/posts (feed + détail + repost legacy) : passe désormais par
  `AudioAvailabilityResolver` (réutilisation) → pré-DL au lieu de fetch-on-play.
- Icônes document mortes (faux boutons `arrow.down.circle.fill`) retirées (×2).
- Images : aucune modif (déjà `ProgressiveCachedImage(autoLoad: true)`).
- SDK `MediaDownloadPolicyEngine` : INTACT. Décision feed/posts encodée app-side
  (respect SDK Purity).

### Vérification
- `./apps/ios/meeshy.sh build` → BUILD SUCCEEDED (76s)
- `MediaAutoDownloadDecisionTests` : 8/8 verts + `AttachmentDownloaderTests` 7/7 → TEST SUCCEEDED

### À smoke-tester (device/sim)
1. Vidéo feed/post : doit s'auto-DL (poster thumbHash→thumbnail pendant le DL,
   puis lecture), AUCUN overlay « Télécharger ».
2. Audio feed/post : pré-DL silencieux ; bascule brève needsDownload→downloading→ready
   (changement de comportement vs fetch-on-play). Vérifier pas de régression visuelle.
3. Document feed/post : plus d'icône flèche trompeuse.
4. Bulle de conversation (vidéo/audio) : comportement INCHANGÉ (politique réseau).

### Non couvert (intentionnel)
- Vidéos en grille multi-média (feed `galleryImageView`, détail `detailGridCell`) :
  poster-only auto-load ; le full DL au passage en plein écran. Pas de lecteur inline.
- Plein écran (`ConversationMediaGalleryView`) : composant partagé, hors périmètre ;
  l'auto-DL inline rend le média déjà caché à l'ouverture dans la plupart des cas.
- Web : hors périmètre (iOS uniquement, arbitré).

### Statut
Branche `feat/ios-feed-posts-auto-download`, NON commitée (attente feu vert utilisateur).
