# Intégration système iOS — identité CallKit, Now Playing en appel, PiP

**Date** : 2026-07-31 (révisé après revue Opus + investigation AVKit)
**Statut** : design révisé, à découper en trois plans d'implémentation
**Périmètre** : `apps/ios/Meeshy` + `packages/MeeshySDK` (aucun changement gateway ni schéma)

## Problème

Trois écarts d'intégration avec les surfaces système iOS, remontés depuis un appareil réel :

1. **Carte d'appel CallKit sans identité Meeshy** — un carré noir arrondi à la place du glyphe.
2. **Now Playing figé pendant un appel** — carte du dernier vocal bloquée à 00:00, transports morts.
3. **Pas de PiP quand on quitte l'app en appel** — et, une fois le PiP obtenu, il doit afficher les deux
   flux quand il est agrandi, et couper la caméra quand il est rangé sur le bord.

> **Note de révision.** La première version de ce spec attribuait (1) à l'absence de l'asset `CallKitIcon`
> et proposait pour (2) un remède reposant sur `togglePlayPause()`. La revue a réfuté les deux, mesures à
> l'appui. Les causes racines ci-dessous sont celles vérifiées.

## Lot A — Identité CallKit

### A0 · Cause racine du carré noir : l'AppIcon en variante sombre

`Assets.xcassets/AppIcon.appiconset/Contents.json` déclare une variante `luminosity: dark` pointant sur
`Icon-Dark-1024x1024.png`. **Ce fichier est un carré noir uni, entièrement opaque, sans aucun glyphe** —
sonde de 256 pixels sur une grille 64×64 : une seule couleur, `(0,0,0,255)`. Son poids le confirme :
20 KB, contre 856 KB pour `Icon-Light-1024x1024.png` qui contient bien le dégradé indigo et les dashes.

`apps/ios/CLAUDE.md` spécifie pourtant : « **Dark mode logo** : Black background + Indigo gradient
stacked-dashes icon ». L'asset livré ne respecte pas sa propre spécification.

Sur iOS 18+, les surfaces système en apparence sombre rendent cette variante. **Un carré noir arrondi est
exactement ce que cet asset produit.**

L'hypothèse initiale — un PNG opaque envoyé à `iconTemplateImageData` — est matériellement impossible :
`git log --all` sur `CallKitIcon.imageset` est vide, l'asset n'a jamais existé sur aucune branche. Et
`iconTemplateImageData == nil` ne peut pas dessiner un rectangle : `nil` signifie « pas de glyphe », pas
« glyphe plein ». L'absence d'asset et l'artefact observé sont deux problèmes disjoints.

**Correctif** : régénérer `Icon-Dark-1024x1024.png` (fond noir + dashes en dégradé indigo) depuis
`apps/ios/logo_master.svg`. Vérifier également `Icon-Tinted`, préparé à l'envers : Apple attend une image
dont la **luminance** porte le glyphe, l'asset actuel est noir sur blanc.

### A1 · Asset CallKit template

`CallManager.swift:653` garde `iconTemplateImageData` derrière `UIImage(named: "CallKitIcon")` — asset qui
n'existe pas. La branche est morte depuis son introduction (`ea5533330`). C'est un défaut réel, distinct
de A0 : il prive l'UI in-call CallKit du glyphe de marque.

Créer `CallKitIcon.imageset`, 40×40 pt (40/80/120 px). `iconTemplateImageData` est un **template** : iOS
ignore les couleurs et ne lit que le **canal alpha**. Depuis `logo_master.svg`, la forme juste est la bulle
**opaque** avec les trois traits **découpés en transparence** — un PNG opaque produirait un rectangle plein.

### A2 · Handle générique — Récents inertes

`CXHandle(type: .generic, value: <ObjectId 24-hex>)` (`CallManager.swift:3029-3031`, `:1288`, `:1541`) ne
résout contre aucun contact. Conséquences : avatar générique dans la carte d'appel, **et** entrées Récents
non rappelables — alors que `config.includesCallsInRecents = true` (`:649`) les écrit bel et bien.

C'est le plus gros des trois défauts d'identité, et le seul qui laisse une trace hors de l'app. **Décision :
hors périmètre de ce lot**, mais nommé ici pour ne pas être redécouvert — le corriger suppose d'arbitrer ce
que Meeshy publie dans l'annuaire système, ce qui est une décision produit distincte.

