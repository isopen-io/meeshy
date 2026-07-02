# Appels Audio/Vidéo — rendre fonctionnel iOS↔iOS, iOS↔web, web↔web

> Branche: `main` (prod = `:latest`). Backend cible: **production** (`gate.meeshy.me`).
> Personne sur la prod. Instrumentation temporaire → **rollback complet à la fin**.
> Déploiement: edit gateway/web → commit+push `main` → CI build `:latest` → `ssh root@meeshy.me` `cd /opt/meeshy/production && docker compose pull && docker compose up -d` → ~30s healthcheck → test.

## Matrice de test (matériel réel disponible)
- **Endpoint Mac**  : `./apps/ios/meeshy.sh run --mac` (Mac Catalyst) — compte `atabeth`
- **Endpoint iPhone**: `Services CEO i16pm` (iPhone 16 Pro Max, iOS 26.3.1) — compte `jcharlesnm`
- **Endpoint Web**  : navigateur sur le Mac (prod web) — compte alterné

| Paire | Endpoints réels | Risque (diagnostic) |
|-------|-----------------|---------------------|
| iOS↔iOS | Mac-app ↔ iPhone | Session audio (RC-2), CallKit lifecycle |
| iOS↔web | iPhone ↔ navigateur | **Le + à risque** : SDP RED asymétrie (RC-3), TURN tardif (RC-1) |
| web↔web | 2 navigateurs | TURN tardif (RC-1), glare, qualité jamais mesurée |

