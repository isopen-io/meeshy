# Intégration système iOS — identité d'icônes, Now Playing en appel, PiP

**Date** : 2026-07-31 · **Révision 3** (après revue initiale + deux relectures de validation)
**Statut** : design arrêté, à découper en trois plans d'implémentation
**Périmètre** : `apps/ios/Meeshy` + `packages/MeeshySDK` (aucun changement gateway ni schéma)

## Problème

Trois écarts d'intégration avec les surfaces système iOS, remontés depuis un appareil réel :

1. **Carré noir à la place du glyphe Meeshy** dans la carte d'appel entrant.
2. **Now Playing figé pendant un appel** — carte du dernier vocal bloquée à 00:00, transports morts.
3. **Pas de PiP quand on quitte l'app en appel** — et une fois le PiP obtenu, il doit afficher les deux
   flux quand il est agrandi, et cesser de consommer quand il est rangé sur le bord.

> **Historique des révisions.** La v1 attribuait (1) à l'absence de l'asset `CallKitIcon` et proposait pour
> (2) un remède reposant sur `togglePlayPause()` : les deux ont été réfutés, mesures à l'appui. La v2 a
> réécrit ces causes racines et ajouté les sections PiP. Deux relectures de validation ont ensuite relevé
> onze bloquants, dont sept erreurs de conception. Cette v3 les intègre. Les affirmations ci-dessous ont
> toutes été vérifiées contre le code ; celles qui exigent un appareil sont marquées **[appareil]**.

---

# Lot A — Identité d'icônes

## A0 · L'AppIcon en variante sombre est vide

`Contents.json:9-20` déclare `appearances: [luminosity/dark] → Icon-Dark-1024x1024.png`. **Ce PNG a
exactement une couleur distincte sur ses 1 048 576 pixels** : `(0,0,0,255)`. Il pèse 20 614 o contre
856 261 o pour `Icon-Light-1024x1024.png`. L'asset est bien compilé et embarqué — vérifié dans le
`Assets.car` du build : `AppIcon | Appearance = UIAppearanceDark | 1024×1024`.

`apps/ios/CLAUDE.md` spécifie « Black background + Indigo gradient stacked-dashes icon ». L'asset livré ne
respecte pas sa propre spécification. C'est le seul asset de l'app qui rende un carré noir arrondi uni.

**[appareil] — lien avec la carte CallKit non établi.** Que la carte d'appel entrant résolve la variante
*dark* n'est pas démontrable depuis le dépôt : cette carte est dessinée par le système avec sa propre
chrome sombre, indépendamment du réglage d'apparence de l'utilisateur. Ce qui est établi : la variante est
compilée, embarquée, et c'est le seul candidat correspondant à l'artefact. **À confirmer sur appareil.**
Indépendamment de ce lien, l'asset viole sa spécification et doit être corrigé.

`Contents.json:33-92` — les 10 entrées restantes sont toutes `idiom: mac` sans `appearances`. La couverture
dark + tinted est donc **complète**, rien d'autre à chercher.

## A1 · Source de régénération : `logo_dark.svg`, pas `logo_master.svg`

Les deux fichiers divergent en palette **et** en composition :

| Fichier | Dégradé | Forme |
|---|---|---|
| `logo_master.svg` | `#2563eb → #4f46e5` | bulle arrondie + 3 traits internes |
| `logo_dark.svg` / `logo_light.svg` | `#6366f1 → #4338ca` | 3 dashes empilés, sans bulle |

L'échantillonnage d'`Icon-Light-1024x1024.png` donne `(85,82,224)`, `(86,83,225)`, `(77,70,214)` — la rampe
`#6366F1 → #4338CA`. C'est `logo_dark.svg`/`logo_light.svg` qui font foi, et c'est la palette Indigo du
design system. Régénérer depuis `logo_master.svg` livrerait une marque différente de celle de l'app.

**Le vecteur est correct ; c'est l'export PNG qui est cassé.** `logo_dark.svg` encode déjà exactement la
cible : `<rect fill="#000000"/>` plus trois `path` en `stroke="url(#dashGradient)"`. Le rasteriseur employé
à l'époque a perdu le dégradé appliqué sur un *stroke* et n'a gardé que le fond. Le correctif est donc une
**régénération**, pas un redessin.

Géométrie de référence (viewBox 1024) : trois traits horizontaux à `y = 384 / 512 / 640`, de `x = 262` à
`762 / 662 / 562`, `stroke-width: 80`, `stroke-linecap: round`. Dégradé linéaire diagonal `(0,0) → (1024,1024)`.

**Tinted : le SVG source est inversé lui aussi.** `logo_tinted.svg` dessine les dashes en `stroke="black"`
sur fond transparent ; le PNG livré est noir sur blanc. Apple attend une image dont la **luminance** porte
le glyphe — donc glyphe clair sur fond sombre. Corriger le SVG **et** le PNG ; régénérer depuis le SVG
actuel reproduirait le défaut.

## A2 · Asset template CallKit

`CallManager.swift:653` garde `iconTemplateImageData` derrière `UIImage(named: "CallKitIcon")` — asset qui
n'a **jamais existé** (`git log --all --diff-filter=A` vide). Branche morte depuis `ea5533330`. Défaut réel
et distinct d'A0 : il prive l'UI in-call CallKit du glyphe de marque.