### A3 · Faire échouer bruyamment + tests

Le `if let` silencieux devient `Logger.calls.error` en release, `assertionFailure` en debug.

`CallProviderIconTests` : asset chargeable, 40×40 pt, **et canal alpha non trivial** — au moins un pixel
transparent ET un pixel opaque. La troisième assertion est celle qui compte ; un test `!= nil` passerait au
vert sur une image entièrement opaque, c'est-à-dire sur le bug qu'on corrige.

`AppIconIntegrityTests` : la variante dark ne doit pas être unicolore. C'est l'assertion qui aurait attrapé
A0 avant l'appareil.

## Lot B — Now Playing suspendu pendant un appel

### B0 · Cause racine réelle

`CallManager.swift:140-150`, dans `callState.didSet` :

```swift
MediaSessionCoordinator.shared.setCallActive(active)
if active && !oldValue.isActive { PlaybackCoordinator.shared.stopAll() }
```

`stopAll()` (`PlaybackCoordinator.swift:104-111`) appelle `stop()` sur tout `AudioPlaybackManager`
enregistré — dont le moteur du coordinateur (`ConversationAudioCoordinator.swift:109`, auto-enregistré via
`AudioPlayerView.swift:106-110`). `stop()` persiste la position puis `resetState()` : `player = nil`,
`isPlaying = false`, `currentTime = 0`.

**La lecture n'est donc pas « non couverte » : elle est déjà détruite.** Ce qui survit :

- `activeContext`, nil-é uniquement par `close()` et `advanceQueue()`, dont aucun ne tourne ;
- les écritures `currentTime = 0` / `isPlaying = false` se propagent par `assign(to:)`
  (`ConversationAudioCoordinator.swift:266-268`) et réveillent les sinks `+NowPlaying.swift:51-61` → un
  dernier `pushNowPlayingInfo()` avec `elapsed = 0`, `rate = 0` ;
- les `MPRemoteCommand` restent `isEnabled = true` (`+NowPlaying.swift:168-175`), et leurs handlers
  retombent sur les gardes `isCallActiveForAudioGuard`.

Résultat exact : **carte figée à 00:00, en pause, transports morts** — l'observation.

### B1 · Conception

**Suspendre la publication.** Un flag `_isSuspendedBySystemCall` court-circuite `pushNowPlayingInfo()`,
sinon le prochain tick republie la carte. `clearNowPlaying()` à l'entrée.

**Désarmer les commandes.** Basculer `isEnabled = false` sur `MPRemoteCommandCenter.shared()`.
**Jamais rappeler `installRemoteCommands`** : elle est one-shot (`_isNowPlayingActivated`) et ses
`_remoteCommandTokens` ne sont jamais retirés — un second appel doublerait les targets et ferait
double-déclencher chaque commande.

**Reprendre par `startCurrentHead()`, pas par `togglePlayPause()`.** Ce dernier est un no-op :
`AudioPlayerView.swift:285` garde sur `player`, qui est nil après `stop()`. Seul un vrai
`engine.play(urlString:)` relance. **La position vient gratuitement** : `stop()` a persisté
(`persistPosition()`) et `playData` applique `applyResumePositionIfAvailable()`
(`AudioPlayerView.swift:236`) — rien à mémoriser.

**Ordonnancement — le piège.** `@Published` émet en `willSet`. Un sink **synchrone** voit donc
`isPlaying` encore vrai, *avant* `stopAll()` ; un sink `.receive(on: DispatchQueue.main)` est différé au
tour de runloop suivant et voit `isPlaying == false`. Or **les trois abonnements existants du fichier**
(`ConversationAudioCoordinator.swift:281`, `:288`, `:296`) utilisent `.receive(on:)` : implémenter par
mimétisme donne la version cassée. La capture de « était-elle en cours » doit être **synchrone**, ou être
poussée depuis `CallManager` avant `stopAll()`.

**Un seul prédicat, et la fenêtre `.ended`.** `CallState.isActive` est faux pour `.idle` **et** `.ended`.
Deux pièges symétriques :