## Causes racines candidates (du diagnostic)
- [x] **RC-1 serveur**: TURN config — VÉRIFIÉ SAIN (`turn.meeshy.me:3478`, coturn healthy). Bug **client web** (TURN tardif non appliqué au PC déjà créé) CORRIGÉ 2026-07-01 : `WebRTCService.setIceServers()` (`services/webrtc-service.ts`) n'écrivait que `this.serverIceServers`, jamais appliqué à un `RTCPeerConnection` déjà construit (`use-webrtc-p2p.ts` cache un service par participant, `setIceServers` seulement au moment de la construction). Fix : `setIceServers()` appelle `peerConnection.setConfiguration({ iceServers })` immédiatement si la connexion existe déjà. Tests : `webrtc-service.coverage.test.ts`.
- [~] **RC-2**: désync session audio iOS (`didActivate` vs `[AUDIO_FALLBACK]` dans `CallManager.transitionToConnected`) → connecté mais muet. Mitigé (guard d'idempotence + self-activate volontairement JAMAIS sur iPhone/iPad, cf. audit 2026-07-01) mais fenêtre de timing résiduelle si `didActivate` est retardé — pas de fix sûr sans test device réel.
- [~] **RC-3**: asymétrie munging SDP iOS↔web (web force RED PT63 / iOS désactive RED) — invisible serveur (pas de log SDP). Confirmé réel mais bas impact (RED est un raffinement fmtp optionnel) ; non prioritaire, cf. audit 2026-07-01.
- [x] **RC-4**: 2× `new CallService` (`MeeshySocketIOManager.ts:153` + `CallEventsHandler.ts:80`) + `CallCleanupService` sans callService (`server.ts:373`) + double cleanup disconnect (`AuthHandler.ts:298` + `CallEventsHandler.ts:1585`). CORRIGÉ commit `7728df04`.
- [x] **RC-5**: fenêtre zombie pré-ACK iOS (`endCall` n'émet `call:end` que si `currentCallId != nil`). CORRIGÉ — `callId` capturé avant l'ACK, `call:end` émis (ack + fallback), gateway `call:force-leave` robuste.

## Phase 0 — Instrumentation (les logs)
Gateway (déployé prod commit b541ba270, image :latest, gateway healthy):
- [x] I1 — log SDP m-lines/codecs/PT + détection RED (`a=fmtp:63`) sur `call:signal` (`CallEventsHandler.ts`) ✅ LIVE PROD
- [x] I7 — corrélation cleanup disconnect (`CallEventsHandler.disconnect` + `AuthHandler.handleDisconnection`) ✅ LIVE PROD
- [x] log émission credentials TURN — DÉJÀ existant (`TURNCredentialService.ts:158` logge turnServers count)

iOS/Mac (build local meeshy.sh) — compilent (build Mac OK 84s, build device en cours):
- [x] I2 — candidats ICE sortants + `typ` host/srflx/relay (`P2PWebRTCClient.didGenerate`)
- [x] I5 — DÉJÀ couvert (`[AUDIO_FALLBACK]` logge didActivate-fired vs manual à `CallManager.swift:1226/1242`)
- [x] I6 — RTP entrant réel promu `.debug`→`.info` (`startRTPGatePolling`)
- [~] I8 — callId ajouté sur les lignes [CALL-DIAG] ; retrofit global non fait (gateway I1 corrèle déjà par callId)

Web (DevTools + `chrome://webrtc-internals` ; code only si besoin):
- [ ] vérifier candidats `relay` présents, état ICE, SDP local par PC

## Setup test (établi)
- Comptes: atabeth (68f2a814…dfc1) + jcharlesnm (69d72d41…815d, "Compte De Test Store")
- Conversation directe partagée: `69e229dd021ac982c7356850`
- Web prod: https://meeshy.me | Device physique: Services CEO UDID 00008140-000C615A3C33001C
- Logs: gateway streamé (bg), device via idevicesyslog (installé)

## Phase 1 — Vérification des 3 paires (ordre: + observable d'abord)
- [ ] web↔web : connexion, relay candidates, audio/vidéo 2 sens, raccroché propre
- [ ] iOS↔web : SDP offre(iOS)/answer(web) via I1, ICE I2, audio 2 sens, autoplay distant
- [ ] Mac↔iPhone : audio session (I5/I6), CallKit start/answer/end

## Phase 2 — Lifecycle / zombies
- [ ] raccroché très rapide (pré-ACK, RC-5) → `call:end` émis ?
- [ ] coupure réseau brutale en appel → double `call:ended`/`participant-left` (RC-4) ?
- [ ] sonnerie 60s sans réponse → `call:missed` + `call:ended` une seule fois
- [ ] post-appel : `CallSession` en DB bien `ended`, aucun zombie

## Phase 3 — Fixes des causes racines confirmées (loop)
- [ ] (selon confirmations) RC-1 web, RC-2 audio, RC-3 SDP, RC-4 gateway, RC-5 pré-ACK
- [ ] redeploy + re-vérif après chaque fix

## Phase 4 — Rollback instrumentation
- [ ] revert tous les commits d'instrumentation, redeploy prod propre, smoke final

## Causes racines TROUVÉES (test live iPhone jcnm → web atabeth, 2026-06-05 10:06)
- **C1 — Web role-gate** : `apps/web/components/conversations/header/use-permissions.ts:10-19` — `canUseVideoCalls` réservé à BIGBOSS/ADMIN/MODERATOR/AUDIT/ANALYST. Un USER ne peut PAS initier d'appel web. **Bug probable**. (atabeth=USER, jcharlesnm=USER, jcnm=ADMIN)
- **C2 — Web v2 bouton mort** : `/v2/chats` header phone button = placeholder sans `onClick`.
- **C3 — Web v2 chats crash** : `ReferenceError: repliedMessage is not defined` (ErrorBoundary) à l'ouverture d'une conversation v2.
- **C4 — Web ne rend PAS l'appel entrant** : gateway a bien émis `call:initiated` à atabeth (ICE générés `:21.878`, socket dans la room) mais aucune notif affichée côté web. À confirmer livraison vs rendu (batch 2 promeut le log livraison).
- **C5 — Churn socket iOS** : jcnm (iPhone) se déconnecte ~5s après `call:initiate` (PAS un ping timeout serveur = 10/25s). Cause en cours d'instrumentation (batch 2 = raison disconnect). iOS NE gate PAS les appels par rôle.
- **OK** : l'iPhone PEUT initier (`call:initiate` arrive au serveur), TURN servi (turnServers:1), session se termine proprement `missed`/`ended` côté serveur (pas de zombie serveur — fantôme = CallKit local iPhone, force-quit pour purger).

## Instrumentation déployée
- Batch 1 (commit b541ba270) : I1 SDP/codecs/RED/ICE + I7 cleanup. LIVE.
- Batch 2 (commit a5911897c, CI 27009097983) : raison disconnect (`disconnecting` handler) + livraison call:initiated info. EN DÉPLOIEMENT.

## JALON 2026-06-05 : appels iOS→web FONCTIONNENT
Capture live 10:41-42 : call:initiate→livraison→answer→SDP(Opus PT111+RED+H264/VP8/VP9/AV1)→ICE host/host connecté ~1s→**30s audio bidirectionnel stable**. Pipeline sain. Le churn socket intermittent est ce qui casse les appels *parfois*.

## FIXES implémentés (2026-06-05)
- [x] **Phantom-cleanup gateway** (commit e7bcc1225, DÉPLOYÉ prod) — chaque initiate force-termine les appels fantômes vivants de l'initiateur (CallService.initiateCall). Fini CALL_ALREADY_ACTIVE bloquant.
- [x] **Fix #1 partie 1 (iOS)** — BackgroundTransitionCoordinator ne suspend/reconnect plus les sockets si `callState.isActive` (couvre ringing/connecting/connected). Socket signaling reste vivant en background pendant l'appel.
- [x] **Fix #1 partie 2 (iOS)** — garde `isCallActiveGuard` injectée dans MessageSocket/SocialSocket : `forceReconnect()` suppressed pendant un appel (couvre token rotation/ré-auth, utile pour le Mac qui ne background pas). Flag `CallManager.isCallActiveFlag` nonisolated thread-safe, câblé dans MeeshyApp.init. Pureté SDK préservée (closure opaque).
- [x] **Fix #2 (gateway)** — DÉJÀ FAIT (session précédente, non coché ici). `CallEventsHandler.ts` `toggle-audio`/`toggle-video` catch blocks parsent `error.message` en `CODE: message` (`errorCode = errorMessage.split(':')[0]`) et `CallService.updateParticipantMedia` throw bien `${CALL_ERROR_CODES.CALL_NOT_FOUND}: ...` — plus de `MEDIA_TOGGLE_FAILED` générique. Vérifié 2026-07-01 : zéro occurrence de `MEDIA_TOGGLE_FAILED` dans `CallEventsHandler.ts`.
- [x] **Fix #3 (web)** — DÉJÀ FAIT. Aucun crash `repliedMessage` trouvé dans `apps/web` (0 occurrence). `v2/ContactCard.tsx` a un `onClick` câblé (`onAction('call', contact.id)`) — mais ce composant n'est actuellement rendu nulle part dans l'app (feature "People hub" pas encore branchée, cf. `tasks/2026-06-07-calls-view-people-hub-plan.md`) : pas un bouton mort, un composant pas encore intégré.
- [x] **Fix #4 (web)** — DÉJÀ FAIT (décision produit tranchée). `use-permissions.ts:canUseVideoCalls` retourne `Boolean(currentUser)` pour tout utilisateur authentifié, plus de gate par rôle staff.
- [x] **RC-3 (SDP RED asymmetry)** — CORRIGÉ 2026-07-01. `apps/web/services/webrtc-service.ts` mungeait encore `a=fmtp:63 opusPT/opusPT` (RED) dans son SDP local (`addAudioRedundancy`), alors que l'ADR-4 iOS (`docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §1.3.4) interdit explicitement le SDP munging pour RED/DTX/codec preferences suite à un bug libwebrtc "silent audio after ICE" déclenché par ce pattern exact — iOS avait déjà migré vers `RTCRtpTransceiver.setCodecPreferences` mais web ne l'avait jamais suivi. Fix : `applyAudioCodecPreferences()` (miroir de la méthode iOS) appelée sur le transceiver audio dans `addLocalMedia()`, négociation Opus+RED via `RTCRtpSender.getCapabilities('audio')` + `setCodecPreferences`, feature-détectée et try/catch (no-op gracieux si absent, ex. anciens Safari). `addAudioRedundancy` supprimée de `mungeSdp`. Tests mis à jour (`webrtc-service.coverage.test.ts`), 167/167 verts, couverture du fichier 99.3%. **Non vérifié en appel réel** (pas d'accès device/navigateur dans cet environnement) — à valider par un test live iOS↔web avant de considérer la piste RC-3 totalement clôturée.

## Causes racines confirmées (raisons disconnect capturées)
- jcnm socket : `transport close`, `transport error` (long-poll erreur réseau), `client namespace disconnect` (app coupe via suspendTransport). Multi-sockets + reconnexions. INTERMITTENT.
- Config socket gateway : pingTimeout 10s / pingInterval 25s (donc churn 5s ≠ ping timeout).
- iOS `.forcePolling(true)` (long-polling only, pas de WebSocket) — fragile sous charge WebRTC.

## Audit 2026-07-01 — relecture complète du backlog + passage gateway/web
Point d'entrée : routine de suivi continu de la feature d'appel. RC-1/RC-4/RC-5/Fix#2/Fix#3/Fix#4
étaient déjà corrigés sur `main` (vérifié par lecture du code réel, pas seulement des docs).
RC-2 et RC-3 restent partiellement ouverts mais sont des risques bas/résiduels (détail ci-dessus) —
RC-2 ne peut pas être corrigé de façon sûre sans test CallKit sur device réel (indisponible dans cet
environnement Linux sans Xcode) ; RC-3 est un raffinement fmtp bas-impact dont le fix risquerait de
rouvrir un bug libwebrtc déjà réglé (commit `9e663039`).

Nouveau bug trouvé et corrigé côté gateway (TDD, `services/gateway/src/services/CallService.ts`) :
`leaveCall()` ne nettoyait pas l'entrée heartbeat en mémoire du participant lors d'un départ mid-call
(groupe, pas le dernier participant) — seul `clearParticipantBackgrounded` était appelé. L'entrée
restait dans `this.heartbeats` jusqu'à la fin de l'appel (footprint mémoire négligeable et borné, mais
incohérence réelle avec le pattern "chaque state se nettoie à la sortie" déjà utilisé pour
`backgroundedParticipants`). Fix : `this.heartbeats.get(callId)?.delete(participantId)` ajouté dans la
branche mid-call-leave, + test TDD couvrant le cas groupe. Suite complète gateway : 486/486 suites,
13361/13362 tests verts, tsc --noEmit propre.

Un audit gateway/web plus large (event listeners ZMQ, race conditions sur Maps in-memory, validation
SDP renegotiation web) a soulevé 4 autres pistes qui, après lecture du code réel, se sont avérées être
des faux positifs : le listener `translateAndEmitSegment` a un design correct (chaque Promise a son
propre listener filtré par taskId, nettoyé au timeout) ; `bufferedOffers` n'a pas de race (Node.js
single-threaded, pas d'`await` dans la boucle de sweep) ; le handler `call:transcription-segment` a déjà
un try/catch englobant tout le corps ; la validation SDP avant `setRemoteDescription` côté web n'est pas
nécessaire (le navigateur valide déjà, le pattern perfect-negotiation polite/impolite est déjà implémenté).

Dead code identifié (SOTA plan §Étape 7, jamais fait) — **supprimé 2026-07-01 (2e session du jour)**,
puis **CORRIGÉ après échec CI** (`ios-tests` a échoué sur PR #1320 : `cannot find 'VideoConfig' in scope`
dans `P2PWebRTCClient.swift:1261-1263`, `selectFormat(for:)`). Cause : `CallMediaConfig.swift` déclare
`VideoConfig`/`AudioConfig`/`DataChannelConfig`/`CodecPreferences`, et **`VideoConfig.hd720p30` est
réellement utilisé en prod** (ceiling résolution/framerate caméra) — ce fichier N'ÉTAIT PAS mort,
contrairement à `CallEventQueue`/`MediaPipelineHook`/`MeeshyAudioProcessingModule` qui le sont réellement
(vérifié à nouveau, zéro référence prod). Le grep initial de vérification pré-suppression a raté cet
usage : la commande Bash `grep -n "..." P2PWebRTCClient.swift | head -30` a tronqué le résultat via son
propre `| head -30` avant d'atteindre la ligne 1261 (~30 correspondances antérieures sur
`setCodecPreferences`/`applyAudioCodecPreferences`, homonymes non liés, avant la vraie occurrence de
`VideoConfig`) — outil `Grep` dédié (head_limit par défaut 250, pas de troncature silencieuse) aurait
évité l'erreur. **Leçon** : ne jamais grep en Bash brut + `| head -N` pour une vérification "zéro
référence" avant suppression ; toujours `Grep` (files_with_matches d'abord, puis content avec
`head_limit: 0`) sur l'intégralité de l'arbre. Fix : `CallMediaConfig.swift` +
`CallMediaConfigTests.swift` restaurés à l'identique (diff vide vs avant suppression) ; `CallEventQueue`/
`MediaPipelineHook`/`MeeshyAudioProcessingModule` + leurs tests restent supprimés (confirmés morts par
cette même re-vérification exhaustive). `project.yml` (XcodeGen) utilise un glob récursif sans liste de
fichiers explicite → l'ajout comme la suppression sont sans risque de cassure de projet ; `project.pbxproj`
reste volontairement non touché (artefact régénéré par CI via `xcodegen generate`, cf. `apps/ios/CLAUDE.md`).
Cet environnement (conteneur Linux, toujours pas de Swift/Xcode/xcodegen) ne peut toujours pas compiler
localement — c'est précisément pourquoi le garde-fou CI (`ios-tests`) existe et a été laissé faire son
travail : **`./apps/ios/meeshy.sh test` / CI verte reste la seule preuve définitive**, obtenue ici via la
CI GitHub Actions elle-même (macOS runner) plutôt qu'en local.
## Review (2026-07-01 — session audit calling feature)
Audit complet du pipeline appels (iOS CallManager/P2PWebRTCClient, gateway CallEventsHandler/CallService,
web webrtc-service). Un agent d'exploration dédié a proposé 5 pistes de bugs (leak NotificationCenter,
accessibilité avatar IncomingCallView, race remoteVideoTrack_, ordre CallKit/socket sur mute, contrôle
VoiceOver caché) — **les 3 premières vérifiées se sont révélées être des faux positifs** après lecture
attentive du code (observateurs enregistrés une seule fois dans `init()` d'un vrai singleton = pas un leak ;
label d'accessibilité mort mais inoffensif car l'ancêtre est déjà `.accessibilityHidden(true)` avec le nom
annoncé séparément ; "race" en fait sérialisée par le `DispatchQueue.main` unique). Les items #2/#3/#4 de ce
fichier étaient déjà résolus par une session antérieure mais jamais cochés ici — source de confusion pour
les prochaines sessions, corrigé. Seul finding réel de la session : RC-3 (asymétrie SDP RED web/iOS),
corrigé ci-dessus, avec tests unitaires mais sans validation d'appel réel device.

