# Un contenu qui disparaît ne sort pas de Meeshy, et une vidéo ne joue qu'à un endroit

Directive porteur du 2026-10-07, conception validée le même jour. L'état des tâches vit dans les issues #9572, #9573, #9574 (milestone 151) et #9575, #9577 (milestone 152) ; ce document ne porte que la conception.

Plateformes : gateway, `packages/shared`, iOS, `apps/web` (navigateur et coque Android). Le Kotlin natif est gelé et ne reçoit rien.

## 1. La loi de sortie (#9572)

Un message a une NATURE de disparition, lue sur le message ET sur chacune de ses pièces jointes (la plus restrictive gagne) :

| Nature | Reconnue par | Transférer | Enregistrer, Imager, partager, publier | Capture d'écran |
|---|---|---|---|---|
| ordinaire | aucun drapeau | oui | oui | libre |
| flamme à durée | `EPHEMERAL` sans `EPHEMERAL_AFTER_READ`, durée connue | oui, durée ≤ source | non | bloquée |
| flamme après lecture | `EPHEMERAL_AFTER_READ` | non | non | bloquée |
| vue unique | `isViewOnce` ou `VIEW_ONCE`, message ou pièce | non | non | bloquée |

Une copie transférée porte durée ET `EPHEMERAL_AFTER_READ` : elle est « après lecture » pour le transfert suivant, donc ne se retransfère pas.

Le flou et le chiffrement gardent leurs restrictions actuelles ; la loi les compose, elle ne les remplace pas.

Site unique : une fonction pure dans `packages/shared/utils/`, à côté de `reply-protection-contagion.ts`, qui rend la nature et les trois verdicts. Miroir Swift dans `packages/MeeshySDK` (modèle stateless). Aucun client ne réécrit la règle ; les prédicats existants (`isForwardable`, `forwardRefusalOf`, `MessageCardSubject.isExportable`, `mediaPageOffers`, `protectionOf`) deviennent des projections de la loi ou la consultent.

## 2. Gateway : le serveur impose (#9572)

Dans `forwardAdmission.ts` et `MessagingService.handleMessage` :

- Le `select` de la source lit aussi `effectFlags`, `isBlurred`, et la protection des pièces jointes.
- Refus `view-once-not-forwardable` étendu à la pièce jointe ; nouveau refus pour la flamme après lecture.
- Source flamme à durée : la copie reçoit `min(durée demandée, durée source)` (durée demandée absente ou invalide ⇒ durée source), les bits `EPHEMERAL | EPHEMERAL_AFTER_READ`, et le flou de la source. Ces champs écrasent ceux de la requête.
- `ephemeralSendFields` accepte la coexistence durée + après lecture sur ce chemin : l'échéance par destinataire (`MessageStatusEntry.ephemeralExpiresAt`) borne, la consommation après lecture retire plus tôt. Le premier des deux l'emporte.
- `copyForwardedAttachments` recopie `isViewOnce`, `isBlurred`, `effectFlags` de chaque pièce.
- `copyAttachmentsFromMessageId` et la publication en post, réel ou story appliquent le verdict « exporter » de la loi.

Rétrocompatibilité : la requête de transfert ne change pas de forme ; `ephemeralDuration` y est déjà acceptée. Un ancien client obtient la durée de la source. Un ancien client qui REÇOIT une copie durée + après lecture la traite au pire comme l'une des deux ; le serveur détruit à l'échéance dans tous les cas. À vérifier par test sur les lecteurs de `effectFlags` des deux clients.

Ce lot passe par l'agent `auditeur-adversarial` avant fusion.

## 3. Clients iOS et web (#9573)

- Menu de message, feuille « Plus », visionneuse (menu ⋯, colonne d'actions), « Imager », « Imager la discussion », publication : n'offrent que ce que la loi autorise. Un bouton interdit n'est pas rendu.
- Feuille de transfert : source flamme à durée ⇒ une rangée de durée, celle de la source présélectionnée, seuls les paliers ≤ (15 s, 30 s, 1 min, 5 min, 1 h, 24 h ; une durée source hors palier s'affiche telle quelle en tête). La valeur part dans `ephemeralDuration`.
- Une sélection multiple contenant un message non transférable : l'action Transférer est absente.

## 4. Anti-capture (#9574)

- iOS : un conteneur SDK agnostique rend son contenu dans la couche sécurisée du système (capture et enregistrement donnent du noir). L'application l'applique au contenu des natures non ordinaires, bulle et visionneuse.
- Coque Android : `FLAG_SECURE` posé et retiré par un compteur de contenus protégés visibles, via un pont Capacitor.
- Navigateur : aucun blocage possible. Le contenu protégé est masqué quand le document perd le focus ou la visibilité. Limite acceptée.

## 5. Vidéo inline et PIP (#9575)

- `_InlineOverlayControls.topBar` (iOS) et `video-tile.tsx` (web) : agrandir au bord gauche, mute au bord droit ; les autres contrôles (PIP, AirPlay, vitesse) restent groupés avant le mute, à droite. La spec `2026-08-10-inline-video-top-controls-centered-design.md` est supplantée.
- iOS : `SharedAVPlayerManager` expose un verdict unique « cette surface peut monter le lecteur pour cette URL », qui rend faux pour une surface inline tant que le PIP est actif. Les sept sites (`_InlineRenderer`, `GalleryVideoPage`, `currentAttachmentIsActiveTrack`, `_FullscreenRenderer`, `ReelVideoView`, `ReelFeedVideoSurface`, `MeeshyScenePlayer`) le consomment. Le PIP s'arrête quand l'application revient au premier plan sur une surface plein écran qui reprend la vidéo. Le lecteur plein écran du SDK configure le PIP avant de le démarrer.
- Web : la tuile et la visionneuse réclament sous des clés distinctes (`claimKey`) ; l'entrée en PIP met la tuile en pause ; le démontage quitte le PIP.

## 6. Plein écran (#9577)

De haut en bas : barre haute, scène, barre de progression sur toute la largeur de l'écran, ligne d'informations, pellicule.

- Mute et (...) quittent la ligne de la barre et rejoignent la colonne d'actions de droite, sous « Composer ».
- Ligne d'informations : `largeur × hauteur · poids · durée`, séparés par un point médian. Pendant la lecture, la durée affiche le temps restant et décompte ; à l'arrêt, la durée totale.
- Bouton pause : effacé 1 seconde après le début de la lecture. Un toucher le ramène (et réarme la seconde) ; un toucher sur le bouton visible met en pause. En pause, il reste affiché.
- Le toucher qui ramène le bouton garde AUSSI son effet : il bascule le plein cadre (galerie iOS, visionneuse web) ou le chrome (`_FullscreenRenderer`) dans le même geste. Il ne s'arrête jamais au bouton (décision porteur du 2026-10-08, #9577 : iOS s'aligne sur le web).
- Mêmes règles pour la galerie de conversation iOS, `_FullscreenRenderer` du SDK et `media-viewer.tsx`.
- Amende `2026-09-12-lecture-media-plateau-design.md` § 2 et `docs/product/visionneuse-plein-ecran.md` § 2.3.

## Méthode

TDD, un témoin rouge avant chaque changement. Les gardes de source qui figent l'ancienne disposition (`MediaGalleryTransportCorridorTests`, `TransportLayoutTests`, `video-tile-fullscreen.test.tsx`) sont réécrites en premier. Un seul lot iOS à la fois ; suites lourdes sur la CI.