Créer `CallKitIcon.imageset`, 40×40 pt (40/80/120 px). `iconTemplateImageData` est un **template** : iOS
ignore les couleurs et ne lit que le **canal alpha**. La source juste est donc `logo_tinted.svg` — dashes
opaques sur fond transparent, structure exactement conforme. Un PNG opaque produirait un rectangle plein.

## A3 · Garde bruyante

Le `if let` silencieux devient `Logger.calls.error` en release, `assertionFailure` en debug. Une suppression
ou un renommage d'asset ne doit plus pouvoir dégrader l'écran d'appel sans laisser de trace.

## A4 · Tests — le sujet de l'assertion d'intégrité n'existe pas au runtime

`CallProviderIconTests` est implémentable : l'asset se charge, mesure 40×40 pt, et **son canal alpha est
non trivial** (au moins un pixel transparent ET un pixel opaque). Cette troisième assertion est celle qui
compte : un test `!= nil` passerait au vert sur une image entièrement opaque, c'est-à-dire sur le bug.

**L'intégrité de l'AppIcon ne peut pas être testée de la même façon.** Dans le `Assets.car`, `AppIcon` est
de type *Icon Image* / *MultiSized Image*, pas *Image* : il n'est pas récupérable par `UIImage(named:)`, et
la sélection d'apparence suppose un `UIImageAsset` que ce type n'expose pas. Le bundle construit ne contient
en clair que les rasters de la variante **claire**.

**Décision : contrôle de dépôt, pas test XCTest.** L'assertion « la variante dark n'est pas unicolore »
s'ajoute à `apps/ios/Meeshy.xcodeproj/validate_app_store_readiness.sh`, qui parcourt déjà
`AppIcon.appiconset/` sur disque (`:211-224`). C'est le seul endroit où le sujet existe réellement.

---

# Lot B — Now Playing suspendu pendant un appel

## B0 · Cause racine

`CallManager.swift:140-150`, dans `callState.didSet` : `MediaSessionCoordinator.shared.setCallActive(active)`
puis, sur front inactif→actif, `PlaybackCoordinator.shared.stopAll()`.

`stopAll()` (`PlaybackCoordinator.swift:104-111`) appelle `stop()` sur tout `AudioPlaybackManager`
enregistré. Le moteur du coordinateur en fait partie : `AudioPlaybackManager.init` s'enregistre lui-même
(`AudioPlayerView.swift:106-110`, `register(self)` en `:108`) et `ConversationAudioCoordinator.swift:109`
prend cet init par défaut. `stop()` persiste la position puis `resetState()` : `player = nil`,
`isPlaying = false`, `currentTime = 0`.

**La lecture est donc déjà détruite.** Ce qui survit :

- `activeContext` — non nil-é sur ce chemin ;
- les écritures `isPlaying = false` / `currentTime = 0` se propagent par `assign(to:)`
  (`ConversationAudioCoordinator.swift:265-269`) et réveillent les sinks `+NowPlaying.swift:51-61` → un
  dernier `pushNowPlayingInfo()` avec `elapsed = 0`, `rate = 0` ;
- les `MPRemoteCommand` restent `isEnabled = true` (`+NowPlaying.swift:168-175`).

**Deux commandes sur cinq ne sont pas gardées.** `nextTrackCommand` (`+NowPlaying.swift:141-145`) →
`playNext()` (`ConversationAudioCoordinator.swift:149`) → `advanceQueue()` (`:234`) : **aucune garde
d'appel**. Un tap « suivant » sur la carte périmée dépile la tête de file, l'ajoute à
`consumedAttachmentIds` (`:242`), et soit nil-e `activeContext` (`:253`) — ce qui **efface** la carte — soit
appelle `startCurrentHead()` qui, lui, bute sur la garde (`:219`). `changePlaybackPositionCommand` →
`seek(toFraction:)` (`:201`) est également non gardé, mais inoffensif (`player == nil`).

L'état n'est donc pas seulement inerte : il est **destructeur**. C'est ce qui rend le désarmement des
commandes indispensable, et non redondant avec les gardes existantes.

## B1 · Conception

**Suspendre la publication.** Un flag `_isSuspendedBySystemCall` court-circuite `pushNowPlayingInfo()` —
sans lui, le prochain tick republie la carte. `clearNowPlaying()` à l'entrée.

**Désarmer les commandes.** Basculer `isEnabled = false` sur `MPRemoteCommandCenter.shared()`. **Jamais
rappeler `installRemoteCommands`** : elle est one-shot (`_isNowPlayingActivated`) et ses
`_remoteCommandTokens` ne sont jamais retirés — un second appel doublerait les targets.

**Reprendre par `startCurrentHead()`.** `togglePlayPause()` est un no-op : `AudioPlayerView.swift:285` garde
sur `player`, nil après `stop()`. Seul `engine.play(urlString:)` relance. **La position vient gratuitement** :
`stop()` a persisté et `playData` applique `applyResumePositionIfAvailable()` (`AudioPlayerView.swift:236`).

