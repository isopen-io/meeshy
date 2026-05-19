# Correctifs bulles de messages — méta + médias optimistes

Branche : `feat/ios-bubble-meta-fixes`

## Contexte
4 bugs UI sur les bulles de message iOS :
1. Bulle audio : horodatage + horloge dupliqués (un dans la bulle, un répété en dessous).
2. Attachement image : icône horloge « file d'attente » manquante.
3. Image en attente d'envoi : carré magenta après avoir quitté/revenu dans la conversation.
4. Tout message en attente d'envoi doit afficher son horodatage dans la bulle, même s'il
   n'est pas le dernier du groupe (texte + emoji).

## Plan

### Bug 1 — Footer audio dupliqué
Décision UX validée : intégrer `identityBarSection` dans `AudioMediaView` (bottom slot du
widget audio) pour remplacer `audioMetaRow`.
- [ ] `AudioMediaView` : nouveau paramètre `@ViewBuilder identityBar`. `bottomContent` envoyé
      à `AudioPlayerView` = pastilles de langue audio (conservées) + barre d'identité injectée.
      Retirer horodatage + `audioDeliveryCheckmark` de `audioMetaRow`.
- [ ] `AudioMediaView.==` : ajouter `message.deliveryStatus` + `message.updatedAt`.
- [ ] `BubbleStandardLayout` : audio-only → ne plus rendre `identityBarSection` en dessous ;
      passer le contenu de la barre dans `AudioMediaView`.

### Bug 2 — Horloge « file d'attente » manquante sur l'image
- [ ] `carouselView` : ajouter l'overlay `BubbleMediaTimestampOverlay` (absent aujourd'hui).
- [ ] Vérifier `visualMediaGrid` + image avec légende.

### Bug 3 — Carré magenta sur image optimiste
- [ ] `ConversationView+AttachmentHandlers` : persister l'image optimiste dans le cache disque
      (`DiskCacheStore.save`), pas seulement le NSCache.

### Bug 4 — Horodatage des messages en attente
- [ ] `BubbleStandardLayout.shouldShowTime` : toujours `true` si le message est en état
      `.sending` / `.invisible` / `.clock` / `.slow` / `.failed`.

## Tests
- [ ] `./apps/ios/meeshy.sh build` vert.
- [ ] `./apps/ios/meeshy.sh test` vert.

## Review

### Fichiers modifiés
- `BubbleStandardLayout.swift` — `isPendingDelivery` + `shouldShowTime` (Bug 4) ;
  `audioIsSoleContent` ; injection de la barre d'identité dans le widget audio +
  suppression du footer dupliqué (Bug 1).
- `ConversationMediaViews.swift` — `AudioMediaView` : paramètre `identityBar`,
  `playerBottomContent` / `audioPlayer` / `audioTranslationRow`, placeholder avec
  barre intégrée, `==` enrichi (`deliveryStatus` + `updatedAt`). Suppression de
  `audioMetaRow`, `audioDeliveryCheckmark`, `timeString` (Bug 1).
- `ThemedMessageBubble+Media.swift` — overlay horodatage/horloge sur le carrousel
  (Bug 2).
- `ConversationView+AttachmentHandlers.swift` — persistance disque de l'image
  optimiste (Bug 3).
- `ConversationSocketHandlerTests.swift` — fix pré-existant `self.conversationId`
  (2 closures `db.read`) qui bloquait la compilation de tout le bundle de tests.

### Vérification
- `./apps/ios/meeshy.sh build` : vert (77 s).
- `./apps/ios/meeshy.sh test` : 1265 tests, 12 skipped, **0 échec inattendu**.
  La « failure » `test_wholeArrayMessagesWrite_countIsExact` est pré-existante
  (`ConversationViewModel.swift` a 2 écritures whole-array `messages = ...` —
  fichier non touché par ce lot).

### Notes
- Contamination worktree partagé : `StoryViewerView*` + `StoryAudioAvailability*`
  sont du travail en cours d'un autre agent — NON inclus dans ce lot.
- Reste : vérification visuelle (audio non dupliqué, horloge image, plus de carré
  magenta, horodatages des messages en attente).