## Review (2026-07-01 — 2e session du jour) — dead code iOS + 2 bugs gateway/web
Point d'entrée : suite de la routine de suivi continu. Cette session a pu tester réellement gateway/web
(bun/node disponibles) mais toujours pas Swift/Xcode (conteneur Linux) — portée limitée à ce qui est
vérifiable ici.

- **Dead code iOS supprimé** : cluster `CallEventQueue`/`MediaPipelineHook`/`CallMediaConfig`/
  `MeeshyAudioProcessingModule`, déjà identifié et reporté deux fois (SOTA plan + audit du matin même) —
  détail ci-dessus.
- **Bug réel #1 (web, corrigé, TDD)** — `WebRTCService.mungeOpusSdp()` (`apps/web/services/webrtc-service.ts`)
  n'avait aucun filtre de section SDP : la regex `a=fmtp:(\d+) (.+)` matchait TOUTE ligne fmtp, y compris
  celles de la section vidéo (H264/VP8/VP9/AV1 `profile-level-id`, etc.), sur lesquelles elle appliquait
  quand même `maxaveragebitrate`/`stereo`/`useinbandfec`/`usedtx`/`maxplaybackrate` (des clés Opus-only, non
  pertinentes pour un codec vidéo). Ce test manquant existait depuis l'introduction de RC-3 le matin même —
  `webrtc-service.coverage.test.ts` testait la pollution du bitrate vidéo et les params Opus séparément,
  jamais leur interaction sur un SDP audio+vidéo combiné. Trouvé par un agent d'exploration dédié
  gateway/web, confirmé par lecture du code + test RED, corrigé : `mungeOpusSdp` collecte d'abord les
  payload types déclarés par les lignes `m=audio` puis ne munge que les `a=fmtp` dont le PT est dans cet
  ensemble (robuste à l'ordre des lignes dans le SDP). 158/158 tests verts, couverture fichier 99.14%
  (inchangée).
- **Bug réel #2 (gateway, corrigé, TDD)** — `CallEventsHandler.ts` : `call:quality-report` (et 6 handlers
  frères : `call:toggle-audio`/`call:toggle-video`/`call:backgrounded`/`call:foregrounded`/
  `call:reconnecting`/`call:reconnected`) autorisaient via `resolveParticipantIdFromCall`, qui vérifie
  seulement l'appartenance à la **conversation**, pas la participation active à **CET appel précis**. Les
  appels sont plafonnés à 2 participants (`CallService.joinCall`) même dans une conversation de groupe —
  un membre du groupe qui n'a jamais rejoint l'appel pouvait donc écrire des stats
  (`bytesSent`/`bytesReceived`/`networkQuality`) sur l'appel actif de quelqu'un d'autre, alors que le
  commentaire du code prétendait explicitement le contraire ("only an active participant of this call may
  write stats"). Fix : nouvelle méthode `resolveActiveCallParticipantId` (mirroir du pattern CVE-001 déjà
  utilisé par `call:signal` — `callService.getCallSession(callId)` + recherche d'un participant actif
  `!leftAt` matchant l'userId), substituée dans les 7 handlers concernés (`call:join`/`call:leave`/
  `call:end`/cleanup/`call:transcription-segment`/`call:request-ice-servers` restent volontairement sur
  l'ancienne méthode — `call:join` en particulier a lieu AVANT la création du `CallParticipant`, donc le
  check strict y serait circulaire). 677/677 tests gateway socketio verts (dont 6 nouveaux cas de
  régression ciblés). `tsc --noEmit` non vérifiable dans cet environnement (client Prisma non généré —
  échec réseau `ECONNRESET` sur le téléchargement du binaire moteur, indépendant de ce changement).
- Non étendu à `call:transcription-segment`/`call:request-ice-servers` (même faille théorique, non
  vérifiée en détail cette session) — piste pour une prochaine passe.

## Session 2026-07-02 — audit iOS AVEC toolchain Xcode (premier passage compilable)
Environnement macOS + Xcode 26.1.1 enfin disponible — le backlog iOS déféré des sessions Linux a été
traité. Audit par 3 agents parallèles (FSM reconnexion / transport+TURN / session audio+CallKit),
chaque piste re-vérifiée dans le code réel avant fix. Fixes commités `6b5e238d8` + `b3f704ba1` :