**Ordonnancement — capture synchrone obligatoire.** `@Published` émet en `willSet`. Un sink **synchrone**
voit `isPlaying` encore vrai, *avant* `stopAll()` ; un sink `.receive(on: DispatchQueue.main)` est différé et
voit `false`. Or les trois abonnements existants du fichier (`ConversationAudioCoordinator.swift:281`,
`:288`, `:296`) utilisent `.receive(on:)` : **implémenter par mimétisme donne la version cassée.** La
capture de « était-elle en cours » doit être poussée depuis `CallManager` avant `stopAll()`.

### Sortie : trois fenêtres `.ended`, dont une de 12 secondes

`CallState.isActive` est faux pour `.idle` **et** `.ended`. Trois délais coexistent :

| Fenêtre | Constante | Site |
|---|---|---|
| Fin d'appel standard | `callEndSettleSeconds` = 1,5 s | `CallManager.swift:3615-3617` |
| **Fin retryable** | **`callEndRetryableSettleSeconds` = 12,0 s** | `WebRTCTypes.swift:1208`, sélectionnée `:3615-3617` |
| Handoff call-waiting | `endAndAnswerPendingHandoffSeconds` = 0,5 s | `CallManager.swift:2492-2493` |

Sur échec transitoire retryable, `.ended` tient **12 s** pendant lesquelles l'affordance « Réessayer » est
vivante ; un tap re-entre dans `startCall` → état actif → `stopAll()`. **Tout délai inférieur à 12 s rejoue
le flap que le critère 5 interdit**, sur un chemin plus fréquent que le call-waiting.

**Décision retenue — s'accrocher à `.idle`, sans réimplémenter aucun délai** *(simplification adoptée à
l'implémentation, en remplacement du « délai différé et annulable » prescrit ci-dessus)*.

`CallManager` arbitre déjà ces trois fenêtres via son `settleToken` : le settle Task
(`CallManager.swift:3618-3643`) pose `.idle` après le délai approprié et bail si un nouvel appel a nilé le
token. Le handoff call-waiting ne passe donc **jamais** par `.idle`, et un tap « Réessayer » dans la fenêtre
de 12 s non plus. Les trois fenêtres sont couvertes par construction, sans dupliquer une seule constante —
ce qui supprime du même coup le risque de désynchronisation que la version précédente cherchait à éviter.

**Piège à traiter — `.idle` transitoire.** `resetEndedStateForNewCall` (`CallManager.swift:893`) pose
`.idle` juste avant de démarrer l'appel suivant. Une reprise synchrone relancerait un vocal une fraction de
seconde avant que le nouvel appel ne le tue. La reprise est donc **différée d'un tour de runloop et
revérifiée** (`callState == .idle` encore vrai).

> Correction d'une justification erronée de la v2 : « un appel démarré dans la fenêtre 1,5 s ne repasse
> jamais par `.idle` » est faux. Le Task de settle (`CallManager.swift:3618-3634`) est gardé par token, et
> l'appel n°2 a son propre `.ended` et son propre `.idle`. Le vrai argument contre « sortir sur `.idle`
> seul » est le handoff de 0,5 s et la fenêtre de 12 s.

### `.callEndedShouldResume` : écarté comme déclencheur

`setCallActive` (`MediaSessionCoordinator.swift:95-107`) émet sur le front `isActive` true→false — donc à
**T0** de l'entrée dans `.ended`, c'est-à-dire au **début** du handoff et de la fenêtre de 12 s, pas à leur
fin. Le consommer comme déclencheur de reprise produirait la reprise immédiate que la section précédente
interdit.

Avec l'accroche à `.idle`, ce canal n'est plus nécessaire : le signal de reprise est le retour au repos
lui-même. Aucun quatrième mécanisme parallèle n'est ajouté pour autant — les deux appels
(`suspendForSystemCall` / `resumeAfterSystemCall`) sont poussés depuis `callState.didSet`, le point de
propagation unique qui porte déjà `setCallActive` et `stopAll()`.

### Arbitrage de la double reprise

`StoryCanvasUIView+Audio.swift:127-135` est le **seul autre abonné** de `.callEndedShouldResume`. Le conflit
est **mutuel** : la reprise story appelle `PlaybackCoordinator.willStartPlaying(external:)` (`:89`) qui
stoppe tous les `AudioPlaybackManager` ; la reprise du coordinateur appelle `willStartPlaying(audio:)`
(`AudioPlayerView.swift:163`) qui appelle `stopAllExternal`. Les deux consomment le même événement sur la
même `DispatchQueue.main` : **le gagnant est l'ordre de souscription**, ce qui n'est pas une conception.

**Règle arrêtée** : le canvas story l'emporte tant que `window != nil` et `mode == .play` — ses gardes
existent déjà (`StoryCanvasUIView+Audio.swift:145-148`). Le coordinateur ne reprend qu'après un tour de
runloop, et seulement si `PlaybackCoordinator.isAnyPlaying == false` (`PlaybackCoordinator.swift:96`).

### Point d'accroche : push, pas abonnement depuis `init`

`ConversationAudioCoordinator.init` ne fait aujourd'hui que *capturer* `CallManager.shared` dans une
closure. S'y abonner l'embarquerait dans des tests purement audio — avec `WebRTCService`, `CXProvider` et
`NWPathMonitor`. Utiliser un push depuis `CallManager`, sur le modèle de `setCallActive`.

