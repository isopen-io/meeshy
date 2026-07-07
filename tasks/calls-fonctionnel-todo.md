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

### Session 2026-07-02 (routine calling-feature, gateway-only) — micro-fix "item F" implémenté
Point d'entrée : reprise du micro-fix candidat documenté dans la 7e vague ci-dessus mais jamais
appliqué ("avec la FSM ringing, le join ne devrait plus clear ce timer"). Lecture attentive du code
réel a confirmé le bug : `CallEventsHandler.ts` `call:join` avait un bloc `finally` qui appelait
`clearRingingTimeout(data.callId)` **inconditionnellement**, sur succès ET échec. Or depuis le
passage à la FSM `initiated → ringing → active` (item F, session précédente), `joinCall()` transitionne
un appel `initiated`/`ringing` vers `ringing` — PAS `active` — car le callee early-join la room dès que
ça sonne (nécessaire pour recevoir l'offer SDP), bien avant que l'utilisateur tape "répondre". Le vrai
answer passe par `call:signal` type `answer`, qui clear déjà le timer à la bonne ligne. Conséquence du
bug : chaque early-join (y compris le re-join après une réhydratation de timer au boot, cf. item H)
tuait silencieusement la protection anti-sonnerie-infinie de 60s — un appel jamais réellement décroché
aurait sonné jusqu'au tier GC heartbeat bien plus grossier (120s) au lieu du timeout dédié. Un échec de
`joinCall` (ex. 3e participant sur un appel P2P déjà plein) clearait aussi à tort le timer légitime des
2 vrais participants. Fix : suppression du `clearRingingTimeout` du bloc `finally` — le nettoyage reste
couvert par (1) `call:signal` type `answer` (déjà en place), (2) les 5 chemins terminaux déjà appairés
par l'item I, (3) le callback de timeout lui-même est status-guardé (`updateMany` atomique scopé à
`[initiated, ringing]`, no-op si déjà `active`/terminal) — donc laisser le timer armé à travers un join
est sûr même dans le cas nominal. Test existant `call:join additional branches > emits error and clears
ringing on joinCall failure` renommé + assertion inversée (`not.toHaveBeenCalled()`), + nouveau test
`item F regression: does NOT clear the ringing timeout on a successful early-join while the call is
still ringing`. Suite `CallEventsHandler.test.ts` : 201/201 (dont 25 suites/739 tests sur tout le
périmètre `*[Cc]all*`). `tsc --noEmit` non vérifiable dans cet environnement (client Prisma non généré,
même limitation réseau que les sessions précédentes — aucune erreur nouvelle imputable à ce diff, le
seul fichier modifié hors tests n'introduit aucune construction TS nouvelle). Suite gateway complète
re-vérifiée après le fix : 492/492 suites, 13491/13492 tests (1 skip pré-existant).

### Session 2026-07-02 (routine calling-feature) — bug web CONFIRMÉ : offre dupliquée en course sur reconnect
Point d'entrée : agent d'exploration dédié (lecture seule, cross-checké contre ce fichier pour éviter un
faux positif déjà classé) a trouvé un bug réel côté web jamais documenté ici. Vérifié à la main avant fix
(lecture `use-webrtc-p2p.ts` + `webrtc-service.ts` en entier sur les chemins concernés).

- **[BUG RÉEL, web, CONFIRMÉ]** `apps/web/hooks/use-webrtc-p2p.ts` — le gateway relaie une offer EN DIRECT
  aux sockets connectés ET la bufferise systématiquement pour un replay au prochain `call:join` du
  destinataire (`bufferOffer`/`bufferedOfferFor`, résilience reconnect/churn — voir §4.6 plus haut). Le
  MÊME onglet navigateur peut donc légitimement recevoir la même offer initiale deux fois (live + replay
  après un blip socket bref). `handleIncomingSignal` décide routing initial-offer vs renégociation via
  `existingService && isEstablished` — mais ces deux refs (`webrtcServicesRef`, `remoteDescriptionSetRef`)
  ne sont peuplées qu'après que `handleOffer` ait `await`é `ensureLocalStream()` (potentiellement lent :
  prompt permission caméra/micro, media pas encore caché). Si la 2e livraison arrive dans cette fenêtre,
  aucune des deux refs n'est encore posée → `handleOffer` est réinvoqué une 2e fois pour le même pair →
  les deux continuations appellent `service.createPeerConnection(fromUserId)` sur la MÊME instance
  `WebRTCService` (clé participantId, pas par offer) → la 2e écrase silencieusement `this.peerConnection`
  (aucun guard/close-old-first dans `createPeerConnection`, `webrtc-service.ts:316`) → le `createAnswer()`
  en vol de la 1re continuation lève `InvalidStateError` sur un `pc` qui n'a jamais reçu de remote
  description → appel qui ne se connecte jamais, `RTCPeerConnection` orpheline jamais fermée. Fix (TDD) :
  nouveau ref `offerInFlightRef` posé SYNCHRONEMENT (avant le premier `await`, donc avant que
  `handleIncomingSignal` ne traite un événement suivant — JS single-threaded) au tout début de
  `handleOffer`, nettoyé en `finally`. `handleIncomingSignal` droppe silencieusement une 2e offer initiale
  dont le pair a déjà un traitement en vol. Test RED vérifié manuellement (revert temporaire du guard →
  `createPeerConnection` appelé 2×, test échoue) puis GREEN. `use-webrtc-p2p.test.tsx` : 24/24 (1 nouveau).
  `webrtc-service.test.ts`+`webrtc-service.coverage.test.ts` : 168/168 inchangé. Suite web complète filtrée
  `*call*` : 15 suites/212 tests verts. `tsc --noEmit` du fichier touché : aucune erreur (le reste du repo
  a des erreurs TS préexistantes sans rapport, non touchées par ce diff).
- **[BUG SECONDAIRE, web, corrigé au passage]** Même fichier : `void existingService.handleRenegotiationOffer(...)`
  et `void existingService.setRemoteAnswer(...)` (chemin renégociation établie) n'avaient aucun `.catch` —
  contrairement aux chemins offer/answer initiaux qui `setError`/`toast.error` sur échec. Un rejet devenait
  une unhandled rejection silencieuse sans retour utilisateur (y compris un rejet déclenché par le bug
  ci-dessus). Fix : `.catch()` miroir du pattern déjà utilisé ailleurs dans le fichier. A nécessité
  d'ajouter `mockHandleRenegotiationOffer.mockResolvedValue(undefined)` /
  `mockSetRemoteAnswer.mockResolvedValue(undefined)` aux mocks du test existant (les mocks `jest.fn()` nus
  ne retournaient pas de Promise, `.catch` sur `undefined` faisait planter 2 tests préexistants).

## Vague 9 — claim orpheline post-missed + statuts terminaux immuables + index dédup fantôme (2026-07-03, validée E2E prod)

Découvert PENDANT la validation device (item J) : mes appels vidéo sim→iPhone étaient rejetés
`CALL_ALREADY_ACTIVE` alors qu'aucun appel n'était actif.

- **[CRITIQUE, gateway, b02de2eee, déployé + validé prod]** Claim `Conversation.activeCallId` jamais
  relâchée quand le ringing timeout résout l'appel `missed` : le handler gagne l'updateMany atomique
  puis délègue à `handleMissedCall → markCallAsMissed` dont le guard non-ringing early-return AVANT
  `releaseActiveCallClaim`. Toute la conversation rejetait les `call:initiate` (observé : ~5 min de
  blocage, et la directe « Compte De Test Store » bloquée 12 HEURES par le missed du matin). Fix 3
  couches : release dans le handler dès la transition gagnée (avant les étapes qui peuvent throw) ;
  cleanup idempotent dans l'early-return du guard (statuts terminaux seulement) ; **self-heal** dans
  `initiateCall` (claim tenue par un holder terminal → compare-and-swap atomique, un claim sain n'est
  jamais clobberé). 2 claims orphelines hot-fixées en prod avant déploiement. Validation : sonde
  socket.io headless (ring 60 s sans raccrocher) → missed à 60,04 s → claim `null` ✓.
- **[CRITIQUE, gateway, c00076e6f, déployé + validé prod]** Statuts terminaux réécrits : la sonde a
  révélé qu'après le missed, la déconnexion du caller armait une grâce (guards armement l.2893 +
  expiration l.392 ne couvraient QUE `'ended'`) → `leaveCall` lisait le doc missed et recomputait
  l'issue → `ended/completed/89s` + 2e summary posté. Fix 4 couches : version-increment sur l'écriture
  terminale du timeout (protocole version-guard réparé) ; `leaveCall` court-circuite sur appel terminal
  (leftAt du participant seulement) ; guards `CALL_TERMINAL_STATUSES` (nouvelle constante runtime dans
  @meeshy/shared/types/video-call) à l'armement ET à l'expiration. Validation : sonde rejouée → statut
  `missed` préservé, version=2, claim null, UN summary ✓.