- sortir sur `.idle` seul : `endCallInternal` pose `.ended` puis attend 1,5 s ; un appel démarré dans cette
  fenêtre ne repasse jamais par `.idle` → NowPlaying reste suspendu pour le reste du process ;
- sortir sur `!isActive` : `endCurrentAndAnswerPending()` (`CallManager.swift:2484-2512`) passe par `.ended`
  puis dort 0,5 s avant `.ringing`. Le call-waiting §7.6 **relancerait un vocal pendant le handoff**.

La sortie doit donc être **différée et annulable** : armer à l'entrée dans `.ended`, annuler si un état
actif revient avant échéance. Le délai couvre les deux fenêtres connues (1,5 s et 0,5 s).

**Ne pas ajouter un quatrième canal.** Trois mécanismes agissent déjà sur ce périmètre :
`PlaybackCoordinator.stopAll()`, `MediaSessionCoordinator.setCallActive` — qui **émet déjà
`.callEndedShouldResume`** sur le front descendant (`MediaSessionCoordinator.swift:95-107`) — et deux
observateurs concurrents d'`AVAudioSession.interruptionNotification` (`CallManager.swift:705-716`,
`MediaSessionCoordinator.swift:239-248`). Le lot B **se branche sur `.callEndedShouldResume`**, canal SDK
conçu pour ce signal. Son seul abonné actuel est `StoryCanvasUIView+Audio.swift:127-135` : vérifier
qu'un canvas story à l'écran et le coordinateur ne reprennent pas simultanément — ils se couperaient
mutuellement via `PlaybackCoordinator.willStartPlaying`.

**Ne pas s'abonner depuis `init`.** `ConversationAudioCoordinator.init` ne fait aujourd'hui que *capturer*
`CallManager.shared` dans une closure. S'y abonner le construirait **eagerly** — donc `WebRTCService`,
`CXProvider`, `NWPathMonitor` au lancement de l'app (`AdaptiveRootView.swift:23-26` monte le coordinateur
à la racine), et dans des tests purement audio. Utiliser un push depuis `CallManager`, sur le modèle de
`setCallActive`.

### B2 · Limite à assumer

Sans CallKit — simulateur, iOS-app-on-Mac, région CN (`CallManager.swift:334-346`) — le Control Center
devient **vide** pendant un appel au lieu d'afficher la carte in-call. FaceTime, WhatsApp et Telegram y
montrent l'appel. Meeshy l'obtient gratuitement *seulement si* `callUsesCallKit`. Dans ces configurations,
le résultat est un vide plutôt qu'une carte périmée — préférable, mais à énoncer.

## Lot C — PiP

### C0 · Règle cadre : PiP ⟺ flux vidéo

Aucune fenêtre PiP pour un appel audio-only. iOS n'expose pas de PiP sans source vidéo, et l'alternative
— publier une piste factice pour rendre l'appel éligible — est écartée : coût batterie et bande passante,
risque App Review. La surface d'un appel audio quitté est l'indicateur CallKit.

### C1 · L'ancre PiP disparaît en mode pilule

`PiPSourceAnchor` (`CallView.swift:80`, définie `:1535-1545`) est le **seul** appelant de
`attachSystemPiP`. `RootView.swift:73-83` gate le `fullScreenCover` sur `displayMode == .fullScreen` ;
réduire l'appel (`RootView.swift:80`, `CallView.swift:192/474/640`, `FloatingCallPillView.swift:369`)
démonte le cover et libère l'ancre. `pipConfiguredSource` étant `weak` (`CallManager.swift:2134`), il passe
à nil et **rien ne reconfigure**. Ni `CallBubbleView` ni `FloatingCallPillView` ne fournissent d'ancre de
rechange — vérifié.

**Décision : deux ancres, et une garde d'idempotence corrigée.** Déplacer simplement l'ancre dans
`RootView` échangerait un défaut contre un autre : le `fullScreenCover` présente en
`UIModalPresentationFullScreen`, UIKit détache la hiérarchie présentante de la fenêtre, et une ancre y
résidant serait **hors fenêtre** pendant que `CallView` est affichée — ce qui rendrait le bouton PiP manuel
(`CallView.swift:1627-1638`, gardé par `isPictureInPicturePossible`) inopérant dans le seul cas qui
fonctionne aujourd'hui.