- **[FIX HIGH] Budget reconnexion épuisé par un blip** — `attemptReconnection()` incrémentait
  `reconnectAttempt` sans garde ; NWPathMonitor tire sur path-lost ET path-restored ET interface-change
  → un hoquet réseau 1-2s brûlait le budget de 3 et tuait l'appel (`.connectionLost`). Fix :
  `CallReliabilityPolicy.evaluateReconnectTrigger` — les triggers externes COALESCENT dans le cycle en
  vol (re-armement de l'iceRestartTask du même attempt, compteur intact) ; seuls le watchdog
  `.reconnecting` et un `performICERestart` nil escaladent (`escalate: true`).
- **[FIX MED] TURN non rafraîchi à l'ICE restart** — le refresh périodique (80% TTL) et le refresh
  didReconnect existaient, mais le chemin network-change→ICE-restart réutilisait les creds courants
  (potentiellement proches de l'horizon). Fix : `emitRequestIceServers` fire-and-forget à chaque
  nouveau cycle (la réponse s'applique via le listener `call:ice-servers-refreshed` existant ; une
  escalade watchdog re-gather avec les creds frais). + `turnRefreshDelay` clamp : un TTL dégénéré
  (<60s) ne désarme plus le refresh périodique (ancien `guard ttl >= 60 else return`).
- **[FIX MED-LOW] Self-heal half-open gelé + re-détection inopérante** — `halfOpenSettled` (var locale
  de la boucle monitor, tick 2s) n'était resetée que si la boucle OBSERVAIT `.reconnecting` (raté si le
  cycle complet passe entre 2 ticks), et la re-détection comparait des compteurs RTP CUMULATIFS (déjà
  au-dessus du seuil après restart → `.healthy` instantané, half-open post-restart indétectable). Fix :
  `HalfOpenMonitorState` (struct pure testée) à époque de connexion (`connectionEpoch` bumpé dans
  `transitionToConnected`) + baselines par époque, évaluation en deltas.
- **[FIX RC-2] Stuck-muted iPhone** — `RTCAudioSession.isAudioEnabled` n'est flippé QUE par
  `provider:didActivate:` ; s'il n'arrive jamais, appel connecté mais muet, aucun filet (le détecteur
  half-open ne voit rien : comfort-noise/DTX maintient les compteurs RTP). Fix : fallback one-shot 2s
  après `.connected` (flag `callKitDidActivateFired` thread-safe pattern `isCallActiveFlag`, bridge
  miroir du recovery interruption-end). **À valider sur device réel** (timing CallKit ≠ simulateur).
- **[FIX produit, décision utilisateur] Effets vocaux = UI mensongère** — le panneau in-call Voice
  Coder/Baby/Demon (CallView→CallEffectsOverlay→AudioEffectsPanel) était branché sur un pipeline MORT :
  `processAudioBuffer` n'a AUCUN appelant prod depuis la suppression de `MeeshyAudioProcessingModule`
  (lui-même scaffold jamais branché — la feature n'a JAMAIS modifié la voix envoyée au pair). Décision
  utilisateur : masquer. Entry points retirés (bouton « + » et overlay = video-only, bouton audio de la
  toolbar supprimé) ; `AudioEffectsPanel` + `CallAudioEffectsService` restent dans l'arbre pour un futur
  recâblage (nécessite un hook de capture WebRTC — chantier dédié). Back-sound (AVAudioEngine concurrent
  du mic WebRTC, lecture locale) désactivé de facto par le même masquage.
- **Vérifiés NON-bugs cette session** (ne pas re-creuser) : `.forcePolling` déjà retiré (transport
  auto-upgrade WS + suppression forceReconnect mid-call) ; watchdog `.reconnecting` présent
  (`evaluateReconnecting`, budget 10s×3) ; un blip socket 2s ne tue PAS l'appel (aucun listener
  socket-disconnect ne termine d'appel ; debounce PC-state 3.5s ; didReconnect re-join+flush ICE) ;
  interruption-end réactive sans `.shouldResume` ; contrats CXAction fulfill-once corrects ;
  `deactivateAudioSession` uniquement au teardown.
- 23 tests unitaires nouveaux (`CallReconnectPolicyTests.swift`) sur les 4 politiques pures.
  Build-for-testing Xcode 26.1.1 VERT. Suite MeeshyTests 18.2 + E2E simu↔web : voir suite session.

## Session 2026-07-02 (suite) — E2E prod RÉUSSI + Fixes 6-10

### JALON : appel audio simulateur → iPhone réel CONNECTÉ sur prod ✅
Endpoint réel : simu iPhone 16 Pro (atabeth, UDID 30BFD3A6) → iPhone 16 Pro Max physique
(jcharlesnm), backend prod. CallId `6a4606f677575265af8192ea` : setup 1/4→4/4, ACK gateway
4 ICE servers, remote ANSWER `audio=sendrecv`, ICE connected en 3,5 s, `[AUDIO_FALLBACK]`
self-activation (chemin simulateur du Fix 6), **78 s de conversation** (RTT 4-9 ms, 0 perte,
mute/unmute + speaker testés en live), raccrochage distant propre (`rawReason=completed`),
journal « Appel audio sortant · 01:20 », 7.6 MB, qualité Excellent. Le refresh TURN 80 % TTL
(Fix 2) validé live : refresh programmé à 2880 s pour TTL=3600 s.

- **[FIX 6] Gate CallKit plateforme** (commit `a45bc1785`) — sur simulateur,
  `provider:didActivate:` ne fire jamais et callservicesd envoie un `CXEndCallAction` autonome
  ~3 s après le start sortant → appel tué en `.ringing`. Même famille que iOS-app-on-Mac
  (error 3). `CallReliabilityPolicy.platformUsesCallKit` (pure) +
  `CallManager.platformSupportsCallKit` (gate statique unique des 3 sites `callUsesCallKit`) ;
  VoIP push garde CallKit (exigence Apple). 3 tests policy + source-guard migré. 51/51 verts.
- **[FIX 7] Vidéo distante invisible en appel audio** (découvert live : le user a activé sa
  caméra pendant l'appel audio → renégociation entrante OK, answer `video=recvonly`, track
  délivré, 7000+ pkts H264… et l'UI restait sur l'avatar). Cause : la bascule
  audio/vidéo de `CallView.connectedView` était `isVideoEnabled` (caméra LOCALE).
  Fix : `CallReliabilityPolicy.videoLayoutActive(local || remote)` (pure, 5 tests) +
  `CallManager.isVideoUIActive` ; bascule layout + swipe-down + auto-hide contrôles dans
  CallView ; miniature `FloatingCallPillView` et `canActivateSystemPiP` keyed sur le flux
  DISTANT seul. L'envoi vidéo DEPUIS le simu reste impossible (guard FigCaptureSourceRemote)
  — l'affichage du flux distant, lui, fonctionne partout.
- **[FIX 8, retour user] Contrôles sur le cadre self-preview + isolation du drag** — boutons
  flip caméra + filtres épinglés SUR le cadre PiP local (`pipFrameButton`, visibles quand le
  PiP montre le flux local) ; le geste swipe-down-minimise déplacé du ZStack `connectedView`
  vers `videoCallLayout` seul → déplacer le cadre PiP (sibling au-dessus) ne quitte plus le
  plein écran.
- **[FIX 9, retour user] Long-press désactivé sur les bulles système** — le handler
  `onLongPress` de ConversationView ignore `messageSource == .system` : plus de réactions/
  Edit/Traduire/Pin/Supprimer sur le journal d'appel ; la bulle call-notice garde son propre
  long-press → sheet détails.
- **[FIX 10, retour user] `CallSummaryDetailSheet` en Liquid Glass iOS 26** — nouveau shim
  `adaptiveSheetGlassBackground()` (MeeshyUI/Compatibility/AdaptiveGlass.swift,
  `presentationBackground(.ultraThinMaterial)` gated 16.4+) ; carte détails en
  `adaptiveGlass(tint:)` ; CTA rappel en `adaptiveGlassProminent`.

### 2e vague (même session, après retours user live + audit prod multi-agents)

Diagnostic majeur (logs gateway prod) : **le chemin décrochage-via-VoIP-push est cassé à 100 %**
(7/7 appels notifiedSockets=0 → push APNS OK → app réveillée (REST OK) → socket JAMAIS connecté
pendant le ring (connect() n'est déclenché que par les vues au foreground) → `call:join` fire-and-forget
perdu → gateway rejette les signaux (« Sender not a participant » ×26 sur …e6) → missed malgré le
décrochage). L'appel réussi de 07:36 : app au premier plan → socket vivant → in-app ring → OK.

- **[FIX 11] `joinCallRoomReliably`** — remplace les 2 émissions early fire-and-forget (chemins VoIP
  et foreground) : force `connect()` si nécessaire, attend `isConnected` (poll 200 ms, budget 30 s),
  `emitCallJoinWithAck` + 1 retry, annulé au teardown. Source-guards EarlyJoin migrés vers le nouveau seam.
- **[FIX 12, retour user] Chrono CallKit au connect réel** — l'answer action CallKit est TENUE
  (`holdPendingAnswerAction`, hand-off synchrone `MainActor.assumeIsolated`, delegate queue=main) et
  settled à `transitionToConnected` (fulfill) / teardown pré-connexion (fail) / filet 10 s (fulfill).
  Le compteur ne démarre plus à 0:00 avant l'établissement. Source-guard CXAnswer migré.
- **[FIX 8b, retour user] Contrôles du cadre sans doublons** — bouton Effets (« + ») et flip iPhone
  retirés de la barre du bas (le picker multi-caméras Mac/iPad reste) ; l'overlay filtres ouvre
  directement le panneau `VideoFiltersPanel` (plus de toolbar intermédiaire à 1 bouton).
- **[FIX C2 audit, HIGH] RATE_LIMIT_EXCEEDED non-fatal côté iOS** — le gateway limite
  `socket:call:ice` à 50/5 s ; un flush de gathering légitime (15-25 candidats/ms) le dépasse et le
  client tuait l'appel (prod : appel …935c tué 382 ms après connexion). Ajouté à la whitelist comme
  INVALID_SIGNAL (drop silencieux, ICE est redondant par design).
- **[FIX gateway, TDD] Payload `call:missed` conforme au contrat** — le ringing-timeout n'émettait
  que `{callId}` (violation de CallMissedEvent, decode iOS KO). Enrichi conversationId/callerId/
  callerName + 5 tests, 188/188 socketio, 683/683 suites call, tsc 0 erreur. Côté SDK iOS,
  `CallMissedData` décode désormais défensivement (champs optionnels) pour les vieux gateways.
- **Audit prod multi-agents archivé** : `docs/analyses/2026-07-02-audit-gateway-appels-prod.md`
  (C1-C8 confirmés dont : appels « completed » duration 0 au lieu de missed ; updateParticipantMedia
  100 % d'échec DB — sémantique Prisma/Mongo `leftAt: null` vs missing ; double summary + index unique
  `(conversationId, clientMessageId)` JAMAIS créé en prod — `$ne:''` non supporté en
  partialFilterExpression ; force-leave pré-answer sans summary ni notification).

### 3e vague — Résilience au redémarrage gateway (retour user : « l'arrêt des serveurs coupe un appel déjà établi »)

Diagnostic : le média d'un appel est **pur P2P** (`RTCPeerConnection` DTLS-SRTP, direct entre appareils) —
il ne transite JAMAIS par la gateway. Pourtant un `docker compose restart gateway` (SIGTERM) coupait
tout appel en cours : à la fermeture du serveur, TOUTES les sockets tombent → le handler
`socket.on('disconnect')` (`CallEventsHandler.ts`) traitait chaque chute comme un raccrochage → `leaveCall()`
(règle 1:1 `isLastParticipant = … || isDirectCall`) → `CallSession` marquée `ended` + broadcast
`call:ended` → les clients détruisaient leur `RTCPeerConnection` pourtant saine. Le serveur ORDONNAIT
la fin d'un appel dont le tuyau média fonctionnait toujours.

- **[FIX gateway, TDD] Flag d'arrêt `prepareForShutdown()`** — `CallEventsHandler.isShuttingDown` posé au
  tout début de `server.stop()` (AVANT `server.close()` qui mass-drop les sockets). Une fois posé, le
  handler `disconnect` laisse les appels actifs INTACTS (pas de `leaveCall`, pas de `call:ended`) →
  le média P2P survit, les clients re-join l'instance redémarrée. Couvre l'arrêt **normal** (SIGTERM).
- **[FIX gateway, TDD] Fenêtre de grâce reconnexion (30 s)** — un `disconnect` involontaire d'un appel
  `active`/`reconnecting` n'appelle plus `leaveCall` immédiatement : il arme un timer par
  `(callId:userId)`. Un `call:join` (re-join) l'annule ; l'expiration exécute le chemin de fin normal
  (extrait dans `leaveParticipationAndBroadcast`, comportement identique à l'ancien). Les appels
  pré-décrochage (`initiated`/`ringing`/`connecting`) gardent la fin immédiate (raccroché/décliné réel).
  À l'expiration, double-vérif DB (participant encore actif, appel non terminé ailleurs) + présence
  socket du user dans la room avant de terminer. Couvre les **blips réseau transitoires**.
- **Arrêt brutal (SIGKILL/crash)** : aucun handler ne s'exécute → la `CallSession` reste `active` en base ;
  le filet est le tier heartbeat de `CallCleanupService` (fallback DB post-restart `lastHeartbeatAt ??
  joinedAt`, fenêtre 120 s) qui ne termine que si personne ne se reconnecte à temps. iOS/web reprennent
  le heartbeat au re-join. Aucun changement nécessaire (déjà en place).
- **[FIX web, TDD] Re-join au reconnect** — `useCallSignaling` écoute désormais le `connect` de la socket
  (Socket.IO réutilise la même instance et refire `connect` au reconnect) et re-émet `call:join` pour
  re-entrer dans la room, SANS recréer la `RTCPeerConnection` (le média a survécu). Un rejet `CALL_ENDED`
  déclenche le teardown. Miroir du `didReconnect` iOS. 3 tests (`useCallSignaling.reconnect.test.ts`).
- **iOS : aucun changement requis** — `CallManager.didReconnect` (l.3121) re-join déjà via
  `emitCallJoinWithAck` + flush ICE + re-sync audio/vidéo + refresh TURN, et aucun listener
  socket-disconnect iOS ne termine d'appel. Le client était déjà résilient ; c'était le SERVEUR le
  bloqueur. Le fix gateway débloque le flux iOS existant de bout en bout. (Non recompilé ici : env Linux
  sans Xcode — la CI `ios-tests` reste le garde-fou.)
- Tests : `CallEventsHandler-restart-resilience.test.ts` (8), `CallEventsHandler-disconnect.test.ts`
  mis à jour pour le flux grâce (fake timers), 20/20 suites socketio (196) + 5/5 services call (219) verts.

### Session continue (routine calling-feature, gateway-only — pas de toolchain Swift dans cet environnement)
Backend uniquement (TDD complet, vérifié : gateway 488/488 suites / 13402/13403 tests, `tsc --noEmit`
propre) :
- **[FIX C5]** `CallService.initiateCall`/`joinCallAttempt` écrivent maintenant `leftAt: null` explicitement
  au `callParticipant.create` — sans ça Prisma n'écrit jamais le champ (optionnel omis ≠ écrit `null`
  sur MongoDB), donc tous les `findFirst({ leftAt: null })` en aval (`updateParticipantMedia` et 5 autres
  sites) ne matchaient jamais la ligne, d'où 100 % d'échec de persistance des toggles média observé en
  prod. 2 tests TDD ajoutés (initiator + joiner).
- **[FIX C6, partiel]** Root cause trouvée : la migration `2026-05-09-message-client-id.mongodb.js` utilise
  `$ne: ''` dans un `partialFilterExpression`, un opérateur NON supporté par MongoDB pour les index
  partiels (seuls égalité/`$exists`/`$gt`/`$gte`/`$lt`/`$lte`/`$type`/`$and` le sont) — `createIndex`
  lève donc une erreur et l'index unique `(conversationId, clientMessageId)` n'a **jamais existé en prod**.
  Sans lui, le catch Prisma P2002 dont dépend `createCallSummaryMessage()` (et toute la dédup offline-queue
  des messages ordinaires) ne se déclenche jamais — deux chemins terminaux concurrents insèrent chacun leur
  propre résumé. Fix : nouvelle migration `2026-07-02-fix-message-client-id-partial-index.mongodb.js`
  (`$gt: ''` à la place, équivalent pour exclure la chaîne vide), idempotente, drop+recrée si un index
  du même nom existe avec une spec différente. L'ancienne migration est annotée SUPERSEDÉE (ne pas
  l'exécuter). **Reste ouvert** : le court-circuit des effets de bord du handler (`call:end` rebroadcast
  même quand `endCall()` retourne "already ended" sans rien avoir changé) nécessiterait de changer la
  signature de `CallService.endCall()` (3 call sites + 8 tests) — jugé hors scope, l'index corrige déjà
  le symptôme observable (double persistance DB).
- **[FIX C7]** Handler `call:force-leave` ne traitait que `callSession.status === 'ended'` (summary +
  broadcast) — un force-leave pré-answer (idempotent leave sur teardown CallKit) résout en `'missed'`,
  jamais couvert : le callee qui avait pourtant décroché n'avait ni résumé ni notification. Fix : miroir
  exact du handler `call:leave` (déjà correct) — traite `'ended' || 'missed'`, déclenche `handleMissedCall`
  sur `'missed'`. 2 tests TDD ajoutés (missed → broadcast+summary ; active → no-op).
- **[FIX, rate limit]** `CALL_ICE_CANDIDATE` porté de 50/5s à 150/5s (recommandation #5 de l'audit) — un
  flush de gathering légitime (15-25 candidats/ms) OU une renégociation (jusqu'à 7 cycles observés sur un
  appel sain de 262s) épuisait la fenêtre et faisait passer un throttle serveur pour fatal côté client
  (déjà mitigé côté iOS par le fix C2 de la session précédente, whitelist non-fatal — ce fix réduit
  maintenant aussi la fréquence réelle du throttle).
- **[FIX, authz]** `call:request-ice-servers` vérifiait la conversation-membership
  (`resolveParticipantIdFromCall`) + la room Socket.IO, mais pas la participation ACTIVE à cet appel précis
  (`resolveActiveCallParticipantId`, même pattern que les 7 autres handlers déjà durcis le 2026-07-01) —
  aligné par cohérence défense-en-profondeur. `call:transcription-segment` était déjà sur le bon pattern
  (contrairement à ce que ce fichier indiquait) ; note corrigée.
- **[Audit iOS, non appliqué]** Agent d'exploration dédié (lecture de code uniquement, pas de build —
  toolchain Swift absente ici) a confirmé 5 pistes concrètes détaillées dans "Reste à faire" ci-dessus.
  Non implémentées cette session (nécessitent `./apps/ios/meeshy.sh build`/CI macOS pour vérification).

### Reste à faire
- [ ] Déployer gateway (résilience restart) + valider live : appel établi → `restart gateway` → l'appel
      continue, re-join auto des 2 côtés (web + iOS)
- [ ] Re-test E2E vidéo après Fix 7 : appel audio → user active sa caméra → le simu AFFICHE le flux
- [ ] Déployer gateway (fix call:missed) + TestFlight (fixes 11/12 côté callee iPhone)
- [ ] Backlog audit prod : C3/C4 (endCall → missed pas completed), C8 (dédup multi-socket), bulle de
      statut orange illisible derrière la Dynamic Island (retour user, StatusBubbleOverlay)
- [ ] Appel vidéo complet + envoi vidéo : device réel uniquement (guard simulateur)
- [ ] Validation device réel du fallback stuck-muted (Fix 4)
- [ ] C6 reste partiel : l'index unique est corrigé (voir session ci-dessous) mais le court-circuit des
      effets de bord (`endCall()` retourne au lieu de throw sur "already ended", le handler rebroadcast
      quand même) n'est pas fait — changerait la signature de `CallService.endCall()` (routes/calls.ts +
      CallEventsHandler.ts + ~8 tests), jugé hors scope pour cette session vu que l'index corrige déjà le
      symptôme observable (double persistance en DB)
- [x] iOS CallKit/TURN/banner triad — **CORRIGÉ 2026-07-02 (session ci-dessous)**, voir détail. Pipeline
      effets vocaux mort mais toujours instancié par appel (`CallAudioEffectsService`, AVAudioEngine
      construit inutilement) reste ouvert — recâblage nécessite un hook de capture WebRTC dédié, hors
      scope d'un cycle d'audit.
- [ ] C6 court-circuit `endCall()` (routes/calls.ts + CallEventsHandler.ts + ~9 tests) toujours différé —
      voir note "Reste ouvert (C6 court-circuit)" ci-dessus. Une variante voisine (endCall() rappelé sur
      un call DÉJÀ missed/rejected/failed, pas seulement ended) a été trouvée et corrigée cette session
      (voir ci-dessous) ; le court-circuit "no-op rebroadcast" original reste, lui, non traité.

### Session 2026-07-02 (mission SOTA appels — macOS + Xcode, 4e vague : EXIGENCE №1 gateway complète)

Cartographie préalable par 3 agents (gateway / iOS / specs) croisée avec le code réel. Constat : la
résilience restart (3e vague, PR #1344) avait un **contournement critique** jamais couvert par les tests.

- **[FIX CRITIQUE, TDD] `AuthHandler.handleDisconnection` terminait les appels répondus** — au dernier
  socket d'un user, boucle `leaveCall()` inconditionnelle sur CHAQUE participation `leftAt: null`, y
  compris `active`/`reconnecting`, SANS garde `isShuttingDown` ni fenêtre de grâce (`AuthHandler.ts:341-376`,
  appelé depuis `MeeshySocketIOManager.ts:1004`). Pour un appel direct, `leaveCall` = `status: ended` en DB
  immédiat → la grâce 30 s du handler disconnect de `CallEventsHandler` (PR #1344) était NEUTRALISÉE pour
  tout user mono-device (le cas nominal) : un blip socket de 2 s ou un restart SIGTERM tuait l'appel en DB,
  le re-join client recevait CALL_ENDED. Fix : le cycle de vie des appels sur disconnect appartient à
  `CallEventsHandler` seul (grâce appels répondus, fin immédiate pré-answer, garde shutdown, re-check room
  à l'expiration qui couvre le multi-device) ; `AuthHandler` ne garde l'auto-leave immédiat que pour les
  participants **anonymes** (introuvables par la requête `participant.userId` du handler A, et sans grâce
  par ADR-6). Tests : `AuthHandler.test.ts` réécrit (registered → jamais de leaveCall, anonyme → préservé,
  48/48), aucun test n'exerçait ce chemin auparavant.
- **[Item H, TDD] Plancher de liveness au boot (`CallCleanupService`)** — après un downtime >
  HEARTBEAT_TIMEOUT_MS (120 s), TOUS les `lastHeartbeatAt` DB lisaient stale au premier tick GC (immédiat
  au `start()`) → appel sain force-ended alors que les clients re-joignaient. Fix : `bootedAt` injecté au
  constructeur (défaut `new Date()`), le fallback DB du tier 4 évalue `max(lastHeartbeatAt ?? joinedAt,
  bootedAt) < now - 120s` — un reap heartbeat ne peut survenir qu'après une fenêtre heartbeat COMPLÈTE
  depuis le boot. Chaos-test 3 (coupure 90 s+) couvert côté serveur. Les tiers 1-3 restent sans grâce
  (voulu : ils s'ancrent sur des timestamps DB persistés et le reap pré-answer au boot est le comportement
  correct du chaos-test 2).
- **[Item H, TDD] Réhydratation des ringing timers au boot** — `CallEventsHandler.rehydrateActiveCalls(io)`
  (câblé `server.ts` après l'attache socket) : requête les appels `initiated`/`ringing` survivants et
  ré-arme chacun via `CallService.rescheduleRingingTimeout(callId, startedAt, handler)` = budget RESTANT
  (`startedAt + 60s - now`, plancher 5 s). Le handler missed est extrait en
  `buildRingingTimeoutHandler(io, callId)` — chemin identique à l'initiate (updateMany status-guardé →
  broadcasts ENDED+MISSED → summary → push manqué). Avant : un appel en sonnerie au moment du crash sonnait
  côté serveur jusqu'au GC 120 s SANS push manqué. Tests : `CallEventsHandler-rehydrate.test.ts` (4),
  `CallService-ringing-reschedule.test.ts` (5, unit — le fichier integration/ est HORS scope jest CI).
- **[Item I, TDD] `clearRingingTimeout` appairé à `clearHeartbeats` sur les 5 chemins terminaux** —
  `endCall` (le REST DELETE /calls/:id ne clearait jamais), `markCallAsMissed`, `leaveCall` (branche
  idempotente + last-participant), `CallCleanupService.forceEndCall`. Timers orphelins = callback tardif
  no-op (status-guardé) mais mémoire retenue. 3 tests comportementaux (timer armé → transition terminale →
  avance 61 s → callback jamais tiré).
- **[Items E/F/G vérifiés dans le code]** E : couvert par le fix AuthHandler + re-check room à l'expiration
  de grâce (le double-join multi-socket C8 reste au backlog). F : `ringing` jamais écrit par le serveur —
  ASSUMÉ : toutes les lectures utilisent `[initiated, ringing]`, FSM cohérente, l'écrire exigerait un
  nouvel event client (`call:ringing-ack`) pour zéro gain de robustesse — non implémenté, documenté ici.
  G : DÉJÀ FAIT (handlers `call:backgrounded`/`foregrounded` avec authz stricte, tolérance
  `BACKGROUND_HEARTBEAT_TIMEOUT_MS` 5 min dans `getStaleHeartbeats` — la dette décrivait un état antérieur).
  Limite connue : les `backgroundedParticipants` in-memory ne sont pas réhydratés au boot — un appel dont
  TOUS les participants sont silencieux (backgroundés, zéro heartbeat) post-restart est reapé à
  boot+120 s au lieu de 5 min ; si UN participant beat, le chemin in-memory protège les autres.

### Session 2026-07-02 (mission SOTA, 5e vague : CHAOS-TESTS E2E EN PROD — sim atabeth ↔ sim meeshy)

Deux simulateurs (iPhone 16 Pro 18.2 = atabeth, Meeshy-iOS26 = meeshy) sur la PROD (directive user :
aucun test local Docker, tout en production). Gateway prod redéployé avec la vague 4 avant les tests.
Pilotage idb (taps en POINTS, pas pixels ; keychain simulateur survit à la désinstallation — reset via
`simctl keychain <UDID> reset` sinon la session précédente se restaure et on appelle le mauvais compte).

**CHAOS-TEST 1 (restart SIGTERM mid-call) — SUCCÈS PARTIEL puis fix :**
- ✅ Au SIGTERM : « Socket disconnect during shutdown — preserving active calls » ×4 sockets
  (prepareForShutdown), le média P2P continue, chrono jamais interrompu (01:32 pendant le down).
- ✅ La bannière « Connexion au serveur perdue — l'appel continue » (isSignalingDegraded, vague 4)
  s'affiche pendant le down et disparaît à la reconnexion — PREMIÈRE VALIDATION LIVE.
- ✅ Re-join automatique des DEUX participants ~25s après le restart + resync toggle-audio + TURN
  frais des deux côtés (didReconnect). La grâce 30s absorbe aussi le churn socket mid-call
  (« Reconnect within grace window — active call preserved »).
- ❌ PUIS mort de l'appel à ~60-90s post-restart, reproduit 2×. Chaîne causale (logs device via
  `simctl spawn <UDID> log show --predicate 'subsystem == "me.meeshy.app" AND category == "calls"'` ;
  les logarchives `log collect` spawnées sortent VIDES — toujours utiliser log show in-sim) :
  le socket du caller churne (re-join toutes les 10-40s) → fenêtres sans socket dans la room →
  un signal relayé du callee tire `call:error TARGET_NOT_FOUND` → **le callee teardown un appel au
  média SAIN** (`ended(.failed("Target participant has no active connection"))`) → les offers
  d'ICE-restart du caller frappent « Signal offer for unknown call » → watchdog ×3 → connectionLost.
- **[FIX TDD] TARGET_NOT_FOUND whitelisté non-fatal** dans le handler call:error de CallManager
  (comme INVALID_SIGNAL et RATE_LIMit_EXCEEDED) : erreur de relay TRANSITOIRE (pair sans socket
  pendant churn/re-join), ICE redondant par design, answer avec retry borné — un appel établi ne
  meurt jamais d'une erreur signaling transitoire (EXIGENCE №1). Test source-guard
  `CallErrorNonFatalWhitelistTests` (check AVANT le teardown failCall).
- Piste gateway complémentaire (backlog #8) : grâce courte pré-answer sur disconnect du CALLER —
  le churn a aussi tué un appel EN SONNERIE (fin pré-answer immédiate alors qu'un vrai cancel passe
  par call:end explicite) ; callId 6a466a604f950a0526227353.

**6e vague — 3 fixes systémiques (TDD, gateway commit a7da93f1e déployé prod ; iOS en attente du
GREEN du chantier parallèle) et CHAOS-TEST 1 DÉMONTRÉ (callId 6a4680ef67ae80d43c57d4cc, sims dédiés) :**
- Fixes : (1) call:end fiable + réconciliation au reconnect (emitCallEndReliably — un teardown local
  qui n'atteint pas le serveur laissait le pair zombie ~48s, prouvé logs 13:56-13:59Z zéro call:end
  reçu) ; (2) extension de grâce serveur si le user garde un socket vivant (15s ×4, cap 90s<120s GC) ;
  (3) grâce courte pré-answer 10s sur disconnect (un vrai cancel = call:end explicite).
- Protocole final EN PROD, preuves serveur : SIGTERM → « preserving active calls » ×4 → re-joins auto
  des 2 participants ~28s + resync toggle-audio → appel VIVANT à t+180s (chrono 04:05 ; il mourait à
  60-90s avant les fixes) → toggle micro relayé post-restart (15:23:22Z enabled:false) → raccroché
  caller → « Ending call » + UN SEUL summary completed. Chaos-test 4 (restart+réseau instable) couvert
  de facto par le churn simulateur permanent + gardes isReconnecting (aucun budget épuisé à tort).
- Env : sims dédiés ChaosA=atabeth (86992F04) / ChaosB=meeshy (0AA8DF6C), runtime 18.2, pour isoler
  les E2E des runs xctest des agents parallèles qui réquisitionnent le simulateur standard (un run
  xctest relance l'app et TUE l'appel en cours). Popups premier lancement (notifications,
  Save Password) à dismiss AVANT la saisie login (elles volent les frappes idb).
- **PROTOCOLE CHAOS BOUCLÉ (17:36)** : test 2 (restart mid-ring, callId 6a4690a2) → résolution UX
  propre (pas de sonnerie infinie/fantôme, caller missed via ring-timeout client 45s) MAIS DB
  failed/91s au lieu de missed → 2 affinements consignés : (a) emitCallEndReliably doit réconcilier
  AUSSI sur ACK-échec (le call:end du caller s'est perdu post-restart avec socket cru connecté) ;
  (b) l'early-join du callee pose connecting+answeredAt dès la sonnerie → « ringing » invisible
  serveur (item F revisité), la réhydratation (initiated/ringing) n'a rien à ré-armer et le tier GC
  connecting>90s résout failed — piste : answeredAt au call:answer réel, pas au join early.
  Test 3 (STOP 100s mid-call, callId 6a4691d9) → **l'appel SURVIT** (04:57 à t+135, zéro
  « Heartbeat timeout » : le plancher boot protège), raccrochage propre ended/completed/403s,
  1 seul summary. Test 4 couvert de facto (churn permanent + gardes isReconnecting).
  Le lot iOS (TARGET_NOT_FOUND, emitCallEndReliably, indicateur, bugs 1-5) est DANS main via la
  PR #1359 du chantier parallèle (co-commit vert, CI+Docker success).
  NON TESTÉ — protocole fourni : bascule cellulaire réelle, CarPlay, iOS↔iOS 2 iPhones physiques,
  validation device réel CallKit didActivate (stuck-muted Fix 4).

**7e vague — affinements #11 VALIDÉS LIVE (commits 887634c99/1cbe00a43, main 4707e35f3, prod redéployée) :**
- emitCallEndReliably arme la réconciliation aussi sur ACK-échec (end jamais perdu, rejoué au connect).
- joinCall → RINGING (item F matérialisé, FSM initiated→ringing→active, answeredAt au vrai answer).
- RE-TEST chaos-2 live (callId 6a46a4e7…) : « Boot rehydration — ringing timers re-armed {count:1} »
  puis DB **missed/missed** (vs failed/91s avant). Note d'affinement mineur : le re-join early du
  callee post-restart passe par call:join dont le finally clearRingingTimeout efface le timer
  réhydraté — le filet tier-1 GC résout missed quand même (~150s au lieu de ~60s) ; avec la FSM
  ringing, le join ne devrait plus clear ce timer (l'answer SDP le fait déjà) — micro-fix candidat.

**8e vague — micro-fix propriété du ringing timer + VALIDATION CHRONOMÉTRIQUE (commit dc8f37a44) :**
call:join ne désarme plus le ringing timer (l'answer SDP + chemins terminaux le possèdent) — le join
early/re-join effaçait le timer réhydraté et laissait la sonnerie sans borne serveur. Re-test chaos-2
live (callId 6a46b5e9…) : initiate 19:03:05.212Z → restart mid-ring → « re-armed count:1 » 19:03:25 →
« Ringing timeout fired — marked as missed » 19:04:05.285Z = endedAt-startedAt **60,001s**, le budget
NOMINAL exact malgré le restart. La réhydratation reprend le décompte là où le crash l'a laissé.
CI note : « Test Python (translator) » flake sur ce push (aucun lien, translator intouché, vert au
run précédent) → re-run déclenché.

### Session 2026-07-02 (routine calling-feature, gateway-only — toujours pas de toolchain Swift ici)

- **[FIX C3/C4]** `CallService.endCall()` alignée sur `leaveCall()` (audit P1-29/P1 rec. #6-7) : un
  `call:end` reçu avant que l'appel ait été décroché (`status` encore `initiated`/`ringing`/`connecting`)
  résout désormais en `status=missed` (au lieu de `ended`) et `endReason=missed` (au lieu de `completed`,
  sauf raison explicite plus spécifique — `rejected`/`failed`/… — préservée). Root cause confirmée par
  l'audit prod : `endCall()` ne faisait AUCUNE distinction pré/post-answer contrairement à `leaveCall()`,
  d'où des appels fantômes « completed » durée 0 dans l'historique et aucune notification manquée pour
  l'autre partie (callIds `…9356`, `…9378`, `…937c` de l'audit). Handler `call:end`
  (`CallEventsHandler.ts`) mis en miroir de `call:leave` : déclenche désormais `handleMissedCall` (push +
  bannière in-app) quand `endCall()` résout en `missed`, exactement comme le fait déjà `call:leave`. Pas
  de changement de signature (contrairement à ce qui avait été envisagé pour le court-circuit C6
  ci-dessus — jugé hors scope à nouveau, la correction C3/C4 est la plus haute valeur du backlog restant
  et reste un diff minimal sur les mêmes lignes). 3 tests TDD `CallService.test.ts` (pre-answer→missed,
  raison explicite préservée, appel répondu reste `completed`) + 2 tests `CallEventsHandler-end.test.ts`
  (broadcast+summary sur missed, pas de `handleMissedCall` sur un end normal). Suite complète : 488/488
  suites gateway, 13418/13419 tests (1 skip pré-existant), `tsc --noEmit` propre.
- **Reste ouvert (C6 court-circuit)** : toujours non fait, mêmes raisons (changerait la signature
  `endCall()` sur 2 call sites + ~9 tests pour un gain cosmétique — la dédup DB réelle est déjà couverte
  par le catch P2002 sur l'index unique partiel corrigé la session précédente).

### Session 2026-07-02 (routine calling-feature) — iOS triad iOS-only backlog traité + bug gateway `endCall` idempotence

Point d'entrée : reprise du backlog "Reste à faire" iOS déféré aux sessions précédentes (toujours pas de
toolchain Swift/Xcode dans cet environnement — Linux — donc portée limitée à des fixes vérifiés par
lecture attentive + tests source-guard, CI `ios-tests` macOS reste le juge final). Un agent d'exploration
dédié a re-vérifié les 3 pistes iOS + les 2 claims de dead code sur le code RÉEL (pas les numéros de ligne
périmés du backlog) avant tout fix.

- **[FIX iOS, HIGH×2 + MED, CONVERGENCE]** Cette session a indépendamment trouvé et corrigé les 3 mêmes
  bugs iOS (CallKit jamais informé sur téardown `.failed(...)`, TURN perdu sur « End & Answer waiting
  call », banner call-waiting jamais nettoyé sur raccroché précoce du 2e appelant) qu'une session parallèle
  (commit `8141e2d`, environnement macOS+Xcode réel, `MeeshyTests` COMPLET vert) a mergée sur `main` en
  premier — mêmes root causes, mêmes fichiers, diagnostics quasi identiques. `git merge origin/main` a
  produit des conflits sur `CallManager.swift`/`P2PWebRTCClient.swift`/`WebRTCService.swift`/2 fichiers de
  test ; résolus en prenant la version `main` (vérifiée compilée+testée sur device réel, plus complète —
  inclut aussi un indicateur "signaling dégradé" et un fix `CallAudioEffectsService` hors scope de cette
  session) plutôt qu'en tentant de réconcilier deux implémentations divergentes du même fix. Les tests
  source-guard écrits ici pour ces 3 bugs (`CallWaitingPendingCallTests`,
  `EndCallInternalFailedReasonReportsToCallKitTests`) ont été supprimés après vérification qu'ils
  échoueraient contre l'implémentation réellement mergée (`failCall(_:)` + `clearPendingIncomingCall(ifMatching:)`,
  une architecture différente de la mienne) — `main` porte déjà une couverture équivalente
  (`CallWaitingAndFailureTeardownTests`).
- **[CLEANUP iOS, CONVERGENCE]** Même chose pour le dead code `WebRTCService.handleRemoteAudioMuted`/
  `comfortNoiseEnabled` et `setMaxAudioBitrate` (protocole + impl réelle) — déjà supprimés par `8141e2d`.
- **[BUG RÉEL RESTANT, iOS] Stub `#else` (WebRTC non résolu) toujours cassé après le merge** —
  `8141e2d` a bien retiré `setMaxAudioBitrate` du stub `#else` de `P2PWebRTCClient` mais n'a PAS ajouté les
  2 requirements manquants découverts cette session (`applyAudioEncoding`, `videoFilterPipeline`) — un gap
  de conformité protocole resté réel après le merge, toujours invisible en CI normale (ce chemin ne compile
  QUE quand le package SPM WebRTC n'est pas résolu). Réappliqué après le merge (2 lignes, miroir exact des
  no-op déjà présents pour `applyVideoEncoding`). Seule contribution iOS de code de cette session qui
  survit au merge ; test source-guard dédié conservé (`P2PWebRTCClientFallbackConformanceSourceGuardTests`,
  `WebRTCServiceTests.swift`, pas de duplicat côté `main`). Non recompilé localement (pas de toolchain
  Swift ici) — CI `ios-tests` reste le garde-fou.
- **Leçon pour la prochaine session** : plusieurs instances de cette routine tournent en parallèle sur le
  même backlog calling-feature et convergent régulièrement vers les mêmes bugs — toujours `git fetch origin
  main` et comparer AVANT de pousser une grosse session de fixes iOS, pas seulement à la fin.

- **[BUG TROUVÉ + CORRIGÉ, gateway, TDD] `CallService.endCall()` : idempotence incomplète (missed/rejected
  → écrasé en `ended`)** — trouvé en auditant le voisinage du fix C3/C4 (guard `updateCallStatus`/
  `leaveCall` déjà sur `TERMINAL_STATUSES.includes(...)`, mais `endCall()` ne guardait que
  `status === CallStatus.ended`). Race réelle : le ringing-timeout (`markCallAsMissed`) résout la
  `CallSession` en `missed` SANS toucher les lignes `CallParticipant` (`leftAt` reste `null`) — un
  `call:end` retardé/rejoué de l'initiateur (retry socket, event dupliqué) repasse alors tous les checks
  (participant encore actif) et écrase silencieusement `status=missed`→`ended`, `endReason`→`completed` :
  exactement le bug "appel fantôme completed" que le fix C3/C4 visait à fermer, réouvert par un chemin
  différent (double-invocation au lieu d'un ordering pré-answer). Fix : `TERMINAL_STATUSES.includes(call.status)`
  au lieu de `call.status === CallStatus.ended`, alignant `endCall()` sur le pattern déjà utilisé par
  `updateCallStatus`/`leaveCall`/`joinCall` (leçon #42/#45 : drift de patterns siblings). 2 tests TDD
  ajoutés (missed→pas réécrit, rejected→pas réécrit, assertion `$transaction` jamais appelé). Suite
  complète : 23/23 suites call (709/709 tests), `CallService.test.ts` 150/150.
