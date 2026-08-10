# Intégration audio immersive iOS/iPadOS — éligibilité Now Playing, interruptions, fusion des moteurs

Date : 2026-08-10
Statut : validé (approche « A + fusion maximale » choisie par l'utilisateur)
Plateformes : iPhone + iPad (`TARGETED_DEVICE_FAMILY: "1,2"`)

## 1. Contexte et constat

L'audio de conversation doit se comporter comme dans WhatsApp/Safari : lecture qui
continue en background, carte Now Playing sur le lock screen et dans le Control
Center (iPhone et iPad), boutons précédent/suivant qui naviguent la file de vocaux,
scrubbing, AirPlay via le bouton route de la carte.

### Ce qui existe déjà (à NE PAS reconstruire)

Le chantier `2026-05-25-ios-audio-playback-persistence` (Phase 8) a livré un pont
complet et correct :

- `ConversationAudioCoordinator` (app) : file séquentielle (`AudioQueueBuilder`),
  historique borné à 100 pour `playPrevious()`, convention < 3 s = piste
  précédente sinon restart, gardes CallKit sur tous les transports, hooks
  logout/suppression socket, événement `attachmentFinishedPublisher`.
- `ConversationAudioCoordinator+NowPlaying` (app) : `MPNowPlayingInfoCenter`
  (titre = expéditeur, album = conversation, artwork 3-tier), throttle 250 ms,
  `MPRemoteCommandCenter` play/pause/next/previous/seek, suspension propre
  pendant un appel Meeshy (`suspendForSystemCall`/`resumeAfterSystemCall`).
  Activé au boot (`AdaptiveRootView`).
- `Info.plist` : `UIBackgroundModes` contient `audio`.
- `MediaLifecycleBridge.prepareForBackground()` : ne coupe RIEN si une lecture
  est active — la continuité background est déjà prévue.
- `AudioBubbleRouter` (app) : bascule bulle ↔ moteur du coordinator via
  `AudioPlayerView(externalPlayer:)`.
- `MiniAudioPlayerBar` : mini-player global (RootView + iPadRootView).
- `AirPlayRoutePicker` (SDK) : existe, câblé uniquement sur la vidéo.

### Cause racine de l'échec apparent

L'unification de session (`2026-06-08-audio-coordination-unification-plan`,
Étape C slice 4) a routé le moteur voice-note via
`MediaSessionCoordinator.request(role: .playback)` qui pose la catégorie
`.playback` avec **`[.duckOthers]`**. Or `.duckOthers` implique
`.mixWithOthers` : une session *mixable* rend l'app **inéligible au statut
« Now Playing app »** — iOS ignore alors `MPNowPlayingInfoCenter` ET les remote
commands. Le commentaire de `AudioPlayerView.swift:84` documente lui-même le
basculement (« ce moteur posait `options: []` … désormais `[.duckOthers]` »).
La carte lock screen a disparu à ce commit ; tout le pont Phase 8 tourne dans le
vide depuis.

### Trous restants au-delà de la régression

1. **Interruptions système non gérées** : aucun abonné aux
   `MediaSessionCoordinator.events` pour l'audio de conversation. Siri, appel
   cellulaire entrant, autre app média, AirPods retirés → pas de pause propre,
   pas de reprise, carte figée.
