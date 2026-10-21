# Meeshy cède la place quand un autre son démarre, et une vidéo passe en PiP quand on quitte l'app — conception

**Date** : 2026-10-19 · **Plateforme** : iOS (`apps/ios`, `packages/MeeshySDK`). Web et coque Android : issues séparées, hors de ce lot. Miroir Kotlin : gelé (directive 2026-09-16).
**Source** : demande porteur du 2026-10-19 (session Claude Code), relevé du code sur `dev` au même jour.

## 1. Intention

Sur iPhone, aujourd'hui :
- on quitte l'app pendant une vidéo → le son continue, **aucune fenêtre PiP** ;
- un appel téléphonique arrive, ou une autre app lance un son → **Meeshy continue de jouer par-dessus**, sans pause ni baisse notable.

Le porteur veut le comportement d'une app de lecture iOS « bien élevée » : Meeshy joue seul, cède la place dès qu'un autre son légitime démarre, et une vidéo regardée en plein écran suit l'utilisateur hors de l'app en PiP.

## 2. Comportements attendus (décisions porteur)

### 2.1 PiP à la sortie de l'app
> **Supplanté en partie par la décision e (2026-10-20, § 5 bis)** : seul le plein écran ouvre un PiP, quelle que soit l'origine de la vidéo.
- Une vidéo **en cours de lecture** passe en PiP quand l'utilisateur **quitte l'app** (accueil, bascule d'app) depuis :
  - un **réel** ;
  - une **vidéo de commentaire** ;
  - une **vidéo de message mise en plein écran par l'utilisateur**. Une vidéo de message lue dans sa bulle (non plein écran) **ne passe pas en PiP**.
- Les vidéos **protégées** (vue unique, éphémère, floutée — `ProtectedPlaybackPolicy`) restent exclues du PiP (#9574, inchangé).
- Naviguer **dans** l'app (quitter un réel vers un autre écran) n'ouvre pas de PiP : la règle actuelle « une vidéo ne joue qu'à un endroit » (décision 2026-10-07) s'applique. *(Appel de Claude : la demande vise la sortie de l'app ; à corriger par le porteur si le PiP doit aussi s'ouvrir en navigation interne.)*

### 2.2 Meeshy cède la place
- Quand Meeshy **lance** un son audible — **quelle que soit la surface** (décision porteur c) : son ou musique d'une story, vidéo de conversation, de post, de réel, de commentaire, d'humeur (mood), message vocal ou tout autre audio — il **met en pause** la musique des autres apps (Spotify, Apple Music…) — **plus de baisse de volume** (`duckOthers`) ni de mélange (`mixWithOthers`) sur les chemins de lecture de contenu.
- Une vidéo **muette** (lecture automatique inline sans son) ne touche pas à la musique des autres apps.
- Quand **une autre app lance une vidéo ou un son**, ou qu'un **appel arrive** (téléphone, FaceTime, appel Meeshy) : ce que joue Meeshy se **met en pause** — vidéo (PiP compris), audio, story, réel.
- **Pause puis reprise à la fin** (précision porteur du 2026-10-19) : quand l'interruption se termine — la vidéo ou le son de l'autre app s'achève, l'appel raccroche —, Meeshy **reprend là où il s'était arrêté**, pour tous les lecteurs (vidéo, PiP compris, audio, story, réel). Le signal est l'interruption terminée avec `shouldResume` (et `.callEndedShouldResume` pour un appel Meeshy, que WebRTC ne signale pas au système) ; sans `shouldResume`, pas de reprise. `ConversationAudioCoordinator` le fait déjà pour les vocaux : la règle s'étend aux autres lecteurs.
- **Interruption sans signal de fin** (vidéo d'une autre app — YouTube, Instagram — qui ne notifie presque jamais) (décision porteur a, « si c'est possible ») : quand l'utilisateur **revient dans Meeshy** et qu'aucun autre son ne joue plus (`AVAudioSession.isOtherAudioPlaying == false`), Meeshy reprend ce qu'il avait mis en pause pour l'interruption — seulement si l'utilisateur ne l'a pas mis en pause lui-même, et seulement sur l'écran où il jouait. En arrière-plan, sans signal, rien ne reprend : iOS ne donne aucun moyen fiable de le savoir.
- **Dans l'autre sens, Meeshy rend la main — exigence centrale du porteur** : à la fin d'un contenu Meeshy (ou à sa mise en pause / fermeture), la session se désactive avec `.notifyOthersOnDeactivation`, pour que la musique que Meeshy a mise en pause (Spotify, Apple Music…) reprenne d'elle-même.
- **Si l'utilisateur relance lui-même la lecture** pendant que l'autre son joue, Meeshy joue — y compris en arrière-plan / en PiP — et c'est alors l'autre app qui s'interrompt (règle iOS d'une session non mélangeable).

### 2.3 Enregistrements
- **Appareil photo iOS (hors Meeshy)** qui filme pendant que Meeshy joue (en PiP ou audio en arrière-plan) : Meeshy **continue au volume normal**, pour que le son soit capté ; c'est l'utilisateur qui l'arrête. **À vérifier sur iPhone réel** (décision porteur b) : si l'appareil photo iOS coupe de force le son des autres apps, on ne lutte pas contre le système, et la feature est gardée pour la **caméra de Meeshy** seulement (ci-dessous).
- **Caméra de Meeshy** (composer, message vidéo) pendant qu'un son Meeshy joue : au lancement de l'enregistrement vidéo, le son Meeshy **baisse** (il reste audible et capté sans couvrir la voix) ; à la fin de l'enregistrement, il **remonte au volume qu'il avait**.
- **Message vocal** pendant qu'un audio ou une vidéo Meeshy joue (en PiP ou en arrière-plan) : le son Meeshy **baisse** pendant l'enregistrement, **sans s'arrêter**, et l'enregistrement se fait ; à la fin, il **remonte au volume qu'il avait** (décision porteur d).
- Les sons **extérieurs** à Meeshy (Spotify, Music…) sont coupés pendant tout enregistrement dans Meeshy. Les créations qui portent leur propre piste (musique d'une story en composition, aperçu du composer) gardent leur comportement.
- **Enregistrement d'écran** : piloté par le système, on n'y touche pas.

### 2.4 PiP d'un appel vidéo Meeshy
- En appel, quitter l'app ouvre un PiP qui montre **le flux des autres ET sa propre caméra**.

## 3. État du code (relevé 2026-10-19)

| Sujet | Où | Constat |
|---|---|---|
| Session audio centrale | `MeeshySDK/Media/MediaSessionCoordinator.swift` | existe ; `request(role: .playback)` par défaut `[.duckOthers]` |
| Un lecteur à la fois | `MeeshyUI/Media/PlaybackCoordinator.swift` | existe |
| Vidéo partagée | `SharedAVPlayerManager.swift:391` | `.playback` + `[.duckOthers]` ⇒ session **mélangeable** ; **aucun observateur d'interruption** |
| Stories | `StoryMediaCoordinator.swift:47`, `StoryCanvasUIView+Playback.swift:241`, `StoryMediaLayer.swift:669`, `StoryBackgroundLayer+Playback.swift:50` | `[.mixWithOthers, .duckOthers]` ⇒ jamais interrompues par une autre app |
| Audio de message | `AudioSessionProfile.swift`, `ConversationAudioCoordinator.swift` | `.content` sans option (correct) ; observe les interruptions |
| Autres lecteurs | `AudioPlayerManager.swift`, `OverlayAudioPlayer.swift`, `RecentMediaPreview.swift:66` | options hétérogènes, écrits en direct |
| Enregistrement vocal | `AudioRecorderManager.swift:102` | session posée en direct (hors coordinateur) |
| Caméra composer | `CameraModel.swift` | configuration automatique de la capture (coupe les sons de Meeshy) |
| Arrière-plan | `BackgroundTransitionCoordinator.swift` (`MediaBackgroundPolicy.decide`) | vidéo mise en pause si le PiP n'a pas démarré sous 0,4 s |
| PiP vidéo | `SharedPipEngine.swift:92` (auto depuis inline) | câblé réels + galerie plein écran ; vidéo de commentaire / `MeeshyVideoPlayer` à vérifier |
| PiP d'appel | `PiPCallController.swift`, `PiPVideoRenderer.swift`, `CallPiPPolicy.swift` | implémenté ; repli « pastille » ; à vérifier sur appareil (deux flux) |

**Causes probables (relecture technique du 2026-10-19), à confirmer sur iPhone réel** (le simulateur ne fait pas de PiP) :
1. **Autre app qui lance un son** : `duckOthers` implique le mélange ; une session mélangeable n'est pas interrompue par l'audio non mélangeable d'une autre app ⇒ les deux jouent ensemble.
2. **Appel qui arrive** : un appel téléphonique / FaceTime interrompt TOUTES les sessions, mélangeables ou non. Si Meeshy continue, c'est qu'un lecteur relance `play()` après l'interruption ou ne la traite pas — `SharedAVPlayerManager` n'a aucun observateur d'interruption.
3. **Pas de PiP en sortie** : le mélange n'empêche pas le PiP automatique (il retire seulement Meeshy du « À l'écoute »). Suspects : `BackgroundTransitionCoordinator` met la vidéo en pause si le PiP n'est pas engagé sous 0,4 s (`waitForPipEngagement(timeout: 0.4)`), et la pause annule le démarrage automatique ; ou le contrôleur différé (`configurePip(deferred:)`) n'existe pas encore au moment de la sortie.

**Limites iOS à connaître** :
- La fin d'interruption avec `shouldResume` n'est pas garantie : fiable après un appel ou Siri, rarement après la vidéo d'une autre app (YouTube, Instagram ne notifient presque jamais en libérant leur session).
- La désactivation avec `.notifyOthersOnDeactivation` échoue si un lecteur tourne encore : mettre en pause d'abord. Spotify / Music reprennent s'ils le décident.
- Une vidéo muette ne doit pas activer de session `.playback` non mélangeable (sinon elle pause la musique) : `.ambient` ou aucune activation ; activer le son bascule la catégorie, et c'est là que la musique s'arrête.

## 4. Forme de la solution (décidée)

1. **Une seule politique de session pour la lecture de contenu**, au `MediaSessionCoordinator` : `.playback` **non mélangeable** dès qu'un contenu audible joue. Tous les sites qui posent une catégorie en direct (stories, `SharedAVPlayerManager`, `AudioPlayerManager`, `OverlayAudioPlayer`, `RecentMediaPreview`) passent par lui. La règle « quelles options pour quel rôle » est une fonction pure testée.
2. **Interruption = pause, fin d'interruption = reprise, pour tous les lecteurs** : le moteur vidéo partagé (et le PiP), les stories et les réels s'abonnent aux événements du coordinateur ; `began` met en pause en mémorisant « interrompu en lecture », `ended` + `shouldResume` reprend ce qui jouait (et seulement cela — une pause de l'utilisateur pendant l'interruption l'emporte). La fin d'un contenu désactive la session avec `.notifyOthersOnDeactivation`.
3. **PiP en sortie** : diagnostiquer sur iPhone pourquoi le démarrage automatique ne part pas (session, délai de 0,4 s, contrôleur non configuré sur la surface), puis le garantir pour les trois surfaces du § 2.1 — et l'interdire pour la bulle non plein écran.
4. **Enregistrement in-app** : la capture ne reconfigure plus la session à sa guise ; elle coupe les sons extérieurs et **baisse** un son Meeshy déjà lancé (vocal, caméra Meeshy), puis le remonte à son volume d'avant à la fin de l'enregistrement.
5. **PiP d'appel** : recette sur iPhone réel ; corriger ce qui empêche l'affichage des deux flux.

## 5. Décisions porteur du 2026-10-19 (réponses aux quatre questions)
- **a. Reprise sans signal de fin** : oui si possible — reprise au retour dans l'app quand plus aucun autre son ne joue (§ 2.2). L'exigence centrale reste que **Meeshy relance ce qu'il a coupé quand il finit** (`.notifyOthersOnDeactivation`).
- **b. Appareil photo iOS** : à vérifier sur iPhone ; s'il coupe Meeshy de force, la feature est gardée pour la caméra de Meeshy : baisser le son au lancement de l'enregistrement, le remonter au bon volume ensuite (§ 2.3).
- **c. Musique d'une story** : met Spotify et les autres lecteurs en pause, comme toute surface Meeshy (story, vidéo de conversation, post, réel, commentaire, humeur, audio).
- **d. Vocal pendant un son Meeshy** : on baisse le son Meeshy (PiP ou audio) et on enregistre ; il remonte à la fin.

## 5 bis. Décisions porteur du 2026-10-20
- **e. PiP = plein écran, quelle que soit l'origine** : une vidéo qui n'est pas en plein écran (bulle de message, post dans le fil, page d'un post, profil visité, commentaire inline) ne passe **jamais** en PiP. Une vidéo en plein écran passe en PiP en sortie d'app, qu'elle vienne d'un réel, d'un commentaire, d'un message ou d'un post. Remplace l'énumération du § 2.1.
- **f. Réel muet** : comportement inchangé — pas de session `.playback`, Spotify continue, pas de PiP.
- **g. Horloge de story** : la progression d'une story **s'arrête** dès que sa lecture est interrompue (appel, autre app, Siri) et repart avec la reprise.
- **h. Appel entrant** : pendant la **sonnerie**, le son des vidéos et audios Meeshy en cours **baisse** ; si l'utilisateur **décroche**, la lecture **s'arrête** pour laisser la place à l'appel (puis reprend au raccrochage, § 2.2) ; s'il **refuse** ou si l'appel cesse de sonner, le son **remonte**. Pour un appel téléphonique / FaceTime, c'est iOS qui interrompt : Meeshy suit le signal du système.
- **i. Tous les lecteurs reprennent après une interruption**, lecteur audio en superposition (`OverlayAudioPlayer`) compris.
- **j. Meeshy rend toujours la main** : si Meeshy a mis en pause une autre app (musique, Spotify, Netflix…), il libère la session avec `.notifyOthersOnDeactivation` à la **fin de sa lecture**, à la pause (≈ 3 s, § 6), et **après une interruption** qui ne débouche pas sur une reprise — pour tous les lecteurs.

## 6. Appels de Claude (réglables par le porteur)
- Vidéo de message dans sa bulle : PiP automatique désactivé ; activé dès qu'elle passe en plein écran.
- Pause de l'utilisateur : la session ne se libère qu'après quelques secondes (≈ 3 s), pour qu'une courte pause ne fasse pas repartir Spotify.
- Activer le son d'une vidéo muette = « lancer un son » ⇒ la musique des autres apps se met en pause.

## 7. Laissé au constructeur
- Le découpage exact en types, l'emplacement SDK / app (règle de pureté du SDK : la règle d'options est une loi sans état → SDK ; « quand passer en PiP » → app).
- La forme des témoins (TDD obligatoire ; fonctions pures pour les options et les verdicts PiP) et la recette sur appareil (`apps/ios/scripts/iphone-remote/iphone-remote.sh`).

## 8. Pilotage
Milestone #191 « Meeshy cède la place quand un autre son démarre, et une vidéo suit l'utilisateur en PiP », une issue par point du § 4 : #11039 (§ 4.1), #11040 (§ 4.2), #11041 (§ 4.3), #11042 (§ 4.4), #11043 (§ 4.5) (dimensions visées : 4 Fluidité, 8 UX, 9 Compatibilité, 12 Simplicité, 13 Complétude). Fermeture seulement après preuve sur iPhone réel.