> L'argument « construction eager au lancement de l'app » avancé en v2 est caduc : `RootView.swift:66`
> porte déjà `@ObservedObject private var callManager = CallManager.shared`. Seul l'argument des tests tient.

## B2 · Limite assumée

Sans CallKit — simulateur, iOS-app-on-Mac, région CN (`CallManager.swift:334-345`) — le Control Center
devient **vide** pendant un appel au lieu d'afficher la carte in-call que montrent FaceTime, WhatsApp et
Telegram. Un vide plutôt qu'une carte périmée : préférable, mais à énoncer.

---

# Lot C — PiP

## C0 · Pas de PiP pour un appel audio — décision produit, pas limite technique

`ContentSource(activeVideoCallSourceView:contentViewController:)` n'exige **aucune** piste vidéo : le
contentViewController peut afficher un avatar statique. La contrainte du header est éditoriale — « This
class must only be used when a video call is active. »

La règle est donc adoptée sur un motif de **politique** : usage conforme à l'intention d'Apple, risque
App Review. La surface d'un appel audio quitté reste l'indicateur CallKit.

**C0 est une condition d'entrée, pas un invariant.** Une fois la fenêtre ouverte, elle survit à l'extinction
de la caméra distante : `isRemoteVideoEnabled` passe à `false` (`CallManager.swift:4215`) et
`setRemoteVideoMuted(true)` est posé (`:4220`), mais rien ne démonte le PiP — `detachSystemPiP` n'a qu'un
appelant, `endCallInternal` (`:3577`). Combinaisons arrêtées :

| État | Rendu |
|---|---|
| Pair coupe sa caméra, PiP en double flux | voie distante → placeholder, voie locale → live |
| J'éteins ma caméra en double flux | voie locale → avatar, voie distante → live |
| Les deux éteintes | deux placeholders ; le PiP **ne se ferme pas** |
| Escalade vidéo pendant un appel audio backgroundé | **pas de PiP pour cet appel** — voir ci-dessous |

**Conséquence assumée.** Un appel audio qui passe en vidéo pendant que l'app est en arrière-plan n'obtiendra
pas de PiP. La raison est indépendante de C0 : `attachSystemPiP` n'a qu'un appelant,
`PiPSourceAnchor.updateUIView` (`CallView.swift:1543`), et SwiftUI n'exécute pas `updateUIView` pour une vue
non présentée en arrière-plan. Le contrôleur AVKit n'est jamais configuré ; la question du démarrage depuis
l'arrière-plan ne se pose même pas. Le header confirme d'ailleurs que l'auto-start est arbitré **au moment
de la transition** : « uses this view's layout frame and visibility … when the app moves to background ».
La surface reste l'indicateur CallKit jusqu'au retour au premier plan.

## C1 · L'ancre PiP disparaît en mode pilule

`PiPSourceAnchor` (`CallView.swift:80`, définie `:1534-1545`) est le **seul** appelant de
`attachSystemPiP` — vérifié sur tout le dépôt. `RootView.swift:73-83` gate le `fullScreenCover` sur
`displayMode == .fullScreen` ; réduire l'appel (`RootView.swift:80`, `CallView.swift:192/474/640`,
`FloatingCallPillView.swift:369`) démonte le cover et libère l'ancre. `pipConfiguredSource` étant `weak`
(`CallManager.swift:2134`), il passe à nil et **rien ne reconfigure**. Ni `CallBubbleView` ni
`FloatingCallPillView` ne fournissent d'ancre de rechange.

**Décision : deux ancres, garde d'idempotence corrigée, ré-armement explicite.**

Déplacer simplement l'ancre dans `RootView` échangerait un défaut contre un autre : le `fullScreenCover`
présente en `UIModalPresentationFullScreen`, UIKit détache la hiérarchie présentante, et une ancre y
résidant serait hors fenêtre pendant que `CallView` est affichée. Le bouton PiP manuel
(`CallView.swift:1627-1638`) **resterait alors affiché et inerte au tap** — il est gardé par
`canActivateSystemPiP` (`:1627`), pas par `isPictureInPicturePossible`, qui n'intervient qu'un étage plus
bas dans `PiPCallController.start()` (`:136-137`). C'est précisément la régression que surveille le critère 6.

On garde donc l'ancre de `CallView` **et** on en ajoute une dans `RootView`, active en `.pip`/`.bubble`.
Deux corrections rendent la cohabitation sûre :

1. **Refuser toute reconfiguration tant qu'un PiP est actif.** Sans cela, `attachSystemPiP` voit une
   `sourceView` différente à chaque bascule, la garde `:2165` laisse passer, et `pip.configure()` commence
   par `tearDown()` → `stopPictureInPicture()`. L'affirmation « `attachSystemPiP` est déjà idempotent » est
   fausse : l'idempotence est clé sur l'identité de la source view.
2. **Nil-er `pipConfiguredSource` / `pipConfiguredTrack` dans `onStop`** (`:2175-2187`). `PiPSourceAnchor`
   est un `UIViewRepresentable` sans propriété stockée : `updateUIView` est son unique déclencheur. Sans ce
   ré-armement, la garde laisse `pipConfiguredSource` épinglé sur une ancre morte.