On garde donc l'ancre de `CallView` **et** on en ajoute une dans `RootView`, active en `.pip`/`.bubble`.
Cela expose un second défaut : `attachSystemPiP` voit une `sourceView` différente à chaque bascule, la
garde `CallManager.swift:2165` laisse passer, et `pip.configure()` commence par `tearDown()` →
`stopPictureInPicture()`. **Un PiP en cours serait tué à chaque changement de `displayMode`.**

Correctif de la garde : **refuser toute reconfiguration tant qu'un PiP est actif**. L'affirmation
« `attachSystemPiP` est déjà idempotent » est fausse dans ce contexte — l'idempotence est clé sur
l'identité de la source view et ne survit pas à son changement.

> Architecture visée à terme : une `UIWindow` dédiée à l'UI d'appel, comme FaceTime, WhatsApp et Telegram —
> une source view y est toujours en fenêtre, quel que soit le mode d'affichage. C'est la cause structurelle ;
> ce lot en traite le symptôme. Hors périmètre, nommé pour la suite.

### C2 · Retour d'arrière-plan : mode d'affichage non restauré

`foregroundObserver` (`CallManager.swift:3077-3101`) émet `emitCallForegrounded` et restaure le signal
caméra, mais **ne touche jamais `displayMode`**. Celui-ci n'est forcé à `.fullScreen` qu'au setup d'appel
(`:982`, `:1186`, `:1272`, `:1534`), au restore PiP (`:2173`) et par tap utilisateur. Un appel réduit puis
backgroundé revient **déterministiquement** en pilule.

Ce n'est pas une vérification à mener, c'est un défaut prouvé par lecture du code. Il entre au périmètre engagé.

### C3 · Le signal caméra est coupé alors que la caméra tourne

`CallManager.swift:3056-3076` **ne coupe pas la caméra** — aucun `stopCapture()`. Il émet
`emitCallToggleVideo(enabled: false)`, c'est-à-dire un **signal** au pair, et pose
`isVideoSuspendedByBackground`.

Or `isMultitaskingCameraAccessEnabled = true` est déjà posé avant `startCapture`
(`P2PWebRTCClient.swift:289-292`), et les trois conditions d'Apple sont remplies : `voip` dans
`UIBackgroundModes` (`Info.plist:105-112`), lien sur SDK ≥ iOS 18, propriété activée avant `startRunning`.
Depuis iOS 18, `isMultitaskingCameraAccessSupported` vaut `true` pour les apps VoIP sur **iPhone** — la
restriction iPad/Stage Manager est l'état iOS 16/17.

Le commentaire `CallManager.swift:607-612` — « iOS enforces camera suspension in the background » — est
donc **factuellement faux**. Conséquence actuelle : en arrière-plan avec PiP actif, Meeshy capture et
encode réellement, mais a dit au pair « caméra coupée ». **On dépense la batterie et le pair perd le flux.**

**Correctif** : remplacer le déclencheur `didEnterBackground` par la vraie source de vérité —
`AVCaptureSession.wasInterruptedNotification` avec `.videoDeviceNotAvailableInBackground`, ou
`isMultitaskingCameraAccessEnabled == false`. Ne pas émettre `toggle-video false` sur simple passage en
arrière-plan quand le PiP est actif et l'accès multitâche accordé.

Conditionner au **runtime** sur `isMultitaskingCameraAccessEnabled`, jamais sur `#available(iOS 18)` : la
propriété est KVO-observable et peut repasser à `false`.

### C4 · Deux flux quand le PiP est agrandi

Quand la fenêtre atteint son pas maximal : **flux distant en haut, caméra locale en bas**, empilés
verticalement dans le ratio 9:16 existant. Aux autres tailles : flux distant seul.

L'empilage vertical est retenu contre le côte-à-côte horizontal littéral : en 9:16, deux colonnes donnent
des bandes très étroites. Et le ratio reste **inchangé** — muter `preferredContentSize` à chaud n'est pas
garanti par la doc Apple et déplacerait la fenêtre sous le doigt de l'utilisateur, écrasant le pas de
taille qu'il vient de choisir.