2. **Moteurs éparpillés** (chacun instancie `AudioPlaybackManager()`) :
   - `AudioFullscreenView` (contenu — court-circuite le coordinator : pas de
     carte, pas de file) ;
   - `ConversationView.scrollButtonAudioPlayer` (contenu — joue un vocal hors
     file) ;
   - `ConversationView.pendingAudioPlayer` (préversion d'un brouillon vocal
     avant envoi) ;
   - `StatusBubbleOverlay.audioPlayer` (préversion d'humeur/statut) ;
   - `ReelsPlayerView.audioPlayer` (réel audio, surface foreground TikTok-like) ;
   - surfaces inline feed/commentaire/post (moteur local possédé par
     `AudioPlayerView`).
3. **AirPlay** : pas de picker sur les surfaces audio.

## 2. Objectifs

- O1 — La lecture d'un vocal de conversation affiche la carte Now Playing
  (lock screen + Control Center, iPhone/iPad), continue en background, et les
  boutons précédent/suivant naviguent la file. Le scrubbing de la carte marche.
- O2 — Les interruptions système (Siri, appel cellulaire, autre app média,
  AirPods retirés) pausent proprement et reprennent quand iOS le demande.
- O3 — Fusion maximale : toute lecture de **contenu** audio (plein écran,
  bouton scroll-to-audio, feed/commentaire/post) passe par le
  `ConversationAudioCoordinator` → carte partout, un seul moteur de contenu.
- O4 — Les **préversions** (brouillon composer, statut) et les **réels** gardent
  un comportement transitoire (duck, jamais de carte) mais sous une politique de
  session unifiée — plus aucun choix d'options de session éparpillé.
- O5 — AirPlay accessible depuis le plein écran audio (la carte système apporte
  déjà son bouton route une fois l'éligibilité réparée).

## 3. Non-objectifs

- CarPlay dédié (app audio CarPlay) — hors périmètre.
- Handoff/Continuity inter-appareils (iPhone → iPad) — le « transfert vers un
  appareil local » demandé est couvert par AirPlay + bouton route.
- Stories : gardent `.mixWithOthers`/`.duckOthers` (expérience foreground).
- Changement de la résolution Prisme des variantes audio traduites dans la
  file (la file continue de jouer l'URL résolue comme aujourd'hui ; le plein
  écran garde son sélecteur de langue via un nouveau seam `playVariant`).
- Web / Android.

## 4. Design

### D1 — Profils de session audio (éligibilité Now Playing)

**SDK** (`MeeshySDK`/`MeeshyUI`) :

- Nouvel enum `AudioSessionProfile` (SDK, paramètre opaque — pureté SDK
  respectée : le SDK ne décide pas *qui* est contenu, il expose le réglage) :
  - `.content` → catégorie `.playback`, `options: []` (non-mixable →
    éligible Now Playing, pause la musique tierce comme WhatsApp) ;
  - `.transient` → catégorie `.playback`, `options: [.duckOthers]`
    (comportement actuel : duck, jamais de carte).
- `MediaSessionCoordinator.request(role:options:)` : le chemin refcompté
  accepte les options de catégorie au lieu de figer `[.duckOthers]`.
- `AudioPlaybackManager.sessionProfile: AudioSessionProfile` (défaut
  `.transient` — fail-safe : un moteur oublié garde le comportement actuel,
  sans carte fantôme), transmis à `request(role:options:)` par
  `acquireSession()`. Seul le moteur possédé par le
  `ConversationAudioCoordinator` opte pour `.content`.

**App** (décisions produit) :

| Moteur/surface | Profil |
|---|---|
| Moteur du `ConversationAudioCoordinator` (bulles, plein écran, scroll button, feed/commentaire/post) | `.content` |
| `pendingAudioPlayer` (brouillon composer) | `.transient` |
| `StatusBubbleOverlay` | `.transient` |
| `ReelsPlayerView` (réel audio, parité avec les réels vidéo `.duckOthers`) | `.transient` |

Conséquence produit assumée (comportement WhatsApp) : lire un vocal **met en
pause** la musique d'une autre app au lieu de la ducker ; à l'arrêt,
`.notifyOthersOnDeactivation` (déjà posé par `release()`/`deactivatePlaybackSync`)
permet à l'autre app de reprendre.

Pourquoi les préversions restent `.transient` : les absorber dans le coordinator
ou les rendre non-mixables afficherait potentiellement une carte lock screen
pour un **brouillon non envoyé** — hors de question. La fusion se fait au niveau
de la politique (un seul enum, plus d'options éparpillées), pas au niveau de
l'instance.

### D2 — Interruptions système et changements de route

Le `ConversationAudioCoordinator` s'abonne aux `MediaSessionCoordinator.events`
(publisher injectable en init pour les tests, défaut = `shared.events`) :

- `.interruptionBegan` → si lecture en cours ET pas déjà suspendu par un appel
  Meeshy (`_isSuspendedBySystemCall`) : mémoriser `wasPlayingBeforeInterruption`,
  passer le moteur en pause (position persistée par le chemin existant),
  **conserver la carte** avec `MPNowPlayingInfoPropertyPlaybackRate = 0`
  (contrairement à la suspension d'appel Meeshy qui l'efface — ici l'OS attend
  que l'app reste l'app Now Playing).
- `.interruptionEndedShouldResume` → si `wasPlayingBeforeInterruption` :
  relancer via le chemin de reprise existant (`startCurrentHead()` si le player
  a été détruit, sinon resume) et republier la carte.
- `.interruptionEndedShouldNotResume` → republier la carte en pause (rate 0).
- `.routeChangedOldDeviceUnavailable` (AirPods retirés, casque débranché) →
  pause, PAS de reprise automatique (convention iOS).
- `.callEndedShouldResume` → ignoré ici : le chemin `CallManager →
  resumeAfterSystemCall()` couvre déjà les appels Meeshy ; double-traiter
  créerait une double reprise.

Garde anti-chevauchement : pendant `_isSuspendedBySystemCall` (appel Meeshy),
tous les events d'interruption sont ignorés — RTCAudioSession peut en générer.

### D3 — Fusion des surfaces de contenu

1. **Plein écran** (`AudioFullscreenView`) : supprime son
   `@StateObject AudioPlaybackManager()`. À l'ouverture :
   - si `coordinator.activeContext?.attachmentId == item.attachment.id` →
     s'attache au moteur du coordinator (`engineForBubble`), la file en cours
     continue telle quelle ;
   - sinon → `coordinator.play(current: QueuedAudio(item…), tail: …)` — depuis
     une conversation, la tail est refournie par le ViewModel ; depuis
     feed/commentaire/post, tail vide (file d'un élément).
   - Sélecteur de langue : nouveau seam `coordinator.playVariant(urlString:)`
     qui swappe l'URL du moteur en conservant `activeContext` et la file (le
     plein écran appelait `player.play(urlString:)` en direct).
2. **Bouton scroll-to-audio** (`ConversationView+ScrollIndicators`) : supprime
   `scrollButtonAudioPlayer` ; le tap route vers
   `ConversationViewModel.playAudio(attachmentId:)` → file complète + carte
   (amélioration UX gratuite : le vocal enchaîne sur les suivants).
3. **Surfaces inline feed/commentaire/post** : généraliser `AudioBubbleRouter`
   en un routeur réutilisable (app-side) qui accepte une fabrique de
   `QueuedAudio` (+ tail optionnelle). La conversation garde son câblage
   actuel ; feed/commentaire/post fournissent une file d'un élément
   (métadonnées auteur → carte correcte). `QueuedAudio.conversationId` porte
   l'id du post/commentaire ; les hooks socket du coordinator filtrent par id
   exact, donc aucun effet de bord.

### D3bis — Vocal en pause au verrouillage : la carte reste

`MediaLifecycleBridge.prepareForBackground()` ne préserve aujourd'hui la
session que si une lecture est EN COURS (`isPlaying`). Un vocal mis en pause
puis l'écran verrouillé → `stopAll()` + désactivation de session → l'app perd
le statut Now Playing et la carte disparaît, alors que WhatsApp la conserve
(et le play depuis la carte réveille l'app suspendue — comportement standard
de l'app Now Playing). La garde s'étend à
`ConversationAudioCoordinator.activeContext != nil` : file en pause = session
conservée, carte affichée à rate 0, reprise possible depuis le lock screen.
La fermeture explicite (`close()`, fin de file, logout) libère la session et
efface la carte comme aujourd'hui.

### D4 — Fiabilité de l'avance de file en background

Entre deux pistes, `AudioPlaybackManager.play(urlString:)` peut toucher le
réseau (cache miss). App en background, dès que l'audio s'arrête, iOS peut
suspendre le process avant le début de la piste suivante. → `advanceQueue()`
enveloppe la transition dans un `UIApplication.beginBackgroundTask` court,
terminé quand la piste suivante a démarré (ou échoué). Pattern standard des
lecteurs à file.

### D5 — Enrichissement de la carte

Ajouts à `pushNowPlayingInfo()` :
- `MPNowPlayingInfoPropertyPlaybackQueueCount` / `…QueueIndex` (position dans
  la file) ;
- format de carte aligné sur la référence WhatsApp du screenshot :
  `MPMediaItemPropertyTitle` = « {conversation} — {date courte du message} »,
  `MPMediaItemPropertyArtist` = expéditeur,
  `MPMediaItemPropertyAlbumTitle` = conversation (inchangé). Aujourd'hui le
  titre est l'expéditeur seul — la date du vocal disparaît, alors que c'est le
  repère principal quand on rattrape une file de vocaux.

### D6 — AirPlay

`AirPlayRoutePicker` ajouté à la rangée transport d'`AudioFullscreenView`
(mêmes conventions visuelles que `VideoTransportControls:162`). Les autres
surfaces s'appuient sur le bouton route natif de la carte système.

## 5. Gestion d'erreurs

- Échec de chargement d'une piste en background : chemin existant
  (`onPlaybackFinished` sur le catch) → la file avance ; le background task
  D4 couvre la fenêtre.
- `playVariant` sur URL invalide : no-op journalisé, la carte reste sur la
  variante précédente.
- Interruption pendant une transition de piste : l'event `.interruptionBegan`
  gagne (pause), le background task est terminé proprement.

## 6. Tests (TDD)

- **SDK** : `AudioSessionProfile.options` — `.content == []`,
  `.transient == [.duckOthers]` (garde comportementale contre le retour de la
  régression) ; contrat `request(role:options:)` (les options transmises sont
  posées, call-aware inchangé).
- **App — coordinator** : events injectés →
  `interruptionBegan` pause et conserve la carte (rate 0) ;
  `interruptionEndedShouldResume` reprend seulement si lecture avant
  interruption ; `routeChangedOldDeviceUnavailable` pause sans reprise ;
  events ignorés pendant `_isSuspendedBySystemCall` ;
  `playVariant` conserve `activeContext` et `queueCount`.
- **App — background** : `prepareForBackground` préserve session et carte
  quand `activeContext != nil` même en pause (sondes `testStopAllProbe` /
  `MediaSessionCoordinatorTestProbe` existantes) ; la fermeture explicite
  libère toujours.
- **App — fusion** : le routeur généralisé produit une file d'un élément pour
  une source hors conversation ; garde de source vérifiant
  qu'`AudioFullscreenView` et `ConversationView+ScrollIndicators`
  n'instancient plus de moteur (ancrée sur le comportement, commentaires
  filtrés).
- **Non-régression** : `ConversationAudioCallSuspensionTests`,
  `MediaSessionCoordinatorTests`, `MediaSessionCoordinatorCallAwareTests`
  restent verts.
- **Vérification manuelle** : simulateur (carte dans le Control Center simulé,
  next/prev/scrub) ; device réel pour lock screen + AirPlay (l'utilisateur).

## 7. Risques

- **Pause de la musique tierce** : voulu (WhatsApp fait pareil), mais changement
  perceptible — documenté ici comme décision produit.
- **Réels audio** : passent explicitement `.transient` — aucun changement de
  comportement.
- **Carte fantôme** : un moteur `.content` qui jouerait sans `activeContext`
  rendrait l'app Now Playing sans métadonnées. Mitigation structurelle : le
  défaut de `sessionProfile` est `.transient` et seul le moteur du coordinator
  opte pour `.content` — un moteur annexe oublié duck comme aujourd'hui, sans
  jamais prendre la carte.

## 8. Références

- `docs/superpowers/plans/2026-05-25-ios-audio-playback-persistence-plan.md` (Phase 8)
- `docs/superpowers/plans/2026-06-08-audio-coordination-unification-plan.md` (origine de la régression)
- `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator(+NowPlaying).swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` (`AudioPlaybackManager`)
- Apple, « Becoming a now playable app » — session non-mixable requise pour le
  statut Now Playing.
