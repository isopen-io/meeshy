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

### Reste à faire
- [ ] Déployer gateway (résilience restart) + valider live : appel établi → `restart gateway` → l'appel
      continue, re-join auto des 2 côtés (web + iOS)
- [ ] Re-test E2E vidéo après Fix 7 : appel audio → user active sa caméra → le simu AFFICHE le flux
- [ ] Déployer gateway (fix call:missed) + TestFlight (fixes 11/12 côté callee iPhone)
- [ ] Backlog audit prod : C3/C4 (endCall → missed pas completed), C5 (leftAt isSet), C6 (index unique
      partiel + court-circuit double summary), C7 (force-leave missed → summary+notif), C8 (dédup
      multi-socket), limite ICE gateway 150/5 s, bulle de statut orange illisible derrière la Dynamic
      Island (retour user, StatusBubbleOverlay)
- [ ] Appel vidéo complet + envoi vidéo : device réel uniquement (guard simulateur)
- [ ] Validation device réel du fallback stuck-muted (Fix 4)
- [ ] Gateway : authz `call:transcription-segment` / `call:request-ice-servers` (piste connue)