**Détection de la taille maximale.** Aucun seuil absolu n'est viable : la taille dépend du ratio, de
l'écran et de l'orientation, et l'activation du PiP peut elle-même altérer `UIScreen.main.bounds`. Le
signal exploitable est `viewDidLayoutSubviews` d'une sous-classe d'`AVPictureInPictureVideoCallViewController`
(`PiPCallController.swift:118-133`). `didTransitionToRenderSize` n'est **pas** disponible : elle appartient
à `AVPictureInPictureSampleBufferPlaybackDelegate`, non câblé par `ContentSource(activeVideoCallSourceView:)`.

iOS n'expose que **trois pas discrets**. Le classement se fait par **rang auto-calibré** : mémoriser les
largeurs distinctes observées pour une clé `(ratio, orientation, taille de scène)`, et ne conclure « max »
que si une valeur strictement plus petite a déjà été vue — sinon `.unknown`, et pas de bascule. Hystérésis
d'environ 8 pt et debounce : `viewDidLayoutSubviews` tire à chaque frame de l'animation de redimensionnement.

**Rendu.** Un second `PiPVideoRenderer` sur un second `PiPVideoSampleBufferView` — le type est réutilisable
tel quel (`nonisolated`, queue série, throttle, backpressure). Le flux local ne coûte **aucun décodage** :
les `CVPixelBuffer` sortent déjà du capturer. Throttler la voie locale plus fort que la distante. La
rotation de la voie locale vient du capturer, pas de `RTCVideoFrame.rotation` du décodeur.

**Dégradation** : si `isMultitaskingCameraAccessEnabled` est faux, la vignette locale est remplacée par
l'avatar. Le côte-à-côte n'est pas disponible sur iPhone sous iOS 16/17.

### C5 · PiP rangé sur le bord (stash)

**Aucune API publique ne détecte le stash.** Vérification exhaustive du SDK iOS 26.1 :
`AVPictureInPictureControllerDelegate` compte six méthodes, aucune ne le concerne ; aucune notification
AVKit ; `viewWillDisappear` n'est pas appelé (le PiP reste actif). Apple **documente l'état** dans
`AVPictureInPictureController_VideoCallSupport.h` puis ne l'expose pas. `isPictureInPictureSuspended` est
un faux ami : il signale la préemption par une autre app, typiquement FaceTime.

**Deux conséquences qui changent le travail.** D'abord, **iOS coupe déjà lui-même la caméra** au stash —
le header le dit : « the camera will be unavailable until the device is unlocked or Picture in Picture is
unstashed ». La règle produit n'est donc pas à implémenter côté capture, mais à **propager**. Ensuite, le
signal disponible est conflaté avec le **verrouillage de l'écran** : Apple met les deux cas dans la même
phrase.

**Conception** : exposer un état unique **« PiP non visible »**, sans chercher à distinguer stash et
verrouillage — la décision produit est identique. Source du signal, prescrite par Apple dans *Adopting
Picture in Picture for video calls* :

```
non visible  ← AVCaptureSession.wasInterruptedNotification (.videoDeviceNotAvailableInBackground)
visible      ← AVCaptureSession.interruptionEndedNotification
```

Sur bascule vers « non visible » : émettre `call:toggle-video false` au pair et tomber à 0 fps sur les deux
renderers. Sur retour : ré-émettre `true` et restaurer le framerate thermique. C'est le même mécanisme que
C3 — un seul état, deux consommateurs.

Prévoir un `default` non fatal sur `InterruptionReason` : iOS 26 ajoute `.sensitiveContentMitigationActivated`.

### C6 · Fin d'appel pendant le PiP

`endCallInternal` appelle `detachSystemPiP()` (`CallManager.swift:3577`) **avant** de poser `.ended`.
`tearDown()` appelle `stopPictureInPicture()` puis immédiatement `delegate = nil` et `pipController = nil`
(`PiPCallController.swift:172-177`) : le callback `didStopPictureInPicture` n'arrive jamais, et la closure
`onStop` (`CallManager.swift:2175-2187`) — dont le commentaire traite précisément ce cas — est **du code
mort sur ce chemin**.

Avec `displayMode == .pip`, `shouldPresentFullScreenCover` est faux, la pilule est masquée
(`FloatingCallPillView.swift:111`) et la bulle aussi (`CallBubbleView.swift:30`) : **l'appel disparaît sans
panneau de fin**. Le lot C rend ce chemin courant pour la première fois, il doit donc le couvrir : restaurer
un mode d'affichage porteur d'UI avant le teardown, et laisser l'animation de fermeture s'achever avant de
désallouer le contrôleur AVKit.