**L'ICE restart n'est pas menacé** — vérifié. `CallManager.swift:4835-4838` traite le track recréé **hors**
du chemin `attachSystemPiP` : `pip.updateRemoteTrack(...)` ré-attache le renderer sans toucher au contrôleur
AVKit, puis la ligne 4837 ré-estampille `pipConfiguredTrack`. Refuser la reconfiguration pendant un PiP
actif ne bloque donc aucun cas légitime, et protège même la course où `pipConfiguredTrack` (weak) passe à
nil avant la ré-estampille. Aucune exception à inventer.

> Architecture visée à terme : une `UIWindow` dédiée à l'UI d'appel, comme FaceTime et WhatsApp — une source
> view y est toujours en fenêtre. C'est la cause structurelle ; ce lot en traite le symptôme.

## C2 · Retour d'arrière-plan : mode d'affichage non restauré

`foregroundObserver` (`CallManager.swift:3077-3101`) émet `emitCallForegrounded` et restaure le signal
caméra, mais **ne touche jamais `displayMode`**. Celui-ci n'est forcé à `.fullScreen` qu'en `:982`, `:1186`,
`:1272`, `:1534`, `:2173` — liste exhaustive vérifiée. Un appel réduit puis backgroundé revient
**déterministiquement** en pilule. Défaut prouvé, périmètre engagé.

## C3 · Le signal caméra est coupé alors que la caméra tourne

`CallManager.swift:3056-3076` **ne coupe pas la caméra** — aucun `stopCapture()`. Il émet
`emitCallToggleVideo(enabled: false)`, un **signal** au pair, et pose `isVideoSuspendedByBackground`.

**Quatre conditions, pas trois**, pour que la caméra survive en arrière-plan :

| Condition | État | Preuve |
|---|---|---|
| `voip` dans `UIBackgroundModes` | ✅ | `Info.plist:108` |
| Lien sur SDK ≥ iOS 18 | ✅ | `iPhoneOS26.1.sdk`. Le `deploymentTarget: 16.0` n'entre pas dans le test *linked on or after* |
| `isMultitaskingCameraAccessEnabled` avant `startRunning` | ✅ | `P2PWebRTCClient.swift:289-292` vs `:317` — `RTCCameraVideoCapturer` ne démarre la session que dans `startCaptureWithDevice:`, l'ordre est garanti |
| **Un `AVPictureInPictureController` actif** | — | **c'est la condition qui pilote tout** |

Il n'existe **aucun** entitlement `com.apple.developer.avfoundation.multitasking-camera-access` dans le
dépôt : la pose explicite de `:290` est la seule voie, et le log `[WEBRTC] multitasking camera access
enabled` (`:291`) est donc la **preuve terrain** que la condition est acquise.

**Portée exacte du bug.** Le commentaire `CallManager.swift:607-612` (« iOS enforces camera suspension in
the background ») est **incomplet, pas universellement faux** : il est vrai sans PiP, faux dès que le PiP est
actif. Comme C1 établit que le PiP ne démarre quasiment jamais aujourd'hui, le bug est **réel mais étroit** —
il n'existe que sur le chemin plein-écran → arrière-plan avec auto-start. À dire, sinon le correctif sera
écrit au mauvais endroit.

**Correctif.** Faire de l'interruption de capture l'**unique** déclencheur, et retirer l'émission depuis
`didEnterBackground` (`:3067-3071`) ainsi que sa symétrique dans `willEnterForeground` (`:3093-3099`).

Ne **pas** écrire « ne pas émettre quand le PiP est actif » : ce prédicat serait évalué dans le handler de
`didEnterBackgroundNotification`, or l'auto-start est déclenché **par** cette même transition —
`willStartPictureInPicture` peut arriver après, le prédicat lirait `false` et on émettrait le mensonge quand
même. Le déclencheur par interruption est en revanche **auto-corrigeant** : si la caméra survit, rien n'est
posté et le signal reste « on ».

**Observation à scoper.** `CameraView.swift:298` instancie une **seconde** `AVCaptureSession` dans le
process. Un `addObserver(..., object: nil)` capterait les interruptions du composeur story et couperait la
vidéo d'appel sur un événement sans rapport. L'observation appartient à `P2PWebRTCClient`, avec
`object: capturer.captureSession`, republiant un signal typé vers `CallManager`.

Conditionner au **runtime** sur `isMultitaskingCameraAccessEnabled`, jamais sur `#available(iOS 18)` : la
propriété est KVO-observable et peut repasser à `false`.

## C4 · Deux flux quand le PiP est agrandi

Flux distant en haut, caméra locale en bas, **empilés verticalement dans le ratio 9:16 existant**. Aux
autres tailles, flux distant seul. Le ratio reste inchangé : muter `preferredContentSize` à chaud n'est pas
garanti par la doc et déplacerait la fenêtre sous le doigt de l'utilisateur.

### Détection de la taille : seuil relatif

La v2 prescrivait un rang auto-calibré — « conclure max dès qu'une largeur plus petite a été observée ».
**C'est le prédicat de non-minimum, pas de maximum** : avec trois paliers, il déclenche le double flux à la
taille intermédiaire une fois sur deux. Abandonné.

