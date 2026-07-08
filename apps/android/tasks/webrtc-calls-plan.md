# Appels WebRTC Android — plan d'implémentation (parité iOS)

Bug #2 : les appels restent « Connecting… » sans jamais aboutir. ROOT CAUSE : côté
Android il y a le **signaling** (`sdk-core/socket/CallSignalManager` : `call:initiate`
+ ICE servers + lifecycle) + l'**UI** (`feature/calls/CallScreen`, `CallViewModel`,
`CallStateMachine`), mais **AUCUN moteur WebRTC** (0 `import org.webrtc`, 0 dépendance,
0 `PeerConnection`, 0 capture média). Le FSM attend l'event `CallEvent.MediaConnected`
pour passer à « Connected » — rien ne l'émet. iOS a libwebrtc complet.

Points d'intégration existants :
- `CallSignalManager.emitInitiate() -> CallInitiateResult{callId, iceServers:
  List<SocketIceServer(urls,username,credential)>}`. `emitJoin/Leave/End/ToggleAudio/
  ToggleVideo`. `events: SharedFlow<CallEvent>`, `incomingOffers`, `endedCalls`.
- `CallEvent` : StartOutgoing/ReceiveIncoming/LocalAnswer/RemoteAnswer/**MediaConnected**/
  ConnectionStalled/ConnectionFailed/Local|RemoteHangUp/RingTimeout…
- **À VÉRIFIER P3** : le relais SDP offer/answer + ICE candidate (emit + inbound) —
  probablement absent puisque WebRTC jamais branché ; le gateway les relaie (voir
  services/gateway call handlers + iOS emitOffer/emitAnswer/emitIceCandidate).

## Phases (chaque phase = build vert + commit ; A/B réel = 2 pairs, à P4/P5)

- [x] **P1 — lib + permissions** : `io.getstream:stream-webrtc-android:1.3.10` (api) au
      catalog + `:sdk-core` (expose `org.webrtc` aux modules). Permissions manifest
      (`f916e4f94`). Helper `CallPermissions.required(isVideo)` (mic + cam si vidéo) ;
      la demande runtime (launcher ActivityResult) = P5. build vert.
- [x] **P2 — moteur `WebRtcEngine`** (`sdk-core/call`, @Singleton Hilt) : PeerConnectionFactory
      (init one-shot process-wide, EglBase, Default video enc/dec factory), `createConnection
      (iceServers)` (map SocketIceServer→IceServer, UNIFIED_PLAN, MAXBUNDLE), local audio
      track (mic) addTrack, createOffer/createAnswer/setLocal/setRemote (wrappers
      suspendCancellableCoroutine sur SdpObserver), addIceCandidate, setAudioEnabled, close.
      Exposé : localIceCandidates(SharedFlow), iceConnectionState(StateFlow),
      remoteAudioTracks(SharedFlow). PAS encore câblé (P3). build vert.
- [x] **P3a — exposition SDK du chemin SDP/ICE** `b3d613e21` : `CallSignalMapper
      .signalEnvelope()` + `CallSignalManager.incomingSignals: SharedFlow<CallSignalEnvelope>`
      (émis pour chaque `call:signal`, en parallèle des events FSM) + emits typés
      `emitOffer/emitAnswer/emitIceCandidate` (payload = parité iOS ; sdpMLineIndex NUMBER).
- [x] **P3b — coordinateur + câblage VM** `<commit>` : `WebRtcCallCoordinator` (app-side feature/calls,
      orchestration) branchant `WebRtcEngine` ↔ `CallSignalManager`. Flux P2P : caller sur
      `ParticipantJoined` → createConnection(iceServers du ACK) → createOffer → setLocal →
      emitOffer ; callee sur accept → obtenir iceServers (emitRequestIceServers + exposer
      `call:ice-servers-refreshed`) → createConnection → (offre via incomingSignals) →
      setRemote → createAnswer → setLocal → emitAnswer ; caller reçoit answer → setRemote ;
      ICE : localIceCandidates→emitIceCandidate, inbound ice→addIceCandidate ; `iceConnectionState
      =CONNECTED` → `CallViewModel.dispatch(MediaConnected)` (→ « Connected »). from/to =
      currentUserId/peerId (CallConfig). Mute→setAudioEnabled, hangup→close. Audio route
      (AudioManager MODE_IN_COMMUNICATION). Attention glare/negotiationId (réf iOS CallManager).
- [x] **P4 — vidéo + rendu** : `WebRtcEngine` étendu (Camera2Enumerator front→capturer,
      SurfaceTextureHelper, createVideoSource/Track, addTrack ; localVideoTrack +
      remoteVideoTracks flow ; setVideoEnabled ; dispose). Coordinateur : isVideo passé à
      createConnection, expose eglBaseContext/localVideoTrack/remoteVideoTracks + setCameraEnabled.
      `VideoRenderer` composable (SurfaceViewRenderer, sink via tag, release au dispose) ;
      CallScreen : remote plein écran + self PiP (coin, mirror) pour les appels vidéo, avatar
      masqué. CallViewModel : toggleCamera→setCameraEnabled. Tests calls verts (mock coordinator).
- [ ] **P5 — A/B 2 pairs (TEST DEVICE UTILISATEUR)** — impossible sur émulateur (pas de vrai
      micro/caméra/pair). Étapes à exécuter sur 2 vrais appareils (Android↔Android ou
      Android↔iOS) connectés au même compte-graph (2 users amis) :
      1. Build+install l'app sur les 2 (ou 1 Android + 1 iOS existant). Accorder mic (+caméra
         si vidéo) à la 1re demande.
      2. **Appel AUDIO** : User A ouvre la conv directe avec B → bouton téléphone. B décroche.
         VÉRIFIER : les 2 passent « Connecting… » → **« Connected »** (compteur qui tourne) ;
         audio bidirectionnel s'entend ; **mute** coupe bien la voix côté pair ; **hangup**
         termine des 2 côtés.
      3. **Appel VIDÉO** : bouton vidéo. VÉRIFIER : vidéo distante plein écran + self PiP ;
         toggle caméra ; audio+vidéo OK.
      4. Si ça reste « Connecting… » : capturer `adb logcat | grep -iE 'webrtc|ice|meeshy'`
         (candidats ICE émis/reçus ? état ICE ? TURN joignable ?) et me le donner — soit un
         souci TURN/réseau, soit un event signaling mal nommé côté gateway↔Android.

## Méthodo
Build `JAVA_HOME=/opt/homebrew/opt/openjdk@21/... ; ./apps/android/meeshy.sh build`
(grep le log). Émulateur `-gpu host` SANS `-dns-server` ; si wedge : `adb emu kill`
PUIS ATTENDRE 5s PUIS relancer `emulator -avd meeshy_pixel8 -gpu host -no-snapshot
-no-boot-anim`. L'émulateur n'a pas de vrai micro/cam → l'A/B média réel = device/2
pairs (P5). Commits sélectifs sur main, pathspec STRICT (WIP concurrent). SDK purity :
le moteur WebRTC (stateful) = service sdk-core (comme CallSignalManager) ; l'UI/
permission-cascade = feature/app. Réf iOS : `WebRTC*`/`Call*` sous apps/ios/Meeshy.