### C7 · Prérequis `.videoChat` à vérifier

`AVPictureInPictureVideoCallViewController` requiert `.playAndRecord` **avec le mode `.videoChat`**. Or
`CallManager.swift:3743` dérive le mode de `isVideoEnabled` — la caméra **locale** — alors que
`canActivateSystemPiP` (`:2152-2154`) n'exige qu'un track **distant**, cas de l'escalade vidéo unilatérale
documenté `:2148-2151`. Dans ce cas la session est en `.voiceChat` et le PiP peut refuser de démarrer.
Non vérifiable sans appareil : test appareil à mener dans le lot.

### C8 · Contrôles dans la fenêtre PiP

Un utilisateur parti dans une autre app **ne peut pas raccrocher** : la vue PiP n'héberge que
`surfaceView` (`PiPCallController.swift:118-123`). FaceTime expose mute, raccrocher et flip caméra ;
WhatsApp expose raccrocher. C'est le plus gros écart UX du lot.

**Décision : hors périmètre de cette itération, mais nommé.** La vue PiP ne reçoit aucun touch — les
contrôles supposent le chemin `AVPictureInPictureController` avec contrôles système, ou une refonte du
contentViewController. À traiter dans une itération dédiée.

## Découpage recommandé

Le périmètre a doublé depuis la revue. Trois plans d'implémentation distincts, livrables indépendamment :

| Plan | Contenu | Dépendances |
|---|---|---|
| **1 — Identité CallKit** | A0, A1, A3 | aucune |
| **2 — Audio en appel** | B0, B1 | aucune |
| **3 — PiP** | C0 → C7 | aucune, mais C3 et C5 partagent l'état « PiP non visible » |

Le plan 3 est le plus lourd et pourrait se scinder à son tour : *(3a)* correction des chemins existants
(C1, C2, C3, C6, C7), *(3b)* affichage double flux (C4, C5).

## Hors périmètre — nommé, non traité

- **A2** — `CXHandle(.generic)` : avatar générique et Récents inertes.
- **C8** — contrôles dans la fenêtre PiP.
- **UIWindow dédiée** pour l'UI d'appel — cause structurelle de C1.
- **Live Activity / Dynamic Island** pour les configurations sans CallKit.
- Escalade vidéo artificielle pour rendre un appel audio éligible au PiP.
- Retrait du bridge Now Playing hors appel : comportement voulu, inchangé.

## Critères d'acceptation

1. Un appel entrant affiche le glyphe Meeshy — pas un carré noir — dans la carte CallKit.
2. La variante sombre de l'AppIcon contient un glyphe (assertion : non unicolore).
3. Le Control Center n'affiche aucune carte audio pendant un appel Meeshy.
4. Un vocal interrompu par un appel **reprend à sa position** en fin d'appel ; un vocal déjà en pause ne
   reprend pas ; un « raccrocher et répondre » ne provoque aucun flap.
5. Un appel vidéo réduit en pilule bascule en PiP système quand on quitte l'application.
6. Le bouton PiP manuel reste fonctionnel en plein écran (non-régression de C1).
7. Une bascule de `displayMode` pendant un PiP actif ne le ferme pas.
8. Le PiP agrandi au maximum affiche les deux flux empilés ; réduit, le flux distant seul.
9. PiP rangé ou écran verrouillé → le pair est notifié et le rendu tombe à 0 fps ; au retour, les deux
   reprennent.
10. Un appel terminé pendant le PiP laisse une UI de fin visible.
11. Un appel audio quitté reste visible via l'indicateur CallKit, et le tap ramène sur `CallView` plein écran.
12. `./apps/ios/meeshy.sh test` vert.

> **Les critères 1, 5 à 11 ne sont pas vérifiables sur simulateur** : `platformSupportsCallKit`
> (`CallManager.swift:334-346`) est faux sur simulateur, iOS-app-on-Mac et en région CN, et le PiP exige
> un appareil. Un `meeshy.sh test` vert (critère 12) ne les valide pas. Validation appareil obligatoire.