La v2 écartait les seuils en ne discutant que des seuils **absolus**. Un ratio `largeurPiP / largeurÉcran`
est invariant à l'écran et à l'orientation **par construction** — c'est le contre-argument qui n'avait pas
été examiné. **Décision : seuil relatif**, calibré [appareil] sur deux ou trois modèles, avec hystérésis
d'environ 8 pt et debounce.

Signal de mesure : `viewDidLayoutSubviews` d'une **sous-classe** d'`AVPictureInPictureVideoCallViewController`
— à introduire, `PiPCallController.swift:118` instancie aujourd'hui la classe nue.
`didTransitionToRenderSize` n'est **pas** disponible : elle appartient à
`AVPictureInPictureSampleBufferPlaybackDelegate`, non câblé par notre `ContentSource`.

### Rendu

Un second `PiPVideoRenderer` sur un second `PiPVideoSampleBufferView` — le type se duplique tel quel. Le
flux local ne coûte **aucun décodage** : `VideoFilterPipeline.swift:430/450` livre des `RTCCVPixelBuffer` et
`VideoFrameConverter.swift:227-229` est un passthrough zéro-copie. La seconde surface doit suivre le même
cycle de vie que la première (`PiPCallController.swift:86` / `:179`), sinon fuite entre appels.

Trois points de rendu à traiter, chacun déjà résolu ailleurs dans l'app :

- **Miroir.** `CallView.swift:95` et `:1117` passent `mirror: isUsingFrontCamera`. `applyRotation`
  (`PiPVideoSampleBufferView.swift:37-42`) pose une rotation via `setAffineTransform` et **écrase** la
  transform : la vignette locale apparaîtrait non miroitée, à l'inverse de ce que l'utilisateur voit dans
  l'app. Composer avec `.scaledBy(x: -1, y: 1)` et faire de l'état appliqué un couple `(degrees, mirrored)` —
  le `guard degrees != appliedRotation` actuel avalerait un changement de miroir seul.
- **Dégradation.** La voie locale a besoin de sa propre `setLocalVideoMuted`, alimentée par
  `isVideoEnabled && !isVideoSuspended && !isVideoSuspendedByHold && !isVideoSuspendedByBackground` —
  l'expression existe littéralement en `CallManager.swift:4157-4159`, à réutiliser. Sans elle, la voie locale
  fige le dernier frame : exactement le bug que `setRemoteVideoMuted` élimine côté distant.
- **Recadrage.** Deux voies empilées dans un conteneur 9:16 donnent des cases 9:8. Avec
  `videoGravity = .resizeAspectFill` (`PiPVideoSampleBufferView.swift:30`), une source portrait y perd
  **~56 % de sa hauteur** et les visages sortent du cadre. **Décision : `.resizeAspect` (letterbox) sur les
  deux voies en mode double flux.**

> La rotation locale ne demande pas de second mécanisme : `RTCCameraVideoCapturer` remplit `frame.rotation`
> et `VideoFilterCapturerDelegate` la propage (`VideoFilterPipeline.swift:453`). Le `notifyRotationIfChanged`
> existant (`PiPVideoRenderer.swift:156-160`) fonctionne à l'identique sur la voie locale.

## C5 · PiP rangé sur le bord — protocole de sondes, pas conception arrêtée

**Aucune API publique ne détecte le stash.** `AVPictureInPictureControllerDelegate` compte six méthodes,
aucune ne le concerne (`AVPictureInPictureController.h:223-267`) ; aucune notification AVKit. Apple
**documente l'état** puis ne l'expose pas :

> « the camera will be unavailable until the device is unlocked or Picture in Picture is unstashed »
> — `AVPictureInPictureController_VideoCallSupport.h`

**Deux conséquences.** iOS coupe déjà lui-même la caméra au stash : la règle produit n'est pas à implémenter
côté capture, mais à **propager**. Et le signal disponible est conflaté avec le **verrouillage de l'écran**.
On expose donc un état unique **« PiP non visible »**, sans chercher à distinguer les deux cas.

**Le candidat prescrit par Apple a un trou structurel.** `AVCaptureSession.wasInterruptedNotification` /
`.videoDeviceNotAvailableInBackground` n'existe **que si une caméra tourne**. Or `canActivateSystemPiP`
(`CallManager.swift:2152-2154`) autorise explicitement le PiP en **réception seule**, caméra locale éteinte
— cas nominal documenté par le code lui-même. Dans cette configuration, aucun signal.

**Aggravant** : `AVCaptureSession.h:73` documente la fin d'interruption comme survenant « when your app comes
back to foreground ». Un *unstash* laisse l'app en arrière-plan. Si Apple s'en tient à la lettre, le retour
ne se déclenche jamais — 0 fps et « caméra coupée » annoncés au pair **jusqu'à la fin de l'appel**. Ce serait
un mode de panne pire que le bug corrigé.

**Décision : sonder avant de figer [appareil].** Trois candidats à instrumenter sur un même build :