- **[CRITIQUE, prod DB, appliqué manuellement]** L'index unique partiel `(conversationId,
  clientMessageId)` n'a JAMAIS existé : la migration C6 (et l'originale 2026-05-09) ciblait
  `db.messages` — collection VIDE (model Prisma `Message` sans `@@map` → collection `db.Message`).
  Dédup P2002 (summaries + offline-queue) inopérante → 33 paires de doublons en prod : 13 summaries
  tardifs supprimés (0 référence), 25 messages utilisateur préservés (`$unset clientMessageId`), index
  créé sur `db.Message` et vérifié par insertion-sonde E11000 ✓. Script de migration corrigé au repo.
- **[Item J, partiel]** Chemin device réel validé : VoIP push APNs production → CallKit lock-screen →
  décrochage jcnm → média actif 73 s (RTT 11 ms, opus). RESTE : appel vidéo décroché, caméra, PiP
  swipe-home, stuck-muted — en attente de disponibilité utilisateur. Sim instable ce soir (2 relaunches
  spontanés + churn sockets) — envisager un run dédié pour la prochaine session device.

## Vague 10 — le fix web reconnect-rejoin de la vague 3 vivait dans un hook mort, jamais monté (2026-07-03)

Point d'entrée : routine de suivi continu, audit dédié gateway/web (agent d'exploration, lecture seule)
mandaté à croiser tout candidat contre ce fichier + lessons.md avant de le rapporter.

- **[BUG CRITIQUE, web, CONFIRMÉ + CORRIGÉ]** La vague 3 (« Re-join au reconnect ») documentait
  `apps/web/hooks/useCallSignaling.ts` + `useCallSignaling.reconnect.test.ts` comme le fix web
  symétrique du `didReconnect` iOS. Les deux existent réellement et le test passe — **mais le hook
  n'est importé nulle part dans l'app rendue**. Le composant réellement monté à `app/call/[callId]/
  page.tsx` est `apps/web/components/video-call/CallManager.tsx` (répertoire SINGULIER, à distinguer
  du répertoire PLURIEL `components/video-calls/` qui contient le hook mort) : son `useEffect`
  d'attache des listeners socket réagit bien à `'connect'` (reconnexion incluse) mais ne fait que
  ré-attacher les 6 listeners `CALL_INITIATED`/`PARTICIPANT_JOINED`/`PARTICIPANT_LEFT`/`CALL_ENDED`/
  `MEDIA_TOGGLED`/`CALL_ERROR` — **aucune ré-émission de `call:join`**. Conséquence : tout
  l'investissement résilience-restart des vagues 3/4/6/7/8 (grâce 30s + extensions, réhydratation
  ringing, etc.) protège iOS mais est **inopérant pour le web** — un redémarrage gateway ou un simple
  blip réseau navigateur fait tourner les 4 extensions de grâce à vide (le socket ne rejoint jamais la
  room `call:<callId>` faute de `call:join`), puis le serveur termine un appel dont le média P2P était
  pourtant sain. Fix (TDD, miroir exact de `rejoinAfterReconnect` du hook mort, appliqué au composant
  RÉELLEMENT monté) : `CallManager.tsx` — `hasConnectedRef` distingue le 1er `connect` d'un reconnect
  réel, `rejoinActiveCallAfterReconnect()` ré-émet `call:join` (lecture live `useCallStore.getState()`,
  pas de dépendance d'effet) si un appel est actif, avec le même traitement `CALL_ENDED` (teardown via
  `handleCallEndedRef`) que le hook mort. Nouveau fichier `__tests__/components/video-call/
  CallManager.reconnect.test.tsx` (4 tests : reconnect réel → rejoin ; 1er connect → pas de rejoin ;
  pas d'appel actif → pas de rejoin ; ack `CALL_ENDED` → teardown), RED confirmé en stashant le fix
  (2/4 rouges) puis GREEN restauré. Suite complète `*call*` : 16 suites/216 tests verts. Suite web
  complète : 432/432 suites, 10832/10853 tests (21 skips pré-existants) — aucune régression. `tsc
  --noEmit` : diff avant/après identique sur `CallManager.tsx` (mêmes erreurs `unknown`/`{}` pré-
  existantes du typage `socket: unknown`, aucune nouvelle). Le hook mort (`useCallSignaling.ts` +
  son test) n'a pas été supprimé cette session (portée volontairement minimale) — à trancher : soit le
  monter pour de vrai en remplaçant l'orchestration ad-hoc de `CallManager.tsx`, soit le supprimer pour
  ne plus induire les futurs audits en erreur (cette session en particulier a failli le faire).
- **Leçon pour la prochaine session** : nommage quasi-identique `video-call/` (singulier, réellement
  monté) vs `video-calls/` (pluriel, contient un hook testé mais mort) — **toujours vérifier qu'un
  hook/composant "fix" est bien import-atteignable depuis une route rendue** avant de le créditer comme
  correctif dans ce fichier (variante du thème sibling-drift #5/#40/#42/#45/#50/#51/#55 : ici la
  divergence est entre un hook réellement utilisé et un jumeau non branché, pas entre deux siblings
  actifs).

## Vague 11 — dead hook supprimé + 3 derniers handlers call:* sans rate limit corrigés (2026-07-03)

Point d'entrée : routine calling-feature, deux agents d'exploration dédiés (iOS lecture seule — pas de
toolchain Swift/Xcode ici — et gateway/web) mandatés à croiser tout candidat contre ce fichier avant de
rapporter quoi que ce soit. iOS : rien de nouveau (couverture de tests déjà exhaustive, aucun code mort,
aucun test désactivé — seul point structurel confirmé : `CallManager.swift` reste un god object de 4450
lignes, refactor hors de portée sans compilateur local). Gateway : subsystem déjà très audité (CVE-002/
004/005/006, dizaines de fixes P0/P1/P2 documentés) — aucune faille d'authz ni de credential en dur
trouvée, un seul gap réel restant.

- **[CLEANUP web, CONFIRMÉ + APPLIQUÉ]** La vague 10 avait explicitement laissé en suspens la décision
  sur `components/video-calls/hooks/useCallSignaling.ts` ("monter pour de vrai, ou supprimer pour ne
  plus induire les futurs audits en erreur"). Reconfirmé mort cette session (`grep useCallSignaling(`
  ne matche que son propre test, `index.ts` et `README.md`) : `CallManager.tsx` (composant réellement
  monté à `app/call/[callId]/page.tsx`) porte sa propre implémentation testée et équivalente
  (`rejoinActiveCallAfterReconnect`, vague 10). Supprimé : le hook, son test dédié
  (`useCallSignaling.reconnect.test.ts`), son export dans `index.ts`, sa section dans `README.md`
  (remplacée par un renvoi vers `CallManager.tsx`), et les 2 commentaires résiduels dans
  `CallManager.tsx`/`CallManager.reconnect.test.tsx` qui le référençaient encore. Suite web complète
  filtrée `*call*` : 15 suites/212 tests verts (inchangé en nombre — le hook n'avait pas de couverage
  productif au-delà de son propre test, maintenant supprimé avec lui).
- **[FIX SÉCURITÉ, gateway, TDD]** `call:reconnecting`, `call:reconnected` et
  `call:request-ice-servers` étaient les 3 derniers handlers `call:*` sans AUCUN rate limit — contraste
  avec tous leurs siblings (`HEARTBEAT`, `QUALITY_REPORT`, `TRANSCRIPTION_SEGMENT`, `ANALYTICS`,
  `SCREEN_CAPTURE`, tous rate-limités). L'authz était déjà correcte sur les 3 (Audit P1-21 / backlog
  "authz call:request-ice-servers") mais un participant authentifié flood-émettant l'un de ces 3
  événements pouvait encore amplifier la charge sur Mongo (`updateCallStatus` en écriture pour les 2
  premiers) ou sur le secret TURN (mint HMAC à chaque `request-ice-servers`). Fix : 3 nouvelles entrées
  `SOCKET_RATE_LIMITS` (`CALL_RECONNECTING`/`CALL_RECONNECTED` 20/min miroir de `CALL_JOIN`/`CALL_LEAVE`,
  `CALL_ICE_SERVERS_REFRESH` 10/min — le client ne rafraîchit qu'à ~80% du TTL, largement en dessous) +
  `checkSocketRateLimit` inséré dans les 3 handlers immédiatement après la résolution `userId`,
  identique au pattern déjà utilisé par `QUALITY_REPORT`/`TRANSCRIPTION_SEGMENT`. Nouveau fichier de
  test `CallEventsHandler-reconnect-signal-rate-limit.test.ts` (6 tests : rate-limité + dropped-on-limit
  pour chacun des 3 handlers) — aucun test existant ne couvrait ces 3 handlers avant cette session (gap
  de couverture comblé au passage). Suite gateway complète filtrée `*Call*` : 27/27 suites, 780/780
  tests verts. `tsc --noEmit` : aucune nouvelle erreur (seule erreur préexistante, `SequenceService.ts`
  → `@prisma/client` racine non généré dans cet environnement sandbox, confirmée présente AVANT ce diff
  via `git stash`, sans rapport avec les fichiers touchés).
- **Reste ouvert** : items J (validation device), C6 (court-circuit dédup cosmétique), CALL-DIAG
  retagging (12 sites, cosmétique) — mêmes raisons de dépriorisation que les vagues précédentes.

## Vague 12 — fuite de télémétrie privée (`CallParticipant.analytics`) sur `GET .../active-call` (2026-07-03)

Point d'entrée : routine calling-feature. Deux commits gateway non encore documentés dans ce backlog
(`d52b77f` négociationTimeMs, `f4d75121` persistance `CallParticipant.analytics`) ont été audités par
deux agents dédiés (iOS lecture seule — confirmé `negotiationTimeMs` déjà émis côté iOS depuis
`CallReliabilityPolicy.callSetupMetrics`, rien à faire ; gateway — exposition/authz de la nouvelle
persistance).

- **[BUG SÉCURITÉ RÉEL, gateway, CONFIRMÉ + CORRIGÉ]** `GET
  /conversations/:conversationId/active-call` (`routes/calls.ts`) déclarait son schema
  `response[200]` avec `additionalProperties: true` et AUCUN schema sur `data` — contournement d'un
  bug `fast-json-stringify` (`oneOf` + `null` crashe, fix du 2026-05-12) qui avait pour effet de bord
  de désactiver tout filtrage de champs sur cette route, contrairement à ses 5 routes soeurs
  (`data: callSessionSchema`, whitelist stricte). `callService.getActiveCallForConversation()` inclut
  les `CallParticipant` sans `select` dédié (`callSessionInclude`, `CallService.ts:113`) → chaque
  participant sérialisé brut, y compris le nouveau champ `analytics` (télémétrie privée : deviceModel,
  codec, averageRtt/packetLoss, negotiationTimeMs…) — lisible par N'IMPORTE QUEL membre de la
  conversation (authz = membership, pas participation à CET appel), y compris pour un participant
  ayant déjà raccroché. Fix : remplacé `additionalProperties: true` par `data: { ...callSessionSchema,
  nullable: true }` — `nullable` (pas `oneOf`) évite le bug fast-json-stringify tout en restaurant le
  whitelist. Vérifié à la main (script Node direct sur `fast-json-stringify`) : cas `data: null` OK,
  cas fuite (`analytics` injecté manuellement dans le payload) → strippé.
- **Nouveau test** `calls-active-call-analytics-leak.test.ts` — contrairement à
  `calls-routes.test.ts` (mocke `sendSuccess` ET `@meeshy/shared/types/api-schemas` en stubs
  `{type:'object'}`, bypassant toute sérialisation réelle — ne pouvait PAS attraper ce bug), ce nouveau
  fichier boote un VRAI Fastify + `.inject()` avec le schema réel. RED confirmé (`git stash` du fix →
  `analytics`/`SECRET-INTERNAL-CODENAME` présents dans la réponse sérialisée), GREEN restauré. Suite
  gateway complète filtrée `*[Cc]all*` : 28/28 suites, 801/801 tests verts.
- **Piège rencontré en écrivant ce test** : un mock de middleware `preValidation` déclaré comme
  `jest.fn()` nu (0 arguments, aucune implémentation) fait **hang indéfiniment** `.inject()` sous un
  vrai dispatch Fastify — invisible dans `calls-routes.test.ts` qui extrait et appelle le handler
  directement (jamais les hooks `preValidation`). Le mock doit être une vraie fonction
  `async (request) => {...}` qui pose `request.authContext`. Symptôme : timeout Jest sur l'`await
  app.inject(...)`, aucune des méthodes prisma/service mockées jamais invoquée (log de debug ajouté
  pour isoler) — piste à vérifier en premier pour tout futur test `.inject()`-based sur une route de
  ce fichier.
- **Autres vérifications de cette session (SAFE, aucun fix nécessaire)** : authz de la persistance
  `call:analytics` (`resolveParticipantIdFromCall` ne peut résoudre qu'au PROPRE participant de
  l'appelant — aucun vecteur de sur-écriture cross-participant) ; `GET /calls/history` et `GET
  /calls/active` (schemas de réponse stricts, `analytics` jamais sélectionné côté `listHistory`) ;
  modèles iOS (`CallModels.swift`/`CallSummaryMetadata.swift`) ne décodent aucun tableau
  `participants`, non concernés.

## Vague 13 — P2034 (write-conflict Mongo) non traité sur `endCall()`/`leaveCall()`, seulement sur `joinCall()` (2026-07-05)

Point d'entrée : routine calling-feature. Lecture complète du backlog (825 lignes) + lessons.md avant
tout diagnostic. `git log` a montré 4 commits gateway/iOS non encore documentés ici, postérieurs à la
Vague 12 (2026-07-04) : `6908bcc` (version-bump GC/missed), `fb2bafa` (fix P2034 sur `joinCall`),
`560926b` (durcissement types, cosmétique), `0f5eefe` (fast-path `call:ended` + UI iOS). Audit ciblé sur
ces 4 diffs plutôt qu'un balayage général — la routine ayant déjà 12 vagues très denses sur le code
inchangé, la zone la plus probable pour un bug réel et neuf est le code touché depuis la dernière
session documentée.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `fb2bafa` (2026-07-04) a corrigé un incident prod réel
  sur `CallService.joinCallAttempt` : deux `call:join` quasi simultanés (3-11 ms d'écart, même appel) font
  détecter par MongoDB un conflit d'écriture AU NIVEAU DOCUMENT, à l'intérieur du `$transaction`, AVANT
  que le garde applicatif (`updateMany` scopé sur `version` + `count === 0`) ne puisse résoudre la course
  lui-même — Prisma remonte ça en `PrismaClientKnownRequestError` code `P2034` ("write conflict or
  deadlock, please retry"), qui partait BRUT au client au lieu d'emprunter le chemin `versionConflict`
  déjà prévu pour cette même course. Le fix a bien été appliqué à `joinCallAttempt` — mais **`endCall()`
  (`CallService.ts:1395-1431`) et `leaveCall()` (`CallService.ts:1158-1222`) utilisent EXACTEMENT le même
  patron** (transaction avec `updateMany` scopé `version` + throw d'un Symbol local `versionConflict`/
  `leaveVersionConflict` + `.then(() => ok, (error) => error === conflictSymbol ? 'conflict' : throw)`)
  et n'avaient reçu AUCUN des deux traitements P2034 — sibling-drift classique de ce backlog (même famille
  que lessons.md #40/#42/#45/#58, et le commentaire de `joinCallAttempt` ne référence même pas ces deux
  autres sites). Impact concret : `call:end`/`call:leave` sont déclenchés par une action utilisateur
  (bouton raccrocher) qui peut légitimement raconter à peu près N'IMPORTE QUEL scénario de course avec un
  autre writer terminal touchant le MÊME document `CallSession` — l'autre participant qui raccroche
  presque au même instant (cas *extrêmement* courant, pas un edge-case exotique), ou une course avec
  `CallCleanupService.forceEndCall`/le ringing-timeout. Avant ce fix, un utilisateur qui "perdait" cette
  course recevait une erreur Prisma brute (`Transaction failed due to a write conflict or a deadlock...`)
  via `CALL_EVENTS.ERROR` au lieu de la résolution idempotente attendue ("l'appel est déjà terminé, voici
  son état actuel") — alors même que l'appel s'était terminé PROPREMENT côté serveur (l'autre transaction
  a gagné). Confirmé par lecture complète des deux méthodes + de leurs tests existants : **aucun test
  n'exerçait le chemin `versionConflict`/`leaveVersionConflict` pour `endCall`/`leaveCall`** avant cette
  session (seul `joinCall` avait une couverture de course, ajoutée par `fb2bafa`).
- **Fix** : nouvelle méthode privée partagée `CallService.isTransientWriteConflict(error)` (juste avant
  `joinCall()`, `CallService.ts`) qui isole le check `(error as { code?: string })?.code === 'P2034'` —
  remplace le bloc dupliqué inline de `joinCallAttempt` (même comportement, code partagé au lieu de
  copier-coller pour les 2 nouveaux sites) et est réutilisée par les `.then` de `endCall()` et
  `leaveCall()` : `error === versionConflict || this.isTransientWriteConflict(error)` /
  `error === leaveVersionConflict || this.isTransientWriteConflict(error)`. Aucune signature changée,
  diff minimal (le comportement "retour à l'état frais" existait déjà pour le Symbol local — seule
  l'ORIGINE de l'erreur reconnue comme conflit transitoire est élargie).
- **Tests TDD** : 2 nouveaux cas dans `CallService.test.ts` (un par méthode), miroir exact du test
  `fb2bafa` pour `joinCall` — `$transaction` rejette une erreur `{ code: 'P2034' }` au 1er essai, assertion
  que `endCall`/`leaveCall` résolvent quand même vers l'état DB frais (`status: ended`) au lieu de rejeter.
  RED confirmé manuellement (`git stash` du seul fix `CallService.ts`, tests re-exécutés → 2 échecs avec
  l'erreur Prisma brute remontée telle quelle) puis GREEN restauré. Suite `CallService.test.ts` complète :
  169/169. Suite gateway filtrée `*[Cc]all*` : 28/28 suites, 814/814 tests verts. Suite gateway complète
  (`bun run test:coverage`, prisma generate + `packages/shared` build réussis cette session — network OK
  cette fois) : 480/506 suites vertes, 13234/13235 tests verts, 1 skip pré-existant ; les 26 suites en
  échec le sont TOUTES sur la même erreur pré-existante et non liée (`SequenceService.ts` important
  `PrismaClient` depuis `@prisma/client` racine, jamais généré dans ce sandbox — déjà documentée Vague 11,
  confirmée absente de tout fichier touché par ce diff). `tsc --noEmit` gateway : une seule erreur, la
  même `SequenceService.ts` pré-existante ; zéro erreur nouvelle sur `CallService.ts`.
- **Web + iOS (lecture seule, aucun changement)** : aucun commit web sur les fichiers d'appel depuis la
  Vague 12 (`git log --since 2026-07-03` sur `webrtc-service.ts`/`use-webrtc-p2p.ts`/`components/
  video-call/` ne remonte qu'un merge sans rapport) — pas de nouvelle zone à auditer côté web cette
  session. Les 4 commits iOS/gateway du 2026-07-04 examinés (`0f5eefe` fast-path `call:end`, glyphes
  qualité transitoires, bye in-band P2P ; `560926b` durcissement types + suppression d'un force-unwrap)
  ont été lus en entier : le fast-path `call:end` (émission `call:ended` à la room dès que
  `socket.rooms.has(ROOMS.call(...))`, AVANT la résolution d'autorisation) a été vérifié en détail —
  l'appartenance à la room est bien acquise uniquement après un `joinCall()`/`initiateCall()` validé en
  DB (`socket.join` n'intervient qu'APRÈS l'écriture Prisma réussie), et tous les chemins qui posent
  `leftAt` sur un `CallParticipant` (call:leave, call:end, call:force-leave) font aussi sortir le socket
  de la room dans le même handler — la seule exception est `CallCleanupService.forceEndCall` (GC
  heartbeat/boot) qui ne fait JAMAIS `socket.leave` ; risque résiduel jugé faible (nécessite un socket
  vivant mais un appel GC-terminé + un `call:end` rejoué sur un callId périmé pour produire un
  `call:ended` fantôme redondant, déjà couvert par le dédup client documenté ligne 2098 de
  `CallManager.swift` et `handleCallEnded`/`reset()` côté web) — noté ici comme piste basse-priorité,
  non traitée cette session (pas de scénario d'exploitation concret trouvé, contrairement au P2034
  ci-dessus qui a un incident prod daté). `duration: 0` du fast-path est bien inerte côté client (iOS ne
  lit jamais `event.duration`, calcule sa propre durée locale ; web `handleCallEnded` logge la valeur
  sans l'utiliser) — la durée persistée vient uniquement de `postCallSummary` (lecture DB fraîche côté
  serveur), donc pas de bug d'affichage de durée malgré le double-broadcast.
- **Reste ouvert** (inchangé) : items J (validation device réel restante), C6 (court-circuit dédup
  cosmétique), CALL-DIAG retagging (12 sites, cosmétique) ; nouvelle piste basse-priorité notée ci-dessus
  (`forceEndCall` ne vide pas la room Socket.IO) pour une session future si un scénario d'exploitation
  concret émerge.

## Vague 14 — `call:check-active` : feature de replay morte côté web + dernier handler `call:*` sans rate limit (2026-07-05)

Point d'entrée : routine calling-feature, agent d'exploration dédié (gateway/web, lecture seule) mandaté à
croiser tout candidat contre ce fichier + lessons.md avant de rapporter quoi que ce soit — a indépendamment
convergé vers la même zone qu'un audit manuel des `checkSocketRateLimit` du fichier.

- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** `call:check-active` (ajouté 2026-06-06, commit `9324b3317`) existe
  côté gateway (`CallEventsHandler.ts:1103-1170`) pour rejouer un `call:initiated` manqué à un socket qui se
  (re)connecte pendant la fenêtre de sonnerie de 60s (page rechargée, onglet réveillé, blip réseau bref).
  iOS l'émet sans condition à CHAQUE connexion (`MessageSocketManager.swift`) — mais **web ne l'a jamais
  émis nulle part** : `CLIENT_EVENTS.CALL_CHECK_ACTIVE` est bien déclaré dans
  `packages/shared/types/socketio-events.ts` mais avait zéro site d'appel web. Le composant réellement monté
  (`apps/web/components/video-call/CallManager.tsx`, cf. vague 10) ne fait que `rejoinActiveCallAfterReconnect`
  sur reconnect — qui ne rejoue QUE l'appel que le store Zustand local pense déjà actif, jamais une
  découverte d'un NOUVEL appel entrant manqué. Conséquence : un callee web dont l'onglet recharge/se réveille/
  subit un blip réseau pendant qu'un pair l'appelle ne voit JAMAIS la bannière d'appel entrant — l'appel sonne
  côté serveur jusqu'au timeout 60s et résout en `missed`, silencieusement, sans aucune UI côté web. Même
  thème "sibling drift" que la vague 10 (un chemin iOS déjà résilient, son jumeau web jamais branché) mais sur
  un event différent. Fix : nouvelle fonction `checkForActiveCall(socket)` dans `CallManager.tsx`, appelée à
  CHAQUE connexion (mount déjà connecté, `onConnect`, et la branche de poll du socket pas encore disponible) —
  émet `CLIENT_EVENTS.CALL_CHECK_ACTIVE` sans condition sur `hasConnectedRef` (contrairement à
  `rejoinActiveCallAfterReconnect`, le replay doit aussi couvrir le tout premier connect : un onglet ouvert
  pendant qu'un appel sonne déjà doit voir la bannière immédiatement). Idempotent côté gateway (fenêtre
  60s + dédup client par callId). Tests : 2 nouveaux cas dans `CallManager.reconnect.test.tsx` (1er connect
  ET reconnect émettent l'event). Suite web filtrée `*call*` : 15 suites/214 tests verts (+2 vs vague 13).
- **[BUG SÉCURITÉ, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `call:check-active` était aussi le DERNIER handler
  `call:*` sans AUCUN rate limit (échappé au sweep 2026-07-03 — item Vague 11 — car enregistré en littéral de
  chaîne brut `'call:check-active'` plutôt qu'une constante `CALL_EVENTS.X`, invisible au grep de cet audit-là).
  Contrairement à ses siblings, il ne requiert AUCUN payload client pour être déclenché et exécute 2-4 requêtes
  Prisma (`participant.findMany`, `callSession.findMany`, `callParticipant.findMany`) PLUS un
  `generateIceServers()` (mint HMAC du secret TURN) PAR appel en cours trouvé — une surface d'amplification par
  invocation plus large que `CALL_ICE_SERVERS_REFRESH` (déjà rate-limité 10/min pour la même raison). Fix :
  nouvelle entrée `SOCKET_RATE_LIMITS.CALL_CHECK_ACTIVE` (20/min, miroir de `CALL_RECONNECTING`/
  `CALL_RECONNECTED` — un client légitime ne se reconnecte pas plus souvent que ça hors abus scripté) +
  `checkSocketRateLimit` inséré immédiatement après la résolution `userId`, avant toute requête DB, identique
  au pattern déjà utilisé par les 6 handlers voisins durcis en vague 11. Nouveau fichier de test
  `CallEventsHandler-check-active-rate-limit.test.ts` (2 tests : rate-limité + dropped-on-limit sans requête
  DB) — aucun test existant ne couvrait ce handler avant cette session. Suite gateway filtrée `*[Cc]all*` :
  29/29 suites, 827/827 tests verts (+1 suite/+2 tests vs vague 13). Suite gateway complète
  (`bun run test:coverage`, prisma generate échoué réseau cette session — `binaries.prisma.sh` injoignable,
  même limitation documentée vagues 11/13, mais le client Prisma généré n'est requis QUE par
  `SequenceService.ts`, sans rapport avec ce diff) : 481/507 suites vertes, 13262/13263 tests verts (1 skip
  pré-existant), les 26 mêmes suites en échec pré-existantes (`@prisma/client` non généré) — comportement
  identique aux vagues 11/13, aucune régression nouvelle.
- **iOS (lecture seule, aucun changement)** : `MessageSocketManager.swift` émet déjà `call:check-active`
  correctement à chaque connexion — rien à faire côté iOS pour ce bug, confirmé par lecture du code réel
  avant de conclure que web était bien la seule moitié cassée de la paire.

## Vague 15 — GC path leaked `qualityDegradedStreaks` (gateway) + web toast noise on transient `call:error` (2026-07-05)

Point d'entrée : routine calling-feature. `git fetch --unshallow` d'abord (le clone shallow local
masquait la vraie relation avec `origin/main` — après unshallow, branche et main pointaient sur le
même commit, rien à réconcilier). Lecture complète du backlog (902 lignes) + `lessons.md` avant audit.
5 commits gateway/iOS non encore documentés depuis la Vague 13 (`a813b31`, `3a6c006`, `08aa433`,
`6b6e335`, `2d240d1`) — les 3 commits iOS (hold/unhold SDP renegotiation, audio-effect capture-hook
guard, audio-session mode reapplication) relus en entier et jugés corrects, structurellement identiques
aux sibling call-sites déjà établis (`toggleVideo`/`applySurvivalVideoSend`) ; pas de nouveau candidat
côté iOS cette session (pas de toolchain Swift dans cet environnement, review lecture seule comme les
sessions gateway-only précédentes). Gateway et web audités en profondeur.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `a813b31` (2026-07-05, plus tôt aujourd'hui) a ajouté
  `CallEventsHandler.clearQualityDegradedStreaks(callId)` — un sweep qui purge toutes les entrées
  `qualityDegradedStreaks` (map keyée `callId:participantId`, jamais nettoyée autrement qu'un sweep
  size-capped à 5000) d'un appel terminé — câblé sur les 3 chemins terminaux que `CallEventsHandler`
  possède lui-même (`broadcastCallEnded`, disconnect leave à 0 participant, disconnect force-cleanup via
  `forceEndOrphanedCallSession`). **Un 4e chemin terminal existe et n'a reçu AUCUN des deux traitements** :
  `CallCleanupService.forceEndCall` (le tier GC — cron 60s, spec section 2.6 : `initiated/ringing` >120s
  → missed, `connecting` >90s → failed, `active`/`reconnecting` >2h → garbageCollected, heartbeat stale
  >120s → heartbeatTimeout) vit dans une classe séparée sans aucune référence à l'instance
  `CallEventsHandler` (contrairement à `CallService`, partagé via `setCallService`). Sibling-drift exact
  du même thème que `a813b31` lui-même documente pour `forceEndOrphanedCallSession` vs. l'ancien
  `endCall`/`leaveCall` non traités — sauf qu'ici c'est le fix du jour qui a lui-même introduit le drift
  en oubliant son propre 4e chemin. Impact : un appel GC-terminé (abandonné, personne n'a raccroché
  proprement — exactement le scénario "dernier rapport dégradé" que ce nettoyage cible) laisse fuir son
  entrée `qualityDegradedStreaks` pour de bon ; sur une gateway à trafic modéré, le cap de 5000 peut
  n'être jamais atteint.
- **Fix** : `clearQualityDegradedStreaks` passé `private` → publique sur `CallEventsHandler` (aucun
  changement de comportement — la visibilité seule). Nouveau bridge symétrique de
  `setPostSummaryCallback` (même raison, même pattern) : `CallCleanupService.setQualityStreakCleanupCallback(fn)`,
  appelé dans `forceEndCall` juste après `clearHeartbeats`/`clearRingingTimeout`, câblé dans `server.ts`
  juste après `setPostSummaryCallback` (`callEventsHandler.clearQualityDegradedStreaks`). No-op silencieux
  si le callback n'est pas encore attaché (miroir exact de `postSummary`).
- **Tests TDD** : 3 nouveaux cas dans `CallCleanupService.test.ts` (`setQualityStreakCleanupCallback`,
  miroir exact de la suite `setPostSummaryCallback` : invoque avec le bon callId, no-op si la race guard
  saute l'écriture, no-op silencieux sans callback enregistré). Suite `CallCleanupService.test.ts` complète :
  55/55. Suite gateway filtrée `*[Cc]all*` : 28/28 suites, 828/828 tests verts (825 + 3 nouveaux).
  `tsc --noEmit` : aucune nouvelle erreur (seule l'erreur `SequenceService.ts` pré-existante, confirmée
  déjà présente avant ce diff).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** Audit dédié web (agent lecture seule, mandaté à falsifier ses
  propres candidats avant de rapporter). `CallManager.tsx` (`handleCallError`, le composant réellement
  monté) n'inspectait que `error.message` (une substring `"not in this call"`) et affichait un
  `toast.error()` pour absolument tout le reste — **jamais `error.code`**. iOS (`CallManager.swift`
  ~3480-3510) whiteliste explicitement 3 codes comme transitoires/non-fatals, chacun documenté avec un
  **incident prod réel** : `RATE_LIMIT_EXCEEDED` (throttle d'UN candidat ICE — redondant par design, le
  cap gateway est 50/5s vs. un flush de gathering légitime de 15-25/ms — a tué un appel sain 382ms après
  connexion en prod) ; `TARGET_NOT_FOUND` (le socket du pair est momentanément absent de la room pendant
  un churn/reconnect — le média P2P est intact — a tué un appel sain pendant le chaos-test prod du
  2026-07-02) ; `INVALID_SIGNAL` (rejet de relais d'UN message, pas une erreur d'opération). Le gateway
  émet ces 3 codes de façon identique à web et iOS (`CallEventsHandler.ts` `call:signal`/
  `call:toggle-*`/etc.) — rien ne gate ce comportement à iOS. Repro : deux onglets web en appel, l'un
  churn son socket (blip réseau) pendant que l'autre émet un burst de candidats ICE ou une offre
  ICE-restart au même instant → le gateway relaie l'échec transitoire via `call:error` → web affiche un
  `toast.error()` brut et inquiétant en plein appel par ailleurs sain, pour une condition qui
  s'auto-guérit et ne requiert aucune action.
- **Fix** : `handleCallError` court-circuite maintenant sur `error.code === 'RATE_LIMIT_EXCEEDED' |
  'TARGET_NOT_FOUND' | 'INVALID_SIGNAL'` (log debug, pas de toast), exactement le même whitelist qu'iOS,
  juste après le check `"not in this call"` préexistant (inchangé). Nouveau fichier de test
  `CallManager.callError.test.tsx` (5 cas : les 3 codes transitoires silencieux, un code inconnu/fatal
  affiche bien le toast, le message `"not in this call"` préexistant reste ignoré quel que soit le code).
  Suite `*CallManager*` web : 2 suites/9 tests verts (4 préexistants + 5 nouveaux). `tsc --noEmit` web :
  diff avant/après identique sur `CallManager.tsx` (mêmes erreurs `unknown`/`{}` préexistantes du typage
  socket, seuls les numéros de ligne décalent — confirmé par diff textuel, aucune nouvelle erreur).
- **Reste ouvert** (inchangé) : items J, C6, CALL-DIAG retagging, `forceEndCall` room Socket.IO non
  vidée (piste basse-priorité, toujours pas de scénario d'exploitation concret).

## Vague 16 — le P0 fix du jour (682c35279) a rouvert le bug de floor-boot ET introduit une race d'initiateur côté web (2026-07-06)

Point d'entrée : routine calling-feature. Le seul commit calling non-documenté depuis la Vague 15 était
`682c35279` (même jour, quelques heures plus tôt) — deux bugs P0 corrigés (l'initiateur web n'entrait
jamais dans son propre appel ; le phantom-cleanup gateway tuait des appels cross-conversation vivants).
Trois agents d'exploration dédiés (gateway, web, iOS — lecture seule, mandatés à croiser tout candidat
contre ce fichier + lessons.md avant de rapporter) ont audité ce diff et son voisinage en profondeur.
iOS n'a rien trouvé de nouveau (le bug de classe "initiateur jamais notifié" n'existe pas côté iOS —
`CallManager.startCall` ne dépend jamais de recevoir `call:initiated` en retour, il pose son état
directement depuis l'ACK locale ; confirmé par lecture complète du chemin sortant). Gateway et web ont
chacun trouvé un bug réel, tous deux des régressions introduites par le fix du jour lui-même.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `isPhantomCallStale` rouvrait exactement le bug de
  classe "item H" qu'il était censé éviter** — `services/gateway/src/services/CallService.ts`. La
  branche `active`/`reconnecting` sans données de heartbeat en mémoire (`this.heartbeats` toujours vide
  juste après un restart) retombait sur `now - startedAtMs > PHANTOM_HEARTBEAT_GRACE_MS` — un ancrage
  purement basé sur `startedAt` (l'ancienneté RÉELLE de l'appel), sans aucun plancher lié au moment du
  boot du process. Le commentaire de la méthode prétendait "mirror CallCleanupService's tiered liveness
  semantics" mais omettait précisément le morceau de sémantique tier-4 qui existe pour survivre à un
  restart (`CallCleanupService.bootedAt`, item H, déjà documenté vagues précédentes). Scénario concret :
  gateway redémarre pendant qu'un appel réel de 10+ minutes est en cours (`startedAt` ancien) ; juste
  après boot, `hasHeartbeatData` est faux pour TOUS les appels (personne n'a encore eu le temps de
  re-battre) ; si N'IMPORTE QUEL utilisateur (potentiellement le même que celui de l'appel, sur un 2e
  appareil/onglet) initie un appel dans une AUTRE conversation dans cette fenêtre, le sweep phantom lit
  l'appel réel comme "stale" (startedAt vieux de plusieurs minutes) et le force-end silencieusement —
  `CallService` n'a pas de référence Socket.IO, donc l'autre partie ne reçoit jamais `call:ended` et
  reste "connecté" indéfiniment. Exactement le symptôme que `682c35279` visait à corriger, réouvert par
  le timing de restart au lieu du cas cross-conversation en régime permanent. Fix : `CallService` reçoit
  désormais un 2e paramètre constructeur `bootedAt: Date = new Date()` (miroir exact du pattern déjà
  utilisé par `CallCleanupService`, injectable pour les tests) ; la branche sans heartbeat ancre
  maintenant sur `Math.max(startedAtMs, bootedAtMs)` au lieu de `startedAtMs` seul — un appel réel garde
  sa fenêtre de grâce complète (120s) après CHAQUE boot avant d'être jugé stale, même si `startedAt` est
  ancien. 3 tests dans `CallService.test.ts` : `beforeEach` de la describe passé à un `bootedAt` vieux de
  24h (la plupart des tests de ce bloc simulent un régime permanent, pas l'instant post-restart — sinon
  le défaut `new Date()` du constructeur aurait rendu TOUT candidat "frais" au moment du test) + nouveau
  test dédié `boot-floor regression` avec un `CallService` fraîchement construit (`bootedAt = new Date()`)
  reproduisant exactement le scénario post-restart. RED confirmé manuellement (revert de la seule ligne
  `Math.max` → le nouveau test échoue, les 174 autres restent verts) puis GREEN restauré. Suite
  `CallService.test.ts` : 175/175. Suite gateway filtrée `*[Cc]all*` : 30/30 suites, 844/844 tests verts.
  `tsc --noEmit` gateway : propre (aucune erreur, y compris la `SequenceService.ts` pré-existante des
  sessions précédentes — absente de cette exécution).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ] Le nouveau `currentCall` synthétique de l'initiateur (fix du
  jour) pouvait être définitivement écrasé par un `call:participant-joined` gagnant la course, bloquant
  l'appel en silence** — `apps/web/hooks/conversations/use-video-call.ts` + `apps/web/stores/
  call-store.ts`. `startCall`'s ack handler pose `currentCall` de façon asynchrone (aller-retour réseau
  vers le propre serveur) avec `participants: []` codé en dur. `addParticipant` (appelé par
  `CallManager.handleParticipantJoined` sur `call:participant-joined`) était un no-op garde par
  `if (currentCall)` — si l'événement de jointure du callee arrive AVANT l'ACK de l'initiateur (callee
  rapide/latence asymétrique, plausible sans être le cas nominal), la jointure est perdue silencieusement,
  puis l'ACK écrase `currentCall` avec un tableau vide, effaçant définitivement la trace que le callee a
  rejoint. `VideoCallInterface` ne crée jamais l'offre SDP pour un participant absent de ce tableau — les
  deux côtés se croient "en appel", personne ne progresse, aucune erreur ne le distingue d'une sonnerie
  normale. Fix (store, source de vérité unique) : nouveau buffer module-level
  `pendingParticipantsByCallId` (miroir du style déjà utilisé par `heartbeatInterval`/
  `beforeUnloadHandler` dans ce même fichier) — `addParticipant` bufferise par `callSessionId` au lieu de
  no-op silencieux quand `currentCall` est encore null ; `setCurrentCall` réclame et fusionne le buffer
  correspondant au `call.id` qu'il pose, AVANT de committer l'état (donc `use-video-call.ts` n'a besoin
  d'aucun changement — le fix est entièrement contenu dans le store, cohérent avec le principe "single
  source of truth"). Buffer vidé sur `reset()` (hygiène : un appel annulé avant que son ACK n'arrive
  jamais ne doit pas fuiter indéfiniment). 3 nouveaux tests `call-store.test.ts` (bufferise + fusionne au
  bon callId ; ne fuite pas vers un callId différent jamais réclamé ; `reset()` vide le buffer). RED
  confirmé (revert du store seul → le test de fusion échoue, les 57 autres restent verts) puis GREEN.
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ] Le timeout 30s "pas de réponse" de l'initiateur était devenu du
  code mort** — `apps/web/components/video-call/CallManager.tsx`. `startCallTimeout` n'était appelé que
  depuis les 2 branches de `handleIncomingCall` (le gestionnaire de l'événement socket
  `call:initiated`) — or la branche `isInitiator` de cette fonction est, par construction du fix du jour,
  définitivement inatteignable pour l'appelant (le gateway ne réémet jamais `call:initiated` vers son
  propre socket). Le nouveau chemin `setCurrentCall` direct de `startCall` n'arme aucun timeout. Avant ce
  fix, l'écran de sonnerie de l'appelant restait affiché indéfiniment si le callee ne répond jamais,
  dépendant à 100 % du timeout serveur de 60s (2x plus long que prévu) et de la réception effective du
  broadcast `call:ended` correspondant. Fix : nouveau `useEffect` dans `CallManager.tsx`, réactif aux
  primitives `currentCall?.id`/`status`/`initiatorId`/`user?.id` — arme `startCallTimeout(currentCall.id)`
  dès que le propre appel sortant de l'utilisateur devient courant en statut `initiated` (mirroir de la
  branche `isInitiator` qu'il rend redondante, conservée pour défense en profondeur si le comportement
  gateway change un jour). Nouveau fichier `CallManager.initiatorTimeout.test.tsx` (2 cas : le timeout
  s'arme et émet `call:leave` + reset après 30s sans réponse ; ne se déclenche pas si le callee a rejoint
  avant l'expiration — le guard de statut interne à `startCallTimeout` protège même sans clear explicite).
  RED confirmé (revert de `CallManager.tsx` seul → le 1er test échoue, le 2e reste vert) puis GREEN. Suite
  web filtrée `*[Cc]all*` : 17/17 suites, 227/227 tests verts (+5 vs baseline 222). `tsc --noEmit` web :
  même 29 erreurs pré-existantes avant/après (aucune nouvelle, confirmé par diff textuel de la sortie
  filtrée sur les 3 fichiers touchés).
- **iOS (lecture seule, aucun changement)** : audit dédié confirmant que la classe de bug "initiateur
  jamais notifié" n'affecte pas iOS (état posé localement depuis l'ACK `call:initiate`, jamais depuis un
  event `call:initiated` reçu) et qu'aucune implication côté iOS de la staleness gate cross-conversation
  du gateway n'a été trouvée (le preflight `emitCallForceLeave` d'iOS est déjà scopé à la conversation
  cible, indépendant du sweep cross-conversation). Audit élargi (commits `4eb6fcdbb`/`98a447c5a` du
  2026-07-05 non encore documentés) : rien de nouveau, tout vérifié correct par lecture complète.
- **Reste ouvert** (inchangé) : items J, C6, CALL-DIAG retagging, `forceEndCall` room Socket.IO non
  vidée.

## Note d'audit — couverture de test illusoire sur `CallManager.swift` (2026-07-06)

Point d'entrée : routine calling-feature, audit dédié (agent d'exploration, lecture seule, environnement
Linux sans toolchain Swift/Xcode). Pendant que cette session auditait le voisinage du P0 fix `682c35279`,
une PR concurrente (`#1558`, session parallèle) avait déjà couvert et corrigé les deux régressions
réelles introduites par ce fix (gateway boot-floor + course d'initiateur web) — voir sa description pour
le détail, pas dupliqué ici pour éviter un conflit de merge sur ce même fichier. Cette note documente
la seule piste NON couverte par `#1558` trouvée cette session : un problème de qualité de test, pas un
bug runtime.

- **[QUALITÉ TEST, iOS, CONFIRMÉ, NON CORRIGÉ — nécessite Xcode]** `apps/ios/MeeshyTests/Unit/Services/
  CallManagerTests.swift` (~5250 lignes) et `CallManagerAudioSessionTests.swift` (~4000 lignes) —
  ensemble le plus volumineux de tests sur le fichier le plus critique du système d'appel (`CallManager.swift`,
  ~4783 lignes, `CXProvider`/`CXCallController`) — ne contiennent **aucune instanciation de `CallManager`**.
  Les centaines d'assertions (~400/fichier) sont des checks regex/substring sur le **texte source** du
  fichier via un helper `callManagerSource()` (`CallManagerAudioSessionTests.swift:7-15`), par exemple
  `XCTAssertFalse(source.contains("audioSession.setActive(true, options:")...)` ou une extraction regex du
  corps de `providerDidReset` vérifiant qu'il contient certains tokens. Même chose dans
  `P2PWebRTCClientConcurrencySourceTests.swift` (le nom du fichier le dit explicitement : "SourceTests").
  Par contraste, `CallReconnectPolicyTests.swift`/`CallQualityIndicatorPolicyTests.swift` (les parties
  extraites en fonctions pures) ont une vraie couverture comportementale — l'écart concerne spécifiquement
  le câblage CallKit/AVAudioSession à l'intérieur du singleton et son proxy `CXProviderDelegate`
  (`CallManager.swift:4460-4669`) : aucun test n'exerce réellement `providerDidReset`,
  `provider(_:perform: CXAnswerCallAction)`, `provider(_:didActivate:)` ou `provider(_:didDeactivate:)`
  contre un vrai double de test. Conséquence concrète : un futur changement qui inverserait l'ordre
  `rtc.isAudioEnabled = false` vs. `audioSessionDidActivate`, ou qui casserait le séquencement réel
  `didActivate`/`didDeactivate` sous le timing CallKit, laisserait la suite complètement verte — elle ne
  vérifie que la présence de tokens dans le fichier, jamais le comportement réel à l'exécution.
- **Pourquoi non corrigé cette session** : le fix correct (rendre `CallManager` testable — abstraire
  `CXProvider`/`CXCallController` derrière un protocole injectable, à l'image du pattern
  `{ServiceName}Providing` déjà utilisé ailleurs dans la codebase, cf. CLAUDE.md "iOS TDD Requirements")
  est un changement architectural sur le fichier le plus sensible du système d'appel — risqué à tenter en
  aveugle sans compilateur Swift local pour vérifier chaque étape (cet environnement reste Linux, sans
  Xcode). Cohérent avec la discipline déjà établie dans ce backlog (vagues 11/15 : "God object refactor,
  hors de portée sans compilateur local").
- **Piste pour une session future avec accès macOS/Xcode** : extraire un protocole
  `CXCallProviding`/`CXCallControlling` (ou équivalent) derrière lequel `CallManager` pilote CallKit,
  permettant un double de test qui simule réellement `providerDidReset`/`didActivate`/`didDeactivate` et
  vérifie l'ordonnancement effectif (pas juste la présence de code), puis remplacer progressivement les
  ~800 assertions source-grep des deux fichiers ci-dessus par des tests comportementaux équivalents.
- **Vérification effectuée cette session (SAFE, aucun changement)** : lecture complète de `CallManager.swift`,
  `WebRTCService.swift`, `P2PWebRTCClient.swift`, `VoIPPushManager.swift`, `PiPCallController.swift` —
  tous les closures/`Task` échantillonnés utilisent correctement `[weak self]`, aucune mutation `@Published`
  hors main thread trouvée, les bascules `@MainActor`/`nonisolated` autour du `CXProviderDelegate` (qui
  s'exécute sur la queue privée de CallKit, pas main — commenté explicitement `CallManager.swift:4488-4498`)
  sont gérées correctement via des hops `Task { @MainActor [weak self] in ... }`. Gateway
  (`CallEventsHandler.ts`/`CallService.ts`/`CallCleanupService.ts`) : aucune Map non bornée, aucun
  `clearTimeout` manquant, aucun chemin de signalisation non authentifié trouvé au-delà de ce qui est déjà
  documenté dans les vagues précédentes.

## Vague 17 — régression silencieuse gateway (commit `8ebd497b`, PR #1525) : ~450 lignes de fixes calling perdues (2026-07-06)

Point d'entrée : routine calling-feature. Lecture complète du backlog (825 lignes) + lessons.md avant
tout diagnostic. `git log` a montré 4 commits gateway/iOS non encore documentés ici, postérieurs à la
Vague 12 (2026-07-04) : `6908bcc` (version-bump GC/missed), `fb2bafa` (fix P2034 sur `joinCall`),
`560926b` (durcissement types, cosmétique), `0f5eefe` (fast-path `call:ended` + UI iOS). Audit ciblé sur
ces 4 diffs plutôt qu'un balayage général — la routine ayant déjà 12 vagues très denses sur le code
inchangé, la zone la plus probable pour un bug réel et neuf est le code touché depuis la dernière
session documentée.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `fb2bafa` (2026-07-04) a corrigé un incident prod réel
  sur `CallService.joinCallAttempt` : deux `call:join` quasi simultanés (3-11 ms d'écart, même appel) font
  détecter par MongoDB un conflit d'écriture AU NIVEAU DOCUMENT, à l'intérieur du `$transaction`, AVANT
  que le garde applicatif (`updateMany` scopé sur `version` + `count === 0`) ne puisse résoudre la course
  lui-même — Prisma remonte ça en `PrismaClientKnownRequestError` code `P2034` ("write conflict or
  deadlock, please retry"), qui partait BRUT au client au lieu d'emprunter le chemin `versionConflict`
  déjà prévu pour cette même course. Le fix a bien été appliqué à `joinCallAttempt` — mais **`endCall()`
  (`CallService.ts:1395-1431`) et `leaveCall()` (`CallService.ts:1158-1222`) utilisent EXACTEMENT le même
  patron** (transaction avec `updateMany` scopé `version` + throw d'un Symbol local `versionConflict`/
  `leaveVersionConflict` + `.then(() => ok, (error) => error === conflictSymbol ? 'conflict' : throw)`)
  et n'avaient reçu AUCUN des deux traitements P2034 — sibling-drift classique de ce backlog (même famille
  que lessons.md #40/#42/#45/#58, et le commentaire de `joinCallAttempt` ne référence même pas ces deux
  autres sites). Impact concret : `call:end`/`call:leave` sont déclenchés par une action utilisateur
  (bouton raccrocher) qui peut légitimement raconter à peu près N'IMPORTE QUEL scénario de course avec un
  autre writer terminal touchant le MÊME document `CallSession` — l'autre participant qui raccroche
  presque au même instant (cas *extrêmement* courant, pas un edge-case exotique), ou une course avec
  `CallCleanupService.forceEndCall`/le ringing-timeout. Avant ce fix, un utilisateur qui "perdait" cette
  course recevait une erreur Prisma brute (`Transaction failed due to a write conflict or a deadlock...`)
  via `CALL_EVENTS.ERROR` au lieu de la résolution idempotente attendue ("l'appel est déjà terminé, voici
  son état actuel") — alors même que l'appel s'était terminé PROPREMENT côté serveur (l'autre transaction
  a gagné). Confirmé par lecture complète des deux méthodes + de leurs tests existants : **aucun test
  n'exerçait le chemin `versionConflict`/`leaveVersionConflict` pour `endCall`/`leaveCall`** avant cette
  session (seul `joinCall` avait une couverture de course, ajoutée par `fb2bafa`).
- **Fix** : nouvelle méthode privée partagée `CallService.isTransientWriteConflict(error)` (juste avant
  `joinCall()`, `CallService.ts`) qui isole le check `(error as { code?: string })?.code === 'P2034'` —
  remplace le bloc dupliqué inline de `joinCallAttempt` (même comportement, code partagé au lieu de
  copier-coller pour les 2 nouveaux sites) et est réutilisée par les `.then` de `endCall()` et
  `leaveCall()` : `error === versionConflict || this.isTransientWriteConflict(error)` /
  `error === leaveVersionConflict || this.isTransientWriteConflict(error)`. Aucune signature changée,
  diff minimal (le comportement "retour à l'état frais" existait déjà pour le Symbol local — seule
  l'ORIGINE de l'erreur reconnue comme conflit transitoire est élargie).
- **Tests TDD** : 2 nouveaux cas dans `CallService.test.ts` (un par méthode), miroir exact du test
  `fb2bafa` pour `joinCall` — `$transaction` rejette une erreur `{ code: 'P2034' }` au 1er essai, assertion
  que `endCall`/`leaveCall` résolvent quand même vers l'état DB frais (`status: ended`) au lieu de rejeter.
  RED confirmé manuellement (`git stash` du seul fix `CallService.ts`, tests re-exécutés → 2 échecs avec
  l'erreur Prisma brute remontée telle quelle) puis GREEN restauré. Suite `CallService.test.ts` complète :
  169/169. Suite gateway filtrée `*[Cc]all*` : 28/28 suites, 814/814 tests verts. Suite gateway complète
  (`bun run test:coverage`, prisma generate + `packages/shared` build réussis cette session — network OK
  cette fois) : 480/506 suites vertes, 13234/13235 tests verts, 1 skip pré-existant ; les 26 suites en
  échec le sont TOUTES sur la même erreur pré-existante et non liée (`SequenceService.ts` important
  `PrismaClient` depuis `@prisma/client` racine, jamais généré dans ce sandbox — déjà documentée Vague 11,
  confirmée absente de tout fichier touché par ce diff). `tsc --noEmit` gateway : une seule erreur, la
  même `SequenceService.ts` pré-existante ; zéro erreur nouvelle sur `CallService.ts`.
- **Web + iOS (lecture seule, aucun changement)** : aucun commit web sur les fichiers d'appel depuis la
  Vague 12 (`git log --since 2026-07-03` sur `webrtc-service.ts`/`use-webrtc-p2p.ts`/`components/
  video-call/` ne remonte qu'un merge sans rapport) — pas de nouvelle zone à auditer côté web cette
  session. Les 4 commits iOS/gateway du 2026-07-04 examinés (`0f5eefe` fast-path `call:end`, glyphes
  qualité transitoires, bye in-band P2P ; `560926b` durcissement types + suppression d'un force-unwrap)
  ont été lus en entier : le fast-path `call:end` (émission `call:ended` à la room dès que
  `socket.rooms.has(ROOMS.call(...))`, AVANT la résolution d'autorisation) a été vérifié en détail —
  l'appartenance à la room est bien acquise uniquement après un `joinCall()`/`initiateCall()` validé en
  DB (`socket.join` n'intervient qu'APRÈS l'écriture Prisma réussie), et tous les chemins qui posent
  `leftAt` sur un `CallParticipant` (call:leave, call:end, call:force-leave) font aussi sortir le socket
  de la room dans le même handler — la seule exception est `CallCleanupService.forceEndCall` (GC
  heartbeat/boot) qui ne fait JAMAIS `socket.leave` ; risque résiduel jugé faible (nécessite un socket
  vivant mais un appel GC-terminé + un `call:end` rejoué sur un callId périmé pour produire un
  `call:ended` fantôme redondant, déjà couvert par le dédup client documenté ligne 2098 de
  `CallManager.swift` et `handleCallEnded`/`reset()` côté web) — noté ici comme piste basse-priorité,
  non traitée cette session (pas de scénario d'exploitation concret trouvé, contrairement au P2034
  ci-dessus qui a un incident prod daté). `duration: 0` du fast-path est bien inerte côté client (iOS ne
  lit jamais `event.duration`, calcule sa propre durée locale ; web `handleCallEnded` logge la valeur
  sans l'utiliser) — la durée persistée vient uniquement de `postCallSummary` (lecture DB fraîche côté
  serveur), donc pas de bug d'affichage de durée malgré le double-broadcast.
- **Reste ouvert** (inchangé) : items J (validation device réel restante), C6 (court-circuit dédup
  cosmétique), CALL-DIAG retagging (12 sites, cosmétique) ; nouvelle piste basse-priorité notée ci-dessus
  (`forceEndCall` ne vide pas la room Socket.IO) pour une session future si un scénario d'exploitation
  concret émerge.

## Vague 14 — `call:check-active` : feature de replay morte côté web + dernier handler `call:*` sans rate limit (2026-07-05)

Point d'entrée : routine calling-feature, agent d'exploration dédié (gateway/web, lecture seule) mandaté à
croiser tout candidat contre ce fichier + lessons.md avant de rapporter quoi que ce soit — a indépendamment
convergé vers la même zone qu'un audit manuel des `checkSocketRateLimit` du fichier.

- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** `call:check-active` (ajouté 2026-06-06, commit `9324b3317`) existe
  côté gateway (`CallEventsHandler.ts:1103-1170`) pour rejouer un `call:initiated` manqué à un socket qui se
  (re)connecte pendant la fenêtre de sonnerie de 60s (page rechargée, onglet réveillé, blip réseau bref).
  iOS l'émet sans condition à CHAQUE connexion (`MessageSocketManager.swift`) — mais **web ne l'a jamais
  émis nulle part** : `CLIENT_EVENTS.CALL_CHECK_ACTIVE` est bien déclaré dans
  `packages/shared/types/socketio-events.ts` mais avait zéro site d'appel web. Le composant réellement monté
  (`apps/web/components/video-call/CallManager.tsx`, cf. vague 10) ne fait que `rejoinActiveCallAfterReconnect`
  sur reconnect — qui ne rejoue QUE l'appel que le store Zustand local pense déjà actif, jamais une
  découverte d'un NOUVEL appel entrant manqué. Conséquence : un callee web dont l'onglet recharge/se réveille/
  subit un blip réseau pendant qu'un pair l'appelle ne voit JAMAIS la bannière d'appel entrant — l'appel sonne
  côté serveur jusqu'au timeout 60s et résout en `missed`, silencieusement, sans aucune UI côté web. Même
  thème "sibling drift" que la vague 10 (un chemin iOS déjà résilient, son jumeau web jamais branché) mais sur
  un event différent. Fix : nouvelle fonction `checkForActiveCall(socket)` dans `CallManager.tsx`, appelée à
  CHAQUE connexion (mount déjà connecté, `onConnect`, et la branche de poll du socket pas encore disponible) —
  émet `CLIENT_EVENTS.CALL_CHECK_ACTIVE` sans condition sur `hasConnectedRef` (contrairement à
  `rejoinActiveCallAfterReconnect`, le replay doit aussi couvrir le tout premier connect : un onglet ouvert
  pendant qu'un appel sonne déjà doit voir la bannière immédiatement). Idempotent côté gateway (fenêtre
  60s + dédup client par callId). Tests : 2 nouveaux cas dans `CallManager.reconnect.test.tsx` (1er connect
  ET reconnect émettent l'event). Suite web filtrée `*call*` : 15 suites/214 tests verts (+2 vs vague 13).
- **[BUG SÉCURITÉ, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `call:check-active` était aussi le DERNIER handler
  `call:*` sans AUCUN rate limit (échappé au sweep 2026-07-03 — item Vague 11 — car enregistré en littéral de
  chaîne brut `'call:check-active'` plutôt qu'une constante `CALL_EVENTS.X`, invisible au grep de cet audit-là).
  Contrairement à ses siblings, il ne requiert AUCUN payload client pour être déclenché et exécute 2-4 requêtes
  Prisma (`participant.findMany`, `callSession.findMany`, `callParticipant.findMany`) PLUS un
  `generateIceServers()` (mint HMAC du secret TURN) PAR appel en cours trouvé — une surface d'amplification par
  invocation plus large que `CALL_ICE_SERVERS_REFRESH` (déjà rate-limité 10/min pour la même raison). Fix :
  nouvelle entrée `SOCKET_RATE_LIMITS.CALL_CHECK_ACTIVE` (20/min, miroir de `CALL_RECONNECTING`/
  `CALL_RECONNECTED` — un client légitime ne se reconnecte pas plus souvent que ça hors abus scripté) +
  `checkSocketRateLimit` inséré immédiatement après la résolution `userId`, avant toute requête DB, identique
  au pattern déjà utilisé par les 6 handlers voisins durcis en vague 11. Nouveau fichier de test
  `CallEventsHandler-check-active-rate-limit.test.ts` (2 tests : rate-limité + dropped-on-limit sans requête
  DB) — aucun test existant ne couvrait ce handler avant cette session. Suite gateway filtrée `*[Cc]all*` :
  29/29 suites, 827/827 tests verts (+1 suite/+2 tests vs vague 13). Suite gateway complète
  (`bun run test:coverage`, prisma generate échoué réseau cette session — `binaries.prisma.sh` injoignable,
  même limitation documentée vagues 11/13, mais le client Prisma généré n'est requis QUE par
  `SequenceService.ts`, sans rapport avec ce diff) : 481/507 suites vertes, 13262/13263 tests verts (1 skip
  pré-existant), les 26 mêmes suites en échec pré-existantes (`@prisma/client` non généré) — comportement
  identique aux vagues 11/13, aucune régression nouvelle.
- **iOS (lecture seule, aucun changement)** : `MessageSocketManager.swift` émet déjà `call:check-active`
  correctement à chaque connexion — rien à faire côté iOS pour ce bug, confirmé par lecture du code réel
  avant de conclure que web était bien la seule moitié cassée de la paire.

## Vague 15 — GC path leaked `qualityDegradedStreaks` (gateway) + web toast noise on transient `call:error` (2026-07-05)

Point d'entrée : routine calling-feature. `git fetch --unshallow` d'abord (le clone shallow local
masquait la vraie relation avec `origin/main` — après unshallow, branche et main pointaient sur le
même commit, rien à réconcilier). Lecture complète du backlog (902 lignes) + `lessons.md` avant audit.
5 commits gateway/iOS non encore documentés depuis la Vague 13 (`a813b31`, `3a6c006`, `08aa433`,
`6b6e335`, `2d240d1`) — les 3 commits iOS (hold/unhold SDP renegotiation, audio-effect capture-hook
guard, audio-session mode reapplication) relus en entier et jugés corrects, structurellement identiques
aux sibling call-sites déjà établis (`toggleVideo`/`applySurvivalVideoSend`) ; pas de nouveau candidat
côté iOS cette session (pas de toolchain Swift dans cet environnement, review lecture seule comme les
sessions gateway-only précédentes). Gateway et web audités en profondeur.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `a813b31` (2026-07-05, plus tôt aujourd'hui) a ajouté
  `CallEventsHandler.clearQualityDegradedStreaks(callId)` — un sweep qui purge toutes les entrées
  `qualityDegradedStreaks` (map keyée `callId:participantId`, jamais nettoyée autrement qu'un sweep
  size-capped à 5000) d'un appel terminé — câblé sur les 3 chemins terminaux que `CallEventsHandler`
  possède lui-même (`broadcastCallEnded`, disconnect leave à 0 participant, disconnect force-cleanup via
  `forceEndOrphanedCallSession`). **Un 4e chemin terminal existe et n'a reçu AUCUN des deux traitements** :
  `CallCleanupService.forceEndCall` (le tier GC — cron 60s, spec section 2.6 : `initiated/ringing` >120s
  → missed, `connecting` >90s → failed, `active`/`reconnecting` >2h → garbageCollected, heartbeat stale
  >120s → heartbeatTimeout) vit dans une classe séparée sans aucune référence à l'instance
  `CallEventsHandler` (contrairement à `CallService`, partagé via `setCallService`). Sibling-drift exact
  du même thème que `a813b31` lui-même documente pour `forceEndOrphanedCallSession` vs. l'ancien
  `endCall`/`leaveCall` non traités — sauf qu'ici c'est le fix du jour qui a lui-même introduit le drift
  en oubliant son propre 4e chemin. Impact : un appel GC-terminé (abandonné, personne n'a raccroché
  proprement — exactement le scénario "dernier rapport dégradé" que ce nettoyage cible) laisse fuir son
  entrée `qualityDegradedStreaks` pour de bon ; sur une gateway à trafic modéré, le cap de 5000 peut
  n'être jamais atteint.
- **Fix** : `clearQualityDegradedStreaks` passé `private` → publique sur `CallEventsHandler` (aucun
  changement de comportement — la visibilité seule). Nouveau bridge symétrique de
  `setPostSummaryCallback` (même raison, même pattern) : `CallCleanupService.setQualityStreakCleanupCallback(fn)`,
  appelé dans `forceEndCall` juste après `clearHeartbeats`/`clearRingingTimeout`, câblé dans `server.ts`
  juste après `setPostSummaryCallback` (`callEventsHandler.clearQualityDegradedStreaks`). No-op silencieux
  si le callback n'est pas encore attaché (miroir exact de `postSummary`).
- **Tests TDD** : 3 nouveaux cas dans `CallCleanupService.test.ts` (`setQualityStreakCleanupCallback`,
  miroir exact de la suite `setPostSummaryCallback` : invoque avec le bon callId, no-op si la race guard
  saute l'écriture, no-op silencieux sans callback enregistré). Suite `CallCleanupService.test.ts` complète :
  55/55. Suite gateway filtrée `*[Cc]all*` : 28/28 suites, 828/828 tests verts (825 + 3 nouveaux).
  `tsc --noEmit` : aucune nouvelle erreur (seule l'erreur `SequenceService.ts` pré-existante, confirmée
  déjà présente avant ce diff).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** Audit dédié web (agent lecture seule, mandaté à falsifier ses
  propres candidats avant de rapporter). `CallManager.tsx` (`handleCallError`, le composant réellement
  monté) n'inspectait que `error.message` (une substring `"not in this call"`) et affichait un
  `toast.error()` pour absolument tout le reste — **jamais `error.code`**. iOS (`CallManager.swift`
  ~3480-3510) whiteliste explicitement 3 codes comme transitoires/non-fatals, chacun documenté avec un
  **incident prod réel** : `RATE_LIMIT_EXCEEDED` (throttle d'UN candidat ICE — redondant par design, le
  cap gateway est 50/5s vs. un flush de gathering légitime de 15-25/ms — a tué un appel sain 382ms après
  connexion en prod) ; `TARGET_NOT_FOUND` (le socket du pair est momentanément absent de la room pendant
  un churn/reconnect — le média P2P est intact — a tué un appel sain pendant le chaos-test prod du
  2026-07-02) ; `INVALID_SIGNAL` (rejet de relais d'UN message, pas une erreur d'opération). Le gateway
  émet ces 3 codes de façon identique à web et iOS (`CallEventsHandler.ts` `call:signal`/
  `call:toggle-*`/etc.) — rien ne gate ce comportement à iOS. Repro : deux onglets web en appel, l'un
  churn son socket (blip réseau) pendant que l'autre émet un burst de candidats ICE ou une offre
  ICE-restart au même instant → le gateway relaie l'échec transitoire via `call:error` → web affiche un
  `toast.error()` brut et inquiétant en plein appel par ailleurs sain, pour une condition qui
  s'auto-guérit et ne requiert aucune action.
- **Fix** : `handleCallError` court-circuite maintenant sur `error.code === 'RATE_LIMIT_EXCEEDED' |
  'TARGET_NOT_FOUND' | 'INVALID_SIGNAL'` (log debug, pas de toast), exactement le même whitelist qu'iOS,
  juste après le check `"not in this call"` préexistant (inchangé). Nouveau fichier de test
  `CallManager.callError.test.tsx` (5 cas : les 3 codes transitoires silencieux, un code inconnu/fatal
  affiche bien le toast, le message `"not in this call"` préexistant reste ignoré quel que soit le code).
  Suite `*CallManager*` web : 2 suites/9 tests verts (4 préexistants + 5 nouveaux). `tsc --noEmit` web :
  diff avant/après identique sur `CallManager.tsx` (mêmes erreurs `unknown`/`{}` préexistantes du typage
  socket, seuls les numéros de ligne décalent — confirmé par diff textuel, aucune nouvelle erreur).
- **Reste ouvert** (inchangé) : items J, C6, CALL-DIAG retagging, `forceEndCall` room Socket.IO non
  vidée (piste basse-priorité, toujours pas de scénario d'exploitation concret).

## Vague 18 — restauration du reste du web calling (currentCall initiateur, check-active replay, transient-error whitelist) touché par 8ebd497b (2026-07-06)

- **Portée non traitée (inchangée du principe Vague 17)** : `8ebd497b` touche 97 fichiers gateway au total
  et un nombre significatif de fichiers iOS (Swift) — `CallSignalGlyph.swift`, `CallTypeBadgeView.swift`,
  plusieurs suites de tests iOS (`CallSignalIndicatorTests`, `CallViewLayoutGuardTests`,
  `CallViewObservedObjectInjectionTests`, `CallQualityIndicatorsUITests`, `FloatingCallPillViewTests`
  partiellement) supprimées dans le même commit, ainsi qu'un remaniement substantiel de `CallManager.swift`/
  `CallAudioEffectsService.swift` (ce dernier semble être un remplacement de service plutôt qu'une pure
  perte — nécessite une lecture approfondie avec compilateur Swift pour distinguer refactor légitime de
  régression, cf. `docs/audit-calls-2026-05-11.md` et `scripts/call-reliability-report.sh` également tronqués/
  supprimés côté docs/scripts, non restaurés — impact nul sur le runtime, priorité basse). **Non traité
  cette session** (environnement Linux sans toolchain Xcode/Swift — cf. discipline établie vagues 11/15/17) —
  candidat prioritaire pour une session avec accès macOS : auditer `git diff cc9380a5 8ebd497b8 --
  'apps/ios/**'` fichier par fichier avant de restaurer quoi que ce soit (certains fichiers ont légitimement
  évolué depuis et un `checkout` naïf écraserait ce travail).
- **Tests** : suite gateway filtrée `*[Cc]all*` : 30/30 suites, 844/844 tests verts (dont le nouveau test
  boot-floor). Suite web filtrée `*[Cc]all*` : 17/17 suites, 227/227 tests verts (dont les 2 fichiers de
  test restaurés/recréés + le nouveau `CallManager.initiatorTimeout.test.tsx`). `tsc --noEmit` gateway :
  327 erreurs avant/après diff, identiques (toutes `@prisma/client` non généré, limitation sandbox connue,
  aucune nouvelle). `tsc --noEmit` web : 1512→1513 erreurs, diff textuel confirmé — le +1 est une occurrence
  supplémentaire de la même catégorie pré-existante (`socket` typé faiblement dans ce fichier, 27
  occurrences déjà tolérées) sur le site `checkForActiveCall` restauré, pas une nouvelle classe d'erreur.
  Suite web complète (non filtrée) : 413/436 suites vertes, les 23 échecs sont TOUS la même cause
  pré-existante documentée dans `CLAUDE.md` (`packages/shared` non buildé dans ce sandbox — résolution de
  module `@meeshy/shared/dist/*` échoue), zéro suite `*call*` parmi les échecs, zéro nouvelle régression.
- **Leçon pour la prochaine session** : une entrée de backlog documentant un fix ("Vague N: FIXED") n'est
  une preuve de RIEN si elle n'a pas été vérifiée contre le code réel de `main` au moment de la lecture —
  ce fichier lui-même a été partiellement effacé par la régression qu'il aurait dû aider à détecter. Avant
  de faire confiance à une entrée de ce backlog pour "passer" une zone du code, `grep` la primitive
  technique citée (nom de fonction, champ, constante) directement dans le fichier source sur `HEAD` — ne
  jamais supposer qu'une doc présente sur `main` implique que le code l'est aussi.

## Vague 19 — `call:join` n'ackait jamais un échec (gateway ET web) + 2 sites P2034 non traités dans `CallService.ts` (2026-07-06)

Point d'entrée : routine calling-feature. Lecture complète du backlog (1383 lignes, 18 vagues) +
`lessons.md` en entier avant tout diagnostic. Environnement Linux sans Xcode/Swift — 3 agents de lecture
seule dédiés (gateway `CallService.ts` en entier, gateway `CallCleanupService.ts` + reste de
`CallEventsHandler.ts`, web les 5 fichiers d'appel) mandatés en parallèle à falsifier leurs propres
candidats contre le backlog avant de rapporter quoi que ce soit — web et gateway, aucun changement Swift.

- **[BUG RÉEL, gateway + web, CONFIRMÉ + CORRIGÉ, TDD, priorité la plus haute]** `call:join`
  (`CallEventsHandler.ts:1511-1780`) déclare `ack?: (response: CallJoinAck) => void` mais ne l'invoquait
  QUE sur le chemin de succès (ligne 1649 pré-fix) — les 5 branches d'échec (non-authentifié, anonyme,
  rate-limité, validation, `NOT_A_PARTICIPANT`) et le `catch` externe faisaient seulement
  `socket.emit(CALL_EVENTS.ERROR, ...)`, jamais `ack?.(...)`. Sibling-drift direct contre le handler
  `call:initiate` immédiatement au-dessus, qui acke `success:false` sur CHACUNE de ses propres branches
  d'échec (7 sites). Côté web, `apps/web/components/video-call/CallManager.tsx:352-414`
  (`handleAcceptCall`, le composant réellement monté à `app/call/[callId]/page.tsx`) aggravait le même
  bug : `setCurrentCall(...)` + `setInCall(true)` + `setIncomingCall(null)` s'exécutaient
  INCONDITIONNELLEMENT juste après `socket.emit(CLIENT_EVENTS.CALL_JOIN, ...)`, sans même attendre l'ack
  — seul le remplissage `iceServers` était gated sur `ack?.success`. Le sibling correct existe pourtant
  dans le même repo : `apps/web/hooks/conversations/use-video-call.ts:157-165` (`answerCall`) fait bien
  `if (!response?.success) { setError(...); return; }` — mais cette fonction n'est jamais appelée par
  aucun composant monté (seul `startCall` de ce hook est consommé), donc sa couverture de test est
  illusoire pour le chemin qui compte réellement. Scénario concret : le callee tape "Accepter" au moment
  précis où l'appelant raccroche (fenêtre de course extrêmement plausible en usage normal, pas un
  edge-case exotique) — le join est rejeté côté serveur (`CALL_ALREADY_ANSWERED`-class ou
  `NOT_A_PARTICIPANT` si l'appel a déjà été nettoyé), mais le callee se retrouve quand même avec
  `VideoCallInterface` monté plein écran, caméra/micro acquis, sans aucune connexion pair jamais établie
  — un faux écran d'appel figé et silencieux. Côté iOS, `VoIPPushManager`/`MessageSocketManager` masque
  partiellement ce même trou gateway via un timeout client 3s (`emitCallJoinWithAck`), dégradant un échec
  immédiat en délai silencieux de 3s au lieu d'un rapport instantané — non touché cette session (pas de
  toolchain Swift), mais bénéficiera de la même correction gateway sans changement de code iOS requis.
  **Fix gateway** : `ack?.({ success: false, error: '...' } as unknown as CallJoinAck)` ajouté sur
  chacune des 6 branches d'échec de `call:join`, exact miroir du pattern déjà utilisé par `call:initiate`.
  **Fix web** : `handleAcceptCall` réécrit pour `await` l'ack (Promise autour de `socket.emit`) et jeter
  si `!ack?.success` (capturé par le `catch` existant : toast d'erreur + `setIncomingCall(null)`) —
  `setCurrentCall`/`setInCall`/l'application des `iceServers` ne s'exécutent plus qu'après un ack
  `success:true` confirmé, miroir du pattern correct de `answerCall`.
  **Tests TDD** : nouveau fichier gateway `CallEventsHandler-join-ack.test.ts` (6 cas, un par branche
  d'échec, RED confirmé par `git stash` du seul fix source → les 6 échouent avec 0 appel à `ack`, GREEN
  restauré) ; nouveau fichier web `CallManager.acceptCall.test.tsx` (2 cas : commit UI seulement après
  ack `success:true`, aucun commit + toast d'erreur sur `success:false` — RED confirmé de la même façon,
  les 2 échouaient avant le fix car `isInCall` passait à `true` immédiatement, avant même la résolution
  de l'ack).
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** Deux sites `$transaction` de forme identique à
  `joinCallAttempt`/`endCall()`/`leaveCall()` (qui ont chacun déjà reçu le traitement P2034 — vagues 13 et
  17) n'avaient JAMAIS reçu le même traitement, malgré une forme de transaction rigoureusement identique :
  - `CallService.leaveCall()`, branche idempotente (`CallService.ts:1202-1229`, prise quand la ligne
    `CallParticipant` active de l'appelant a déjà disparu — départ auto sur `disconnect` concurrent,
    double `call:leave`) : son propre `.then(resolve, reject)` local ne vérifiait QUE
    `error === idemVersionConflict`, jamais `this.isTransientWriteConflict(error)` — contrairement au
    chemin principal de la MÊME fonction, 100 lignes plus bas (`leaveVersionConflict`, ligne 1378), qui
    vérifie bien les deux. Sibling-drift À L'INTÉRIEUR d'une seule fonction, pas seulement entre
    fonctions. Un P2034 brut sur cette branche remontait tel quel jusqu'au `catch` de `call:leave`
    (`CallEventsHandler.ts`), qui fait `errorMessage.split(':')[0]` sur le message Prisma brut et émet un
    `error.code` incohérent au client, au lieu de la résolution idempotente prévue ("l'appel est déjà
    terminé, voici son état").
  - `CallService.forceEndOrphanedCallSession()` (`CallService.ts:338-378`) — transaction structurellement
    identique (updateMany scopé + version bump) mais sans AUCUN traitement de conflit : un P2034 brut
    remontait non capturé jusqu'aux 2 sites appelants (`CallEventsHandler.ts` disconnect force-cleanup et
    `forceEndOrphanedCallAfterOptimisticBroadcast`), qui le loggent comme un échec générique
    ("force cleanup also failed") au lieu du cas bénin "un autre writer a déjà résolu cet appel" que les
    3 autres sites traitent maintenant correctement — l'appel pouvait rester non-terminal jusqu'au
    passage du GC 60s.
  **Fix** : `idemVersionConflict` étendu à `|| this.isTransientWriteConflict(error)` (1 ligne, miroir
  exact du chemin principal) ; `forceEndOrphanedCallSession` enveloppé d'un `.catch` qui traite P2034
  comme le `count === 0` déjà géré (retourne `false`/`null` au lieu de jeter).
  **Tests TDD** : 2 nouveaux cas dans `CallService.test.ts` (un par site), miroir exact des tests P2034
  déjà existants pour `endCall`/`leaveCall` principal — RED confirmé par `git stash` du seul fix source
  (2 échecs, l'erreur Prisma brute remonte), GREEN restauré.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, mineur]** `CallService.initiateCall()`, branche de nettoyage
  d'appel zombie avant un nouvel appel (`CallService.ts:804-837`) : appelle `this.clearHeartbeats(...)`
  mais jamais `this.clearRingingTimeout(...)`, contrairement à son sibling immédiat 40 lignes plus haut
  (la boucle de phantom-cleanup de l'initiateur, qui nettoie bien les deux) et à tous les autres chemins
  terminaux du fichier. Impact borné et auto-guérissant (si un timer de ringing vivant existe encore pour
  cet appel zombie, il se déclenche jusqu'à 60s plus tard mais son écriture est scopée
  `status IN (initiated, ringing)` — no-op silencieux puisque le zombie est déjà `ended` ici) — corrigé
  quand même car le fix est trivial et sûr (1 ligne, appel à une méthode déjà existante).
- **Vérification (gateway)** : suite gateway filtrée `*[Cc]all*` : 31/31 suites (+1 nouveau fichier),
  852/852 tests verts (+8 vs vague 18 : 6 join-ack + 2 P2034). Suite gateway COMPLÈTE
  (`bun run test:coverage`, prisma generate + build `packages/shared` réussis cette session) : 509/509
  suites, 13779/13780 tests verts (1 skip pré-existant), **0 échec** — meilleur que la baseline
  documentée des vagues précédentes (qui listait 26 suites en échec sur l'import `@prisma/client` non
  généré dans leur sandbox) : le client Prisma a été généré proprement cette session, donc ce bruit
  pré-existant n'apparaît pas ici. `tsc --noEmit` gateway : 0 erreur.
- **Vérification (web)** : suite web filtrée `*[Cc]all*` : 19/19 suites (+2 nouveaux fichiers), tests tous
  verts. Suite web COMPLÈTE : 439/439 suites, 10941/10962 tests verts (21 skips pré-existants), **0
  échec** — meilleur que la baseline documentée (413/436 avec 23 échecs pré-existants sur
  `@meeshy/shared/dist/*` non résolu) : `packages/shared` a été buildé proprement cette session. `tsc
  --noEmit` web : nombre d'erreurs sur `CallManager.tsx` identique avant/après (29/29, vérifié par
  `git stash` du seul fix) — même classe de bruit pré-existant (socket typé faiblement dans ce fichier),
  aucune nouvelle erreur introduite.
- **iOS (lecture seule, aucun changement)** : non audité en profondeur cette session au-delà de la
  confirmation que `MessageSocketManager.emitCallJoinWithAck` masque partiellement le bug gateway
  ci-dessus via un timeout 3s — aucun changement Swift nécessaire, le fix gateway suffit à raccourcir ce
  délai à un rapport immédiat pour tout futur appelant qui écoute l'ack.
- **Reste ouvert (nouveau, trouvé cette session, PAS corrigé — trop risqué/complexe pour une seule
  session, cf. discipline établie de ne pas tout corriger d'un coup)** :
  - **`call:force-leave` court-circuite `broadcastCallEnded()`** (`CallEventsHandler.ts:2079-2100`,
    handler démarrant ligne 1946) — HIGH confidence. Contrairement à `call:leave`/`call:end`, qui routent
    tous deux leur événement terminal via `broadcastCallEnded()` (nettoie `qualityDegradedStreaks`,
    diffuse vers l'audience complète via `resolveCallEndedRooms`, envoie le push silencieux
    `call_cancel`), `call:force-leave` fait son propre double-emit inline (call room + conversation room
    seulement) et n'appelle jamais `broadcastCallEnded`/`clearQualityDegradedStreaks`/
    `clearRingingTimeout`/`clearBufferedOffer`. Depuis le fix Audit-C7 qui fait résoudre les force-leave
    pré-réponse en `missed` (exactement le scénario que cible `sendCallCancellationPushes`), un callee en
    sonnerie fantôme (push VoIP livré, socket jamais entré dans la room) reste à sonner jusqu'à son propre
    timeout client quand l'appelant est nettoyé via ce chemin (le chemin standard de récupération
    `CALL_ALREADY_ACTIVE`). Piste pour une session future : router `call:force-leave` à travers
    `broadcastCallEnded()` comme ses siblings — nécessite de vérifier l'audience exacte attendue par ce
    handler (boucle sur PLUSIEURS appels obsolètes par itération, contrairement à `call:leave`/`call:end`
    qui traitent un seul appel) avant de changer son fanout.
  - **GC tier-1 (ringing/initiated obsolète) ne crée jamais de `Notification` persistée** —
    (`CallCleanupService.ts:456-486` + câblage `server.ts:1315-1332`). Seuls
    `setPostSummaryCallback`/`setMissedCallCancelPushCallback` sont câblés vers `CallCleanupService` ; pas
    d'équivalent pour `handleMissedCall`/`createMissedCallNotifications`. Un appel résolu SEULEMENT par ce
    backstop GC (double-échec du timer in-process ET de la réhydratation au boot — réel mais rare) ne crée
    aucune entrée notification-center/badge pour le callee. MEDIUM confidence, sévérité plus basse que
    ci-dessus (le chemin primaire et `rehydrateActiveCalls` couvrent déjà le cas commun).
  - **Web : `VideoCallInterface.offersCreatedFor` (ref, `components/video-calls/VideoCallInterface.tsx:189-213`)
    n'est jamais invalidé sur `participant-left`** — seulement ajouté ou nettoyé sur échec de
    `createOffer`. Si l'AUTRE participant quitte puis rejoint en cours d'appel (blip réseau, reload
    d'onglet) pendant que le composant reste monté, `createOffer` est silencieusement sauté pour ce
    userId indéfiniment — pas de reconnexion possible sans redémarrer tout l'appel. HIGH confidence,
    complexité de fix non-triviale (état WebRTC de renégociation par participant) — nécessite une session
    dédiée avec tests de renégociation soignés.
  - **Web : le refresh des credentials TURN n'est jamais implémenté** — gateway a un round-trip complet
    `call:request-ice-servers`/`call:ice-servers-refreshed` testé, iOS l'utilise (périodique 80% TTL + à
    chaque ICE restart), mais AUCUN site d'appel web pour ces events (`apps/web/services/webrtc-service.ts`,
    `apps/web/hooks/use-webrtc-p2p.ts`) — confirmé par grep, zéro occurrence. Un appel web dépassant la
    TTL TURN (~3600s) qui a besoin d'un ICE restart (changement réseau) retente avec des credentials
    expirés et peut échouer à se rétablir définitivement pour un pair en NAT symétrique, sans aucun
    mécanisme client pour le détecter. HIGH confidence, mais c'est un GAP de fonctionnalité entière
    (implémenter le refresh périodique + sur ICE-restart côté web), pas un bug ponctuel — hors de portée
    d'une seule session, candidat prioritaire pour une prochaine vague dédiée.
  - `call:force-leave` ne nettoie pas non plus `ringingTimeout`/`bufferedOffer` (distinct du bug
    `broadcastCallEnded` ci-dessus) — impact borné/auto-guérissant (le timeout re-vérifie le statut avant
    d'écrire, le buffered-offer a son propre TTL de sweep), noté pour complétude, pas une priorité.
  - `negotiate()` (`webrtc-service.ts:750-755`) : le guard `makingOffer` peut potentiellement abandonner
    silencieusement un ICE-restart en attente s'il court-circuite une renégociation A/V déjà en vol —
    spéculatif, fenêtre de course étroite, non vérifié comme atteignable en pratique.

## Vague 20 — 3 des 5 items ouverts de la Vague 19 traités (item 1 déjà corrigé entre-temps) (2026-07-07)

Point d'entrée : routine calling-feature. Un agent d'exploration dédié (lecture seule) a re-vérifié les 5
items "Reste ouvert" de la Vague 19 contre `HEAD` avant tout fix — `git log` confirme qu'aucun commit
postérieur à `4c99916d` n'avait touché ces fichiers.

- **Item 1 (`call:force-leave` court-circuite `broadcastCallEnded()`) — DÉJÀ CORRIGÉ**, par le commit
  `164efcf9` ("repair phantom-ringing fanout gap + call teardown edge cases", même journée que la Vague 19).
  Vérifié par lecture directe : `CallEventsHandler.ts` route bien ce chemin via `broadcastCallEnded()`
  depuis ce commit. Aucune action nécessaire.
- **[FIX RÉEL, gateway, TDD] Item 5 — `call:force-leave` ne nettoyait ni `ringingTimeout` ni
  `bufferedOffer`** — contrairement à `call:leave` (même fichier, juste au-dessus), qui appelle les deux
  juste après `leaveCall()`. Fix : mêmes deux appels ajoutés dans la boucle de force-leave, juste après
  `leaveCall()`. 2 tests TDD (`CallEventsHandler-force-leave.test.ts`) : clearRingingTimeout appelé avec le
  bon callId, bufferedOffer supprimé (seedé via accès `(handler as any).bufferedOffers`).
- **[FIX RÉEL, gateway, TDD] Item 2 — GC tier 1 (initiated/ringing > 120s → missed) ne créait jamais de
  `Notification` persistée** pour les participants n'ayant pas répondu, contrairement au chemin in-process
  (`CallEventsHandler.handleMissedCall` → `createMissedCallNotifications`). `CallCleanupService.forceEndCall`
  mirrorait déjà les DEUX autres effets de bord d'un missed (résumé via `postSummary`, push silencieux via
  `missedCallCancelPush`) mais pas la notification badge/centre-de-notifications elle-même — un appel résolu
  UNIQUEMENT par ce filet GC laissait le callee sans aucune trace qu'on l'avait appelé. Fix : nouveau bridge
  `setMissedCallNotificationCallback` (miroir exact de `setMissedCallCancelPushCallback`), câblé dans
  `server.ts` vers `callEventsHandler.createMissedCallNotifications(callId)` — PAS `handleMissedCall` (qui
  ré-invoquerait `markCallAsMissed`, déjà fait par la transaction GC elle-même ; seul l'effet de bord
  notification manquait). 6 tests TDD dans `CallCleanupService.test.ts` (miroir exact de la suite
  `setMissedCallCancelPushCallback` : invoqué tier-1 seulement, pas tier-2/3, pas sur race-guard skip, ne
  jette pas si le callback rejette, no-op sans callback).
- **[FIX RÉEL, web, TDD] Item 3 — `VideoCallInterface.offersCreatedFor` (ref, composant réellement monté via
  `CallManager.tsx` → confirmé, pas le jumeau mort) n'était jamais invalidé sur `participant-left`** — un
  participant qui quitte puis rejoint pendant que le composant reste monté (blip réseau, reload d'onglet) ne
  recevait plus jamais d'offer, la guard le croyant déjà offert pour toujours. Fix : `offersCreatedFor.current.delete(participantId)`
  ajouté dans le même bloc `setTimeout` (2s) qui fait déjà `removeRemoteStream`/`removePeerConnection` —
  au moment où la peer connection est réellement démontée, pas avant. Test TDD dans
  `VideoCallInterface.test.tsx` : simule quitter (event participant-left + avance des timers 2s) puis
  rejoindre (round-trip `participants.length` 1→0→1 via `rerender`, la vraie dépendance de l'effet
  d'offer) → `createOffer` doit être rappelé une 2e fois pour le même participantId. RED confirmé (revert
  du seul fix source → 1/6 rouge, `createOffer` jamais rappelé).
- **[FIX RÉEL, web, TDD] Item 4 — le refresh périodique des credentials TURN n'était jamais implémenté côté
  web** (gap de fonctionnalité entière, documenté 3 vagues de suite comme "hors scope, nécessite une session
  dédiée" — traité ici avec un scope volontairement réduit pour rester sûr). Le gateway expose depuis
  longtemps le round-trip complet `call:request-ice-servers`/`call:ice-servers-refreshed` (iOS le consomme :
  refresh périodique à 80% du TTL + refresh sur ICE-restart) mais `apps/web/hooks/use-webrtc-p2p.ts` n'avait
  AUCUN site d'appel pour l'un ou l'autre event — un appel web dépassant la TTL TURN (~3600s par défaut) qui
  a besoin d'un ICE restart retentait avec des credentials expirés, sans échappatoire pour un pair en NAT
  symétrique. Fix scope volontairement réduit (évite de threader `ttl` à travers tous les acks/events
  `call:initiate`/`call:join`/`call:initiated`/`call:participant-joined`, qui aurait cassé plusieurs mocks
  `CallService` de tests gateway existants sans `getIceServerTtl` stubé — vérifié en amont, pas tenté) :
  timer de refresh périodique armé au montage avec un TTL par défaut conservateur (3600s, miroir du défaut
  documenté ailleurs dans ce fichier), ET refresh immédiat déclenché sur `iceConnectionState === 'disconnected'`
  (signal de network-change/ICE-restart imminent, avant même l'échec). La réponse `call:ice-servers-refreshed`
  (qui, elle, porte bien un `ttl` réel per-event) met à jour le store ET applique en direct
  `service.setIceServers(...)` à chaque `WebRTCService` déjà existant dans `webrtcServicesRef` (le fix RC-1
  antérieur fait que `setIceServers` applique déjà via `RTCPeerConnection.setConfiguration` si la connexion
  existe), puis reprogramme le prochain refresh sur le VRAI ttl reçu — donc après le premier cycle, le
  scheduling converge vers la valeur serveur réelle même si le défaut de démarrage était approximatif.
  5 tests TDD (`use-webrtc-p2p.test.tsx`, nouveau describe `TURN credential refresh`) : écoute l'event au
  montage + arme le timer par défaut ; refresh immédiat sur `disconnected` ; applique store+peer connections
  existantes et reprogramme sur le TTL réel reçu ; ignore un refresh pour un autre callId ; nettoie le timer
  au démontage. RED confirmé (revert du seul fix source → 5/29 rouges dans ce fichier). Mock `useCallStore`
  du fichier de test converti de littéral figé vers `Object.assign(buildState, { getState: buildState })`
  (le hook appelle maintenant `useCallStore.getState().setIceServers(...)`, motif déjà établi ailleurs dans
  la codebase pour les stores Zustand mockés).
- **Non traité (déféré à une session dédiée, comme documenté depuis 3 vagues)** : threader le VRAI `ttl` à
  travers `call:join`/`call:initiate`/`call:initiated`/`call:participant-joined` remplacerait le défaut
  conservateur ci-dessus par la valeur serveur exacte dès le premier cycle — gain marginal (le premier
  refresh utilise de toute façon le TTL réel dès la 1re réponse), coût réel (≥5 fichiers de test gateway à
  mettre à jour avec un mock `getIceServerTtl`), jugé hors scope pour cette session.
- **Vérification (gateway)** : suite filtrée `*[Cc]all*` : 31/31 suites, 863/863 tests verts (+11 vs Vague
  19 : 2 force-leave clear + 6 missed-notification callback + 3 déjà comptés côté web n'affectent pas ce
  total). `tsc --noEmit` gateway : 0 erreur (client Prisma généré + `packages/shared` buildé proprement
  cette session, réseau OK).
- **Vérification (web)** : suite filtrée `*[Cc]all*` + `*webrtc*` : 21 suites, 427 tests verts (aucune
  régression). `tsc --noEmit` web : 1513 erreurs avant/après (identique, diff textuel confirmé) — les 11
  restantes sur `VideoCallInterface.tsx` sont pré-existantes (typage `unknown` sur `window`/`event`, non
  liées à ce diff).
- **iOS (lecture seule, aucun changement)** : aucun commit iOS sur les fichiers d'appel depuis la Vague 19 —
  pas de nouvelle zone à auditer cette session (toujours pas de toolchain Swift/Xcode dans cet
  environnement Linux).
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `forceEndCall` room Socket.IO non vidée, `negotiate()` guard `makingOffer`
  spéculatif ; nouveau : threading complet du `ttl` TURN à travers tous les événements call (voir item 4
  ci-dessus).

## Vague 21 — privacy: un callee répondant à un appel AUDIO activait quand même sa caméra et transmettait de la vidéo, gateway+web (2026-07-07)

Point d'entrée : routine calling-feature. 4 PRs calls concurrentes déjà ouvertes au démarrage (#1601
socket-room eviction sur GC force-end, #1606 version-bump `initiateCall` + web quality-report, #1597 typo
prop `DraggableParticipantOverlay`, #1610 docs-only) — cible retenue strictement disjointe, trouvée par un
agent d'exploration dédié (lecture seule) scopé explicitement à éviter ces 4 zones et le backlog déjà
déprioritisé (C6/CALL-DIAG/`negotiate()`/threading TTL).

**Mécanisme** : le CALLER respecte déjà le type d'appel — `use-video-call.ts` (`startCall`) acquiert le
stream via `getUserMedia({ audio, video: isVideo ? VIDEO_CONSTRAINTS : false })` puis le pré-autorise via
`window.__preauthorizedMediaStream` (consommé par `VideoCallInterface` au mount, chemin Safari-compatible).
Le CALLEE, lui, n'appelait JAMAIS `getUserMedia` dans `CallManager.handleAcceptCall` — aucun
pré-autorization n'était posé, donc `VideoCallInterface` retombait sur `initializeLocalStream()` →
`WebRTCService.getLocalStream()` sans contraintes → `DEFAULT_MEDIA_CONSTRAINTS` (audio+vidéo
inconditionnels), quel que soit `incomingCall.type`. Sibling-drift confirmé côté gateway : `CallService.ts`
gate déjà `isVideoEnabled` par `type === 'video'` pour l'INITIATEUR (`initiateCall`, ligne ~877) mais PAS
pour le JOINEUR (`joinCallAttempt`, `isVideoEnabled: settings?.videoEnabled ?? true` sans lien avec
`call.metadata.type`) — un joiner (ou un client web bugué/malveillant) pouvait faire persister
`isVideoEnabled: true` sur un appel audio-only.

**Impact** : un appelant démarre un appel AUDIO ; le callee accepte ; son navigateur active la caméra et
transmet de la vidéo live à l'appelant sans consentement pour CET appel — vrai gap privacy/consentement,
atteignable en usage normal (pas de fenêtre de course), et un défaut de conformité "usage justifié de la
caméra" au sens des guidelines plateforme.

**Fix (bounded, TDD)** :
- **Gateway** (`services/gateway/src/services/CallService.ts`, `joinCallAttempt`) : lit
  `call.metadata.type` (même pattern déjà établi ligne ~2065 pour `buildCallSummaryWithMetadata`) et
  applique la même garde que l'initiateur : `isVideoEnabled: isVideoCall ? (settings?.videoEnabled ?? true)
  : false`. 1 nouveau test TDD (`CallService.test.ts`, describe `joinCall`) : un joiner qui ENVOIE
  `videoEnabled: true` sur un appel dont `metadata.type === 'audio'` doit quand même persister
  `isVideoEnabled: false`. RED confirmé (échec `Received value: true` avant fix). Suite `CallService.test.ts`
  complète : 179/179 ; suite gateway filtrée `*[Cc]all*` : 31/31 suites, 864/864 tests ; `tsc --noEmit`
  gateway : 0 erreur.
- **Web** : extraction d'une source unique `apps/web/lib/calls/call-media-constraints.ts`
  (`AUDIO_CONSTRAINTS`/`VIDEO_CONSTRAINTS`/`getCallMediaConstraints(type)`/`stopPreauthorizedStream`) —
  élimine exactement la classe de duplication qui a causé ce bug (le callee n'avait jamais reçu la version
  caller de cette logique). `use-video-call.ts` refactoré pour consommer la source unique (comportement
  caller inchangé, 46/46 tests toujours verts). `CallManager.handleAcceptCall` mirrore maintenant le
  pré-authorization pattern du caller : `getUserMedia(getCallMediaConstraints(incomingCall.type === 'video'
  ? 'video' : 'audio'))` AVANT d'émettre `call:join`, stream posé sur `__preauthorizedMediaStream`,
  `settings.videoEnabled` du payload `call:join` dérivé du même booléen (au lieu du `true` hardcodé) ;
  cleanup (`stopPreauthorizedStream`) sur tout échec après acquisition (pas de socket, ack rejeté) pour ne
  jamais laisser micro/caméra actifs sans rien pour consommer le stream — bénéfice UX en prime : un refus
  de permission est maintenant intercepté AVANT de joindre l'appel, au lieu d'atterrir dans un état "in
  call" déjà commité avec un stream jamais obtenu. 3 nouveaux tests TDD
  (`CallManager.acceptCall.test.tsx`) : audio→`getUserMedia({video:false})`+`call:join{videoEnabled:false}`,
  video→`getUserMedia({video:{...}})`+`call:join{videoEnabled:true}`, permission refusée→`call:join` jamais
  émis + tracks partiels stoppés. RED confirmé (3/5 rouges, `git stash` scoped aux seuls fichiers source via
  patch, tests inchangés) → GREEN après fix. + 4 tests unitaires du nouvel helper
  (`lib/calls/__tests__/call-media-constraints.test.ts`). Suite `*[Cc]all*|webrtc*` web : 21 suites/430
  tests + les 2 nouveaux fichiers (acceptCall 5/5, helper 4/4) ; `tsc --noEmit` web : 1535 erreurs
  avant/après identique (bruit préexistant `(socket as unknown)` déjà présent partout dans ce fichier,
  confirmé par `git stash` du seul diff source).
- **iOS** : non audité cette session (pas de toolchain Swift/Xcode dans cet environnement Linux) — la
  logique CallKit `hasVideo` iOS lit déjà `type` correctement à l'INITIATION
  (`CallInitiatedEvent.type`/`hasVideo`, cf. commentaire ligne 415 `video-call.ts`) ; non revérifié pour le
  chemin JOIN iOS dans cette session, candidat pour une prochaine passe iOS dédiée.
- **Reste ouvert (inchangé)** : items J, C6, CALL-DIAG retagging, `forceEndCall` room Socket.IO non vidée,
  `negotiate()` guard spéculatif, threading TTL complet.