1. `AVCaptureSession.wasInterrupted` / `interruptionEnded` — le candidat d'Apple, dépendant de la caméra ;
2. **KVO sur `AVPictureInPictureController.isPictureInPictureSuspended`** — le **seul candidat indépendant
   de la caméra**, donc le seul capable de fermer le trou. La v2 l'écartait comme « faux ami » sans source ;
   le header ne dit rien de plus que « Whether or not Picture in Picture is currently suspended » ;
3. cycle de vie de la vue du contentViewController (`viewWillDisappear`, `window == nil`) — la v2 affirmait
   qu'il n'est pas appelé ; non vérifiable sans appareil, donc à mesurer.

**Watchdog obligatoire** quel que soit le gagnant : retour forcé à l'état « visible » après N secondes sans
signal de fin, pour borner la panne.

**Consommation de l'état** — deux consommateurs, gardes différentes :

- **Rendu** : ne pas passer par le framerate. `setMaxFrameRate(0)` donne **1 fps**
  (`PiPVideoRenderer.swift:78-81`), et le handler thermique (`CallManager.swift:4611`) écraserait la valeur.
  Ajouter un `setSuspended(_:)` — un booléen de garde en tête de `consume()`, sur le modèle exact de
  `isRemoteVideoMuted` (`:63`, `:86-94`, réappliqué au ré-attach `PiPCallController.swift:250`).
- **Signal pair** : émettre `call:toggle-video false` **uniquement si `isVideoEnabled`** — sinon c'est du
  bruit qui désynchronise l'état pair. Toutes les émissions existantes sont gardées ainsi
  (`CallManager.swift:3067`, `:3178`, `:4156-4160`).

Prévoir un `default` non fatal sur `InterruptionReason` : iOS 26 ajoute `.sensitiveContentMitigationActivated`
(`AVCaptureSession.h:84`).

## C6 · Fin d'appel pendant le PiP — restauration conditionnée

`endCallInternal` appelle `detachSystemPiP()` (`CallManager.swift:3577`) **avant** de poser `.ended`
(`:3583`). `tearDown()` appelle `stopPictureInPicture()` puis immédiatement `delegate = nil` et
`pipController = nil` (`PiPCallController.swift:172-177`) : le callback `didStopPictureInPicture` n'arrive
jamais, et `onStop` (`CallManager.swift:2175-2187`) est **du code mort sur ce chemin**.

**Le défaut est déjà atteignable sans PiP.** `FloatingCallPillView.swift:286` et `CallBubbleView.swift:234`
appellent `endCall()`, et les deux vues se masquent sur `callState.isActive` (`:111`, `:30`) — faux dès
`.ended`. Raccrocher depuis la pilule fait donc **déjà** disparaître l'appel sans panneau de fin. L'assertion
de la v2 (« le lot C rend ce chemin courant pour la première fois ») est fausse : le défaut est plus large
que le PiP.

**Correctif conditionné.** Appliquer littéralement « restaurer un mode porteur d'UI avant le teardown »
**imposerait un modal plein écran à chaque raccrochage depuis la pilule** — le flux le plus courant. La
restauration doit donc être **gardée sur `isSystemPiPActive`**. Posée avant `:3577`, elle est sûre :
`callState` est encore actif, `shouldPresentFullScreenCover` passe par `isActive` puis reste vrai par
`isEnded` jusqu'au reset `.idle`. Le panneau de fin normal n'est pas touché.

**Ordre du teardown différé.** `webRTCService.close()` est appelé en `:3581`, quatre lignes après
`detachSystemPiP()`. Différer tout le teardown laisserait le renderer attaché à un track dont la peer
connection est fermée. **Détacher le renderer immédiatement** (`PiPCallController.swift:175`) et ne différer
que la libération de `delegate` / `pipController` (`:176-177`) — c'est ce `delegate = nil` immédiat qui tue
le callback.

## C7 · Prérequis `.videoChat` — deux sites, pas un

`AVPictureInPictureVideoCallViewController` requiert `.playAndRecord` avec le mode `.videoChat`. Deux sites
dérivent ce mode d'`isVideoEnabled` — la caméra **locale** :

- `configureAudioSession()` — le mode **initial**, en vigueur au premier démarrage du PiP ;
- `CallManager.swift:3743` — la **mise à jour** (`updateAudioSessionModeForCurrentVideoState`).

Or `canActivateSystemPiP` (`:2152-2154`) n'exige qu'un track **distant**. Sur escalade unilatérale, la
session est en `.voiceChat` et le PiP peut refuser de démarrer. **[appareil]** — et le correctif doit
porter sur les **deux** sites : ne corriger que `:3743` laisserait la configuration initiale fausse. Le
prédicat juste est `isVideoUIActive`, pas `isVideoEnabled`.

## C8 · Pas de contrôles dans la fenêtre PiP — limite de plateforme

Un utilisateur parti dans une autre app ne peut pas raccrocher depuis la fenêtre PiP. **Ce n'est pas une
limite d'implémentation, c'est un contrat** : « this view controller's view is not interactive and will not
receive touches or other user input ». Et le chemin alternatif n'en est pas un — dans
`ContentSource(sampleBufferDisplayLayer:playbackDelegate:)`, les contrôles système sont *play/pause/skip*,
pas raccrocher, et basculer dessus perdrait l'auto-start lié à `activeVideoCallSourceView`.

**La surface système pour raccrocher hors app existe déjà : CallKit** (bannière et écran verrouillé).
L'écart réel n'est donc pas que le PiP manque de boutons, mais que cette bannière n'est pas mise en avant.
Hors périmètre.

---

# Découpage

| Plan | Contenu | Dépendances |
|---|---|---|
| **1 — Identité d'icônes** | A0 → A4 | aucune |
| **2 — Audio en appel** | B0 → B2 | aucune |
| **3a — PiP, chemins existants** | C0, C1, C2, C3, C6, C7 + état « PiP non visible » | aucune |
| **3b — PiP, double flux** | C4, C5 | **dépend de 3a** |

3b consomme l'état « PiP non visible » livré par 3a — il n'est pas livrable indépendamment. **C6 dépend de
C1** : le correctif C6 change `displayMode`, ce qui active l'ancre `RootView` introduite par C1 et entre
dans la garde d'idempotence qu'elle corrige. Écrire C6 avant C1 produit exactement le PiP tué à la bascule
que C1 décrit. Le plan 2 et C7 mutent tous deux l'`AVAudioSession` partagée : ordonner les tests appareil.

# Hors périmètre — nommé, non traité

- `CXHandle(type: .generic, value: <ObjectId>)` (`CallManager.swift:3029-3031`, `:1288`, `:1541`) : ne résout
  contre aucun contact → avatar générique et **entrées Récents non rappelables**, alors que
  `includesCallsInRecents = true` (`:649`). Le corriger suppose d'arbitrer ce que Meeshy publie dans
  l'annuaire système — décision produit distincte.
- C8 — contrôles dans la fenêtre PiP (limite de plateforme).
- `UIWindow` dédiée à l'UI d'appel — cause structurelle de C1.
- Live Activity / Dynamic Island pour les configurations sans CallKit.
- Escalade vidéo artificielle pour rendre un appel audio éligible au PiP.
- Retrait du bridge Now Playing hors appel : comportement voulu, inchangé.

# Critères d'acceptation

| # | Critère | Vérification |
|---|---|---|
| 1 | La variante dark de l'AppIcon contient un glyphe (non unicolore) ; la variante tinted porte le glyphe en luminance | contrôle de dépôt (A4) |
| 2 | `iconTemplateImageData` est alimenté par une image 40×40 pt à alpha non trivial | test unitaire |
| 3 | Un appel entrant affiche le glyphe Meeshy, pas un carré noir | **[appareil]** |
| 4 | Aucune carte audio dans le Control Center pendant un appel | **[appareil]** |
| 5 | Un vocal interrompu reprend **à sa position** ; un vocal déjà en pause ne reprend pas ; ni le call-waiting (0,5 s) ni la fenêtre retryable (12 s) ne provoquent de flap | test unitaire + **[appareil]** |
| 6 | Un tap « suivant » sur la carte pendant un appel ne détruit pas la tête de file | test unitaire |
| 7 | Un appel vidéo réduit en pilule bascule en PiP système quand on quitte l'app | **[appareil]** |
| 8 | Le bouton PiP manuel reste actif ET fonctionnel en plein écran | **[appareil]** |
| 9 | Une bascule de `displayMode` pendant un PiP actif ne le ferme pas | **[appareil]** |
| 10 | **Quitter l'app en appel vidéo avec PiP actif : le pair CONTINUE de recevoir la vidéo** (aucun `video=false` côté pair), sans double émission au retour | **[appareil]**, log pair |
| 11 | En arrière-plan **sans** PiP (mode pilule), le pair reçoit bien `video=false` — non-régression | **[appareil]**, log pair |
| 12 | Escalade unilatérale : le PiP démarre depuis le premier plan, session en `.videoChat` | **[appareil]** |
| 13 | Le PiP agrandi au maximum affiche les deux flux empilés dès la première expansion ; réduit, le distant seul | **[appareil]** |
| 14 | PiP rangé ou écran verrouillé → le pair est notifié, le rendu se suspend ; au retour, **les deux reprennent dans un délai borné même si aucun signal de fin n'arrive** | **[appareil]** |
| 15 | Un appel terminé pendant le PiP laisse une UI de fin visible ; raccrocher depuis la pilule **n'ouvre pas** de modal plein écran | **[appareil]** |
| 16 | Un appel audio quitté reste visible via l'indicateur CallKit, et le tap ramène sur `CallView` plein écran | **[appareil]** |
| 17 | `./apps/ios/meeshy.sh test` vert | CI |

> **Prérequis de validation de C3.** Le log `[WEBRTC] multitasking camera access enabled`
> (`P2PWebRTCClient.swift:291`) doit être présent au moment des tests 10 à 12. S'il est absent —
> `isMultitaskingCameraAccessSupported` faux à cet instant — tout C3 est inobservable et le testeur
> conclurait « pas de bug » à tort.
>
> **Les critères 3 à 16 ne sont pas vérifiables sur simulateur** : `platformSupportsCallKit`
> (`CallManager.swift:334-345`) y est faux, `RTCCameraVideoCapturer.captureDevices()` y est vide
> (`P2PWebRTCClient.swift:296-301`), et le PiP exige un appareil. Un `meeshy.sh test` vert (critère 17) ne
> les valide pas.
