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

## Vague 22 — `forceEndCall` ne vidait jamais la room Socket.IO du call GC-terminé (2026-07-07)

Point d'entrée : routine calling-feature. Un agent d'exploration dédié (lecture seule) a re-vérifié la
piste basse-priorité notée Vague 13 et reconfirmée "reste ouvert" depuis (Vagues 13/19/20) contre `HEAD`
avant tout fix — toujours vrai, aucun commit entre-temps ne l'avait traité.

- **[FIX RÉEL, gateway, TDD]** Les trois chemins de terminaison client (`call:end`, `call:leave`,
  `call:force-leave`, tous dans `CallEventsHandler.ts`) font systématiquement `fetchSockets()` +
  `s.leave(ROOMS.call(callId))` sur la room `call:<id>` juste après le broadcast `call:ended`.
  `CallCleanupService.forceEndCall` (le tier GC — cron 60s : ringing>120s→missed,
  connecting>90s→failed, active>2h ou heartbeat stale>120s→ended) ne le faisait JAMAIS : un socket
  encore connecté au moment où GC réclame un appel zombie restait membre de la room `call:<id>`
  indéfiniment, jusqu'à sa propre déconnexion. Sur un process long-lived (Redis adapter en scale
  horizontal notamment), c'est une fuite de membership de room non bornée, pas seulement le risque
  cosmétique de `call:ended` fantôme redondant déjà noté Vague 13. Fix : même paire d'appels
  `this.io.in(ROOMS.call(callId)).fetchSockets()` / `Promise.all(sockets.map(s => s.leave(...)))`
  ajoutée dans `forceEndCall`, juste après le broadcast existant — miroir exact du bloc
  `CallEventsHandler.ts` (`call:end`, lignes ~2650-2652). 3 tests TDD (`CallCleanupService.test.ts`,
  nouveau describe `room cleanup`) : évince chaque socket restée dans la room après un force-end,
  ne jette pas quand la room est déjà vide, ne tente aucun accès `io` quand aucun serveur Socket.IO
  n'est attaché. RED confirmé (revert du seul fix source → le test d'éviction échoue, `io.in` jamais
  appelé ; les deux autres tests passent déjà car ils n'assertent que l'absence de throw/le compte
  `cleaned`, comportement inchangé par le fix).
- **Vérification (gateway)** : suite filtrée `*[Cc]all*` : 31/31 suites, 866/866 tests verts (+3 vs
  Vague 20). `tsc --noEmit` gateway : 0 erreur (client Prisma généré + `packages/shared` buildé
  proprement cette session).
- **iOS/Android/web (lecture seule, aucun changement)** : aucun fichier touché hors gateway cette
  session ; pas de nouvelle zone candidate identifiée côté client par l'agent d'exploration pour ce tour.
- **Reste ouvert (inchangé)** : items J, C6, CALL-DIAG retagging, `negotiate()` guard `makingOffer`
  spéculatif, threading complet du `ttl` TURN à travers tous les événements call (voir Vague 20 item 4).

## Vague 23 — gap protocole `version` sur 2 sites `initiateCall` (gateway) + `call:quality-report` web jamais réellement émis (2026-07-07)

Point d'entrée : routine calling-feature. `git log` confirme aucun commit sur les fichiers gateway/web
calling depuis `b4b5a8a1` (Vague 20, déjà mergé sur `main` — cette branche pointait déjà sur le même
commit que `origin/main`). Deux agents d'exploration dédiés (gateway, web — lecture seule, mandatés à
falsifier tout candidat contre ce fichier + `lessons.md` avant de rapporter) lancés en parallèle.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallService.initiateCall()` — les deux écritures
  terminales de nettoyage pré-initiate (phantom-cleanup cross-conversation, `CallService.ts:773-781`, et
  nettoyage zombie same-conversation, `:824-832`) ne bumpaient PAS `version`, contrairement à TOUS les
  autres writers terminaux du fichier (`forceEndOrphanedCallSession`, `updateCallStatus`,
  `joinCallAttempt`, `leaveCall` (les 2 branches), `endCall`, `markCallAsMissed`) qui portent tous
  explicitement le commentaire "terminal write protocol : tout writer terminal DOIT bumper `version`,
  même un writer gardé par statut plutôt que par version — sinon un writer version-gardé qui a lu la ligne
  juste avant peut encore matcher son `version` périmé et écraser cet état terminal juste après". Ces deux
  sites précèdent probablement l'introduction du protocole (ils ne s'appellent pas `forceEndX`, donc
  invisibles aux sweeps "grep tous les `forceEnd*`" des vagues 13/15/17/19/20) et le commentaire de test
  existant (`CallService.test.ts:112`, "Version-guarded writes (updateCallStatus/initiateCall zombie
  cleanup) default to 'lock won'") montre que l'équipe elle-même les considère déjà comme faisant partie
  de la famille version-gardée — confirmant un oubli, pas un choix. Scénario concret : un appel
  fantôme/zombie (par définition à clients peu fiables — exactement les scénarios de churn déjà chassés
  dans ce backlog) est force-terminé par un de ces deux sweeps sans bump de version ; un writer légitime
  concurrent sur le MÊME appel (retry `call:leave`/`call:end` en retard, `updateCallStatus` déclenché par
  une SDP-answer tardive, ou le callback de ringing-timeout) qui a lu la ligne un instant plus tôt détient
  encore l'ancienne version inchangée et son propre `updateMany` version-gardé réussit — écrasant l'état
  terminal qui vient d'être écrit (mauvais `endReason`/`duration`/`endedAt`, un 2e `call:ended`
  contradictoire, voire une résurrection vers un statut non-terminal via `updateCallStatus`). Exactement la
  classe de bug "résurrection version-guard" que le protocole existe pour fermer.
  **Fix** : `version: { increment: 1 }` ajouté aux deux `data` des `updateMany`, miroir exact des autres
  writers terminaux. **Tests TDD** : assertion `version` ajoutée au test existant `should cleanup zombie
  call before initiating new call` + nouveau test dédié `phantom cleanup: bumps version on the terminal
  write` (capture les args du `tx.callSession.updateMany` mocké). RED confirmé (`git stash` du seul fix
  source → les 2 échouent, `data` sans `version`), GREEN restauré. Suite `CallService.test.ts` : 178/178
  (+1). Suite gateway filtrée sur les 31 fichiers `*[Cc]all*` (via `bunx jest --testPathPatterns`, `bun
  test` natif crashe sur un module NAPI sans rapport avec ce diff — `uv_async_init` non supporté par le
  runtime bun sur cet hôte, contournement : passer par `bunx jest`) : 31/31 suites, 864/864 tests verts
  (863 + 1 nouveau). `tsc --noEmit` gateway : 0 erreur.
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** `apps/web/hooks/use-call-quality.ts` — l'effet qui arme
  l'intervalle 10s d'émission de `CLIENT_EVENTS.CALL_QUALITY_REPORT` dépendait de `[callId, qualityStats]`.
  Or `qualityStats` est un NOUVEL objet à chaque tick du monitoring (`updateInterval`, 2000ms pour le seul
  appelant réel `VideoCallInterface.tsx`) — chaque changement de référence démonte et recrée le
  `setInterval` de 10s, qui n'a donc jamais l'occasion de survivre jusqu'à son propre déclenchement (un
  timer de 10s armé à T est toujours nettoyé à T+2s avant de pouvoir tirer). **Conséquence : le client web
  n'émettait jamais réellement `call:quality-report` en production**, ce qui rend inopérants côté web à la
  fois le suivi `qualityDegradedStreaks` du gateway (tout le sujet du leak-fix de la Vague 15 — sans objet
  pour web puisque l'entrée n'est jamais créée) et la télémétrie "data/qualité réseau" persistée sur le
  résumé d'appel que les commentaires du code attribuent explicitement à cet event. **Pourquoi ça a survécu
  aux tests** : le test existant (`emits CALL_QUALITY_REPORT every 10s`) fait un seul
  `jest.advanceTimersByTime(10_000)` — les fake timers de Jest déclenchent tous les callbacks dus en un
  seul batch synchrone, sans laisser React re-rendre/reflow les effets entre chaque tick de 2s ; l'effet
  dépendant de `qualityStats` n'est donc recréé qu'UNE fois pendant tout le test au lieu de 5 fois comme en
  production réelle — artefact de fake-timer identique en substance à l'"illusory coverage" déjà documenté
  côté iOS (source-grep) mais ici une variante timer JS. Le contraste : `use-adaptive-degradation.ts`
  documente et gère EXPLICITEMENT la même sémantique "nouvel objet à chaque tick" via un `lastSampleRef`
  plutôt que comme dépendance d'effet nue — preuve que le pattern était compris ailleurs dans le fichier
  voisin, juste raté ici. **Fix** : nouveau `qualityStatsRef` (mis à jour à chaque render, miroir du
  pattern `actionsRef` déjà utilisé dans `use-adaptive-degradation.ts`) ; l'effet d'émission ne dépend plus
  que de `[callId]` et lit `qualityStatsRef.current` à l'intérieur du callback d'intervalle. **Test TDD**
  (`use-call-quality.test.ts`) : nouveau cas qui avance le temps par pas de 1s (`updateInterval` par défaut)
  dans des `act()` SÉPARÉS (donc avec un vrai flush de rendu/effet entre chaque tick, contrairement à
  l'ancien test single-shot) — reproduit exactement la fenêtre de production. RED confirmé (`git stash` du
  seul fix source → 0 appel à `emit` après 10×1s), GREEN restauré. Suite `use-call-quality.test.ts` :
  40/40 (+1). Suite web filtrée `*[Cc]all*`/`*webrtc*`/`*quality*` : 21 suites, 428/428 tests verts (+1 vs
  Vague 20). `tsc --noEmit` web : 1513 erreurs avant/après (identique, confirmé par comparaison directe
  `git stash`), aucune nouvelle.
- **iOS (lecture seule, aucun changement)** : non audité cette session au-delà de la confirmation qu'aucun
  commit iOS n'a touché les fichiers d'appel depuis la Vague 20 (pas de toolchain Swift/Xcode dans cet
  environnement Linux).
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `negotiate()` guard `makingOffer` spéculatif, threading complet du `ttl` TURN à
  travers tous les événements call (`forceEndCall` room Socket.IO résolu par la Vague 22 ci-dessus).

## Vague 24 — disconnect-grace missed calls never notified (gateway) + stale perfect-negotiation state on participant rejoin (web) (2026-07-07)

Point d'entrée : routine calling-feature. `git log` confirme HEAD (`0ea62a8`) inchangé depuis la Vague 23 —
cette branche pointait déjà sur le même commit que `origin/main`. Trois agents d'exploration dédiés
(lecture seule, mandatés à falsifier tout candidat contre ce fichier + `lessons.md` avant de rapporter,
lancés en parallèle) : cartographie complète de la pile d'appel iOS (aucune régression trouvée,
confirmation que l'`actor CallEventQueue` évoqué par l'ADR SOTA n'existe pas encore sous ce nom — candidat
pour une future session avec toolchain Swift), audit gateway, audit web.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.leaveParticipationAndBroadcast()`
  (le chemin partagé qui termine un appel quand le socket d'un participant tombe et ne revient pas, couvrant
  à la fois la grâce pré-réponse ~10s et la grâce post-réponse ~30s+extensions) diffusait bien `call:ended`
  et postait le résumé de chat quand `leftSession.status === 'missed'`, mais n'appelait jamais
  `this.handleMissedCall(leftSession.id)` — contrairement à ses trois siblings structurels (`call:leave`
  l.1918-1927, `call:force-leave` l.2119-2124, `call:end` l.2643-2648) qui font tous exactement cet appel
  sur la même transition de statut. `handleMissedCall()` fait deux choses : `markCallAsMissed()` (no-op
  idempotent ici, la ligne est déjà terminale) et surtout `createMissedCallNotifications()` — la
  **notification persistée** (badge/centre de notifications) pour chaque participant n'ayant pas répondu,
  distincte des pushes silencieux `call_cancel` (qui ne font que fermer l'UI CallKit) et du message de
  résumé en chat. **Scénario concret** : A appelle B ; avant que B décroche, le socket de A tombe (coupure
  réseau, app backgroundée/tuée — bien plus fréquent en pratique qu'un raccroché explicite pendant la
  sonnerie, d'où l'existant appareillage de grâce). Après `PRE_ANSWER_GRACE_MS` (10s) sans reconnexion, le
  serveur résout l'appel `missed` via exactement ce chemin. L'UI CallKit/sonnerie de B est bien fermée
  (broadcast + push silencieux), mais B ne reçoit **aucune trace persistée** qu'un appel a eu lieu — le seul
  enregistrement qui survit si B ne regardait pas l'app à cet instant précis. Aucun test n'exerçait ce cas
  (`CallEventsHandler-disconnect.test.ts` n'assertait que sur `status: 'ended'`/`'active'`, jamais sur
  `'missed'` ni sur `handleMissedCall`). **Fix** : ajout du même bloc `this.handleMissedCall(leftSession.id)`
  (catché + loggé, jamais rejeté) que les 3 siblings, juste après `postCallSummary`, gardé sur
  `dcStatus === 'missed'` uniquement. **Tests TDD** (`CallEventsHandler-disconnect.test.ts`, nouveau describe
  imbriqué) : `jest.spyOn(handler, 'handleMissedCall')` — appelé avec le bon `callId` quand `dcStatus ===
  'missed'`, jamais appelé quand `dcStatus === 'ended'`. RED confirmé (`git stash` du seul fix source → le
  test positif échoue, 0 appel), GREEN restauré. Suite gateway filtrée `[Cc]all` : 31/31 suites, 870/870
  tests verts (+2). `tsc --noEmit` gateway : 0 erreur.
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ]** `WebRTCService.createPeerConnection()`
  (`apps/web/services/webrtc-service.ts`) construisait toujours une nouvelle `RTCPeerConnection` mais ne
  réinitialisait JAMAIS l'état de perfect-negotiation (`autoNegotiate`/`makingOffer`/
  `isSettingRemoteAnswerPending`/`ignoreOffer`/`videoTransceiver`) — seul `close()` le faisait. Or
  `use-webrtc-p2p.ts` cache **un service par `participantId`** (`webrtcServicesRef`) et ne le vide QUE sur
  cleanup complet ou changement de `userId` — jamais sur le départ d'un seul participant. Un participant qui
  quitte puis **rejoint** un appel pendant qu'un autre reste connecté récupère donc la MÊME instance
  `WebRTCService`, avec `autoNegotiate` resté à `true` depuis la négociation initiale déjà aboutie. Le
  rejoin appelle `createPeerConnection()` sur cette instance réutilisée : une toute nouvelle
  `RTCPeerConnection` est créée (transceivers ajoutés par `addLocalMedia()` juste après programment un
  `negotiationneeded` navigateur), mais `autoNegotiate` étant resté vrai, ce `negotiationneeded` déclenche
  un `negotiate()` (donc un `createOffer()`/`setLocalDescription()`) CONCURREMMENT à l'appel explicite
  `createOffer()` que le hook de rejoin est déjà en train d'attendre — deux séquences d'offre indépendantes
  courent sur la même connexion ; celle qui résout en dernier gagne `pc.localDescription`, tandis que
  l'autre chemin signale quand même sa propre offre (désormais périmée) au pair via
  `CLIENT_EVENTS.CALL_SIGNAL` — le pair répond à partir d'une SDP qui ne correspond plus à ce qui est
  réellement posé en local. Net : un rejoin peut silencieusement échouer à rétablir le média, sapant
  exactement le travail de reconnexion que la Vague 20 visait à livrer, sans aucun test couvrant le chemin
  « pas de `close()` avant réutilisation ». **Fix** : réinitialisation des 5 champs de perfect-negotiation
  au DÉBUT de `createPeerConnection()` elle-même (pas seulement dans `close()`), puisque cette méthode
  construit toujours une ressource neuve et que tout état lié à une connexion antérieure y est
  catégoriquement périmé, que l'appelant ait pensé à `close()` avant ou non. **Test TDD**
  (`webrtc-service.coverage.test.ts`, nouveau describe) : `createOffer()` (arme `autoNegotiate=true`) →
  `createPeerConnection()` À NOUVEAU sans `close()` → déclenche `onnegotiationneeded` → assert
  `onLocalDescription` PAS appelé (variante du test existant l.1696 sans le `close()` intercalé, avec flush
  de microtasks car `negotiate()` est asynchrone — piège découvert en écrivant le test : sans `await
  Promise.resolve()` × 3, l'assertion passe trivialement avant que la promesse de négociation n'ait eu la
  chance de résoudre, RED silencieux). RED confirmé (`git stash` du seul fix source → 1 appel constaté au
  lieu de 0), GREEN restauré. Suite web filtrée `[Cc]all|webrtc` : 22 suites, 436/436 tests verts (+1).
  `tsc --noEmit` web : 1534 erreurs avant/après identique (confirmé par comparaison directe `git stash`),
  aucune nouvelle — bruit préexistant `(socket as unknown)`/mocks de test déjà présent partout dans ce
  fichier.
- **iOS (lecture seule, aucun changement)** : cartographie complète effectuée (CallKit, PushKit, WebRTC,
  signaling, audio session, UI, tests — voir résumé agent) ; aucun bug candidat retenu au-delà de ce qui
  était déjà connu. Piste à creuser dans une session avec toolchain Swift réel : l'`actor CallEventQueue`
  documenté dans l'ADR SOTA (`docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §10) comme
  devant sérialiser les entrées concurrentes socket/CallKit/WebRTC/réseau n'a pas été trouvé sous ce nom
  dans `CallManager.swift` — à vérifier si l'intention a été absorbée autrement (ex. `@MainActor` seul) ou
  si c'est un gap réel de l'ADR jamais implémenté. Drift documentaire mineur aussi noté :
  `apps/ios/CLAUDE.md` indique WebRTC 141.0 alors que `Package.swift`/`Package.resolved` épinglent 146.0.0.
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `negotiate()` guard `makingOffer` spéculatif, threading complet du `ttl` TURN à
  travers tous les événements call.

## Vague 25 — `forceEndOrphanedCallSession` était le 4e writer terminal à ignorer `answeredAt` (gateway) + field-name mort `poorStreak`/`goodStreak` (web, TS2353) (2026-07-07)

Point d'entrée : routine calling-feature. `git log` confirme HEAD (`119ccd8`) inchangé côté calling depuis
la Vague 24 (seul commit intermédiaire : un fix translator emoji, hors scope). Deux agents d'exploration
dédiés (gateway, web — lecture seule, mandatés à falsifier tout candidat contre ce fichier + `lessons.md`)
lancés en parallèle ; iOS non ré-audité cette session (pas de toolchain Swift/Xcode dans cet environnement).

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallService.forceEndOrphanedCallSession()`
  (`CallService.ts:338`) lisait seulement `{ startedAt, conversationId }` et écrivait
  inconditionnellement `status: CallStatus.ended` — contrairement à ses 3 siblings structurels
  (`endCall`/`leaveCall`/`markCallAsMissed`) qui branchent tous sur `answeredAt` (`wasPreAnswered`) pour
  résoudre en `missed` un appel jamais décroché. Cette méthode est le filet de sécurité de dernier
  recours de `CallEventsHandler` : (1) le catch du disconnect-handler quand `leaveCall()` échoue et 0
  participant ne reste, (2) `forceEndOrphanedCallAfterOptimisticBroadcast` — appelée à la fois quand
  `resolveParticipantIdFromCall` échoue à résoudre l'appelant sur `call:end`, et depuis le catch-all de ce
  même handler. **Scénario concret** : A appelle B ; avant que B décroche, le socket de A tombe pendant que
  sa ligne `Participant` de conversation est temporairement non résolue (course de membership), ou
  `endCall()` lève une exception (ex. `NOT_A_PARTICIPANT` déjà consommé par un autre writer terminal
  concurrent). Le gateway force-termine la session en `status: ended` au lieu de `missed`, et
  `handleMissedCall()` → `createMissedCallNotifications()` n'est jamais invoqué sur AUCUN des 3 sites
  d'appel — B ne reçoit aucune notification/badge d'appel manqué persisté pour un appel qui a réellement
  sonné sans jamais être décroché, et l'historique affiche un `status: ended`/`endReason` incohérent avec
  `direction: missed` (dérivé indépendamment de `answeredAt` par `deriveCallDirection`). Le test existant
  (`CallService.test.ts`, ex-ligne 4694) confirmait le bug : il asserte `status: CallStatus.ended`
  inconditionnellement, mock `findUnique` sans jamais sélectionner `answeredAt`.
  **Fix** : `forceEndOrphanedCallSession` sélectionne désormais `answeredAt`, calcule `wasPreAnswered =
  !session.answeredAt`, branche `status`/`endReason` exactement comme `endCall()` (une raison explicite
  non-`completed` est préservée ; seule la raison par défaut `completed` est normalisée en `missed`), et
  retourne `{ status, endReason }` en plus de `{ duration, conversationId }`. Les 3 sites d'appel dans
  `CallEventsHandler.ts` invoquent désormais `this.handleMissedCall(callId)` quand
  `forceEnded.status === CallStatus.missed` (même pattern try/catch-jamais-rejeté que les autres
  sites), et le `reason` du `CallEndedEvent` diffusé utilise `forceEnded.endReason` (résolu) au lieu du
  paramètre brut hardcodé. **Tests TDD** : `CallService.test.ts` — test existant adapté (mock avec
  `answeredAt` réel → statut `ended` toujours correctement asserté) + 2 nouveaux cas (`answeredAt: null` →
  `missed` avec raison explicite préservée / raison par défaut normalisée). `CallEventsHandler-
  disconnect.test.ts` — 2 nouveaux cas (`handleMissedCall` appelé quand `status === missed`, PAS appelé
  quand `status === ended`). RED confirmé par `git stash` du seul diff source (4 échecs : 3 sur
  `CallService.test.ts`, 1 sur `CallEventsHandler-disconnect.test.ts`), GREEN restauré. Suite gateway
  filtrée `.*[Cc]all.*\.test\.ts$` : 31/31 suites, 874/874 tests verts. `tsc --noEmit` gateway : 0 erreur.
- **[BUG RÉEL (type-correctness), web, CONFIRMÉ + CORRIGÉ]** `apps/web/hooks/use-adaptive-degradation.ts:95,104`
  — les branches catch de `suspend()`/`resume()` écrivaient `poorStreak: 0`/`goodStreak: 0`, deux champs
  qui n'existent PAS sur `DegradationState` (seuls `poorSince`/`goodSince` existent,
  `lib/calls/adaptive-degradation.ts:37-45`) — confirmé `tsc --noEmit` TS2353 "Object literal may only
  specify known properties" sur les 2 lignes, isolé via `git stash` du seul fichier source (2 erreurs
  présentes avant le fix, absentes après ; 1534→1532 sur le compte total du projet, aucune erreur
  nouvelle ailleurs). **Falsification du scénario de reproduction** : l'hypothèse initiale (un rejet
  répété hammer `getUserMedia()`/`disableVideoSend()` toutes les ~2s) a été tracée pas-à-pas contre
  `reduceDegradation` — invalidée : chaque transition optimiste (`suspend-video`/`resume-video`) met déjà
  `poorSince`/`goodSince` à `null` de façon SYNCHRONE avant même l'appel async, et le flag `state.sending`
  empêche structurellement que le champ concerné soit repeuplé pendant la fenêtre d'attente (les ticks
  reçus pendant que `sending` est encore à sa valeur optimiste retombent tous dans la branche qui ne
  touche PAS le champ que le catch tente de réinitialiser). Confirmé empiriquement : un test reproduisant
  exactement le scénario proposé passe IDENTIQUEMENT sur le code bogué et corrigé (`git stash` du seul
  fichier source, suite inchangée 7/7 verte dans les deux cas) — donc AUCUN impact runtime observable
  actuellement, uniquement un bug de type mort/latent (fragile si `reduceDegradation` change un jour sa
  logique de reset optimiste). Fix conservé (noms de champs corrects, dette de type réelle, `tsc` RED→GREEN
  comme preuve de régression pour ce type de bug) mais le rapport initial de l'agent d'audit surestimait la
  gravité runtime — corrigé ici pour ne pas polluer un futur audit avec une fausse causalité. 2 nouveaux
  tests de comportement ajoutés (`use-adaptive-degradation.test.tsx`) couvrant les branches catch
  (auparavant 0% de couverture) : revert + retry après un rejet de `suspend()`/`resume()` — passent sur
  les deux versions (couverture, pas régression), utiles pour verrouiller le comportement si
  `reduceDegradation` évolue. Suite web filtrée `.*([Cc]all|webrtc|quality|degradation).*\.test\.` :
  24/24 suites, 452/452 tests verts.
- **iOS (lecture seule, aucun changement)** : non ré-audité cette session au-delà de la confirmation
  qu'aucun commit iOS n'a touché les fichiers d'appel depuis la Vague 24.
- **Règle réutilisable** : quand un candidat de bug repose sur "un champ n'est jamais réinitialisé", ne
  pas se contenter de la preuve `tsc`/lecture statique — tracer l'ENTIÈRE fenêtre temporelle entre la
  transition optimiste et le catch (quels ticks peuvent arriver entre les deux, quelle branche du FSM ils
  empruntent) avant d'écrire le scénario de reproduction dans le rapport. Un bug de type peut être réel et
  valoir d'être corrigé (dette, fragilité future) sans que le scénario runtime dramatique décrit soit
  falsifiable — les deux affirmations (bug de type / impact runtime) doivent être vérifiées et rapportées
  séparément, jamais fusionnées par défaut.
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `negotiate()` guard `makingOffer` spéculatif, threading complet du `ttl` TURN à
  travers tous les événements call.

## Vague 26 — `call:end` recovery path bypassait le fanout d'appel + web n'émettait jamais `call:heartbeat` (2026-07-07)
(voir section suivante pour le détail — laissée en place, non dupliquée)

## Vague 27 — 3 bugs gateway (recovery + duration + push mort) + boucle self-triggering web + banner iOS non re-armée (2026-07-08)

Point d'entrée : routine calling-feature, reprise après compaction de session. `git fetch origin main`
confirme HEAD (`37d9522`) déjà à jour avec `origin/main` — aucune divergence, pas de merge à résoudre.
Trois agents d'exploration dédiés (gateway, web, iOS — lecture seule, mandatés à falsifier tout candidat
contre ce fichier + `lessons.md` avant de rapporter) lancés en parallèle.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `call:leave`/`call:force-leave` n'avaient aucun filet de
  récupération orpheline quand l'écriture terminale lève — contrairement à leur sibling `call:end`.**
  `call:end`'s catch appelle `forceEndOrphanedCallAfterOptimisticBroadcast` depuis la Vague 26 (voir
  ci-dessous) ; `call:leave` (catch top-level) et `call:force-leave` (catch par-appel dans la boucle)
  se contentaient de logger + émettre une erreur client. `CallService.leaveCall()` peut réellement lever
  (`CALL_NOT_FOUND`, une erreur DB non-transitoire dans sa transaction) — la session restait alors
  bloquée non-terminale (ACTIVE), bloquant tout `call:initiate` futur dans la conversation jusqu'au GC
  (~120s). Pour `call:force-leave` en particulier, c'est ironique : sa RAISON D'ÊTRE est de débloquer
  exactement ce genre d'appel zombie. **Fix** : les deux catch appellent désormais
  `forceEndOrphanedCallAfterOptimisticBroadcast(io, callId, userId)` (userId ré-résolu via
  `getUserId(socket.id)` dans le catch de `call:leave`, où il est hors scope du try — même pattern que
  `call:end`). **Tests TDD** : 2 nouveaux cas (un par handler), RED confirmé par lecture (0 appel avant
  fix) puis GREEN. Suite gateway filtrée `[Cc]all` : 31/31 suites, 880/880 tests verts.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `duration` incohérent entre 3 writers terminaux
  (ring+talk time) et `endCall()` (talk time seul).** `endCall()` calcule
  `duration = call.answeredAt ? (endedAt-answeredAt) : 0`. Trois siblings — `forceEndOrphanedCallSession`,
  et les 2 branches de `leaveCall` (idempotente + principale) — calculaient tous
  `duration = now - startedAt` INCONDITIONNELLEMENT, incluant le temps de sonnerie et ignorant
  `wasPreAnswered` (déjà utilisé par ces mêmes méthodes pour le statut/endReason depuis les Vagues 19/25,
  juste jamais étendu à `duration`). Un même appel réel (55s de sonnerie + 5s parlé) affiche donc
  `duration=60` s'il se termine via `leaveCall`/force-end, mais `duration≈5` via le bouton "Terminer" —
  et ce champ alimente directement la bulle résumé chat + l'historique (`createCallSummaryMessage`). Le
  test existant de `forceEndOrphanedCallSession` encodait littéralement le bug
  (`expect(result?.duration).toBeGreaterThanOrEqual(42)` avec startedAt=42s/answeredAt=30s dans la
  fixture) — recadré sur l'invariant corrigé (talk-time ~30s) plutôt que contourné, cf. Leçon 58.
  **Fix** : les 3 sites anchorent désormais sur `answeredAt` (0 si jamais répondu), miroir exact de
  `endCall()`. **Tests TDD** : 3 tests adaptés + 2 nouveaux (fixtures avec `startedAt`/`answeredAt`
  délibérément écartés de 60s pour qu'un anchor startedAt-régressé échoue bruyamment plutôt que par
  coïncidence). RED confirmé (2 échecs avant fix sur les tests adaptés), GREEN restauré. Suite
  `CallService.test.ts` : 183/183 verts.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ] Push silencieux "call_answered_elsewhere" mort depuis
  l'introduction du FSM Item F.** Ce push (notifie les AUTRES devices de l'answerer pour qu'ils arrêtent
  de sonner — utile pour un device réveillé par VoIP push dont le WebSocket n'est jamais monté) était
  gaté dans `call:join` sur `callSession.status === 'connecting'`. Or `CallStatus.connecting` n'est plus
  JAMAIS écrit en production depuis l'Item F (`joinCallAttempt` ne transitionne que
  `initiated/ringing → ringing`) — confirmé par grep exhaustif de tout `status: CallStatus.connecting`
  dans `services/gateway/src`. Condition en permanence fausse : mort depuis l'introduction du FSM Item F
  (Vague 7/8), jamais détecté par 26 vagues d'audit car aucune n'avait vérifié qu'une condition de statut
  correspondait à un statut RÉELLEMENT écrit quelque part. **Fix** : relocalisé vers le vrai site de
  transition (`call:signal`, type `answer`, juste avant `updateCallStatus(active)`) — gaté sur
  `isFirstAnswer = !callSession.answeredAt` (lu AVANT la mise à jour, donc jamais re-déclenché par une
  renégociation ultérieure, ex. activer la vidéo en cours d'appel) et `userId !== callSession.initiatorId`
  (jamais pour la propre réponse de l'initiateur). Les tests de l'ancien site (fixture `status: 'connecting'`,
  qui n'arrive jamais en vrai) ont été supprimés et reconstruits sous `call:signal` avec la fixture
  correcte (`answeredAt: null` = première réponse / `answeredAt: <date>` = renégociation). 4 tests
  (premier answer → push ; renégociation → pas de push ; initiateur → pas de push ; échec push
  n'interrompt pas l'ack). RED confirmé sur le cas nominal (0 appel avant fix), GREEN restauré.
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ] `use-call-quality.ts` : boucle self-triggering sur transition de
  niveau de qualité, indépendante de `updateInterval`.** `updateStats` dépendait de `qualityStats?.level`
  (uniquement pour un log de debug comparant l'ancien/nouveau niveau). Chaque VRAIE transition de niveau
  (excellent↔bon↔correct↔mauvais) changeait donc l'identité de `updateStats`, ce qui redéclenchait
  l'effet de monitoring (qui dépend de `updateStats` et appelle inconditionnellement un "Initial update"
  à chaque exécution) — un appel `getStats()` hors-bande, sans rapport avec `updateInterval`. Sur une
  connexion réellement instable (exactement le cas que ce moniteur existe pour détecter), cet appel
  supplémentaire peut lui-même produire un niveau différent et boucler indéfiniment (reproduit dans un
  test : timeout par dépassement de boucle infinie). Sibling du bug déjà corrigé Vague 23 dans le même
  fichier (l'effet d'émission `CALL_QUALITY_REPORT` à 10s), mais un mécanisme distinct (l'effet de
  MONITORING ici, pas celui d'émission). **Fix** : miroir du pattern `qualityStatsRef` déjà utilisé 20
  lignes plus bas dans le même fichier — un nouveau `previousLevelRef` remplace la dépendance directe,
  `updateStats` ne dépend plus que de `[peerConnection, calculateQualityLevel]`. **Test TDD** : nouveau
  cas (niveau alterné à chaque `getStats()`, `updateInterval` volontairement énorme pour isoler tout
  appel hors-timer) — RED confirmé par timeout (boucle infinie réelle, pas juste une assertion), GREEN
  restauré. Suite `use-call-quality.test.ts` : 41/41 verts. Suite web filtrée
  `.*(call|webrtc|quality).*\.test\.` : 23 suites/440 tests verts (+1). `tsc --noEmit` web : 1532 erreurs
  avant/après identique (confirmé par diff des lignes touchées), aucune nouvelle.
- **[BUG RÉEL, iOS, CONFIRMÉ (lecture seule, pas de toolchain Swift ici — fix mécanique appliqué par
  inspection) — timer d'auto-dismiss de `CallWaitingBannerView` non ré-armé quand un 3e appelant
  supplante un 2e en attente.]** Le fix du jour même (commit `97c94dc`, "third caller silently dropped")
  fait que `rejectSupersededPendingCall` termine proprement le 2e appelant côté serveur et écrase
  `pendingIncomingCall` avec le 3e — mais `showCallWaitingBanner` reste `true` tout du long, donc SwiftUI
  RÉUTILISE la même identité de vue : `onAppear`/`scheduleAutoDismiss()` ne se redéclenche pas, et le
  `Task` de 15s armé pour le 2e appelant continue son compte à rebours inchangé. **Scénario concret** : A
  en appel actif ; B appelle (banner, timer à 15s) ; à T+10s, C appelle pendant que B attend encore —
  B est proprement raccroché serveur, mais le Task original (toujours armé pour B) tire à T+15s (5s
  seulement dans le ring réel de C) et auto-rejette C au lieu de B. Aucune trace dans `lessons.md`/backlog
  (classe de bug introduite par le fix du jour même, jamais auditée avant). **Fix appliqué** (mécanique,
  un seul modifier SwiftUI par site, 2 sites identiques) : `.id(callManager.pendingIncomingCall?.callId)`
  ajouté aux deux mounts (`RootView.swift`, `iPadRootView+Sheets.swift`) — force un remount (donc un
  ré-armement du timer) à chaque supersession. **Non vérifié par compilation** (environnement Linux sans
  Xcode) — la CI `ios-tests` (macOS) reste le garde-fou définitif ; changement volontairement borné à un
  seul modifier de vue par site pour rester dans l'enveloppe "mécanique, vérifiable par lecture" des
  sessions sans toolchain (cf. `lessons.md`, règle post-2026-07-02).
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `negotiate()` guard `makingOffer` spéculatif, threading complet du `ttl` TURN à
  travers tous les événements call.

## Vague 26 — `call:end` recovery path bypassait le fanout d'appel + web n'émettait jamais `call:heartbeat` (2026-07-07)

Point d'entrée : routine calling-feature. `git log` confirme HEAD (`ec73d65`) inchangé côté calling depuis
la Vague 25. Trois agents d'exploration dédiés (gateway, web, iOS — lecture seule, mandatés à falsifier
tout candidat contre ce fichier + `lessons.md` avant de rapporter, lancés en parallèle) : iOS n'a rien
trouvé de nouveau (aucun commit iOS sur les fichiers d'appel depuis la Vague 24, hormis la feature bulle
swipe-to-collapse déjà couverte par son propre design doc — pas de toolchain Swift/Xcode dans cet
environnement de toute façon).

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `forceEndOrphanedCallAfterOptimisticBroadcast` (le chemin
  de récupération de `call:end` quand l'ender ne résout pas en participant, OU quand `endCall()` lève)
  bypassait `broadcastCallEnded()`** — sibling-drift confirmé contre son jumeau exact, le chemin de
  force-cleanup sur disconnect (`CallEventsHandler.ts` ~l.667-682), qui fait déjà
  `broadcastCallEnded` (clearQualityDegradedStreaks + fanout call+conversation+chaque user room membre,
  la même audience que `call:initiated`) + `postCallSummary` + `handleMissedCall` conditionnel. La
  méthode de récupération de `call:end`, elle, ne faisait QUE le force-end DB + `handleMissedCall`
  conditionnel — sautant entièrement le fanout large, le nettoyage quality-streak, et le message de
  résumé en chat. Le fast-path optimiste de `call:end` (avant l'écriture autoritative) ne notifie QUE la
  call room, et seulement si l'émetteur y est déjà — un callee encore en sonnerie (jamais dans la call
  room, souvent pas non plus dans la conversation room) ne recevait donc AUCUNE notification de fin
  d'appel sur ce chemin de récupération précis : exactement l'incident prod 2026-07-03 06:14 que
  `broadcastCallEnded` existe pour prévenir, réouvert par un chemin différent. **Fix** :
  `forceEndOrphanedCallAfterOptimisticBroadcast` prend maintenant `io` + `endedBy` en paramètres et
  mirrore exactement le chemin disconnect — `broadcastCallEnded` + `postCallSummary` + `handleMissedCall`
  conditionnel sur statut `missed`. Les 2 sites d'appel (branche `NOT_A_PARTICIPANT`, catch-all de
  `endCall()`) passent désormais `io` et `userId` (ré-résolu via `getUserId(socket.id)` dans le catch,
  `userId` du `try` n'étant pas visible dans son scope). **Tests TDD** (`CallEventsHandler.test.ts`,
  describe `call:end`) : 2 nouveaux cas (un par site d'appel) asserting le fanout large
  (`io.to` avec call+conversation+chaque user room membre) + le résumé chat posté (`messageBroadcaster`).
  RED confirmé (`git stash` du seul fix source → les 2 échouent, `io.to` jamais appelé avec l'audience
  large), GREEN restauré. Suite gateway filtrée `.*[Cc]all.*\.test\.ts$` : 31/31 suites, 876/876 tests
  verts (+2). `tsc --noEmit` gateway : 0 erreur.
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ] Web n'émettait JAMAIS `call:heartbeat`** — `stores/call-store.ts`
  définit `startHeartbeat`/`stopHeartbeat` (intervalle 15s, miroir du contrat iOS
  `CallManager.startHeartbeat()`) mais AUCUN composant monté ne les appelait (confirmé : seul le fichier
  de test du store référence `startHeartbeat`). Le tier GC de `CallCleanupService` (gateway) traite
  `hasHeartbeatData`/`recordHeartbeat` comme le signal de liveness ; sans lui, un appel purement web↔web
  n'a jamais d'entrée heartbeat sur AUCUN participant — indiscernable pour le GC d'un zombie authentique
  une fois la fenêtre de grâce post-boot passée, donc un appel web↔web sain de plus de ~2 minutes se
  faisait force-terminer (`endReason: heartbeatTimeout`) malgré un média P2P parfaitement fonctionnel.
  Drift protocolaire iOS/web jamais détecté par les audits précédents (focalisés sur le drift
  gateway-side, pas sur "cette obligation client est-elle seulement implémentée"). **Fix** :
  `CallManager.tsx` (composant réellement monté, cf. vague 10) — nouvel effet démarrant
  `startHeartbeat(currentCall.id)` dès que `isInCall && currentCall?.id`, cleanup `stopHeartbeat()` au
  départ (déjà redondant avec le `reset()` du store qui stoppe aussi l'intervalle, mais symétrique avec le
  pattern des autres effets du fichier). **Test TDD** (nouveau fichier
  `CallManager.heartbeat.test.tsx`, miroir du pattern `CallManager.reconnect.test.tsx`) : 3 cas (émet
  `call:heartbeat` toutes les 15s en appel actif / n'émet rien sans appel actif / s'arrête après
  `reset()`). RED confirmé (`git stash` du seul fix source → 2/3 rouges, le socket n'émettait que
  `call:check-active`), GREEN restauré. Suite web filtrée `.*(call|webrtc|quality).*\.test\.` : 23
  suites/439 tests verts (+1 suite/+3 tests). `tsc --noEmit` web : 1532 erreurs avant/après identique
  (confirmé par `git stash` du seul diff source), aucune nouvelle.
- **iOS (lecture seule, aucun changement)** : aucun bug candidat retenu — voir résumé agent en tête de
  section. `actor CallEventQueue` (ADR SOTA) toujours absent du code sous ce nom, gap déjà documenté.
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, `negotiate()` guard `makingOffer` spéculatif, threading complet du `ttl` TURN à
  travers tous les événements call.

## Vague 28 — `negotiate()` guard `makingOffer` speculative item finally verified real (web) + cross-platform verification near-miss on `call:force-leave` (2026-07-08)

Point d'entrée : routine calling-feature (agent Cowork non interactif, PHASE 1-12 mandate). `git log`
confirme HEAD (`1b28c39`) déjà à jour avec `origin/main`, 2 commits après `b62f4ba` (Vague 27's aggregate),
tous deux hors scope calling (Android empty-state, mentions). Trois agents d'exploration dédiés (iOS
CallManager/WebRTC core, iOS call UI screens, gateway signaling/backend) lancés en parallèle, lecture
seule, mandatés à croiser tout candidat contre ce fichier + `lessons.md`.

- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, TDD] Le `negotiate()` guard `makingOffer` spéculatif (noté "non
  vérifié comme atteignable en pratique" depuis la Vague 19, jamais retraité en 8 vagues) est réel et a
  été corrigé.** `WebRTCService.negotiate({iceRestart:true})` (`apps/web/services/webrtc-service.ts:759`)
  droppait silencieusement un ICE restart si le guard de ré-entrance `makingOffer` était déjà posé par une
  renégociation SANS RAPPORT en vol (ex. le `onnegotiationneeded` d'un A/V switch). Scénario concret :
  `oniceconnectionstatechange` passe à `'failed'` pendant qu'une offre d'A/V switch attend son
  `createOffer()`/`setLocalDescription()` (potentiellement lent) → `restartIce()` →
  `negotiate({iceRestart:true})` retourne immédiatement sans jamais relancer la collecte ICE — aucun
  filet, aucun retry, la connexion reste `failed` pour toujours (l'A/V switch qui complète ensuite ne
  régénère pas de nouvel ufrag/pwd puisqu'il n'est pas lui-même un ICE restart). Cette classe de bug
  ("un appel établi ne doit jamais mourir d'une condition transitoire/racy") est exactement celle que la
  routine a corrigée à répétition côté gateway (`TARGET_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`) — jamais
  vérifiée côté web jusqu'ici faute de scénario de repro écrit. **Fix** : nouveau flag
  `pendingIceRestart` — un ICE restart dropé par le guard est mémorisé au lieu d'être perdu ; le bloc
  `finally` de `negotiate()` le rejoue automatiquement (`void this.negotiate({iceRestart:true})`,
  fire-and-forget avec `.catch` miroir du pattern `restartIce().catch()` déjà utilisé ailleurs dans le
  fichier) une fois l'offre en vol réglée — sans boucle infinie (le flag n'est consommé qu'une fois, la
  relecture elle-même ne peut pas se re-marquer sauf nouvelle collision réelle). Reset ajouté aux 2 points
  de remise à zéro existants de l'état perfect-negotiation (`createPeerConnection` reuse-sans-close et
  `close()`), miroir exact des 4 autres flags (`makingOffer`/`isSettingRemoteAnswerPending`/`ignoreOffer`/
  `autoNegotiate`). **Test TDD** (`webrtc-service.coverage.test.ts`, describe `negotiate`) : offre A/V
  switch mise en pause (`createOffer` hangé), ICE restart concurrent → dropé (0 second `createOffer`
  avant résolution) → résolution de la 1ʳᵉ offre → le restart est rejoué automatiquement
  (`createOffer` appelé 2×, 2e appel avec `{iceRestart:true}`). RED confirmé (0 échec de la suite avant
  le fix ne suffisait pas à prouver le bug — nouveau test écrit AVANT le fix source, `toHaveBeenCalledTimes(2)`
  échouait avec `1` reçu), GREEN restauré. Suite `webrtc-service.coverage.test.ts` +
  `webrtc-service.test.ts` : 170/170. Suite web filtrée `.*(call|webrtc|quality).*\.test\.` : 23
  suites/442 tests verts (+1 vs Vague 27). `tsc --noEmit` web : 1201 erreurs identiques avant/après sur
  `webrtc-service.ts` (0 nouvelle erreur sur ce fichier, confirmé par grep ciblé).
- **[FAUX POSITIF confirmé, gateway] `call:toggle-video` "skips the audio-only privacy gate"
  n'est PAS un bug — c'est la feature FIX 7 (Vague "2026-07-02 (suite)") qui fonctionne comme prévu.**
  Un agent d'exploration gateway a rapporté en HIGH que `updateParticipantMedia`/le handler
  `call:toggle-video` n'appliquent aucun gate "call.metadata.type === 'video'" avant d'écrire
  `isVideoEnabled: true`, contrairement au gate join-time (`joinCallAttempt`, audit 2026-07-07). Vérifié
  FAUX par lecture complète + confrontation à ce fichier : le join-time gate protège contre un
  `videoEnabled: true` **implicite/non consenti** envoyé automatiquement par un client au moment de
  répondre à un appel audio (état client périmé, la victime n'a fait qu'appuyer sur "répondre" à un appel
  qu'elle croit audio). `call:toggle-video {enabled:true}` mid-call est au contraire une action
  **utilisateur explicite** (bouton caméra local, `CallManager.toggleVideo` iOS / `CallControls` web) —
  et la Vague "FIX 7" (2026-07-02) documente EXPLICITEMENT ce chemin comme une feature livrée et testée
  ("l'user a activé sa caméra pendant l'appel audio → renégociation entrante OK... l'affichage du flux
  distant fonctionne partout"). Appliquer le gate suggéré aurait cassé cette feature shippée. **Règle
  réutilisable** : un event `X:Y {enabled:true}` déclenché par un bouton UI explicite et un champ du même
  nom écrit implicitement à une transition d'état (join/answer) NE partagent PAS le même modèle de
  consentement, même s'ils appellent la même méthode service — vérifier QUI déclenche l'event
  (action utilisateur explicite vs valeur par défaut héritée d'un client) avant de proposer un gate
  symétrique. Non corrigé (à raison) ; noté ici pour ne pas re-flaguer.
- **[NEAR-MISS méthodologique, gateway+iOS, aucun changement net] `SERVER_EVENTS.CALL_FORCE_LEAVE`
  ('call:force-leave' server→client) a failli être supprimé comme "mort" — vérification cross-repo a
  révélé un récepteur iOS réel et testé.** Un agent gateway a rapporté ce type/const comme
  "aspirationnel, jamais émis" (grep gateway + web : zéro émetteur, commentaire source disant
  "no emitter yet"). Suppression appliquée puis **annulée** après avoir grep `apps/ios` (pas fait par
  l'agent, scope gateway/web uniquement) : `MessageSocketManager.swift:3052` écoute bien
  `socket.on("call:force-leave")` server→client, publie via `callForcedLeave` (Combine), et
  `CallManager.swift:3689` s'y abonne — le tout couvert par une suite de tests dédiée
  (`CallManagerTests.swift:3230-3276`, vérifie teardown `.remote` + report CallKit). Investigation
  complémentaire (safe, lecture seule) : `CallCleanupService.forceEndCall` (le seul chemin qui aurait dû
  émettre ce SERVER_EVENTS-là) broadcast en réalité `call:ended` à la même audience large
  (call+conversation+user rooms, cf. Vague 15/26) — donc le récepteur iOS `callForcedLeave`, bien que
  réel et testé, est aujourd'hui **inatteignable en pratique** (le serveur ne l'émet jamais, `call:ended`
  couvre déjà le même besoin UX). Ni clairement mort (receiver réel, testé, documenté) ni clairement
  manquant (`call:ended` fait déjà le travail) — **aucun changement appliqué**, ambiguïté non tranchée
  volontairement plutôt que de deviner. **Leçon méthodologique pour la prochaine session** : avant de
  supprimer une déclaration TS "SERVER_EVENTS.X, jamais émis" repérée par un audit gateway/web-only,
  grep AUSSI `apps/ios` et `packages/MeeshySDK` pour un récepteur `socket.on("...")`/Combine correspondant
  — "aucun émetteur" côté serveur ne prouve pas que la déclaration est morte si un client a déjà construit
  et testé le côté réception en attendant l'implémentation serveur. Décision produit à trancher dans une
  session future : émettre réellement `call:force-leave` en plus de `call:ended` (défense en profondeur,
  risque de double-traitement à gérer) OU supprimer le récepteur iOS mort (nécessite Xcode pour vérifier
  qu'aucun autre test/appelant n'en dépend).
- **[iOS, lecture seule, aucun changement — nécessite Xcode]** Deux agents dédiés (CallManager/WebRTC core,
  UI/accessibilité) ont audité l'intégralité de la pile iOS. Aucun changement appliqué (toujours pas de
  toolchain Swift/Xcode dans cet environnement) ; findings consignés pour une session avec accès macOS :
  - `CallManager.switchCamera()`/`selectCamera(id:)` posent `isUsingFrontCamera` de façon optimiste AVANT
    que `WebRTCService.switchCamera()` (fire-and-forget) confirme — un échec (format caméra indisponible,
    thermal throttling) laisse le flag à la mauvaise valeur pour le reste de l'appel (preview mirroré à
    tort, cf. contrat §7.7 "bug k"). Même pattern sur `toggleSpeaker()`/`applyRouteOverride` (sévérité
    moindre, `handleAudioRouteChange` peut se re-corriger sur un futur route-change).
  - `CallManagerTests.swift`/`CallManagerAudioSessionTests.swift` (~800 assertions cumulées) sont des
    tests "source-reflection" (regex/substring sur le texte source du fichier, zéro instanciation réelle
    de `CallManager`/`CXProvider`) — déjà documenté par une note d'audit du 2026-07-06, toujours vrai,
    toujours hors de portée sans compilateur (nécessite d'abstraire `CXProvider`/`CXCallController`
    derrière un protocole injectable).
  - UI/accessibilité (8 findings, triés par sévérité) : `IncomingCallView`/`CallWaitingBannerView` sans
    fallback landscape/Dynamic-Type (risque de clipper les boutons Accepter/Refuser — safety-critical) ;
    `CallsTab`'s `CallRowDialButton` (40×40, sous les 44pt HIG) et filter chips (~28-30pt) sous le tap
    target minimum ; `BubbleCallNoticeView` hardcode `indigo500` au lieu de recevoir `accentColor` en
    paramètre (violation de la règle documentée SDK/app) ; `CallDetailSheet`/`CallSummaryDetailSheet`
    sans plafond de largeur iPad/Mac (contrairement à `FloatingCallPillView`'s 560pt déjà établi) ;
    `CallsTab`'s `.accessibilityElement(children: .combine)` rend le menu "Rappeler" inatteignable en
    VoiceOver. Aucun n'est un crash/perte de données — reportés pour une session avec Xcode plutôt que
    risqués en aveugle (cf. lessons.md : édits Swift mécaniques uniquement, vérifiables par lecture, dans
    cet environnement).
- **Reste ouvert (inchangé sauf `negotiate()` retiré, ajout `call:force-leave`)** : items J (validation
  device réel), C6 (court-circuit dédup cosmétique), CALL-DIAG retagging, threading complet du `ttl` TURN
  à travers tous les événements call, `call:force-leave` server-emit ambiguïté (voir ci-dessus), 5 findings
  iOS structurels listés ci-dessus (nécessitent Xcode).

## Vague 29 — 4 des 8 findings iOS UI/accessibilité de la Vague 28 corrigés mécaniquement (lecture seule, toujours pas de toolchain Swift) (2026-07-08)

Toujours pas de Swift/Xcode dans cet environnement — seuls les 4 findings de la Vague 28 qui sont des
édits mécaniques, à un seul fichier, vérifiables intégralement par lecture (renommage de paramètre,
changement de constante numérique, déplacement de modifier) ont été appliqués. Les 2 restants (route
`switchCamera`/`toggleSpeaker` optimiste, tests source-reflection `CallManagerTests`) et le finding
landscape/Dynamic-Type d'`IncomingCallView`/`CallWaitingBannerView` (nécessite un nouveau pattern
`verticalSizeClass` jamais utilisé ailleurs dans la codebase — pas un simple mirroring, donc hors
scope sans compilateur pour vérifier le layout réel) restent des follow-ups Xcode.

- **[FIX RÉEL, iOS, mécanique] `BubbleCallNoticeView`/`CallSummaryDetailSheet` hardcodaient
  `MeeshyColors.indigo500`** au lieu de recevoir l'accent de la conversation — violation de la règle
  documentée (`apps/ios/CLAUDE.md` "Conversation Accent Color" : tout composant conversation-context DOIT
  utiliser `accentColor`, jamais une couleur codée en dur). Fix : nouveau paramètre `accentHex: String`
  (mirroring exact de `BubbleQuotedReply.accentHex`), threadé dans `CallNoticePresentation.tint` (cas
  `.completed`), `callBackButton`, `qualityRow`/`detailRow` (icônes). `ThemedMessageBubble.swift:200`
  passe désormais `accentHex: contactColor` (même valeur que tous les autres sous-composants Bubble).
  `qualityColor` (indigo400 pour le palier "bonne" qualité réseau) intentionnellement PAS touché — c'est
  une échelle sémantique à 4 paliers (excellent/bonne/moyenne/faible), pas une teinte de conversation.
- **[FIX RÉEL, iOS, mécanique] `CallsTab.CallRowDialButton` (40×40pt) et les filter chips (~27-30pt de
  haut) sous le tap target minimum HIG (44×44pt).** Fix : `CallRowDialButton.frame` 40→44 ; les chips
  gardent leur taille visuelle (padding horizontal 14/vertical 7 inchangé) mais gagnent
  `.frame(minHeight: 44).contentShape(Rectangle())` pour élargir la zone tactile sans changer l'esthétique
  du pill compact.
- **[FIX RÉEL, iOS, mécanique] `CallsTab.CallJournalRow`'s `.accessibilityElement(children: .combine)`
  groupait TOUTE la ligne (bouton nom/avatar + `CallRowDialButton`) en un seul élément VoiceOver** — le
  menu "Rappeler" (avec son propre `accessibilityLabel`/`Hint`) devenait inatteignable, absorbé dans le
  libellé combiné de la ligne. Fix : le `.accessibilityElement(children: .combine)` +
  `.accessibilityLabel` (+ le `.contentShape(Rectangle())` associé) sont maintenant scopés au seul
  `Button(action: onTap)` (nom/avatar/direction) ; `CallRowDialButton` reste un élément VoiceOver séparé
  et atteignable, hors du HStack combiné.
- **[FIX RÉEL, iOS, mécanique] `CallDetailSheet`/`CallSummaryDetailSheet` sans plafond de largeur
  iPad/Mac** — sur une fenêtre large, les `Spacer()` des `redialButtons`/`detailRow`/`callBackButton`
  s'étirent bord à bord au lieu de rester un enregistrement centré et lisible. Fix : mirroring du
  plafond déjà établi par `FloatingCallPillView` (560pt) — `.frame(maxWidth: 560).frame(maxWidth:
  .infinity)` sur le VStack de contenu des deux sheets (cap puis centrage explicite, indépendant du
  comportement par défaut du `ScrollView` sur l'axe perpendiculaire). Pleine largeur inchangée sur
  iPhone (<560pt).

## Vague 30 — callee's own incoming-call timeout was dead code (web) (2026-07-09)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` confirme HEAD (`236f8ca6`) à jour, aucune divergence. Trois agents d'exploration dédiés
(iOS CallManager/WebRTC core, gateway CallEventsHandler/CallService, web webrtc-service/CallManager.tsx)
lancés en parallèle, lecture seule, mandatés à falsifier tout candidat contre ce fichier + `lessons.md`
avant de rapporter.

- **iOS** : aucun bug neuf retenu. Trois pistes soulevées (PushKit registry sur `.main` queue — trade-off
  déjà documenté dans le code, pas un oversight ; double hop MainActor redondant `P2PWebRTCClient`→
  `WebRTCService` — inefficacité mineure, pas un bug de correction ; double chemin de settlement de
  `CXAnswerCallAction` — fragile par construction mais fonctionne aujourd'hui, aucun test ne l'exerce)
  sont documentées ici pour une session future avec Xcode, aucune n'a été appliquée à l'aveugle (pas de
  scénario de repro falsifiable sans device/compilateur). Zéro retain cycle, force-unwrap ou API dépréciée
  trouvé — cette pile est déjà très mature (annotations d'audit P0-P3 partout, ~600 tests ciblés).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, TDD] Le timeout 30s d'auto-dismiss de la bannière d'appel entrant
  du CALLEE était du code mort.** `apps/web/components/video-call/CallManager.tsx`, `startCallTimeout`'s
  callback (déjà réputé fragile depuis le fix initiateur de la Vague 16 — voir la note à ce sujet dans ce
  même fichier) garde sur `useCallStore.getState().{isInCall,currentCall}`. Le branch callee de
  `handleIncomingCall` (l.213-224, `else` du check `isInitiator`) appelle seulement `setIncomingCall(event)`
  + `startCallTimeout(event.callId)` — jamais `setCurrentCall`/`setInCall` (réservés à `handleAcceptCall`).
  Donc pour TOUT appel entrant jamais répondu, le guard voit `isInCall=false`/`currentCall=null` et
  retourne avant d'atteindre `setIncomingCall(null)` — la bannière de sonnerie (boutons Accepter/Refuser)
  ne se referme JAMAIS via ce timer. Seul `handleCallEnded` (réception de `call:ended`) la referme encore ;
  un callee dont le socket est transitoirement déconnecté quand l'appelant raccroche/timeout serveur (60s)
  rate ce fanout — `call:check-active` ne rejoue que les appels ENCORE en sonnerie, jamais les événements
  terminaux — et la bannière reste bloquée indéfiniment avec Accepter/Refuser actifs sur un appel mort
  (tap Accepter → `call:join` rejeté, toast "Failed to join call" déjà connu de la Vague 19).
  Sibling exact du bug initiateur de la Vague 16, jamais revisité sur le branch callee en 29 vagues
  (confirmé par grep du backlog entier pour "callee"+"timeout"/"CallNotification" — seuls des findings
  iOS bannière sans rapport ressortent). **Fix** : le callback du timeout efface désormais son propre
  `incomingCall` (par callId, `setIncomingCall(current => current?.callId === callId ? null : current)`)
  AVANT le guard store — no-op pour l'initiateur (dont `incomingCall` n'est jamais posé). Le guard
  store existant reste inchangé pour la branche initiateur (emit `call:leave` + `reset()`), qui ne
  s'applique jamais au callee (jamais dans le call-store tant qu'il n'a pas accepté). **Tests TDD**
  (nouveau fichier `CallManager.calleeTimeout.test.tsx`, miroir du pattern `CallManager.initiatorTimeout.
  test.tsx`) : 2 cas — la bannière se referme après 30s malgré `isInCall`/`currentCall` jamais posés ;
  aucun `call:leave` n'est émis pour un callee qui n'a jamais rejoint. RED confirmé (nouveau test échoue
  sur le code non modifié — bannière encore présente après avance des timers), GREEN restauré. Suite
  `__tests__/components/video-call/` : 6 suites/23 tests verts (+1 suite/+2 tests). Suite web filtrée
  `.*(call|webrtc|quality).*\.test\.` : 24 suites/451 tests verts (+1 suite/+2 tests vs Vague 29).
  `tsc --noEmit` web : 1193 erreurs identiques avant/après (confirmé par `git stash` du seul fichier
  source, diff de compte nul), aucune nouvelle — toutes préexistantes sur du typage `unknown` du socket,
  non liées à ce fix.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `CallCleanupService.forceEndCall` (GC) calculait encore
  `duration` depuis `startedAt` inconditionnellement — le sibling que le fix duration de la Vague 27 avait
  raté.** Vague 27 avait ancré `endCall()`/`leaveCall()` (2 branches)/`forceEndOrphanedCallSession()` sur
  `answeredAt` (talk time), mais `forceEndCall` vit dans un fichier/classe différent
  (`CallCleanupService.ts`, pas `CallService.ts`) et n'avait jamais été touché — même classe de bug sibling-
  drift que la Vague 15 (`clearQualityDegradedStreaks`) et la Vague 22 (éviction de room) avaient déjà
  trouvée dans cette même fonction. **Scénario concret** : le tier 1 du GC (cron 60s) force-termine en
  `missed` tout appel encore `initiated`/`ringing` après 120s — par définition JAMAIS répondu
  (`answeredAt` est `null`) — mais persistait quand même `duration ≈ 120-180s`. Cette valeur remonte telle
  quelle via `GET /calls/history` (`deriveDurationSec`, dont le docstring dit pourtant explicitement 0 pour
  un appel manqué) jusqu'à `APICallRecord.durationLabel` (SDK iOS, gardé seulement sur `durationSec > 0`,
  pas sur `isMissed`), affiché sans garde par `CallsTab.swift`/`CallDetailSheet.swift` : un appel qui a
  sonné 2 minutes sans réponse s'affichait **« Manqué · 2:00 »** au lieu de juste « Manqué ». Le résumé de
  bulle chat (`BubbleCallNoticeView.swift`/`CallSystemMessage.tsx`) était lui déjà correctement gardé sur
  `outcome === 'completed'` — la fuite ne touchait QUE le journal d'appels. Aucun test existant n'épinglait
  la valeur numérique (`expect.any(Number)` seulement). **Fix** : `forceEndCall` prend désormais
  `answeredAt: Date | null` (au lieu de `startedAt: Date`) et calcule `duration = answeredAt ? max(0,
  floor((now-answeredAt)/1000)) : 0`, miroir exact de `endCall()`. Les 5 sites d'appel passent
  `call.answeredAt` au lieu de `call.startedAt` (tiers 1/2/3/4×2) — un no-op pour le tier 1 (jamais
  répondu par construction) et une correction pour les tiers 2/3/4 (qui ancraient déjà sur du temps de
  conversation réel dans les autres writers, désormais cohérent ici aussi). **Tests TDD** : 2 nouveaux cas
  — tier 1 jamais répondu → `duration: 0` persisté ; tier 3 GC 2h avec `startedAt`/`answeredAt`
  délibérément écartés de 60s → `duration` ancré sur `answeredAt` (10800s), pas `startedAt` (10860s), pour
  qu'un anchor régressé échoue bruyamment plutôt que par coïncidence (méthodologie Vague 27). RED confirmé
  (`git stash` du seul fichier source → 130/10860 reçus au lieu de 0/10800), GREEN restauré. Suite
  `CallCleanupService.test.ts` : 72/72 verts (+2). Suite gateway filtrée `[Cc]all` : 32 suites/888 tests
  verts. `tsc --noEmit` gateway : erreurs identiques avant/après, toutes préexistantes
  (`Cannot find module '@meeshy/shared/prisma/client'` — client Prisma non généré dans ce sandbox réseau-
  restreint, cf. `lessons.md` 2026-07-02 ; aucune nouvelle erreur sur `CallCleanupService.ts` au-delà de
  cet import préexistant).
- Note en passant (non corrigée, hors scope de cette passe) : `CallService.updateCallStatus()` a le même
  pattern inconditionnel `duration = now - startedAt` dans sa branche terminale, mais cette branche est
  aujourd'hui du code mort (jamais appelée qu'avec `active`/`reconnecting`, des statuts non-terminaux) —
  pas urgent, mais à corriger dans la même passe si elle devient un jour atteignable.
- **Reste ouvert (inchangé)** : items J (validation device réel), C6 (court-circuit dédup cosmétique),
  CALL-DIAG retagging, threading complet du `ttl` TURN, `call:force-leave` server-emit ambiguïté, 3
  findings iOS structurels restants de la Vague 28 (switchCamera/toggleSpeaker rollback optimiste, tests
  source-reflection CallManagerTests, landscape/Dynamic-Type IncomingCallView/CallWaitingBannerView) +
  les 3 nouvelles pistes iOS de cette vague (nécessitent toutes Xcode).

## Vague 31 — 2 siblings supplémentaires du bug `duration` ancré sur `startedAt` : les propres sweeps phantom/zombie de `CallService.initiateCall` (2026-07-09)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` confirme `HEAD` (`0c41fc6f`) à jour ; un seul PR calls ouvert (`#1764`, web,
`use-video-call.ts` ack-échec de `call:initiate`) — cible retenue strictement disjointe. Un agent
d'exploration dédié (lecture seule, scopé iOS/gateway/web) a été lancé en premier ; ses pistes exploitables
(flag `isUsingFrontCamera` non réverté sur échec de switch caméra, tests source-reflection
`CallManagerTests`) nécessitent toutes un compilateur Swift — absent de ce sandbox Linux, cohérent avec
30 vagues précédentes. Reprise en lecture directe de `CallService.ts`/`CallCleanupService.ts` pour
chercher un sibling encore non couvert du bug family `duration = now - startedAt` déjà corrigé 3 fois
(Vagues 25/27/30, toujours dans `CallCleanupService`/`endCall`/`leaveCall`).

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] `CallService.initiateCall` a DEUX writers terminaux —
  son propre phantom-cleanup et son propre zombie-cleanup — jamais touchés par les 3 fixes précédents
  car ils vivent dans `CallService.ts`, pas `CallCleanupService.ts`.** Grep de tous les sites `duration`/
  `answeredAt`/`startedAt` de `CallService.ts` : deux writers restaient sur le pattern pré-Vague-25
  `Math.floor((now - startedAt) / 1000)` inconditionnel :
  1. Le sweep phantom cross-conversation de l'INITIATEUR (l.779-810, force-end tout appel non-terminé
     dont l'initiateur est resté participant `leftAt:null` ailleurs) — un appel encore `ringing`/
     `initiated`/`connecting`, jamais répondu, mais dont `isPhantomCallStale` le juge assez vieux (>60s de
     ring), se voit persister `duration = temps de sonnerie` au lieu de 0.
  2. Le nettoyage zombie scopé à la conversation cible (l.844-863, tous les participants sont `leftAt`
     mais le call reste dans `ACTIVE_STATUSES`) — même pattern, même bug, si le zombie n'a jamais été
     répondu (`answeredAt: null`).
  **Scénario concret** : A appelle B dans la conversation X (ring), personne ne répond avant qu'un
  crash/reconnect côté A laisse le participant `leftAt:null`. 90 secondes plus tard A initie un NOUVEL
  appel (même conversation ou une autre) — le sweep phantom ou zombie force-termine l'ancien appel
  `ringing` avec `endReason: garbageCollected` et un `duration` égal au temps de sonnerie écoulé (ex.
  90s) au lieu de 0. Le journal d'appels affichera cet appel comme "Manqué · 1:30" — même famille exacte
  que la Vague 27 (`APICallRecord.durationLabel` gardé sur `durationSec > 0`, pas sur `isMissed`), mais
  atteint par un chemin de code que ce fix n'avait pas couvert. Root cause : la sélection Prisma
  (`callSession: { select: { …, answeredAt: true } }`, l.762) chargeait déjà `answeredAt` — il était
  disponible, juste jamais lu pour le calcul de `duration`.
  **Fix** (mirroring exact du pattern déjà établi, `answeredAt ? … : 0`) :
  - Site 1 (phantom sweep, l.789) : `const startedAt = …` → `const answeredAt = staleSession?.answeredAt
    ? new Date(staleSession.answeredAt) : null`, `duration: answeredAt ? Math.max(0, Math.floor((now -
    answeredAt)/1000)) : 0`.
  - Site 2 (zombie sweep, l.845) : `Math.floor((now - activeCall.startedAt)/1000)` →
    `activeCall.answeredAt ? Math.max(0, Math.floor((now - activeCall.answeredAt)/1000)) : 0`
    (`activeCall` est le `CallSession` complet, `answeredAt` déjà dessus sans `select`).
  **Tests TDD** (`CallService.test.ts`) : 2 nouveaux cas — `should anchor zombie call cleanup duration on
  answeredAt…` (zombie `ringing`, `startedAt` -5min, `answeredAt: null` → `duration: 0` attendu) ;
  `phantom cleanup: anchors duration on answeredAt…` (participation stale `ringing`, `startedAt` -5min,
  `answeredAt: null` → `duration: 0` attendu). RED confirmé sur les deux (`duration: 300` reçu au lieu de
  `0`, `git diff` du seul fichier source annulé le temps du run). GREEN après fix. Suite
  `CallService.test.ts` : 185/185 verts (+2). Suite gateway filtrée `[Cc]all` : 32 suites/890 tests verts
  (+2 vs Vague 30). `tsc --noEmit` gateway : 324 erreurs identiques avant/après (`git stash` du seul
  fichier source + test → même compte exact, même 9 erreurs pré-existantes sur `CallService.ts`, toutes
  `Cannot find module '@meeshy/shared/prisma/client'`-dérivées, sandbox réseau-restreint cf. `lessons.md`
  2026-07-02 ; aucune nouvelle erreur).
  **Bonus** : la "Note en passant" de la Vague 30 sur `CallService.updateCallStatus()` (même pattern,
  mais code mort en prod — jamais appelée qu'avec `active`/`reconnecting`) reste non corrigée cette
  session, toujours par prudence (branche non atteignable, pas de test de régression falsifiable sans la
  rendre atteignable d'abord — hors scope d'un fix mécanique borné).
- **iOS/web (lecture seule, aucun changement)** : audit dédié (agent d'exploration) n'a trouvé aucun
  nouveau retain cycle, timer non invalidé, race ICE, ou gap de rate-limit — toutes catégories déjà
  balayées par les vagues précédentes. Deux pistes iOS actionnables identifiées mais NON corrigées
  (nécessitent Xcode, absent de ce sandbox Linux) : (1) `CallManager.switchCamera()`/`selectCamera(id:)`
  (`CallManager.swift:2021-2049`) flippent `isUsingFrontCamera` de façon optimiste AVANT que
  `WebRTCService.switchCamera()` (fire-and-forget via `Task` détachée, `WebRTCService.swift:262-272`) ne
  confirme le succès — un échec réel (thermal throttling, format caméra indisponible) laisse le flag de
  mirroring UI durablement faux pour le reste de l'appel, jamais reverté ; (2) confirmation que
  `CallManagerTests.swift`/`CallManagerAudioSessionTests.swift` (~800 assertions) restent des tests de
  réflexion sur le texte source (`callManagerSource()` + regex/substring), sans instancier `CallManager`
  ni exercer `CXProviderDelegate` réellement — aucune couverture comportementale sur
  `providerDidReset`/`didActivate`/`didDeactivate` (déjà noté 2026-07-06, toujours vrai, nécessite un
  protocole `CXProviding` injectable pour corriger — hors portée sans Xcode).
- **Reste ouvert (inchangé)** : items J, C6, CALL-DIAG retagging, threading TTL, `call:force-leave`
  server-emit ambiguïté, 3 findings iOS structurels Vague 28, landscape/Dynamic-Type Vague 28/29,
  `updateCallStatus()` dead-code duration anchor (note Vague 30) + les 2 pistes iOS actionnables de cette
  vague (camera-flag rollback, protocole `CXProviding` pour tests comportementaux) — toutes nécessitent
  Xcode/macOS.

## Vague 32 — group call mid-call cleanup was stopping the SHARED camera/mic stream for every other participant (web) (2026-07-09)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` confirme `HEAD` (`4c7f0713`) à jour. Deux agents d'exploration dédiés (gateway
CallService/CallCleanupService/CallEventsHandler/TURNCredentialService ; web webrtc-service/CallManager/
use-webrtc-p2p/use-video-call), lecture seule, mandatés à falsifier tout candidat contre ce fichier +
`lessons.md` avant de rapporter — répertoire des faux positifs et fixes déjà appliqués fourni en amont
pour éviter tout re-flag (duration/answeredAt ×5, toggle-video gate intentionnel, force-leave server-emit
ambiguïté, hardening d'autorisation, résilience restart, etc.).

- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, TDD, SÉVÉRITÉ HAUTE] `WebRTCService.close()` stoppait le
  `MediaStream` local PARTAGÉ entre toutes les connexions d'un appel de groupe — le départ (ou l'échec de
  négociation) d'UN SEUL participant coupait le micro/caméra pour TOUS les autres.**
  `use-webrtc-p2p.ts` garde une instance `WebRTCService` par participant distant
  (`webrtcServicesRef`, Map), mais `addLocalMedia(stream, …)` (`createOffer`/`handleOffer`) leur passe
  toutes la MÊME référence `MediaStream` — celle du store (`ensureLocalStream()` → `useCallStore`
  `localStream`), jamais un clone. `WebRTCService.close()` (`webrtc-service.ts:1160-1195`) faisait
  inconditionnellement `this.localStream.getTracks().forEach(track => track.stop())`. `removeParticipant()`
  (`use-webrtc-p2p.ts:322-335`) appelle `service.close()` pour UN SEUL participant, et est déclenché par :
  (1) les catch blocks de `createOffer`/`handleOffer` sur échec de négociation d'un pair (cleanup de fuite
  de peer connection orpheline, Vague antérieure) ; (2) `CallManager.tsx:300`
  (`handleParticipantLeft`, un VRAI événement `participant-left` en cours d'appel de groupe).
  **Scénario concret** : appel de groupe A/B/C, tous connectés. B raccroche (ou : l'échec transitoire de
  négociation d'un nouveau D qui rejoint). `handleParticipantLeft`/le catch block appelle
  `removeParticipant('B')` → `service.close()` sur l'instance de B → stoppe les tracks du `MediaStream`
  PARTAGÉ → puisque ce sont les MÊMES tracks que celles attachées au sender de la connexion vers C (même
  objet `MediaStream`, mêmes `MediaStreamTrack`), l'audio/vidéo sortant vers C meurt silencieusement aussi,
  bien que la connexion A↔C reste `connected`. Pire : `ensureLocalStream()` retourne ensuite le stream du
  store, maintenant mort (tracks `ended`), à toute tentative de rejoin ultérieure — l'appel reste cassé
  jusqu'à un raccroché/rejoin complet. Le vrai propriétaire du cycle de vie du stream partagé est déjà
  `call-store.ts` (`reset()` l.471, stoppe les tracks UNE SEULE FOIS au vrai teardown de fin d'appel ;
  `setLocalStream()` stoppe l'ancien stream seulement s'il est REMPLACÉ par un objet différent) — le
  double-stop de `WebRTCService.close()` était non seulement redondant avec ce chemin au vrai hangup, mais
  actif et destructeur sur le chemin single-participant.
  **Fix** : `close(options: { stopLocalTracks?: boolean } = {})`, défaut `true` (comportement de
  full-teardown inchangé partout ailleurs — `cleanup()`, l'effet de reset sur changement de `userId`).
  `removeParticipant()` passe désormais `{ stopLocalTracks: false }` : la connexion pair est bien fermée
  (`peerConnection.close()`, flags de négociation reset) mais les tracks matérielles partagées survivent
  pour les autres participants encore connectés.
  **Tests TDD** (`webrtc-service.coverage.test.ts`) : 2 nouveaux cas — `close({ stopLocalTracks: false })`
  avec DEUX instances `WebRTCService` partageant le même stream : fermer l'une n'arrête aucun track partagé
  et laisse l'autre connexion/stream intacts (`pc.close` non appelé sur l'autre, `getCurrentStream()`
  toujours le même stream) ; `close()` sans option stoppe toujours les tracks (non-régression du défaut).
  RED confirmé (le premier test échouait avec `stop` appelé). GREEN après fix. Suite
  `webrtc-service.coverage.test.ts` + `webrtc-service.test.ts` + `use-webrtc-p2p.test.tsx` : 204/204 verts.
  Suite web filtrée `.*(call|webrtc|quality).*\.test\.` : 25 suites/457 tests verts (+1 suite/+6 tests vs
  Vague 30/31, dont les 2 nouveaux tests `close()` + 2 nouveaux tests du fix cosmétique ci-dessous). `tsc
  --noEmit` web : 1573 erreurs après fix vs 1574 avant (`git stash` du seul diff calling) — aucune nouvelle
  erreur imputable à ce changement (le delta de -1 est du bruit préexistant sans rapport).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, TDD, cosmétique] La bannière d'appel entrant affichait toujours
  « Video Call » / l'icône vidéo, même pour un appel purement audio.** `CallNotification.tsx:73-79`
  hardcodait l'icône `Video` et la clé `calls.incoming.videoCall` sans lire `call.type` (`'audio' |
  'video'`, `CallInitiatedEvent`, déjà consommé correctement ailleurs par le gate de contrainte média de
  `CallManager.tsx`). Aucune clé `audioCall` n'existait dans aucune des 4 locales. **Scénario** : B appelle
  A en audio seul ; la bannière d'A affiche une icône vidéo qui pulse et « Video Call », alors que
  l'acquisition média elle-même (gate privacy déjà correct depuis les vagues antérieures) est bien
  audio-only — juste le libellé/icône ment sur ce que l'utilisateur s'apprête à rejoindre. **Fix** :
  icône + libellé branchés sur `call.type === 'video'` (icône `Mic` + nouvelle clé
  `calls.incoming.audioCall` sinon). Clé ajoutée aux 4 locales (en: "Audio Call", fr: "Appel audio", es:
  "Llamada de audio", pt: "Chamada de áudio"). **Tests TDD** (nouveau fichier
  `CallNotification.test.tsx`, aucun test n'existait pour ce composant) : appel vidéo → libellé/icône
  vidéo, pas de clé audio rendue ; appel audio → libellé audio, pas de clé vidéo rendue. RED confirmé sur
  le 2e cas (le composant rendait `videoCall` sans condition). GREEN après fix.
- **[Candidat gateway, NON corrigé — code mort aujourd'hui, noté pour hygiène]**
  `CallService.markCallAsMissed()` (l.1925-1927) est un 5e sibling du bug family `duration = now -
  startedAt` (déjà corrigé 4× : Vagues 25/27/30/31) — persiste le temps de sonnerie au lieu de `0` pour un
  appel jamais répondu. **Actuellement injoignable** : les 6 sites d'appel de `handleMissedCall()` (seul
  appelant) font TOUS déjà transitionner le statut hors de `initiated`/`ringing` avant d'appeler cette
  fonction (via leur propre `updateMany` atomique, ou via `leaveCall`/`endCall`/
  `forceEndOrphanedCallSession`, déjà `answeredAt`-ancrés) — donc le `findUnique` de `markCallAsMissed` ne
  voit jamais un statut encore `initiated`/`ringing`. Même famille structurelle que le dead-code
  `updateCallStatus()` déjà noté (Vague 30) et volontairement non corrigé par cohérence (branche non
  atteignable, pas de scénario de régression falsifiable sans la rendre atteignable d'abord — hors scope
  d'un fix mécanique borné). À corriger dans la même passe qu'`updateCallStatus()` si l'une des deux
  devient un jour atteignable (nouveau endpoint admin/REST "force-missed", ou un appelant qui saute la
  pré-transition).
- **Web (lecture seule, non corrigé, plausibilité moindre)** : `CallManager.tsx:388-488`
  (`handleAcceptCall`) n'a aucun garde de ré-entrance — un double-tap/double-clic avant que
  `setIncomingCall(null)` ne retire le bouton Accepter pourrait déclencher deux `getUserMedia` +
  `CALL_JOIN` qui se chevauchent, chacun écrasant `window.__preauthorizedMediaStream`. Non corrigé cette
  session (fenêtre de timing, pas de scénario de repro déterministe en test unitaire sans horloge
  factice sur les transitions React) — piste pour une session future.
- **iOS (lecture seule, aucun changement — pas de toolchain Swift dans ce sandbox)** : aucun nouveau
  candidat au-delà des 5 findings déjà documentés (Vagues 28/31, camera-flag rollback,
  `CXProviding`/tests source-reflection, landscape/Dynamic-Type).
- **Reste ouvert** : items J, C6, CALL-DIAG retagging, threading TTL, `call:force-leave` server-emit
  ambiguïté, 3 findings iOS structurels Vague 28, landscape/Dynamic-Type Vague 28/29, `updateCallStatus()`
  + `markCallAsMissed()` dead-code duration anchors (jumeaux, mêmes conditions de correction), camera-flag
  rollback + `CXProviding` iOS, `handleAcceptCall` re-entrancy guard (web, cette vague).

## Vague 33 — re-entrancy sur `handleAcceptCall` (web) + grace de reconnexion perdue sur un `call:join` qui échoue (gateway) (2026-07-09)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Deux agents
d'exploration dédiés (gateway CallService/CallCleanupService/CallEventsHandler/AuthHandler ; web
webrtc-service/CallManager/use-webrtc-p2p/use-video-call), lecture seule, mandatés à falsifier tout
candidat contre `lessons.md`/ce fichier avant de rapporter. `git fetch origin main` : HEAD à jour
(`0921b9d7`). Recherche de PRs calls ouverts AVANT de commencer (évite le doublon) : 4 trouvées
(#1764 ack-échec web, #1767 PiP iOS, #1771 "Vague 32" shared-stream group-call + banner audio/vidéo,
#1777 room-membership leak + reconnect web) — toutes disjointes du périmètre retenu ici, diffs lus
intégralement pour confirmer l'absence de recouvrement avant d'implémenter quoi que ce soit.

- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, TDD] `CallManager.handleAcceptCall` (callee) n'avait aucun garde
  de ré-entrance.** `incomingCall` (et le bouton Accepter qu'il affiche) n'est cleared qu'APRÈS
  l'aller-retour complet `getUserMedia` + ack `call:join` — un double-tap/double-clic sur Accepter avant
  que l'ack ne résolve atteint `handleAcceptCall` deux fois en concurrence, chacune acquérant son propre
  `MediaStream` via `getUserMedia`. Les deux écrasent `window.__preauthorizedMediaStream` (dernier écrit
  gagne) ; le stream du perdant n'est plus jamais référencé nulle part et ses pistes ne sont JAMAIS
  stoppées — micro/caméra restent actifs sans consommateur (fuite ressource + vie privée). Déjà repéré
  comme piste "confiance moindre" dans les notes de PR #1771 (Vague 32), non corrigé alors. **Fix** :
  `acceptingCallIdRef` (`useRef<string | null>`) posé au début de `handleAcceptCall`, early-return si déjà
  égal à `incomingCall.callId`, reset dans un nouveau bloc `finally` (couvre les deux issues, succès et
  échec). **Bonus mécanique** : les deux `import('@/utils/ringtone').then(...)` de `handleAcceptCall`/
  `handleRejectCall` n'avaient pas de `.catch()` — seul endroit du fichier sans, contrairement au pattern
  déjà correct de `CallNotification.tsx` (chunk-load failure → rejection non gérée sur CHAQUE
  accept/reject, pas un edge-case vu que ce chemin s'exécute à chaque appel entrant). Alignés sur le
  pattern existant. **Tests TDD** (`CallManager.acceptCall.test.tsx`) : nouveau cas — double-clic Accepter
  avant résolution de l'ack → `getUserMedia` et `CALL_JOIN` appelés une seule fois chacun ; l'ack finit par
  résoudre normalement (`isInCall` devient `true`). RED confirmé (2 appels reçus au lieu d'1). GREEN après
  fix. Suite `CallManager*.test.tsx` + `video-call*`/`use-video-call` : 15 suites/103 tests verts.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD, MOYEN] `call:join` annulait le timer de grâce de
  reconnexion AVANT de savoir si le join allait réussir.** `cancelDisconnectGrace(data.callId, userId)`
  (`CallEventsHandler.ts`, handler `call:join`) s'exécutait juste après la validation Zod, mais AVANT
  `resolveParticipantIdFromCall` et `callService.joinCall(...)`, qui peuvent tous deux encore throw (DB
  transitoire, race). Le catch (`CallEventsHandler.ts` fin du handler) ne ré-arme JAMAIS la grâce. **Scénario
  concret** : le socket de P tombe pendant un appel répondu → grâce de reconnexion armée (30s, cf. Vague
  "3e vague" ci-dessus). P se reconnecte, émet `call:join` — la grâce est annulée immédiatement, PUIS le
  join échoue pour une raison transitoire (hoquet DB dans `resolveParticipantIdFromCall`/`joinCall`, pas
  "l'appel est vraiment terminé"). P se retrouve sans socket actif dans la room ET sans timer de grâce —
  le seul filet restant est le tier heartbeat de `CallCleanupService` (60-120s), bien plus lent que le
  filet rapide conçu pour ce cas précis. **Fix** : `cancelDisconnectGrace` déplacé après le `await
  this.callService.joinCall(...)` réussi (juste avant `const { callSession, iceServers } = joinResult`) —
  un join qui throw retourne dans le catch AVANT d'atteindre l'annulation, laissant la grâce d'origine
  intacte. **Tests TDD** : nouveau cas dans `CallEventsHandler.test.ts` (disconnect arme la grâce → `call:
  join` avec `joinCall` rejeté → avance 31s → `leaveCall` toujours appelé, prouvant que la grâce d'origine
  a survécu). Un test PRÉEXISTANT de `CallEventsHandler-restart-resilience.test.ts` ("re-join... cancels
  the pending end") testait en réalité l'ANCIEN comportement bugué par accident — son propre commentaire
  documentait "call:join bails after cancel... but the cancel already ran" avec un mock join qui échoue
  TOUJOURS (`callSessionForJoin` jamais fourni → `null` par défaut) alors que le titre du test prétendait
  vérifier un rejoin RÉUSSI. Corrigé pour mocker un join réellement réussi (nouveau `callSessionForJoin`
  + `mockJoinCall.mockResolvedValue(...)` complet avec `participants` incluant l'utilisateur) ; un second
  test ajouté juste à côté couvre explicitement le cas join-échoue-grâce-survit. RED confirmé sur le
  nouveau test (0 appels à `leaveCall` reçus). GREEN après fix, la suite restart-resilience et le test
  préexistant corrigé passent tous les deux. Suite gateway filtrée `[Cc]all` : 32 suites/892 tests verts
  (vs 890 avant, +2 nouveaux tests nets après le fix du test préexistant).
- **[Candidat gateway, INVESTIGUÉ, PAS UN BUG ATTEIGNABLE — documenté pour hygiène]** `call:end`'s
  fast-path émet un `call:ended` optimiste au pair AVEC `duration: 0` hardcodé (pour que l'UI du pair
  réagisse instantanément), suivi secondes plus tard du broadcast authoritatif `broadcastCallEnded()` avec
  la vraie `duration`. Piste initiale de l'agent d'exploration gateway : si les clients dédupliquent le
  second `call:ended` une fois déjà en état terminal (ce qu'iOS fait bien, `CallManager.swift:2219`,
  `if case .ended = callState { return }`), le pair resterait bloqué sur `duration: 0` pour toujours.
  **Vérifié FAUX sur les deux clients actuels** : `handleRemoteEnd(callId:rawReason:)` (iOS) ne reçoit
  MÊME PAS de paramètre `duration` — la durée affichée localement vient du timer `durationTask` du client,
  jamais du payload socket. Côté web, `CallManager.tsx`'s `handleCallEnded` lit bien `event.duration` mais
  seulement pour une ligne de `logger.info` (aucun affichage utilisateur — "Toast métier désactivé" est le
  seul autre effet, un `reset()` idempotent). Aucun consommateur web (grep exhaustif de `CallEndedEvent`
  dans `apps/web`) n'affiche cette valeur. La vraie durée persistée et affichée dans l'historique d'appels
  vient du fetch REST/DB (`CallSession.duration`), jamais de ce payload socket éphémère. Incohérence
  architecturale réelle (le fast-path ment sur `duration` et le contrat de dédup client la fige) mais SANS
  impact UX observable aujourd'hui sur aucune plateforme — à corriger uniquement si un futur consommateur
  du payload socket (analytics, notif, etc.) venait un jour lire ce champ.
- **Web (lecture seule, non corrigé, findings de l'agent d'exploration web, à trier)** :
  1. `CallControls.tsx`'s `handleSpeakerToggle` (HAUTE confiance) est un pur no-op UI — flippe seulement
     l'icône/aria-label local, n'appelle jamais `HTMLMediaElement.setSinkId()` sur aucun élément
     `<video>` distant (`VideoStream.tsx`, un `<video>` par participant, joue AUSSI l'audio distant). Le
     bouton "haut-parleur" ne change RIEN au routage audio réel. Non corrigé cette session : nécessiterait
     un vrai design (registre des refs `<video>` distants remontant à `CallControls`, énumération
     `navigator.mediaDevices.enumerateDevices()` filtrée `audiooutput`, feature-detection Safari) — plus
     une feature à construire qu'un bug mécanique à corriger, hors du grain "un bug + fix minimal" de
     cette passe.
  2. Groupe d'appel avec >1 pair : `enableVideo`/`disableVideo` (`use-webrtc-p2p.ts`) font un `Promise.all`
     sans rollback par-pair — si un pair échoue après qu'un autre a déjà réussi sa renégociation, l'UI
     affiche "caméra coupée" alors qu'un pair reçoit toujours la vidéo. Confidence MOYENNE, scope non
     atteignable aujourd'hui : `use-active-peer-connection.ts` documente explicitement l'invariant P2P
     "au plus un pair en 1:1", donc ce chemin `Promise.all` sur une Map à plusieurs entrées n'est pas
     encore exercé en prod tant que les appels de groupe ne sont pas livrés — noté pour quand ce sera le
     cas.
  3. `useWebRTC.switchCamera` (`components/video-calls/hooks/useWebRTC.ts`) ne fait que muter le
     `MediaStream` local (`removeTrack`/`addTrack`) sans jamais appeler `RTCRtpSender.replaceTrack` —
     contrairement à l'implémentation correcte de `VideoCallInterface.handleSwitchCamera`. Code mort :
     exporté depuis `components/video-calls/index.ts` mais aucun composant prod ne l'importe (seul son
     propre test le fait) — à corriger ou supprimer avant qu'il soit accidentellement câblé tel quel.
- **Reste ouvert (inchangé + additions)** : items J, C6, CALL-DIAG retagging, threading TTL,
  `call:force-leave` server-emit ambiguïté, 3 findings iOS structurels Vague 28, landscape/Dynamic-Type
  Vague 28/29, `updateCallStatus()` dead-code duration anchor (Vague 30), camera-flag rollback + `CXProviding`
  iOS (Vague 31/32), `handleAcceptCall` re-entrancy web (Vague 32 note → CORRIGÉ cette vague), `call:end`
  fast-path `duration:0` (non atteignable, documenté ci-dessus), speaker toggle no-op web (nécessite design
  dédié), group-call `enableVideo`/`disableVideo` rollback (non atteignable tant que groupe pas livré),
  `useWebRTC.switchCamera` dead-code sans `replaceTrack` (à nettoyer ou corriger).

## Vague 34 — `useWebRTC.switchCamera` (web) : dead code buggy supprimé (2026-07-10)

Point d'entrée : routine calling-feature. Reprise directe des 4 candidats déjà documentés dans les notes
de PR #1780 / Vague 33 plutôt qu'un audit neuf. Candidat #1 (`handleSpeakerToggle` no-op) confirmé toujours
hors grain "un bug + fix minimal" (nécessite un vrai design de registre de refs `<video>` + énumération de
devices). Candidat #2 (`enableVideo`/`disableVideo` `Promise.all` sans rollback) confirmé toujours non
atteignable : `use-active-peer-connection.ts` documente toujours l'invariant P2P 1:1 strict, aucun appel de
groupe livré. Candidat #4 (iOS `CallManager.swift`) : `which xcodebuild`/`which swift` → aucun toolchain
Swift dans ce sandbox (confirmé, cohérent avec 33 vagues précédentes) — non touché, noté tel quel.

- **[CLEANUP web, CONFIRMÉ + APPLIQUÉ, TDD]** Candidat #3 : `components/video-calls/hooks/useWebRTC.ts`
  reconfirmé mort. Grep exhaustif de `useWebRTC(` (pas seulement `switchCamera`) sur tout `apps/web` :
  seuls hits restants avant fix = sa propre déclaration, l'export barrel `index.ts`, et sa propre section
  README — **aucun test ne l'importait plus** (la note de la Vague 33 « seul son propre test l'importe »
  est devenue stale : ce test avait déjà disparu, `find -iname "*useWebRTC*"` ne retournait que le fichier
  source lui-même). Aucun import du barrel `components/video-calls` nulle part dans `apps/web` non plus
  (`from '@/components/video-calls'` : 0 hit) — le composant réellement monté, `VideoCallInterface.tsx`,
  utilise `useWebRTCP2P` (`@/hooks/use-webrtc-p2p.ts`) et porte sa propre `handleSwitchCamera` (l.361-393)
  qui, elle, appelle correctement `RTCRtpSender.replaceTrack` sur chaque sender vidéo AVANT de stopper
  l'ancienne piste — exactement l'implémentation que le hook mort aurait dû avoir mais n'a jamais eue
  (son `switchCamera` mute juste le `MediaStream` local via `removeTrack`/`addTrack`, sans jamais toucher
  aux `RTCRtpSender`, donc n'aurait jamais propagé le changement de caméra à un pair distant si jamais
  câblé). Précédent direct dans ce même fichier : Vague 11 avait déjà traité un cas identique
  (`useCallSignaling.ts`, mort, supprimé sans TDD comportemental car aucun comportement n'était atteignable
  à caractériser). **Fix** : suppression du fichier `hooks/useWebRTC.ts` (179 lignes), de son export dans
  `index.ts` (3 lignes), et de sa section obsolète dans `README.md` (remplacée par une note pointant vers
  `useWebRTCP2P`/`VideoCallInterface.handleSwitchCamera`, même pattern que la note laissée pour
  `useCallSignaling` en Vague 11). `hooks/useVideoFilters.ts` (seul autre fichier du dossier `hooks/`)
  intact, non concerné. **Test TDD** (nouveau `__tests__/components/video-calls/index.test.ts`, évite
  d'importer le barrel complet — trop de dépendances lourdes côté `VideoCallInterface` à mocker pour une
  simple assertion de surface d'export) : 2 cas — le barrel `index.ts` n'exporte plus `useWebRTC` (source
  lue via `fs`, pas d'import runtime) ; le fichier `hooks/useWebRTC.ts` n'existe plus sur disque
  (`fs.existsSync`). RED confirmé sur les deux avant suppression (le barrel exportait bien `useWebRTC`,
  le fichier existait bien). GREEN après suppression. Suite filtrée `call|webrtc` : 25 suites/461 tests
  verts (dont le nouveau). `tsc --noEmit` web : 0 erreur avant et après (sandbox avec `bun install
  --ignore-scripts` cette fois — `bun install` seul échoue sur le postinstall privé de `grpc-tools`,
  dépendance du gateway sans rapport avec ce fix ; contourné avec `--ignore-scripts`, suffisant pour
  jest/tsc qui n'ont pas besoin du binaire natif compilé).
- **Reste ouvert (inchangé)** : items J, C6, CALL-DIAG retagging, threading TTL, `call:force-leave`
  server-emit ambiguïté, 3 findings iOS structurels Vague 28, landscape/Dynamic-Type Vague 28/29,
  `updateCallStatus()` dead-code duration anchor (Vague 30), camera-flag rollback + `CXProviding` iOS
  (Vague 31/32), `call:end` fast-path `duration:0` (non atteignable), speaker toggle no-op web (nécessite
  design dédié), group-call `enableVideo`/`disableVideo` rollback (non atteignable tant que groupe pas
  livré). `useWebRTC.switchCamera` dead-code (Vague 33) → **SUPPRIMÉ cette vague**, retiré de la liste.


## Vague 35 — `call:end` fast-path broadcast fired before authorization (gateway) + 3 broken prop destructures (web) (2026-07-10)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` : HEAD (`8f2a9ba`) à jour, PR #1809 (calling-stack hardening, 5 bugs) et #1810 (dead GC tier)
ouverts/mergés avant démarrage — diffs lus intégralement pour confirmer l'absence de recouvrement. Deux
agents d'exploration dédiés (gateway `CallEventsHandler`/`CallService`/`CallCleanupService`/
`TURNCredentialService` ; web `use-webrtc-p2p`/`use-video-call`/`components/video-call{,s}/`), lecture
seule, briefés avec la liste exhaustive des bugs déjà fixés (waves 25-34 + PR #1809) pour falsifier tout
candidat contre ce fichier + `lessons.md` avant de rapporter.

- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD, SÉCURITÉ] Le broadcast optimiste `call:ended` du fast-path
  de `call:end` s'exécutait AVANT la vérification d'autorisation, pas après.** `CallEventsHandler.ts`
  (handler `CALL_EVENTS.END`) émettait `call:ended` vers la room dès que `socket.rooms.has(ROOMS.call(...))`
  était vrai — raisonnement : "l'appartenance à la room EST l'autorisation" (vrai au moment du `call:join`
  vérifié). Mais rien n'évince un socket de la call room si l'autorisation sous-jacente est révoquée
  ENSUITE (ex. un admin retire l'appelant de la conversation en cours d'appel) — ce n'est pas un invariant,
  juste une preuve ponctuelle. Le fix sécurité du 2026-07-10 (déjà en prod) traite exactement ce cas côté
  écriture DB (`resolveParticipantIdFromCall` échoue → refuse de force-end la session) mais ne faisait rien
  côté broadcast, déjà parti avant que ce rejet ne s'exécute. **Scénario** : A et B en appel actif
  (rooms rejointes via `call:join` vérifié) ; A perd son appartenance à la conversation en cours d'appel
  (aucun code n'évince son socket de la call room) ; A déclenche `call:end` ; le fast-path notifie
  IMMÉDIATEMENT B (`call:ended`) ; B démonte l'appel sans re-validation côté client ; `resolveParticipantIdFromCall`
  échoue ensuite pour A (à raison) et le handler rejette `NOT_A_PARTICIPANT` sans toucher au `CallSession`
  (reste `active`) — état divergent (B pense l'appel fini, le serveur le croit toujours actif) jusqu'au
  self-heal par le tier GC 120s. **Fix** : réordonnancement — `resolveParticipantIdFromCall` s'exécute
  maintenant AVANT le broadcast fast-path (le chemin autoritatif faisait déjà cet appel juste après ;
  aucun aller-retour DB supplémentaire, juste un déplacement de bloc). **Tests TDD**
  (`CallEventsHandler.test.ts`, nouveau cas dans `describe('call:end')`) : socket toujours dans la call
  room + `resolveParticipantIdFromCall` échoue → `socket.to(...)` ne doit JAMAIS être appelé, seul
  `call:error NOT_A_PARTICIPANT` + `ack(false)`. RED confirmé (`socket.to` appelé 1 fois avant le fix).
  GREEN après. Suite `CallEventsHandler.test.ts` : 233/233. Suite filtrée `Call` (32 fichiers) : 896/896.
  `tsc --noEmit` gateway : 325 erreurs identiques avant/après (`git stash` du seul fichier source + test →
  même compte exact, toutes `Cannot find module '@meeshy/shared/prisma/client'`-dérivées, sandbox
  réseau-restreint cf. lessons.md 2026-07-02 ; aucune nouvelle erreur).
- **[BUG RÉEL, web, CONFIRMÉ + CORRIGÉ, mécanique] 3 composants d'appel destructuraient une prop typée avec
  un nom préfixé `_` qui ne correspondait PAS à la clé de l'interface, cassant la liaison shorthand.**
  `VideoStream.tsx` (`isLocal?: boolean` déclaré, déstructuré `_isLocal = false`), `OngoingCallBanner.tsx`
  (`callId: string` déclaré, déstructuré `_callId`), `CallStatusIndicator.tsx` (`callDuration?: number`
  déclaré, déstructuré `_callDuration = 0`) — la déstructuration shorthand cherche une propriété
  littéralement nommée `_isLocal`/etc. sur l'objet props, ne la trouve jamais, retombe silencieusement sur
  le défaut local. Confirmé 3 erreurs `tsc --noEmit` réelles (`TS2339: Property '_X' does not exist on type
  '...Props'`), disparues après fix, présentes avant (vérifié par `git stash` du diff web seul). Signature
  du bug : cohérente avec une passe automatisée "préfixer les vars inutilisées par `_`" appliquée
  aveuglément à une déstructuration d'objet-props (qui casse le lien nom↔clé), pas une simple faute de
  frappe manuelle. Les 3 sites sont réellement montés (pas de composants morts) avec de vrais appelants
  passant de vraies valeurs (`LocalVideoTile.tsx` → `isLocal={true}`, `ConversationHeader.tsx` →
  `callId={currentCall.id}`, `VideoCallInterface.tsx` → `callDuration={callDuration}` depuis
  `useCallDuration()`). Vérification manuelle (lecture complète des 3 corps de composant) : aucune des 3
  props n'est actuellement lue dans le corps du composant (donc zéro régression comportementale visible
  aujourd'hui — `isLocal` : le mirroring est géré par le `className` de l'appelant, pas par `VideoStream`
  lui-même ; `callId`/`callDuration` : jamais référencés). **Fix** : syntaxe de renommage explicite
  (`isLocal: _isLocal = false`, etc.) — lie correctement chaque prop à son nom d'interface déclaré tout en
  gardant le préfixe `_` sur la variable locale (`varsIgnorePattern: "^_"` dans `eslint.config.mjs`),
  puisqu'aucune des 3 n'est lue ailleurs dans le rendu aujourd'hui — zéro changement de comportement, pur
  fix de type. Suite `__tests__/components/video-calls/` : 8/8 suites, 35/35 tests verts. `eslint` non
  exécutable dans ce sandbox (`TypeError: Converting circular structure to JSON` sur `next/core-web-vitals`
  — problème d'environnement pré-existant, indépendant de ce fix ; le raisonnement `varsIgnorePattern`
  reste vérifiable par lecture directe de `eslint.config.mjs`).
- **iOS (lecture seule, aucun changement — pas de toolchain Swift dans ce sandbox)** : non ré-audité cette
  vague, aucun candidat neuf recherché (périmètre volontairement limité à gateway + web, cf. constat répété
  30+ vagues consécutives).
- **Reste ouvert (inchangé)** : items J, C6, CALL-DIAG retagging, threading TTL, `call:force-leave`
  server-emit ambiguïté (le sous-cas broadcast-avant-autorisation traité cette vague était un bug DISTINCT
  de cette ambiguïté documentée, toujours ouverte pour le reste), 3 findings iOS structurels Vague 28,
  landscape/Dynamic-Type Vague 28/29, `updateCallStatus()` dead-code duration anchor (Vague 30),
  camera-flag rollback + `CXProviding` iOS (Vague 31/32), `call:end` fast-path `duration:0` (non
  atteignable, valeur cosmétique seulement — distinct du bug d'autorisation corrigé cette vague), speaker
  toggle no-op web (nécessite design dédié).

## Vague 36 — accessibilité VoiceOver iOS : glyphe signal + badge durée vidéo (2026-07-11)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` : HEAD à jour (`c358be9`). PR ouverte trouvée AVANT de commencer : **#1825**
(`claude/loving-thompson-1jf9pj`, TURN TTL floor + buffered-offer answer race iOS — audit fiabilité/
sécurité complet du même mandat, ouvert quelques heures plus tôt le même jour) — diff lu intégralement,
aucun recouvrement (fichiers distincts : `TURNCredentialService.ts`/`CallManager.swift` vs les deux fichiers
ci-dessous). Vu que 35 vagues antérieures avaient déjà largement épuisé les bugs de fiabilité/race gateway+web
et que #1825 venait de repasser tout le pipeline iOS reliability/CallKit/PushKit, cette vague a délibérément
choisi un angle neuf jamais couvert par les vagues précédentes : accessibilité VoiceOver / conformité HIG de
l'UI d'appel iOS (lecture seule, pas de toolchain Swift dans ce sandbox — CI `iOS Tests` est le seul juge
définitif). Un agent d'exploration dédié a lu tout `tasks/calls-fonctionnel-todo.md` (a11y/VoiceOver/Dynamic
Type/landscape) + `lessons.md` pour écarter les faux positifs déjà tranchés (label avatar `IncomingCallView`
mort mais inoffensif, "leak" `NotificationCenter` de `CallManager`, "race" `remoteVideoTrack` — les trois
confirmés faux) avant de rapporter.

- **[BUG RÉEL, iOS, CONFIRMÉ + CORRIGÉ, HAUTE confiance] `CallSignalStrength.accessibilityLabel` annonçait
  un ÉVÉNEMENT de connexion (reconnexion/perte) alors que le cas peut aussi représenter une MÉTRIQUE de
  qualité temps réel sur un lien pleinement connecté.** `CallSignalGlyph.swift` — `.fair`/`.poor`/`.lost`
  sont produits par `from(level:connection:)` de DEUX sources distinctes que l'enum ne peut pas discriminer
  après coup : (1) repli ICE binaire avant le 1er échantillon de stats (`connection: .reconnecting/.checking/
  .new` → `.fair` ; `.disconnected/.failed/.closed` → `.lost`) — ici "Reconnexion"/"Connexion perdue" sont
  vraies — OU (2) des stats RTT/perte temps réel sur un lien `.connected` sain (test préexistant
  `test_from_fairLevel_returnsFair` : `.from(level: .fair, connection: .connected)` → `.fair`) — ici le
  lien n'a JAMAIS bougé, seule sa qualité est moyenne/faible. L'ancien libellé confondait les deux : un
  utilisateur VoiceOver sur un appel à bande passante médiocre mais jamais interrompu entendait "Reconnexion"
  à chaque effleurement du glyphe, et "Connexion perdue" pour un lien juste dégradé (`.poor`) — fausse alerte
  répétée sur un appel qui va bien. **Fix** : les libellés décrivent désormais UNIQUEMENT la force du signal
  (jamais un événement de connexion), honnête dans les deux branches — `.fair` → "Signal moyen" (nouvelle clé
  `call.quality.fair`), `.poor` → "Signal faible" (nouvelle clé `call.quality.poor`, séparée de `.lost` qui
  partageait jusqu'ici le même libellé), `.lost` → "Signal très faible" (clé `call.quality.lost` réutilisée,
  valeur changée). Les vrais événements de reconnexion/perte restent annoncés séparément par les bannières
  `isSignalingDegraded`/`isRemoteQualityDegraded` de `CallView` (déjà en place, vagues antérieures) — ce
  glyphe n'a jamais été leur canal. L'ancienne clé `call.quality.reconnecting` est supprimée (usage exclusif
  confirmé : aucun autre call-site dans `apps/ios`). 5 locales mises à jour (de/en/es/fr/pt-BR),
  `call.quality.good`/`call.quality.inProgress` inchangées (non ambiguës). Tests TDD
  (`CallSignalIndicatorTests.swift`) : `.fair` sur `connection: .connected` ne doit pas contenir "reconnec" ;
  `.poor` sur `connection: .connected` ne doit pas dire "lost"/"perdu" ; `.poor` et `.lost` doivent maintenant
  produire des libellés distincts (avant : identiques).
- **[BUG RÉEL, iOS, CONFIRMÉ + CORRIGÉ, HAUTE confiance] Le badge durée du layout vidéo avalait le libellé
  d'accessibilité de ses enfants (glyphe signal + icône réseau-faible-contact) via `children: .ignore`
  implicite.** `CallView.swift` (`videoCallLayout`, badge durée ~l.1004-1057) — appliquer `.accessibilityLabel`/
  `.accessibilityValue` directement sur le `HStack` conteneur le transforme implicitement en UN SEUL élément
  VoiceOver opaque : le `.accessibilityLabel("Réseau faible (contact)")` posé sur l'icône `wifi.exclamationmark`
  (et, transitivement, le libellé du glyphe signal ci-dessus) n'atteignait donc JAMAIS VoiceOver — seul
  "Durée de l'appel, MM:SS" sortait, peu importe l'état réseau. Contrairement au layout audio (qui a des
  `statusPill` séparées pour porter cet état), le commentaire du fichier confirme que **le layout vidéo n'a
  aucune autre surface** pour cette information — le badge est le SEUL endroit où elle existe en appel vidéo.
  Même famille de bug que le swallow déjà corrigé une fois dans `CallsTab` (Vague 29, `CallRowDialButton`),
  réapparu ici sans être détecté. **Fix** : nouvelle propriété calculée `videoDurationBadgeAccessibilityLabel`
  compose "Durée de l'appel" + (si `signalStrength.isDegraded`) le libellé du glyphe + (si
  `isRemoteQualityDegraded`) "Réseau faible (contact)" — parité stricte avec ce que montre visuellement le
  badge (le glyphe transitoire n'apparaît QUE dégradé, l'icône QUE si le pair est dégradé). Les libellés
  individuels de l'icône/du glyphe sont retirés du corps (morts, swallowed) ; `.accessibilityElement(children:
  .ignore)` posé explicitement sur le `HStack` interne (au lieu de compter sur le comportement implicite) pour
  qu'un futur retrait du label parent ne réexpose pas silencieusement des annonces fragmentées. Tests TDD
  (`CallViewAccessibilityTests.swift`, source-pattern par cohérence avec le reste du fichier — pas de toolchain
  Swift pour instancier la vue) : le badge utilise la propriété composée (pas la clé brute) ; `children:
  .ignore` explicite présent ; l'icône wifi n'a plus de libellé orphelin ; la propriété composée référence bien
  `isRemoteQualityDegraded` ET `signalStrength.isDegraded`/`signalStrength.accessibilityLabel`.
- **Non implémenté cette vague** : reste de l'audit a11y (WebRTCVideoView, CallBubbleView, FloatingCallPillView,
  CallsTab, CallDetailSheet, BubbleCallNoticeView) confirmé déjà conforme (tap targets, traits/values des
  toggles, polices Dynamic-Type) par les corrections des vagues précédentes — aucun nouveau candidat.
- **Reste ouvert (inchangé + additions)** : tout ce qui précède, plus — CI `iOS Tests` reste la seule
  vérification réelle des deux fixes ci-dessus (aucun Xcode/Swift dans ce sandbox, comme 36 vagues
  consécutives) ; PR #1825 (autre session, même mandat) à suivre séparément, aucun recouvrement avec cette
  vague.

## Vague 37 — `call:signal` servait un participant déjà parti depuis le cache de session (audit #10 régression) (2026-07-11)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche dédiée
déjà mergée (audit #9, `45a13ba`) → redémarrée depuis `origin/main` (§ règle "PR déjà mergée = travail
neuf"). Aucun autre PR ouvert ne touche aux appels (`#1873` web realtime timers, `#1874` android media
cache — vérifiés sans recouvrement). Un agent d'exploration dédié, briefé avec les 36 vagues + audit
2026-07-11 (déjà CLOS) pour falsifier tout candidat contre le travail déjà fait, a ciblé le commit le plus
récent non encore audité en profondeur (`3061b1f`, audit #10 — cache TTL 2s du hot-path `call:signal`).

- **[BUG SÉCURITÉ RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD]** Le cache `signalSessionCache` (TTL 2s, audit
  #10) ne force une relecture DB que dans deux cas : signal `answer`, ou participant **absent** de
  l'instantané caché (garde-fou "join tout frais", `findSender`/`findTarget` retournent `undefined`).
  Aucun garde-fou ne couvrait le cas inverse : un participant **présent** dans l'instantané caché
  (`leftAt: null`) qui a réellement quitté DEPUIS l'écriture du cache — `call:leave`/`call:force-leave`/
  `call:end`/l'expiry de la grâce de reconnexion déconnexion mettent tous à jour `CallParticipant.leftAt`
  en DB mais ne touchaient jamais `signalSessionCache`. `findSender`/`findTarget` matchent alors
  l'entrée périmée, et la vérification CVE-001 "sender est bien participant de l'appel" passe à tort.
  **Scénario** : A et B en appel ; une rafale ICE prime le cache pour ce `callId` ; A quitte proprement
  (`call:leave`, DB à jour, A hors de la room) ; pendant jusqu'à 2s, A (toujours connecté au gateway, plus
  participant) peut émettre `call:signal` de type `offer`/`ice-restart`/`ice-candidate` (seul `answer`
  contourne le cache) ciblant B — la session cachée périmée montre encore A actif, la vérification CVE-001
  passe à tort, et le signal est relayé au socket de B (injection de signalisation par un participant
  parti, exactement ce que CVE-001 durcit depuis 8+ vagues). **Fix** : nouvelle méthode privée
  `invalidateSignalSession(callId)` appelée aux 4 sites qui écrivent `leftAt` dans ce handler —
  `call:leave`, `call:force-leave`, `call:end`, et `leaveParticipationAndBroadcast` (chemin partagé
  disconnect immédiat / expiry de grâce de reconnexion, succès `leaveCall` ET fallback d'écriture directe
  Prisma si `leaveCall` lève). La CallCleanupService (GC/heartbeat, échelle 60-120s) n'est PAS concernée :
  son délai est très supérieur au TTL de 2s, la fenêtre de risque a de toute façon déjà expiré par TTL
  naturel avant que le GC n'agisse.
- **Tests TDD** (`CallEventsHandler-signal-cache-invalidation.test.ts`, nouveau fichier) : RED confirmé
  (les 3 tests d'éviction échouaient — `signalSessionCache.has(callId)` restait `true` après leave/end ;
  le 4e test — signal post-leave rejeté plutôt que relayé — atteignait `TARGET_NOT_FOUND: no active
  connection`, preuve qu'il passait bien au-delà du contrôle d'autorisation attendu `NOT_A_PARTICIPANT`)
  avant le fix. GREEN après (4/4). Suite complète filtrée `Call` : 38/38 suites, 932/932 tests verts.
  Suite gateway complète : 525/525 suites, 14139/14140 tests verts (1 skip pré-existant, sans rapport).
  `tsc --noEmit` gateway : 0 erreur avant et après (`git stash` du seul fichier source, `packages/shared`
  buildé au préalable comme l'exige CLAUDE.md pour un tsc gateway propre).
- **Reste ouvert (inchangé)** : tout le backlog des vagues précédentes, plus — dette mineure résiduelle
  de l'audit #10-#11 (emits Android `call:screen-capture-detected`/`call:analytics`, jamais testable dans
  ce sandbox sans device 2 réel) ; aucun nouveau candidat gateway/web de confiance comparable trouvé après
  ce passage (cf. rapport de l'agent d'exploration dédié).

## Vague 38 — timeout no-answer web à 30s, 15s plus court que la convention iOS documentée (2026-07-11)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche déjà
au niveau d'`origin/main` (aucune divergence, dépôt shallow re-déshallow pour confirmer). Vague 37 avait
conclu à aucun nouveau candidat gateway/web — un second agent d'exploration dédié, briefé avec l'historique
complet des 37 vagues + l'audit clos, a ciblé un angle différent (asymétrie de budget de sonnerie côté
client) plutôt que ré-auditer l'autorisation/les handlers déjà couverts.

- **[MOYEN, web, CONFIRMÉ + CORRIGÉ]** `CallManager.tsx` (`CALL_TIMEOUT_MS`, ligne 28) coupait l'appel
  côté web après **30s** sans réponse — 15s plus tôt que le budget iOS documenté
  (`WebRTCTypes.swift:outgoingRingTimeoutSeconds = 45.0`, commentaire explicite « 15s headroom under the
  gateway's hard cap » de 60s, `CallService.RINGING_TIMEOUT_MS`). Android n'a aucun timer client propre
  (attend le frame serveur, donc tolère de fait ~60s). **Scénario concret** : A appelle B depuis le web ;
  B est lent à répondre (distraction, push en retard) mais aurait décroché à 38s — largement dans le
  budget iOS (45s) et serveur (60s), et le genre de cas qu'Android tolère par construction. Parce que
  l'appelant est sur web, `CallManager.tsx` émet `call:leave` à 30s : `CallService.leaveCall` (chemin
  pré-answer) résout la session en `missed` avant que B ait pu la rejoindre — tout `call:join` ultérieur
  de B est rejeté. Le même callee lent aurait pu se connecter avec un appelant iOS ou Android. C'est une
  extension de l'item #7 déjà documenté (« budgets de sonnerie incohérents, pas de source de vérité
  unique ») qui ne mentionnait jamais la vraie valeur web (30s) ni ne remettait en cause si 30s était la
  bonne valeur — les deux fixes web précédents sur ce timer (Vague 16, Vague 30) ne faisaient que le
  réparer pour qu'il se déclenche correctement, jamais reconsidérer sa valeur. **Fix** : `CALL_TIMEOUT_MS`
  30000 → 45000, commentaire documentant l'alignement sur la convention iOS. Web-only (aucun changement
  gateway/iOS/Android — les deux autres plateformes étaient déjà correctes/tolérantes).
- **Tests** : `CallManager.calleeTimeout.test.tsx` + `CallManager.initiatorTimeout.test.tsx` mis à jour
  (constante locale + libellés 30s→45s) ; les deux étaient déjà des reproductions fidèles du comportement
  réel (asserts sur `CALL_TIMEOUT_MS + 1`), donc le changement de valeur suffit à les garder verts sans
  changer leur structure. 18 suites / 122 tests verts sur `apps/web/**/*video-call*`. `tsc --noEmit` :
  34 erreurs préexistantes dans `CallManager.tsx` (typage `socket as unknown`, sans rapport, confirmées
  identiques avant/après via `git stash`) ; 0 nouvelle erreur introduite. Lint (`eslint`) cassé dans ce
  sandbox après `bun install --ignore-scripts` (config circulaire, environnement, sans rapport avec ce
  diff) — non bloquant, pas re-tenté.
- **Reste ouvert (inchangé)** : tout ce qui précède. Envisagé mais non fait : hisser la valeur en constante
  partagée `packages/shared` consommée par iOS/Android — reporté (aucun toolchain Swift/Kotlin dans ce
  sandbox pour vérifier une modification cross-platform ; iOS/Android ont déjà chacun leur propre valeur
  correcte documentée, seul web dérivait).

## Vague 39 — `call:end` : deux sites castaient la raison brute du client en `CallEndReason` sans normalisation (gateway) (2026-07-12)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). `git fetch
origin main` : HEAD (`489176d`) à jour. PR ouvertes trouvées AVANT de commencer — **#1883** (iOS,
`P2PWebRTCClient` delegate-identity guard), **#1880** (web, comments — hors périmètre appels), **#1879**
(web, `CALL_TIMEOUT_MS` 30s→45s), **#1884** (Android, hors périmètre appels) — les trois diffs pertinents
lus intégralement, aucun recouvrement de fichiers avec cette vague (gateway `CallService.ts`/
`CallEventsHandler.ts` uniquement). Un agent d'exploration dédié, briefé pour falsifier tout candidat
contre les 37 vagues précédentes + `lessons.md`, a lu `CallEventsHandler.ts`/`CallService.ts`/
`TURNCredentialService.ts`/`call-schemas.ts` en entier ; 2 de ses 4 candidats se sont révélés faux
positifs après vérification manuelle complète (détaillés ci-dessous), 2 ont donné le bug réel corrigé
cette vague.

- **[FAUX POSITIF, écarté après vérification]** Le candidat "`call-schemas.ts` : la regex `reason`
  `/^[a-z_]+$/` ne peut jamais matcher les valeurs camelCase (`connectionLost`/`heartbeatTimeout`/
  `garbageCollected`) que `CallService.resolveEndReason()` gère" est réel textuellement mais **sans
  scénario d'exploitation** : ces 3 raisons ne sont JAMAIS envoyées par un client — elles sont des
  décisions **serveur-only** (`forceEndOrphanedCallSession(callId, CallEndReason.connectionLost)` au
  disconnect, `CallCleanupService` au GC) qui appellent `endCall`/`forceEndOrphanedCallSession` avec
  l'enum typé directement, jamais via le payload `call:end` validé par ce schéma. Vérifié par grep complet
  des 3 clients (web `CallManager.tsx` : envoie seulement `'rejected'`/`'completed'` ; iOS : `call:end` n'a
  **aucun `reason`** sauf `'rejected'` codé en dur pour le refus, cf. `MessageSocketManager.swift`).
- **[NON TRANCHÉ]** Le candidat "§4.6 buffered-offer replay ne couvre pas `answer`" n'a pas été creusé
  cette vague (temps alloué au bug confirmé ci-dessous) — reste un candidat ouvert pour une vague future,
  non vérifié ni comme réel ni comme faux.
- **[BUG RÉEL, gateway, CONFIRMÉ + CORRIGÉ, TDD] Deux sites castaient directement la `reason` brute du
  client en `CallEndReason` (`as CallEndReason`) au lieu de la faire passer par
  `CallService.resolveEndReason()`, la même normalisation que le chemin autoritatif.** Le schéma Zod
  `socketEndCallSchema` n'autorise que le charset `[a-z_]{1,50}` — PAS l'appartenance à l'enum
  `CallEndReason` (`completed`/`missed`/`rejected`/`failed`/`connectionLost`/`heartbeatTimeout`/
  `garbageCollected`). Une chaîne schema-valide mais hors-enum (`"busy"`, `"declined"`, `"hangup"`, ...)
  passait donc la validation puis était castée telle quelle : (1) `CallEventsHandler.ts` (`call:end`,
  fast-path optimiste `socket.to(...).emit('call:ended', ...)`, ~L3017) — le pair recevait cette chaîne
  brute comme `reason`, alors que le broadcast autoritatif qui suit quelques lignes plus loin
  (`endCall()` → `resolveEndReason()`) l'aurait normalisée en `completed` : **les deux broadcasts pouvaient
  se contredire**, et un client fortement typé (Swift `CallEndReason`, Kotlin sealed class) décodant la
  chaîne brute du fast-path risque un échec de désérialisation / valeur inconnue silencieusement droppée.
  (2) `forceEndOrphanedCallAfterOptimisticBroadcast()` (~L890, appelée depuis le catch-block de `call:end`
  quand `endCall()` échoue après le fast-path) — cast identique, mais ici la valeur est ensuite persistée
  dans la colonne Prisma strictement typée `CallSession.endReason` : une chaîne hors-enum ferait
  potentiellement échouer l'écriture Prisma elle-même (validation enum côté client Prisma), le catch
  "best-effort" (commentaire du fichier : "a failure here is logged, not thrown") avalant l'échec
  silencieusement — la session resterait bloquée `active` jusqu'au GC 120s, exactement le symptôme que ce
  chemin de récupération existe pour éviter. **Fix** : `CallService.resolveEndReason()` passée de
  `private` à publique (single source de vérité déjà utilisée par le chemin autoritatif, maintenant
  réutilisée par les 2 sites) ; les 2 casts remplacés par `this.callService.resolveEndReason(reason)`.
  Les 2 AUTRES casts `as CallEndReason` du fichier (L660, L2181 — `leftSession.endReason`/
  `callSession.endReason`) ne sont PAS concernés : leur source est déjà une valeur enum écrite en DB par
  le service lui-même (round-trip Prisma déjà normalisé), pas de la saisie client brute — vérifié avant
  de les exclure du périmètre du fix.
- **Tests TDD** : 4 nouveaux cas — 2 dans `CallEventsHandler.test.ts` (fast-path + force-end-recovery,
  `reason: 'busy'` → `'completed'`), `CallEventsHandler-end.test.ts` (2 assertions pré-existantes qui
  vérifiaient le passage brut de `END_DATA.reason = 'hangup'` mises à jour pour attendre la valeur
  normalisée — ces tests figeaient le comportement buggy par construction). RED confirmé par `git stash`
  du seul diff source (2 fichiers) en conservant les mocks de test mis à jour : échec précis attendu
  (`Received: "reason": "busy"` / `"hangup"` au lieu de `"completed"`), aucune autre régression. GREEN
  après restauration. Effet de bord découvert en cours de route : 3 fichiers de mock `CallService`
  (`CallEventsHandler.test.ts`, `CallEventsHandler-end.test.ts`,
  `CallEventsHandler-signal-cache-invalidation.test.ts`) + 1 stub e2e manuel
  (`calls-two-socket-e2e.test.ts`, `callServiceStub as unknown as CallService`) ne définissaient pas
  `resolveEndReason` → `TypeError` runtime dès le premier appel une fois la méthode consommée par le
  handler ; les 4 corrigés en miroir de l'implémentation réelle (même switch), sinon 12 tests
  préexistants auraient régressé (2 vrais bugs de comportement dans l'e2e — `endAck.success` toujours
  `false`, y compris pour `reason: 'rejected'`, un enum pourtant valide — le TypeError crashait le handler
  quel que soit le contenu de `reason`). Suite `Call*` : 40/40 suites, 972/972 tests verts. Suite gateway
  complète (`test:coverage`) : 527/527 suites, 14193/14194 tests verts (1 skip pré-existant documenté,
  sans rapport). `tsc --noEmit` gateway : 0 erreur avant et après (`packages/shared` buildé au préalable).
  `eslint` non exécutable dans ce sandbox (config manquante `eslint.config.js` introuvable depuis
  `services/gateway` ni la racine — même limitation pré-existante que les vagues précédentes).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre cette vague (aucune toolchain
  Swift/Kotlin dans ce sandbox) ; PR #1883 (iOS, autre session) à suivre séparément, aucun recouvrement.
- **Reste ouvert (inchangé + additions)** : tout ce qui précède, plus — le candidat §4.6
  buffered-offer/`answer` non creusé (voir faux-positif ci-dessus, en réalité "non tranché", à
  re-évaluer) ; PR #1879/#1880/#1883/#1884 (autres sessions, même mandat) à suivre séparément.

## Vague 40 — retry-on-failure n'était câblé que sur le watchdog local, jamais sur `call:ended` (web) (2026-07-12)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/loving-thompson-260v1v` : les 50 commits qu'elle portait s'étaient déjà tous retrouvés dans
`origin/main` (vérifié après un `git fetch --unshallow` — le clone shallow initial masquait l'ancêtre
commun et faisait croire à une divergence ; `git merge-base --is-ancestor HEAD origin/main` confirme
franchement 0 commit non mergé). Branche redémarrée depuis `origin/main` (règle "PR déjà mergée = travail
neuf", même si ici aucune PR formelle n'a jamais existé pour cette branche précise — le contenu était déjà
entré via une autre lignée). PR ouvertes vérifiées avant de commencer : **#1889** (gateway, buffer `answer`
§4.6) et **#1890** (gateway ZMQ, `translatedAudios` optionnel) — aucun recouvrement de fichiers. Un agent
d'exploration dédié, briefé avec l'audit CLOS + les 39 vagues précédentes pour falsifier tout candidat,
a ciblé le commit le plus récent (`7e6ea5d49`, retry-on-failure web) — postérieur à toute vague/audit
existant, donc jamais revu.

- **[HAUT, web, CONFIRMÉ + CORRIGÉ, TDD]** `isRetryableCallFailure` (`call-retry-policy.ts`) — la
  politique pure qui décide quelles raisons de fin d'appel méritent un « Réessayer » (`failed`,
  `connectionLost`) — n'avait **aucun call site en production** ; son seul consommateur était son propre
  test unitaire. Le seul site de production de `offerCallRetry` était le watchdog local
  `VideoCallInterface.tsx:451` (appel jamais connecté dans les 45s) — un timer local sans raison serveur à
  consulter. Le site qui REÇOIT la raison serveur pour CHAQUE terminaison — `CallManager.handleCallEnded`
  (`CallManager.tsx:330`), sur l'event `call:ended` dont `reason: CallEndReason` est un champ
  **obligatoire et toujours peuplé** (`video-call.ts:468-472`) — ne lisait jamais `event.reason` : `reset()`
  inconditionnel, sans jamais consulter `isRetryableCallFailure` ni appeler `offerCallRetry`. **Scénario
  concret** : A et B en appel établi ; la connexion de B tombe réellement (perte réseau, tab tuée en fond,
  portable en veille) ; côté serveur ceci se résout via la grâce de déconnexion / `CallCleanupService` en
  `call:ended` avec `reason: 'failed'`/`'connectionLost'` diffusé à A ; `handleCallEnded` de A réinitialise
  l'état SANS offrir de retry — alors que c'est exactement le scénario "~16% des appels finissent en échec
  transitoire" qui a motivé la feature (commit `7e6ea5d49` + section "Retry-on-failure" de l'audit). Seul
  le cas plus étroit (appel JAMAIS connecté dans une fenêtre locale fixe de 45s) recevait le toast
  « Réessayer » — la voie la plus fréquente en usage réel (fin pilotée serveur avec raison) ne l'avait
  jamais eu.
- **Fix** : `handleCallEnded` consulte désormais `isRetryableCallFailure(event.reason)` avant `reset()` ;
  si vrai, lit `currentCall`/`controls` FRAIS via `useCallStore.getState()` (même pattern que
  `VideoCallInterface.tsx:451`, évite une dépendance périmée dans le `useCallback`) et appelle
  `offerCallRetry({ conversationId, type })` — `type` dérivé de `controls.videoEnabled`, comme le watchdog
  local. `reset()` continue inconditionnellement juste après (il préserve déjà `pendingRetry` par design).
  Aucun changement gateway/iOS/Android.
- **Tests TDD** (`CallManager.callEndedRetry.test.tsx`, nouveau fichier) : RED confirmé avant le fix — les
  2 cas `failed`/`connectionLost` échouaient (`pendingRetry` restait `null`), les cas non-transitoires
  (`completed`/`missed`/`rejected`/`heartbeatTimeout`/`garbageCollected`) passaient déjà (no-op correct).
  GREEN après fix : 8/8. Piège d'isolation de test découvert en cours de route : `reset()` préserve
  **délibérément** `pendingRetry` d'un test à l'autre (par design, pour survivre à sa propre remise à
  zéro) — `beforeEach` doit appeler explicitement `clearCallRetry()` en plus de `reset()`, sinon l'offre
  d'un cas fuit dans le suivant. Suite complète `video-call|call-retry|call-store` : 23/23 suites, 213/213
  tests verts. `tsc --noEmit` web : 30 erreurs préexistantes dans `CallManager.tsx` (typage `socket as
  unknown`, sans rapport, confirmées identiques avant/après via `git stash`) ; 0 nouvelle erreur. `eslint`
  cassé dans ce sandbox après `bun install --ignore-scripts` (config circulaire `@eslint/eslintrc`,
  environnement, même limitation pré-existante que Vague 38) — non bloquant.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre cette vague (aucune toolchain
  Swift/Kotlin dans ce sandbox) ; la feature retry-on-failure reste web-only, parité iOS/Android à
  construire dans une session avec le toolchain adéquat (déjà noté comme suivi dans le commit
  `7e6ea5d49`).
- **Reste ouvert (inchangé + additions)** : tout ce qui précède ; parité iOS/Android du retry-on-failure ;
  la piste secondaire notée par l'agent d'exploration (`CallService.leaveCall` résout tout leave
  post-answer en `completed`, y compris une vraie coupure réseau détectée seulement par l'expiry de la
  grâce de déconnexion — semble intentionnel d'après les commentaires du fichier, non creusé cette vague,
  à ré-évaluer) ; PR #1889/#1890 (autres sessions) à suivre séparément.

## Vague 41 — `pendingRetry` (retry-on-failure, web) était un scalaire unique : deux échecs transitoires sur des conversations différentes se clobbaient silencieusement (2026-07-27)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-q44x1t` redémarrée depuis `origin/main` à jour (0 commit en retard/avance). Aucune
PR ouverte au démarrage (`list_pull_requests` state=open → `[]`). 3 commits calling déjà mergés
aujourd'hui/hier, non revus : `9816c79d` (web, negotiationId), `ba58580f` (iOS, jitter reconnect),
`f31d4fe3` (gateway, scope analytics writes). Un agent d'exploration dédié, briefé avec les 40 vagues
précédentes + ces 3 commits pour falsifier tout candidat déjà couvert, a ciblé la feature retry-on-failure
elle-même (introduite Vague 40, jamais réauditée depuis).

- **[MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `pendingRetry: PendingCallRetry | null` (`call-store.ts:56`)
  était un scalaire unique écrasé sans condition par `offerCallRetry` (`set({ pendingRetry: retry })`,
  ligne 507). Deux writers de production existent (`VideoCallInterface.tsx:451`, watchdog local 45s ;
  `CallManager.tsx:431`, `call:ended` server-authoritative) et un seul consommateur — `useCallRetryToast`
  — est monté par instance UNIQUE, reparamétrée par `selectedConversation?.id`
  (`ConversationLayout.tsx:214`), pas « une instance par conversation » comme le suggérait le commentaire
  du test existant (`use-call-retry-toast.test.tsx:42`, « Left for the other conversation's hook to
  consume » — ce hook n'existe nulle part ailleurs dans l'arbre).
- **Scénario concret** : utilisateur sur la conversation Y (ou toute autre page) quand un appel
  ÉTABLI sur la conversation Z (reçu, décroché plus tôt) tombe réellement (perte réseau, tab en fond) →
  résolu côté serveur en `call:ended` `reason: 'failed'|'connectionLost'` → `CallManager` (monté
  globalement à la racine) pose `pendingRetry = {conversationId: Z, type}`. Le hook monté (scope Y ou
  absent) ne le consomme pas — c'est le comportement voulu, en attendant que l'utilisateur navigue vers
  Z. Mais si un DEUXIÈME échec transitoire survient sur une conversation W avant que l'utilisateur ne
  navigue vers Z, `offerCallRetry` écrase le scalaire : l'offre de Z est perdue **silencieusement et
  définitivement**, même si l'utilisateur ouvre Z des heures plus tard — aucun toast ne se déclenchera
  jamais pour cet appel, à l'encontre du but même de la feature (« ~16% des appels finissent en échec
  transitoire », motivation du commit `7e6ea5d49`/Vague 40).
- **Fix** : `pendingRetry` devient `PendingCallRetryMap` (`Record<conversationId, PendingCallRetry>`,
  `call-store.ts`). `offerCallRetry` fusionne par clé (`{...state.pendingRetry, [retry.conversationId]:
  retry}`) au lieu d'écraser. `clearCallRetry(conversationId?)` : avec un id, ne retire que cette entrée ;
  sans argument (compat des `beforeEach` de test existants), vide tout. `useCallRetryToast` lit
  `pendingRetryMap[conversationId]` et ne consomme (`clearCallRetry(conversationId)`) que l'entrée de SA
  conversation — les offres des autres conversations survivent intactes. `reset()` continue de préserver
  toute la map (logique inchangée, juste le type). Aucun changement de signature pour les 2 sites
  `offerCallRetry(...)` de production (même shape d'argument) ni pour `CallManager.tsx`/
  `VideoCallInterface.tsx`.
- **Tests TDD** : `call-store.test.ts` — nouveau cas « a second offer for a DIFFERENT conversation does
  not clobber an earlier unconsumed offer » (RED avant fix : la 2e offre écrasait la 1re) + cas
  `clearCallRetry(id)` scope-only vs `clearCallRetry()` clear-all. `use-call-retry-toast.test.tsx` —
  cas existant étendu : une 2e offre pour une 3e conversation ne doit pas faire disparaître l'offre déjà
  en attente pour `conv-OTHER`. `CallManager.callEndedRetry.test.tsx`/`CallManager.callWaiting.test.tsx`
  adaptés à la forme map (`toEqual({[id]: {...}})` / `toEqual({})` au lieu de `toBeNull()`). Suite
  `--testPathPatterns=call` complète : 35/35 suites, 372/372 tests verts. `tsc --noEmit` web : 1184
  erreurs préexistantes identiques avant/après (`git stash` diff, aucune dans les fichiers touchés) ;
  0 nouvelle erreur. `eslint` cassé dans ce sandbox (config circulaire `@eslint/eslintrc`), même
  limitation pré-existante que Vagues 38/40, non bloquant.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox) ; la feature retry-on-failure reste web-only.
- **Reste ouvert (inchangé + addition)** : tout ce qui précède (Vague 40) ; noter que même après ce fix,
  une offre pour une conversation jamais revisitée par l'utilisateur reste en mémoire indéfiniment (pas de
  TTL/expiry) — pas une fuite pratique (une entrée = ~2 champs string, bornée par le nombre de
  conversations distinctes ayant eu un échec transitoire, purgée dès la visite ou un nouvel appel réussi
  sur cette même conversation via les writers existants) mais un candidat de suivi si une UX de
  staleness (« cet appel a échoué il y a longtemps ») s'avère nécessaire ; piste `CallService.leaveCall`
  de la Vague 40 toujours non creusée ; PR #1889/#1890 à suivre séparément.

## Vague 42 — `CallService.leaveCall` résolvait TOUT leave post-answer en `completed`, y compris un vrai crash/déconnexion réseau (2026-07-28)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-y6gp0r` : le ref remote avait déjà été mergé et auto-supprimé par une exécution
précédente (0 commit propre au-delà de l'ancien `main`) — redémarrée depuis `origin/main` à jour, règle
"PR déjà mergée = travail neuf". 2 PR ouvertes trouvées au démarrage, toutes deux issues d'exécutions
précédentes de cette même routine, CI verte + `mergeable_state: clean` + 0 review bloquante : **#2424**
(gateway, shape d'ack `call:initiate`/`call:join`) et **#2422** (web, `pendingRetry` scalaire → Vague 41)
— mergées avant de commencer ce cycle. Un agent d'exploration dédié (iOS lifecycle/WebRTC/CallKit) n'a
trouvé qu'une seule piste concrète — du code Swift mort (`CallManager.handleRemoteReject`, 0 call site) —
laissée en l'état : aucune toolchain Xcode/simulateur dans ce sandbox, donc aucune modification Swift
n'est vérifiable ici (même contrainte que TOUTES les vagues précédentes).

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** La piste "non creusée" laissée ouverte par les Vagues 40
  et 41 (« `CallService.leaveCall` résout tout leave post-answer en `completed`, y compris une vraie
  coupure réseau détectée seulement par l'expiry de la grâce de déconnexion — semble intentionnel,
  à ré-évaluer ») a enfin été creusée. Confirmée réelle : `leaveParticipationAndBroadcast`
  (`CallEventsHandler.ts`) est appelée **exclusivement** depuis `onDisconnectGraceExpired` — jamais
  depuis un `call:leave`/`call:end` explicite (grep : un seul call site). Son chemin heureux
  (`callService.leaveCall()` réussit) laissait `CallService` défaulter l'`endReason` à `completed`,
  alors que son PROPRE chemin de repli d'erreur, quelques lignes plus bas (`leaveCall()` qui throw →
  `forceEndOrphanedCallSession(..., CallEndReason.connectionLost)`), stampait déjà `connectionLost` pour
  ce même scénario exact. Incohérence interne confirmant le bug : le happy-path et le fallback d'erreur
  du MÊME événement (déconnexion involontaire, jamais raccrochée) disaient deux choses différentes.
- **Impact concret** : la feature retry-on-failure (Vagues 40/41, `isRetryableCallFailure`) n'offre
  « Réessayer » que pour `reason: 'failed'|'connectionLost'`. Le scénario le plus courant de coupure
  réseau réelle en usage — le socket de signaling tombe et n'expire jamais dans la fenêtre de grâce —
  se résolvait en `completed`, **exactement comme un raccroché volontaire**, et n'offrait donc jamais le
  retry pour le cas même qui a motivé la feature (« ~16% des appels finissent en échec transitoire »).
- **Fix** : nouveau champ optionnel `endReasonHint?: CallEndReason` sur `LeaveCallData`
  (`CallService.ts`). Les deux branches terminales de `leaveCall` (principale et idempotente) l'utilisent
  désormais : `endReasonHint ?? CallEndReason.completed` au lieu du littéral `completed` en dur — la
  classification pré-réponse (`missed`) est inchangée, seul le post-réponse est concerné.
  `leaveParticipationAndBroadcast` passe `endReasonHint: CallEndReason.connectionLost` sur son unique
  site d'appel. Les 3 AUTRES call sites de `leaveCall()` (`call:leave` explicite, `call:force-leave`,
  route REST, `AuthHandler`) ne passent aucun hint — comportement `completed` par défaut strictement
  inchangé, aucune régression sur un hangup délibéré.
- **Tests TDD** : RED confirmé via `git stash` du diff source seul (2 fichiers) en gardant les tests mis à
  jour — 3 échecs précis attendus (2 tests pré-existants dans `CallEventsHandler-restart-resilience.test.ts`
  qui figeaient l'objet exact passé à `leaveCall` sans le hint, TS2353 sur les 3 nouveaux cas de
  `callService-leaveCall.test.ts` référençant un champ encore inexistant). GREEN après restauration.
  Nouveau describe `CallService.leaveCall() — endReasonHint` (4 cas : branche principale avec/sans hint,
  branche pré-réponse ignore le hint, branche idempotente honore le hint) + 1 cas dans
  `CallEventsHandler-disconnect.test.ts` (le handler transmet bien le hint) + mise à jour des 2 tests
  pré-existants qui pinnaient l'ancien comportement buggy par construction (même piège que documenté aux
  Vagues précédentes — `git stash` uniquement les 2 fichiers source, tests déjà mis à jour restent en
  place pour confirmer le RED précis). Suite gateway complète (`bun run test:coverage`) : 544/544 suites,
  14780/14781 tests verts (1 skip pré-existant documenté, sans rapport). `tsc --noEmit` gateway : 0
  erreur avant et après (`packages/shared` généré + buildé au préalable : `npx prisma generate` a
  nécessité un contournement — `bunx`/`npx` déclenchaient une install `pnpm add prisma@6.19.3` qui restait
  bloquée indéfiniment dans ce sandbox ; invoquer directement le binaire déjà présent dans le store pnpm
  hoisté racine a débloqué la génération en <1s).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox) ; dead code Swift `CallManager.handleRemoteReject` noté ci-dessus, non touché.
- **Reste ouvert (inchangé + addition)** : tout ce qui précède (Vagues 40/41) ; dead code Swift
  `CallManager.handleRemoteReject(callId:)` (0 call site, à vérifier/supprimer dans une session avec
  Xcode) ; `CallManager.swift` (5462 lignes) et `CallEventsHandler.ts` (4089 lignes) restent des candidats
  de découpage God-object, non traités cette vague (refactor risqué sans compilation/tests locaux
  vérifiables sur la partie iOS) ; parité iOS/Android du retry-on-failure toujours à construire.

## Vague 43 — `AuthHandler`'s anonymous-guest disconnect leave était le sibling manqué du fix Vague 42 (2026-07-29)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-nurgaz` : le ref remote avait déjà été mergé et auto-supprimé par l'exécution d'hier
(`merge-base --is-ancestor` confirme le tip local contenu dans `origin/main`) — redémarrée depuis
`origin/main` à jour, règle "PR déjà mergée = travail neuf". 2 PR ouvertes trouvées au démarrage :
**#2428** (iOS, CallKit `timedOutPerforming` + race audio-reactivation) et **#2430** (gateway, hors
périmètre calls — share-link `maxUses` gate sur l'envoi de message). #2428 n'a **aucun run `iOS Tests`**
sur sa branche (`ios-tests.yml` ne se déclenche que sur push `dev` ou `workflow_dispatch` manuel, jamais
sur PR — décision délibérée du 2026-07-27, cf. l'en-tête du workflow) et le token GitHub de cette session
n'a pas la permission de déclencher `workflow_dispatch` (`403 Resource not accessible by integration`) —
commentaire posté sur la PR signalant que ses checks verts ne couvrent pas le diff Swift, laissée non
mergée en attendant une vérification humaine.

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** Un agent d'exploration dédié, briefé avec les 42 vagues
  précédentes + l'audit historique pour falsifier tout candidat déjà couvert, a trouvé le sibling exact
  du fix Vague 42 sur le chemin **anonyme** : `AuthHandler.handleDisconnection` (`AuthHandler.ts:392-398`)
  appelle `callService.leaveCall()` sur `disconnect` pour un participant anonyme **sans jamais passer
  `endReasonHint`** — alors que ce chemin est, par construction (commentaire in-code `CALL-RESILIENCE` à
  `AuthHandler.ts:360-368`), la seule route de cleanup d'appel pour les participants anonymes
  (`CallEventsHandler` ne peut pas les résoudre, sa recherche est indexée sur `participant.userId`,
  toujours `null` pour un anonyme) et se déclenche **exclusivement** sur une coupure socket involontaire —
  jamais un `call:leave`/`call:end` délibéré. Sans le hint, `CallService.leaveCall` retombe sur son défaut
  `CallEndReason.completed`, exactement le même bug que Vague 42 avait corrigé pour
  `leaveParticipationAndBroadcast` (le twin registered-user de ce même événement `disconnect`).
- **Impact concret** : un invité anonyme (lien de partage) dont l'app crash ou le réseau tombe pendant un
  appel voit son départ enregistré `completed` (raccroché normal) au lieu de `connectionLost` — la feature
  retry-on-failure web (Vagues 40/41) n'offre "Réessayer" que pour `failed`/`connectionLost`, donc ce
  scénario précis (coupure réseau d'un invité anonyme) ne déclenche jamais le retry, à l'inverse du même
  scénario côté utilisateur enregistré (déjà corrigé hier).
- **Fix** : ajout de `endReasonHint: CallEndReason.connectionLost` sur cet unique site d'appel
  (`AuthHandler.ts`), import `CallEndReason` depuis `@meeshy/shared/prisma/client` (déjà exporté comme
  valeur, même pattern que `CallEventsHandler.ts`). Changement d'une ligne + un import, aucune autre
  branche touchée.
- **Non corrigé, noté en suivi** : ce même chemin anonyme ne broadcast jamais `PARTICIPANT_LEFT`/
  `call:ended`/`postCallSummary`/`evictCallRoomSockets` contrairement à `leaveParticipationAndBroadcast`
  (confirmé : zéro `CALL_EVENTS`/`io.emit` dans `AuthHandler.ts`) — l'autre partie ne voit jamais que
  l'appel s'est terminé, l'UI reste "en appel" jusqu'au GC `CallCleanupService` (~120s). Fix réel plus
  large (`AuthHandler` n'a pas de référence `io`/callback de broadcast — nécessite le même genre
  d'injection que `CallCleanupService.setPostSummaryCallback`) ; laissé pour une session dédiée plutôt que
  d'élargir la portée de ce fix chirurgical.
- **Tests TDD** : RED confirmé (`AuthHandler.test.ts` pinnait l'ancien payload sans `endReasonHint`, avant
  le fix la nouvelle assertion échoue exactement comme attendu) puis GREEN après le fix. Suite complète
  `AuthHandler.test.ts` : 50/50. Suite gateway complète (`jest --config=jest.config.json --coverage=false`,
  après `prisma generate` + `bun run build` de `packages/shared` comme documenté ci-dessus — `bun install`
  a d'abord échoué sur le postinstall natif de `grpc-tools` (téléchargement binaire bloqué par le proxy
  sandbox), contourné avec `--ignore-scripts`) : 544/544 suites, 14790/14791 tests verts (1 skip
  pré-existant, sans rapport). `tsc --noEmit` gateway : 0 erreur.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox).
- **Reste ouvert (inchangé + addition)** : tout ce qui précède ; broadcast manquant sur le chemin anonyme
  (ci-dessus) ; dead code Swift `CallManager.handleRemoteReject` ; God-objects `CallManager.swift`/
  `CallEventsHandler.ts` ; parité iOS/Android retry-on-failure ; PR #2428 (iOS) non mergée en attendant
  une vérification `iOS Tests` manuelle par un humain.

## Vague 44 — broadcast manquant sur le chemin anonyme (le fil laissé ouvert par la Vague 43), corrigé (2026-08-01)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-01ebob`, redémarrée depuis `origin/main` à jour (0 PR ouverte trouvée au démarrage —
`list_pull_requests` state=open vide, donc rien à mergér avant de commencer). Un audit de repository
(commits récents, `tasks/calls-fonctionnel-todo.md`, `docs/audit-calls-2026-05-11.md` via un agent
d'exploration dédié) a confirmé que le sujet le plus concret et le mieux scopé restant ouvert était
exactement celui laissé de côté par la Vague 43 : « broadcast manquant sur le chemin anonyme ».

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** Repris et creusé le fil laissé ouvert par la Vague 43 :
  `AuthHandler.handleDisconnection` — la SEULE route de cleanup d'appel pour les participants anonymes
  (`CallEventsHandler` ne peut pas les résoudre, sa recherche est indexée sur `participant.userId`,
  toujours `null` pour un anonyme) — appelait `callService.leaveCall()` puis jetait le résultat sans
  jamais rien broadcaster. Contrairement à son sibling enregistré
  (`CallEventsHandler.leaveParticipationAndBroadcast`, chemin de grâce-expiry), aucun `PARTICIPANT_LEFT`
  ni `call:ended` n'était émis, aucun `postCallSummary` ni `evictCallRoomSockets` ne tournait — confirmé
  par grep : zéro `io.emit`/`CALL_EVENTS` dans `AuthHandler.ts` avant ce fix.
- **Impact concret** : un invité anonyme (lien de partage) dont l'app crash ou le réseau tombe pendant un
  appel voit son départ enregistré correctement en DB (endReason `connectionLost` depuis la Vague 43) mais
  l'AUTRE partie ne voit jamais que l'appel s'est terminé — son UI reste "en appel" jusqu'au GC
  `CallCleanupService` (~120s), et le message système "Appel · MM:SS" n'apparaît jamais dans la
  conversation tant que ce GC ne tourne pas.
- **Fix** : extraction du volet broadcast (PARTICIPANT_LEFT + `broadcastCallEnded` conditionnel +
  `postCallSummary` + `handleMissedCall` + `evictCallRoomSockets`) de
  `CallEventsHandler.leaveParticipationAndBroadcast` en une nouvelle méthode PUBLIQUE
  `broadcastParticipantLeftResult(opts: {io, leftSession, participation, userId})` — extraction
  comportementalement neutre, `leaveParticipationAndBroadcast` l'appelle désormais au lieu de dupliquer la
  logique inline. `AuthHandler` reçoit une nouvelle dépendance optionnelle `broadcastCallParticipantLeft`
  (même pattern que `emitPresenceSnapshot` : callback pré-curryé par `MeeshySocketIOManager`, qui possède
  `io` et construit déjà `callEventsHandler` avant `authHandler`) ; la boucle anonyme capture désormais le
  `leftSession` retourné par `leaveCall()` et invoque `this.broadcastCallParticipantLeft?.({leftSession,
  participation, userId})` — optionnel pour que les tests unitaires construisant `AuthHandler` directement
  n'aient pas besoin de stubber Socket.IO ; `leaveCall()` tourne inconditionnellement dans tous les cas,
  seul le broadcast est skip si le callback est absent. Type `DisconnectParticipation` exporté depuis
  `CallEventsHandler.ts` (était un `type` interne non exporté) pour être réutilisé par la signature du
  callback côté `AuthHandler.ts`.
- **Tests TDD** : 2 nouveaux cas dans `AuthHandler.test.ts` — « broadcasts the participant-left result via
  the injected callback for an anonymous participant auto-leave » (2 participations actives → 2 appels du
  callback avec le `leftSession`/`participation`/`userId` exacts par participation, RED avant l'ajout de la
  dépendance car `broadcastCallParticipantLeft` n'existait pas) et « does not throw when
  broadcastCallParticipantLeft is not injected » (régression : comportement pré-Vague-44 inchangé quand le
  callback est absent). Suite `AuthHandler.test.ts` complète : 52/52. Les 25 suites `CallEventsHandler*`
  (494 tests) restent 100% vertes après l'extraction de `broadcastParticipantLeftResult`, confirmant
  l'absence de régression comportementale sur le chemin enregistré (grace-expiry) déjà couvert par
  `CallEventsHandler-restart-resilience.test.ts`/`CallEventsHandler-disconnect.test.ts`. `tsc --noEmit`
  gateway : 0 erreur avant et après. Suite gateway complète (`bun run test:coverage`) lancée en fin de
  vague pour confirmation finale — cf. résultat consigné au commit/PR.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox) ; changement strictement gateway.
- **Reste ouvert (inchangé)** : dead code Swift `CallManager.handleRemoteReject` ; God-objects
  `CallManager.swift`/`CallEventsHandler.ts` ; parité iOS/Android retry-on-failure ; PR #2428 (iOS) —
  vérifier si toujours ouverte/mergée par un humain depuis la Vague 43.

## Vague 45 — les routes REST end/leave n'invalidaient jamais le cache de session `call:signal` (2026-08-02)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-hfo5vo`, déjà à jour sur `origin/main` au démarrage (0 commit de retard une fois le
cache `origin/main` local rafraîchi). **1 PR ouverte trouvée au démarrage : #2458** (humain `jcnm`,
`fix/calls-anon-disconnect-signal-cleanup`) — touche exactement le même invariant
(`invalidateSignalSession`) mais sur le chemin `AuthHandler.handleDisconnection` (participant anonyme qui
se déconnecte) + un repli `forceCleanupParticipationAfterLeaveFailure`. Scope de cette vague choisi pour
ne PAS toucher `AuthHandler.ts`/`CallEventsHandler.broadcastParticipantLeftResult` afin d'éviter toute
collision avec #2458 encore en CI au démarrage de cette session.

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** Sibling exact du trou déjà fermé pour `call:ended`
  (`CallService.broadcastCallEndedIfTerminal`, commentée « Bug (parité socket) ») mais sur l'invariant
  **signal cache**, pas broadcast : les deux routes REST `DELETE /calls/:callId` (end) et
  `DELETE /calls/:callId/participants/:participantId` (leave) appellent `callService.endCall()`/
  `leaveCall()` — qui écrivent `CallParticipant.leftAt` — puis renvoient la réponse **sans jamais
  invalider** `CallEventsHandler.signalSessionCache` (TTL 2s, `call:signal`). Les handlers socket
  `call:end`/`call:leave`/`call:force-leave` appellent tous `this.invalidateSignalSession(...)`
  inconditionnellement juste après un `leaveCall()`/`endCall()` réussi (vérifié aux 3 sites,
  `CallEventsHandler.ts:2443/2675/3180`) — **inconditionnellement**, pas seulement quand l'appel devient
  terminal (`invalidateSignalSession` sur `call:leave` tourne même pour un leave de groupe qui continue).
  `CallService` possédait déjà le pont exact nécessaire (`signalCacheInvalidator` +
  `setSignalCacheInvalidationCallback`, câblé server.ts → `CallEventsHandler.invalidateSignalSession`)
  mais son seul point d'invocation (`notifyReapedCallEnded`) n'est atteint QUE par les 2 sweeps GC internes
  d'`initiateCall` — jamais par `endCall()`/`leaveCall()` eux-mêmes, donc jamais par leurs appelants REST.
- **Impact concret** : un utilisateur enregistré qui raccroche via REST (`DELETE /calls/:callId` ou
  `.../participants/:participantId` — ex. bouton raccrocher web hors chemin socket, ou tout futur client
  REST-only) laisse la session signalée en cache pendant jusqu'à 2s après son départ réel en DB. Un
  `call:signal` reçu dans cette fenêtre (ICE/SDP tardif d'un pair encore en train d'émettre) est encore
  relayé sur la base de l'instantané périmé — exactement le trou que PR #2458 corrige en parallèle pour le
  chemin `AuthHandler` anonyme, ici sur les 2 routes REST enregistrées.
- **Fix** : nouvelle méthode publique `CallService.invalidateSignalCache(callId)` — extraction neutre du
  corps de `notifyReapedCallEnded` (`this.signalCacheInvalidator?.(callId)` factorisé, comportement du
  sweep GC inchangé), symétrique à `broadcastCallEndedIfTerminal`. Les 2 routes REST l'appellent
  **inconditionnellement** juste après `endCall()`/`leaveCall()` (PAS gardée sur le statut terminal,
  contrairement à `broadcastCallEndedIfTerminal` — un leave de groupe non-terminal écrit quand même
  `leftAt` pour le partant, donc doit quand même invalider).
- **Tests TDD** : RED confirmé via `git stash` des 2 fichiers source seuls (tests déjà en place) — 5
  échecs précis (3 assertions routes REST end/leave/leave-non-terminal + 2 nouveaux cas
  `CallService.invalidateSignalCache`), GREEN après restauration. Nouveau describe
  `CallService - invalidateSignalCache` (2 cas : délègue au callback, no-op sans callback câblé — miroir
  exact du describe `broadcastCallEndedIfTerminal`) + 3 assertions routes (`calls-routes.test.ts` : end
  route, leave route, + 1 cas dédié prouvant l'invalidation même pour un leave non-terminal, contrairement
  à `broadcastCallEndedIfTerminal`). Suite gateway complète (`jest --config=jest.config.json
  --coverage=false`, après `npx prisma generate` + `bun run build` de `packages/shared` — cette fois
  `prisma generate` a réussi directement sans contournement) : 566/566 suites, 15087/15088 tests verts (1
  skip pré-existant documenté, sans rapport). `tsc --noEmit` gateway : 0 erreur.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox) ; changement strictement gateway, aucun fichier en commun avec PR #2458.
- **Reste ouvert (inchangé + addition)** : dead code Swift `CallManager.handleRemoteReject` ; God-objects
  `CallManager.swift`/`CallEventsHandler.ts` ; parité iOS/Android retry-on-failure ; PR #2458 (gateway,
  humaine) — vérifier statut CI/merge à la prochaine vague ; PR #2428 (iOS) déjà mergée depuis la Vague 43
  (confirmé cette vague, `merged: true`) ; nettoyage `any`/parsing d'erreur dupliqué dans
  `CallEventsHandler.ts` (12 occurrences `catch (error: any)` + logique `errorCode`/`message` répétée 3x
  aux handlers `call:initiate`/`call:join`/`call:end`, viole la règle CLAUDE.md « No `any` types » —
  candidat scopé et mécanique pour une prochaine vague, non traité ici pour rester chirurgical).

## Vague 46 — zéro `any` dans CallEventsHandler.ts + parsing d'erreur unifié (2026-08-02)

Candidat « scopé et mécanique » consigné en Vague 45, traité tel quel :
- **Helper extrait** : `socketio/utils/call-error-parsing.ts` —
  `callErrorMessageOf(error, fallback)` (parité exacte avec l'idiome
  `error.message || fallback` des catch `any`, objets non-Error à `.message`
  string compris) + `parseCallHandlerError(error, fallback)` (découpe
  « CODE: message » au premier deux-points, reste recollé + trim, AUCUNE
  validation de code — forme historique des 4 catch dupliqués, sur laquelle
  gatent les clients type web reconnect-rejoin `CALL_ENDED`). 9 tests unitaires.
- **4 copies remplacées** : call:initiate / call:join / call:leave / call:end.
- **12 annotations `any` éliminées** : 7 `catch (error: any)` → `catch (error)`,
  3 catch de log (`err?.message` → `callErrorMessageOf(err, String(err))`),
  lambda `(s: any)` (inférence RemoteSocket) et `(p: any)` (type structurel
  participant). `grep ': any'` sur le fichier : 0 occurrence.
- **Vérifié** : `tsc --noEmit` 0 erreur ; 26 suites / 504 tests verts
  (`--testPathPatterns 'CallEventsHandler|call-error-parsing'`), dont
  `CallEventsHandler-error-fallbacks` qui épingle le comportement
  « valeur jetée sans .message » sur join/leave — inchangé.
- **Reste ouvert (inchangé)** : dead code Swift `CallManager.handleRemoteReject` ;
  God-objects `CallManager.swift`/`CallEventsHandler.ts` ; parité iOS/Android
  retry-on-failure.

## Vague 47 — code mort `CallManager.handleRemoteReject` supprimé (2026-08-02)

Consigné « Reste ouvert » depuis la Vague 43. Vérifié avant suppression :
zéro appelant dans l'app et le SDK ; aucun événement `call:rejected` n'existe
(ni dans `packages/shared/types/video-call.ts`, ni au gateway) — le signal de
refus voyage dans `call:ended` avec `rawReason: rejected|declined`, que
`handleRemoteEnd` route via `CallEndReasonMapper` vers EXACTEMENT le même
comportement (`.declinedElsewhere` CallKit + `endCallInternal(.rejected)`).
Aucune garde de source n'ancrait ses fenêtres sur cette fonction (les
anciennes gardes fragiles de `handleRemoteEnd` avaient déjà été remplacées
par `CallEndReasonMapperTests`, comportementales).
- **Reste ouvert (inchangé)** : God-objects `CallManager.swift`/
  `CallEventsHandler.ts` ; parité iOS/Android retry-on-failure.

## Vague 48 — une offre de retry périmée survivait à un appel réussi ultérieur sur la même conversation (web) (2026-08-02)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-pddnvp`, à jour sur `origin/main` au démarrage. PR #2470 (Vague 47, suppression du
dead code Swift `handleRemoteReject`) trouvée ouverte avec CI encore `pending` — pas touchée, sur une
branche distincte. PR #2458 (parité anon-disconnect, Vague 44/45) confirmée mergée.

- **[MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `pendingRetry` (`call-store.ts:55`, `Record<conversationId,
  PendingCallRetry>`) n'était écrit que par `offerCallRetry` (posé sur un `call:ended` transitoire —
  `failed`/`connectionLost`, `CallManager.tsx:430`) et lu/consommé par `useCallRetryToast` **uniquement
  quand l'utilisateur navigue vers CETTE conversation précise**. `reset()` préserve délibérément la map
  (commentaire explicite `call-store.ts:562`). Aucun writer ne purgeait une entrée parce qu'un **nouvel
  appel indépendant sur la même conversation** s'était depuis résolu — `handleCallEnded` ne touchait
  `pendingRetry` que sur la branche `isRetryableCallFailure(event.reason)`, jamais sur l'`else` implicite.
  La note « Reste ouvert » de la Vague 41 affirmait qu'un nouvel appel réussi purgeait l'entrée « via les
  writers existants » — assertion non vérifiée : `grep pendingRetry` sur tout `apps/web` ne montre aucun
  tel writer.
- **Impact concret** : A et B en appel sur la conversation Z, coupure réseau → `pendingRetry[Z]` posée
  pendant que A navigue ailleurs (le toast ne s'affiche donc jamais). B rappelle A sur Z ; A décroche via
  le CallManager global (monté à `app/layout.tsx`, indépendant de la conversation affichée), l'appel se
  déroule normalement et se termine `completed` — `pendingRetry[Z]` reste intacte, `isRetryableCallFailure`
  étant faux sur cette branche. Des jours plus tard, A ouvre enfin la conversation Z : `useCallRetryToast`
  déclenche un toast « Réessayer ? » pour un échec déjà résolu par un vrai appel réussi entre-temps, dont
  l'action lance un nouvel appel sortant non sollicité.
- **Fix** : `handleCallEnded` (`CallManager.tsx:401`) lit désormais `currentCall`/`clearCallRetry` dans
  tous les cas (pas seulement la branche retryable) ; sur un motif NON transitoire
  (`completed`/`rejected`/`missed`/`heartbeatTimeout`/`garbageCollected`), il appelle
  `clearCallRetry(currentCall.conversationId)` — no-op si aucune entrée pour cette conversation
  (`call-store.ts:522`), donc sans risque sur le chemin déjà couvert. La garde `!waitingCall` existante est
  conservée pour les deux branches (promotion d'appel en attente : ni offre ni purge, comportement
  inchangé).
- **Tests TDD** : RED confirmé (2 nouveaux cas dans `CallManager.callEndedRetry.test.tsx` — l'entrée
  périmée survivait avant le fix) puis GREEN. Nouveau cas 1 : une offre posée pour `Z`, puis un `call:ended
  completed` sur `Z` → `pendingRetry` vide. Nouveau cas 2 (isolation) : une offre posée pour une conversation
  **différente** → intacte après le même `call:ended completed` sur `Z`. Suite calling complète web
  (`jest --testPathPatterns call`) : 35/35 suites, 374/374 tests verts. `tsc --noEmit` : aucune nouvelle
  erreur introduite dans les fichiers touchés (bruit préexistant ailleurs, `packages/shared` non buildé
  dans ce sandbox — non lié).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans ce
  sandbox) ; changement strictement web (`CallManager.tsx`, tests).
- **Reste ouvert (inchangé)** : dead code Swift `CallManager.handleRemoteReject` (PR #2470, CI en cours) ;
  God-objects `CallManager.swift`/`CallEventsHandler.ts` ; parité iOS/Android retry-on-failure.

## Vague 49 — `markCallAsMissed` n'invalidait jamais le cache de session `call:signal` (2026-08-02)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-cicy3x`, redémarrée depuis `origin/main` à jour (0 PR ouverte trouvée au démarrage —
`list_pull_requests` state=open : 2 PR, aucune sur le sujet calls). Un audit dédié (agent d'exploration,
lecture seule) a cartographié l'intégralité de la stack d'appel iOS/SDK/gateway et confirmé le constat des
Vagues précédentes : `CallManager.swift` (5663 lignes) et `CallEventsHandler.ts` (4152 lignes) restent des
god-objects trop volumineux pour un refactor sûr en une seule passe, zéro toolchain Swift/Kotlin disponible
dans ce sandbox (donc tout travail iOS/Android reste hors de portée de vérification locale), et le code
appel est déjà exceptionnellement propre (zéro TODO/FIXME, zéro force-unwrap/`as!`/`try!`, zéro `as any`
côté gateway). Retour au grain scopé/mécanique qui a produit les Vagues 40-48 : chercher un chemin de
terminaison d'appel qui a été oublié par l'invariant documenté d'invalidation du cache signal.

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.invalidateSignalSession` documente
  l'invariant : « Every path that writes `CallParticipant.leftAt` for this call must evict the entry so the
  very next `call:signal` re-reads. » Vérifié par grep de tous les appelants : `call:leave`/`call:end`/
  `call:force-leave` (CallEventsHandler.ts, 3 sites), le chemin de déconnexion avec grâce
  (`leaveParticipationAndBroadcast`, Vague 44), le fallback `forceCleanupParticipationAfterLeaveFailure`, le
  chemin d'erreur `force-end orphaned call`, les 2 routes REST end/leave (Vague 45), et le sweep GC zombie
  (`CallService.notifyReapedCallEnded`, via `invalidateSignalCache`) — **8 sites au total** — respectent
  tous l'invariant. `CallService.finalizeMissedCallCleanup` — le cleanup partagé de `markCallAsMissed`,
  atteint par (a) le watchdog `buildRingingTimeoutHandler` (60s sans réponse) qui stampe `leftAt` sur les
  participants encore ouverts, et (b) `CallEventsHandler.handleMissedCall` (appelé après un `call:leave` qui
  résout `missed`) — **ne l'a jamais respecté**, ni en interne (contrairement à `notifyReapedCallEnded`, qui
  s'auto-invalide), ni via son unique appelant (`handleMissedCall`, contrairement aux handlers socket
  `call:leave`/`call:end`/`call:force-leave` qui invalident juste avant de l'appeler pour leur PROPRE
  écriture — mais pas pour celle, secondaire, de `finalizeMissedCallCleanup` sur d'autres participants
  restés ouverts).
- **Impact concret** : un appel qui expire côté serveur (60s sans réponse, ou un `call:leave` qui bascule
  l'appel à `missed`) stampe `leftAt` sur les lignes `CallParticipant` encore ouvertes sans jamais purger le
  cache signal (TTL 2s). Un `call:signal` (SDP/ICE) tardif reçu dans cette fenêtre — un appelant encore en
  train d'émettre une offre au moment précis où la sonnerie expire — continue d'être relayé sur la base de
  l'instantané périmé (participants pas encore marqués `leftAt`) au lieu d'être rejeté, exactement le trou
  déjà fermé pour les chemins `call:end`/`call:leave`/`call:force-leave`/REST/GC.
- **Fix** : une ligne — `finalizeMissedCallCleanup` appelle désormais `this.invalidateSignalCache(callId)`
  (méthode publique déjà existante depuis la Vague 45, extraction déjà faite de `notifyReapedCallEnded`),
  juste après `releaseActiveCallClaim`, symétrique à ce dernier. Couvre les DEUX chemins d'entrée
  (ringing-timeout ET handleMissedCall-après-leave) sans dupliquer l'appel à chaque site — cohérent avec le
  commentaire déjà présent sur la méthode (« Safe to call more than once: every write here is
  scoped/idempotent »), donc aucun risque de double-invalidation avec les invalidations déjà faites en amont
  par les handlers socket appelants.
- **Tests TDD** : RED confirmé (2 nouveaux cas dans `describe('CallService - markCallAsMissed non-ringing
  guard')`, le describe qui contient déjà la régression jumelle 2026-07-02 pour `releaseActiveCallClaim` sur
  ces mêmes deux branches — écriture fraîche `ringing→missed` et branche idempotente déjà-missed) puis
  GREEN. Cas 1 : écriture fraîche → `signalCacheInvalidator` appelé avec le `callId`. Cas 2 : branche
  idempotente (le ringing-timeout a déjà gagné la course, `finalizeMissedCallCleanup` tourne quand même) →
  invalidation également. Cas 3 (garde de régression) : sans callback câblé, `markCallAsMissed` reste
  silencieux (comportement actuel préservé, optionnel comme tous les autres appelants
  d'`invalidateSignalCache`). Suite `CallService.test.ts` complète : 210/210 verts. Suite gateway complète
  filtrée sur `Call` (44 suites, `CallEventsHandler*`/`CallService*`/`CallCleanupService*`/`calls-routes`/
  `call-*`) : 1085/1085 verts — aucune régression sur les 8 sites d'invalidation déjà corrects. `tsc
  --noEmit` gateway : 0 erreur. Suite gateway complète (`bun run test:coverage`) lancée en fin de vague pour
  confirmation finale — cf. résultat consigné au commit/PR.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans ce
  sandbox) ; changement strictement gateway (`CallService.ts`, tests).
- **Reste ouvert (inchangé)** : dead code Swift `CallManager.handleRemoteReject` (PR #2470 — à vérifier
  mergée) ; God-objects `CallManager.swift`/`CallEventsHandler.ts` (candidats d'extraction identifiés par
  l'audit de cette vague : helpers d'émission socket MARK « Socket Emit Helpers » et proxy délégué CallKit
  déjà en `extension` séparée — angle plus sûr que réintroduire l'acteur `CallEventQueue` explicitement
  abandonné en 2026-06) ; parité iOS/Android retry-on-failure — **probablement déjà résolue** (vérifié cette
  vague : `CallManager.swift` a `canRetryCall`/`retryCall()` avec commentaire « Parité web/Android
  retry-on-failure », PR #2428 déjà mergée depuis la Vague 43 ; Android a `CallRetryPolicy.kt` +
  `CallUiState.canRetry` + wiring `CallScreen.kt` — cette note « reste ouvert » semble stale et recopiée
  sans revérification depuis la Vague 40, à confirmer/clore lors d'une prochaine vague dédiée à l'audit du
  fichier todo lui-même) ; couverture E2E iOS des écrans d'appel entrant/sortant relativement fine (unit
  tests profonds sur `CallManager`/policies, peu de XCUITest bout-en-bout) ; test de contrat cross-platform
  signal (`CALL_EVENTS` partagé iOS/web/Android) limité à un fichier de 52 lignes — à renforcer avant tout
  changement de protocole de signalisation.

## Vague 50 — `forceCleanupParticipationAfterLeaveFailure` invalidait le cache signal AVANT l'écriture `leftAt`, pas après (2026-08-03)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-a9q288`, redémarrée depuis `origin/main` à jour. PR #2478 (Vague 49) trouvée ouverte,
CI entièrement verte, `mergeable_state: clean` — mergée avant de démarrer cette vague plutôt que laissée
traîner. Un audit dédié (agent d'exploration, lecture seule) a revérifié l'ensemble des 8 sites
`invalidateSignalSession`/`invalidateSignalCache` connus plus les god-objects `CallManager.swift`/
`CallEventsHandler.ts` (toujours jugés trop volumineux pour un refactor sûr en une passe) et a confirmé
deux choses : l'item « reste ouvert » parité iOS/Android retry-on-failure est bien résolu (vérifié à
nouveau : `CallManager.swift:1187-1204` `canRetryCall`/`retryCall()`, Android `CallRetryPolicy.kt` +
`CallUiState.canRetry`, web `call-retry-policy.ts` `isRetryableCallFailure` — les trois plateformes
partagent le même ensemble retryable `{failed, connectionLost}`), à retirer de cette liste ; et un nouveau
bug scopé dans l'ordre des opérations d'un des 8 sites d'invalidation.

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.forceCleanupParticipationAfterLeaveFailure`
  (`CallEventsHandler.ts:823`) — le fallback de nettoyage forcé quand `leaveCall` a rejeté (erreur DB/
  validation), atteint par le handler de déconnexion socket — appelait `this.invalidateSignalSession(...)`
  **avant** d'attendre la transaction Prisma qui stampe `CallParticipant.leftAt`, à l'inverse des 7 autres
  sites d'invalidation (`CallEventsHandler.ts:722`, `:1058`, `:2474`, `:2702`, `:3207`, plus
  `CallService.finalizeMissedCallCleanup`/`notifyReapedCallEnded`), qui invalident tous strictement APRÈS
  que leur écriture a committé.
- **Impact concret** : un `call:signal` (SDP/ICE) de l'expéditeur en cours de force-cleanup, arrivant dans
  la fenêtre entre l'invalidation prématurée et la fin de la transaction DB, force une relecture fraîche
  via `refreshSignalSession` — mais la transaction n'a pas encore committé, donc cette relecture renvoie
  encore l'ancien snapshot (`leftAt: null`) et le RE-cache pour un plein cycle TTL (2s) qui commence APRÈS
  que l'écriture réelle a eu lieu. Un signal suivant, dans cette fenêtre de 2s post-commit, continue donc
  d'être relayé comme si l'expéditeur était toujours participant — exactement le trou déjà fermé pour les 7
  autres chemins.
- **Fix** : une ligne déplacée — `this.invalidateSignalSession(participation.callSessionId)` se trouve
  désormais immédiatement après le `await this.prisma.$transaction(...)`, avant l'émission
  `PARTICIPANT_LEFT`, symétrique à l'ordre déjà utilisé partout ailleurs. Aucun changement de comportement
  hors de cette fenêtre de course.
- **Tests TDD** : RED confirmé (nouveau cas dans
  `CallEventsHandler-signal-cache-invalidation.test.ts`, describe existant `signalSessionCache invalidated
  on leave/end`) — le test mocke `prisma.$transaction` pour faire arriver un `call:signal` concurrent
  PENDANT la transaction (avant que le mock de `getCallSession` ne bascule sur le snapshot post-écriture),
  puis vérifie qu'un second signal juste après le fix reste rejeté (`NOT_A_PARTICIPANT`). Avant le fix,
  l'expéditeur passait la vérification de participant (cache repollué avec l'ancien snapshot) et
  l'assertion échouait avec `TARGET_NOT_FOUND` au lieu de `NOT_A_PARTICIPANT` — preuve que la garde
  d'expéditeur était contournée, pas seulement un artefact de harnais. GREEN après le fix : 7/7 tests du
  fichier. Suite calling complète gateway filtrée (`CallEventsHandler|CallService|CallCleanupService|
  calls-routes|call-`) : 41 suites / 1037 tests verts — aucune régression sur les 7 autres sites déjà
  corrects. `tsc --noEmit` gateway : 0 erreur. `bun run test:coverage` complet lancé en fin de vague pour
  confirmation finale — cf. résultat consigné au commit/PR.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — changement strictement gateway
  (`CallEventsHandler.ts`, tests).
- **Reste ouvert** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` (inchangé, toujours
  jugé trop risqué pour une passe non scopée) ; couverture E2E iOS des écrans d'appel entrant/sortant
  relativement fine (peu de XCUITest bout-en-bout) ; test de contrat cross-platform `CALL_EVENTS` limité à
  un scan des littéraux gateway — ne couvre pas une dérive d'un littéral `"call:..."` codé en dur côté iOS/
  Android (confirmés présents dans `apps/ios`/`packages/MeeshySDK`/`apps/android`), à renforcer par un scan
  Swift/Kotlin dédié dans une prochaine vague. **Parité iOS/Android retry-on-failure retirée de cette
  liste** (confirmée résolue cette vague, voir ci-dessus).

## Vague 51 — Garde de contrat cross-platform pour les littéraux `call:*` iOS/Android (2026-08-03)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-uv0fco`, redémarrée depuis `origin/main` à jour (`98cc74f9`, PR #2492 déjà mergée — 0 PR
ouverte trouvée sur le sujet calls au démarrage). Un audit dédié (agent d'exploration, lecture seule) a
recartographié la stack d'appel iOS/SDK et confirmé indépendamment le même item « reste ouvert » que la
Vague 50 avait signalé sans le traiter : `CallEventsHandler-event-contract.test.ts` ne scanne que les
`socket.on(...)` littéraux de `CallEventsHandler.ts` (gateway) contre le contrat partagé — aucun garde
n'existe pour les littéraux `"call:..."` codés en dur côté iOS (`CallManager.swift`,
`MessageSocketManager.swift` du SDK) et Android (`CallSignalManager.kt`), qui n'importent pas le contrat
TypeScript et peuvent dériver silencieusement.

- **[FAIBLE, gateway (scan multi-plateforme), infrastructure de test, TDD]** Nouveau fichier
  `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-cross-platform-event-contract.test.ts` :
  lit en texte brut (sans toolchain Swift/Kotlin) les 3 fichiers de signalisation d'appel connus pour
  contenir des littéraux `"call:..."` — `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`,
  `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`,
  `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt` — et vérifie que chaque
  littéral extrait existe dans le même contrat partagé (`CALL_EVENTS` ∪ `CLIENT_EVENTS` ∪ `SERVER_EVENTS`)
  que le garde gateway existant.
- **Constat** : aucune dérive trouvée — les 3 fichiers sont déjà alignés avec le contrat (attendu, cf.
  Vagues précédentes : code appel déjà exceptionnellement propre). Ce n'est donc pas un bug corrigé mais une
  garde de non-régression comblant un trou d'observabilité identifié à la Vague 50.
- **Tests TDD (RED prouvé sans casser la prod)** : un premier cas fixture (`"call:definitely-not-a-real..."`)
  prouve que l'extraction/comparaison détecte bien un littéral hors contrat. RED réel confirmé en
  conditions live : littéral factice `"call:totally-bogus-event"` injecté temporairement dans
  `CallSignalManager.kt` (production) → le nouveau test échoue avec le littéral listé dans `offContract` ;
  fichier restauré depuis une copie (`git diff --stat` vide après restauration, confirmant un fichier
  strictement identique) → GREEN. Suite calling gateway complète (`CallEventsHandler|CallService|
  CallCleanupService|calls-routes|call-`) : 42 suites / 1041 tests verts (+1 suite / +4 tests vs. Vague 50).
  `tsc --noEmit` gateway : 0 erreur.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — changement strictement gateway (1
  nouveau fichier de test lisant les sources iOS/Android sans les modifier).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift` (5663 lignes, confirmé par
  l'audit de cette vague)/`CallEventsHandler.ts` (toujours jugé trop risqué pour une passe non scopée) ;
  couverture E2E iOS des écrans d'appel entrant/sortant relativement fine (peu de XCUITest bout-en-bout,
  confirmé par l'audit de cette vague — aucun XCUITest de bout en bout trouvé) ; l'ADR `actor CallEventQueue`
  documenté dans `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` (section 10) semble ne
  jamais avoir été implémenté (`grep CallEventQueue` vide sur `CallManager.swift` actuel) — à vérifier si
  c'est un abandon délibéré déjà tracé ailleurs ou un écart ADR/code à documenter lors d'une prochaine
  vague.

## Vague 52 — `call:transcription-segment` gardait uniquement le littéral `'ended'`, pas `CALL_TERMINAL_STATUSES` (2026-08-04)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-cds5c7`, redémarrée depuis `origin/main` à jour (`54bbee9`, 0 PR ouverte trouvée sur le
sujet calls au démarrage). Un audit dédié (agent, lecture seule) a re-scanné `CallEventsHandler.ts`/
`CallService.ts` contre les 5 patterns de bug déjà rencontrés dans les vagues précédentes (dérive de garde
de statut terminal, ordre d'invalidation du cache signal, ordre de libération de claim, résolveur
participant faible vs strict, bump de `version` sur écriture terminale) et a confirmé que les 4 premiers
patterns étaient déjà corrigés partout — sauf un nouveau site pour le pattern 1.

- **[FAIBLE-MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.ts:3553`, handler
  `call:transcription-segment` — gardait `callSession.status === 'ended'` (un littéral unique) au lieu de
  `CALL_TERMINAL_STATUSES` (`ended`/`missed`/`rejected`/`failed`), déjà importé et utilisé correctement
  ailleurs dans le même fichier (lignes 653 et 3998).
- **Impact concret** : un appel résolu `missed`, `rejected` ou `failed` (au lieu de `ended`) laisse la garde
  passer. Un socket encore joint à `ROOMS.call(callId)` dans la fenêtre entre l'écriture terminale et
  `evictCallRoomSockets` (plusieurs étapes `await` plus loin — `broadcastCallEnded`/`postCallSummary`/
  `handleMissedCall`) qui émet `call:transcription-segment` voit son segment relayé dans une room d'appel
  déjà mort, et potentiellement envoyé au traducteur ZMQ (charge gaspillée) — un broadcast fantôme dans un
  appel résolu, symétrique aux trous déjà fermés côté cache signal (Vagues 49/50) mais sur le chemin de
  garde de statut, pas d'invalidation de cache.
- **Fix** : une ligne — `callSession.status === 'ended'` → `(CALL_TERMINAL_STATUSES as readonly
  string[]).includes(callSession.status)`, symétrique aux gardes déjà correctes lignes 653/3998.
- **Tests TDD** : RED confirmé — `CallEventsHandler-transcription.test.ts` avait déjà un `describe` couvrant
  `status: 'ended'` (silencieusement droppé) mais aucun cas pour `missed`/`rejected`/`failed`. Paramétré en
  `describe.each(['ended', 'missed', 'rejected', 'failed'])` : avant le fix, les 3 nouveaux statuts
  laissaient passer le relais (`roomEmit` appelé) — 3 tests rouges sur 21. Fix appliqué → 21/21 verts. Suite
  calling gateway complète filtrée (`CallEventsHandler|CallService|CallCleanupService|calls-routes|call-`) :
  42 suites / 1047 tests verts — aucune régression sur les 4 autres patterns déjà corrects. `tsc --noEmit`
  gateway : 0 erreur. Suite gateway complète (`bun run test:coverage`) : 578 suites / 15271 tests verts.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — changement strictement gateway
  (`CallEventsHandler.ts`, 1 fichier de test).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté (à trancher : abandon délibéré ou écart à documenter) ; couverture
  E2E iOS des écrans d'appel (peu de XCUITest bout-en-bout).

## Vague 53 — `handleMissedCall` livrait 2 notifications « appel manqué » pour un seul appel raté (2026-08-05)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-xc8hle`, redémarrée depuis `origin/main` à jour. PR #2574 (Vague précédente, dead
`call:check-active` replay + listener leak web) trouvée ouverte — CI entièrement verte SAUF le job
`Security` (Trivy) en `failure` ; log confirmé : `403 Forbidden` sur `mirror.gcr.io` en téléchargeant la
DB de vulnérabilités, un échec d'infra transitoire sans rapport avec le diff (2 fichiers,
`CallEventsHandler.ts`/`CallManager.tsx`). `Security` n'est pas un check requis par le job `summary`
(`if: always()`, agrège sans conditionner sur son résultat) — mergée telle quelle. Un audit dédié (agent
d'exploration, lecture seule, croisé avec `tasks/calls-fonctionnel-todo.md`) a ensuite cherché un nouveau
bug scopé/mécanique selon les 5 patterns déjà rencontrés dans les vagues précédentes.

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.handleMissedCall` est atteignable
  depuis **7 chemins terminaux indépendants** (ringing-timeout `buildRingingTimeoutHandler:566`,
  disconnect-grace-expiry `:749`, force-cleanup-after-leave-failure `:907`, force-end-orphaned `:1088`,
  `call:leave` `:2552`, `call:force-leave` `:2767`, `call:end` `:3261`), plus `CallCleanupService`'s GC
  tier qui appelle `createMissedCallNotifications` DIRECTEMENT via `missedCallNotify` (bypass complet de
  `handleMissedCall`). Seul le chemin ringing-timeout se protège avant d'appeler `handleMissedCall` — via
  un `updateMany` atomique scopé `[initiated, ringing]` (`count === 0` → `return`, « une autre voie a déjà
  transitionné »). Les 6 AUTRES chemins socket ne font que LIRE le statut déjà committé de l'appel
  (`finalStatus = callSession.status`) et rappellent `handleMissedCall` dès qu'ils observent `missed`,
  qu'ILS soient ou non à l'origine de la transition — `markCallAsMissed` elle-même a une garde côté
  ÉCRITURE (statut non-ringing → skip write, déjà idempotente depuis les Vagues antérieures) mais AUCUNE
  garde ne protège l'appel à `createMissedCallNotifications` en aval, qui n'avait strictement aucune
  déduplication.
- **Impact concret** : A appelle B ; le ringing-timeout de 60s gagne la transition atomique vers `missed`
  et notifie B (notification #1). Au même instant (course quotidienne, pas un cas limite) A raccroche
  (`call:leave`) ou le socket de A tombe et la grâce de déconnexion expire ; ce second chemin lit le
  statut déjà `missed` (committé par le timeout) et rappelle `handleMissedCall` → notification #2 pour B,
  pour le même appel. Badge doublé, push doublé, entrée doublée dans le centre de notifications.
- **Fix** : garde de déduplication par callId (`missedCallNotifiedAt: Map<string, number>`) DANS
  `createMissedCallNotifications` elle-même plutôt que dans `handleMissedCall` — couvre d'un seul coup les
  7 chemins socket ET l'appel direct de GC sans devoir instrumenter chaque site d'appel individuellement.
  TTL-balayée (600s) dans l'intervalle de nettoyage existant à 60s, aux côtés de `bufferedOffers` et
  `signalSessionCache` — mêmes idiome et fenêtre de tolérance que les structures sœurs, pas de nouveau
  point d'accroche « cleanup terminal » à câbler dans les 7 sites.
- **Tests TDD** : RED confirmé via `git stash` du seul fichier source (tests déjà en place) — 2 nouveaux
  cas dans le describe `createMissedCallNotifications` : (1) double appel sur le même callId → avant le
  fix, 2 notifications au lieu de 1 attendue ; (2) isolation — un 2e callId différent après déduplication
  du 1er → avant le fix, 3 notifications au lieu de 2 attendues (aucune régression sur les cas déjà
  distincts). GREEN après restauration du fix. Suite calling gateway complète filtrée
  (`CallEventsHandler|CallService|CallCleanupService|calls-routes|call-`) : 43 suites / 1050 tests verts —
  aucune régression. `tsc --noEmit` gateway : 0 erreur. Suite gateway complète (`bun run test:coverage`) :
  582/582 suites, 15307/15307 tests verts.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre (aucune toolchain Swift/Kotlin dans
  ce sandbox) ; changement strictement gateway (`CallEventsHandler.ts`, 1 fichier de test).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel (peu de XCUITest
  bout-en-bout).

## Vague 54 — unmount leak call-waiting banner + dead code `callEndReason` + enum drift `callSessionSchema.status` (2026-08-05)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-bih8gr`, redémarrée depuis `origin/main` à jour ; aucune PR calls concurrente ouverte.
Sans toolchain macOS/Xcode dans ce sandbox, le scope a été délibérément restreint à la couche TypeScript
(gateway + web), seule vérifiable par build/tests réels ici — pas de tentative de modification Swift
non compilable à l'aveugle. Audit dédié (agent général, lecture seule, croisé avec ce fichier et
`tasks/calls-audit-2026-07-11.md` pour éviter tout doublon avec du travail déjà fermé/en cours) sur
`CallEventsHandler.ts`, `CallService.ts`, `CallCleanupService.ts`, `TURNCredentialService.ts`,
`routes/calls.ts` et la couche WebRTC web (`CallManager.tsx`, `call-store.ts`, `webrtc-service.ts`,
`use-webrtc-p2p.ts`) — la majeure partie du terrain facile côté gateway est déjà nettoyée par les 53
vagues précédentes ; rien de neuf trouvé dans `CallEventsHandler`/`CallService`/`CallCleanupService`/
`TURNCredentialService`/`routes/calls.ts` au-delà de ce qui est déjà corrigé en date du 2026-08-05.

- **[MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `CallManager.tsx` — l'effet de nettoyage au démontage
  (`useEffect` de cleanup, ~ligne 1036) ne vidait que `callTimeoutRef` via `clearCallTimeout()` ; le second
  timer indépendant du composant, `waitingTimeoutRef` (armé par `startWaitingTimeout` dès qu'un DEUXIÈME
  `call:initiated` arrive pendant un appel déjà actif, pour auto-décliner la bannière « call waiting » après
  45s), n'était jamais vidé. **Impact concret** : utilisateur en appel actif, un second appelant sonne
  (bannière affichée), l'utilisateur navigue ailleurs / se déconnecte AVANT que le timeout expire → 45s
  après le démontage, le timeout orphelin s'exécute quand même et appelle `rejectWaitingCall` — un vrai
  `socket.emit('call:end', {reason: 'rejected'})` — pour un composant que plus rien n'observe, déclinant
  silencieusement un appel que l'utilisateur a peut-être géré autrement entretemps. **Fix** : ajout de
  `clearWaitingTimeout()` dans le même effet de cleanup + dans son tableau de dépendances. **Tests TDD** :
  nouveau fichier `CallManager.unmountCleanup.test.tsx` — RED confirmé avant le fix (l'assertion
  `call:end` intercepte l'emit orphelin après `unmount()` + `jest.advanceTimersByTime(45001)`), GREEN
  après. Suite `video-call`/`video-calls` complète : 26 suites / 227 tests verts.
- **[FAIBLE, web, dead code, CONFIRMÉ + SUPPRIMÉ]** `call-store.ts` — champ `callEndReason` + action
  `setCallEndReason` : aucune référence en dehors de leur propre définition et de leurs propres tests
  (grep repo entier, y compris Swift/Kotlin) ; la Vague du 2026-07-12 (retry-on-failure) avait déjà
  délibérément construit `pendingRetry` SANS jamais câbler `setCallEndReason`, sans le retirer ensuite.
  Retiré (champ, action, valeurs par défaut/reset, import de type `CallEndReason` désormais inutilisé) +
  ses 2 blocs de test dans `call-store.test.ts`. `CallEndReason` (le TYPE, dans `video-call.ts`) reste
  utilisé ailleurs (ex. `CallEndedEvent.reason`) — non touché.
- **[FAIBLE, shared, drift schéma, CONFIRMÉ + CORRIGÉ, TDD]** `packages/shared/types/api-schemas.ts`
  `callSessionSchema.status` — déjà repéré comme dette faible en Vague 53 (« candidat FAIBLE pour une
  prochaine vague ») ; l'enum listait 6 des 9 valeurs Prisma `CallStatus`, omettant `initiated`,
  `connecting`, `reconnecting`. Inoffensif à l'exécution (`fast-json-stringify` ne valide pas contre
  `enum` en sérialisation) mais un contrat REST qui ment sur les statuts possibles mord dès qu'un outil
  plus strict (codegen OpenAPI, validateur de requête) lui fait confiance comme exhaustif. **Fix** : les 9
  valeurs ajoutées. **Tests TDD** : nouveau fichier
  `call-session-status-enum-drift.test.ts` (gateway) verrouillant la parité contre un miroir statique de
  `enum CallStatus` (schema.prisma) — RED confirmé avant le fix, GREEN après.
- **Vérification globale (pas seulement le périmètre calls)** : suite gateway complète
  (`bunx jest`, hors coverage) : 587/587 suites, 15341/15341 tests verts. Suite web complète : 502/502
  suites, 11645/11666 tests verts (21 skip pré-existants). Suite `packages/shared` (`vitest run`) :
  48/48 fichiers, 1454/1454 tests verts. `tsc --noEmit` sur les 4 fichiers modifiés : aucune erreur
  introduite (les erreurs pré-existantes ailleurs dans `apps/web` — `VideoLightbox.tsx`,
  `use-communities-query.ts`, etc. — sont hors du diff de cette vague et non liées aux calls).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans
  ce sandbox Linux ; changements strictement gateway/shared/web (4 fichiers modifiés + 2 nouveaux fichiers
  de test).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel (peu de XCUITest
  bout-en-bout) ; `enableSimulcast()` (`webrtc-service.ts`) référencé uniquement par son propre test —
  scaffolding SFU Phase 2 documenté comme intentionnel, PAS retiré.

## Vague 55 — call:already-answered n'éteignait pas la bannière call-waiting (2026-08-05)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-sxx5n5`, redémarrée depuis `origin/main` à jour. PR #2578 (`claude/modest-cori-bih8gr`,
Vague 54 : unmount `waitingTimeoutRef` leak, dead `callEndReason`, enum drift `callSessionSchema.status`)
était déjà ouverte et non mergée au démarrage de cette session — scope délibérément disjoint pour éviter
tout doublon/conflit (aucun fichier en commun). Audit dédié (agent général, lecture seule) sur la couche
web (`CallManager.tsx`, `call-store.ts`, `webrtc-service.ts`, `use-webrtc-p2p.ts`, `use-video-call.ts`,
`VideoCallInterface.tsx`) et gateway (`CallEventsHandler.ts`, `CallService.ts`, `CallCleanupService.ts`,
`TURNCredentialService.ts`, `routes/calls.ts`) — la majeure partie du terrain facile y est déjà nettoyée
par les 54 vagues précédentes.

- **[HAUT, web, CONFIRMÉ + CORRIGÉ, TDD]** `CallManager.tsx` `handleAnsweredElsewhere` (le listener
  `call:already-answered`, qui éteint la sonnerie quand l'utilisateur décroche sur un AUTRE device) ne
  vérifiait que `incomingCall` (le ring plein écran), jamais `waitingCall` (la bannière busy-path compacte
  affichée quand un DEUXIÈME appel sonne pendant un appel déjà actif, cf. Vague 40/`CallWaitingBanner`).
  **Scénario concret** : utilisateur en appel actif sur le device A ; un second appelant sonne → bannière
  call-waiting affichée + timer d'auto-déclin 45s armé (`startWaitingTimeout`). L'utilisateur décroche ce
  DEUXIÈME appel sur le device B au lieu de toucher la bannière sur A. Le gateway passe l'appel en `active`
  et diffuse `call:already-answered` aux rooms utilisateur — device A l'ignorait (comparé uniquement à
  `incomingCall`, `null` puisque l'appel waiting n'est jamais promu en `incomingCall`), donc la bannière ET
  son timer continuaient de tourner sans personne pour les regarder. 45s plus tard, le timer orphelin
  émettait `rejectWaitingCall` → un vrai `call:end {reason: 'rejected'}` pour l'appel même que l'utilisateur
  est en train de vivre sur le device B. L'autorisation `CallParticipant` étant scopée à l'utilisateur (pas
  au device), le gateway accepte l'ordre — l'appel actif sur B se fait raccrocher silencieusement par une
  bannière périmée sur A. **Fix** : `handleAnsweredElsewhere` vérifie maintenant `incomingCall` PUIS
  `waitingCall` (branches indépendantes, chacune scopée à son propre callId) — la branche waiting vide
  `clearWaitingTimeout()` + `setWaitingCall(null)`, sans toucher à l'appel actif. **Tests TDD** : nouveau
  fichier `CallManager.answeredElsewhereWaiting.test.tsx` (4 cas : bannière dismiss, timer orphelin
  neutralisé, appel actif intact, callId non concerné ignoré) — RED confirmé avant le fix (2/4 rouges,
  exactement la banner-non-dismissed + le `call:end` orphelin), GREEN après. Suite `video-call`/
  `video-calls`/`call-store` complète : 24 suites / 180 tests verts (aucune régression). `tsc --noEmit` :
  30 erreurs `CallManager.tsx` avant ET après (compté par stash/pop) — toutes pré-existantes (le fichier a
  un vieux socket typé `unknown`/`as unknown` ailleurs dans le fichier), aucune introduite par ce diff.
- **[MOYEN, gateway, documenté seulement, PAS corrigé]** `CallService.ts` `initiateCall` autorise
  explicitement les conversations GROUP, mais le plafond P2P de participants actifs (max 2,
  `CallService.ts` `joinCall`) verrouille silencieusement tout membre au-delà du premier répondant. Les 3
  clients connus (web, iOS — Android non audité cette vague) gatent le bouton "démarrer un appel" aux
  conversations `direct` uniquement, donc actuellement inatteignable via l'UI normale — non corrigé
  (defense-in-depth, pas de bug utilisateur actif), mais non documenté dans les 54 vagues précédentes.
  Candidat pour une prochaine vague avant qu'un client (ex. Android) ne câble un jour l'appel de groupe.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans
  ce sandbox Linux ; changement strictement web (1 fichier modifié + 1 nouveau fichier de test).

## Vague 56 — `sendCallCancellationPushes` livrait 2 pushes `call_cancel` pour un seul appel missed/rejected (2026-08-06)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-ct9ddv`, redémarrée depuis `origin/main` à jour (`6e871dcf`, PR #2578 — Vague 54 —
mergée avant de démarrer cette vague ; PR #2581 — Vague 55 — trouvée ouverte avec un conflit de merge sur
`CallManager.tsx`/`tasks/calls-fonctionnel-todo.md` contre le `main` fraîchement mis à jour par #2578,
résolu manuellement dans un worktree dédié (le code source s'est auto-mergé sans conflit réel, seul le
changelog avait un conflit textuel) et repoussé pour re-vérification CI avant merge — traité en dehors de
cette vague de code. Audit dédié (agent d'exploration, lecture seule, croisé avec les 55 vagues
précédentes) sur les 8 patterns de bug déjà rencontrés, scope délibérément exclu de `CallManager.tsx`/
`call-store.ts` (fichiers en vol sur #2581).

- **[MOYEN, gateway, CONFIRMÉ + CORRIGÉ, TDD]** `CallEventsHandler.ts` `sendCallCancellationPushes`
  (`:472`) — le fan-out de push silencieuse `call_cancel` (coupe CallKit pour un membre de la conversation
  qui n'a JAMAIS rejoint la room d'appel — socket mort / app suspendue) n'avait AUCUNE garde
  d'idempotence, contrairement à son cousin `createMissedCallNotifications` (dédupliqué en Vague 53 via
  `missedCallNotifiedAt`). Cette fonction est atteignable depuis **tous** les appelants de
  `broadcastCallEnded`(ringing-timeout, `call:leave`, `call:force-leave`, `call:end`,
  disconnect-grace-expiry, force-cleanup-after-leave-failure, force-end-orphaned, plus le wrapper REST
  `broadcastCallEndedForTerminatedCall`) **ET** directement depuis le wrapper public
  `sendMissedCallCancellationPushForTerminatedCall`, utilisé par le tier GC de `CallCleanupService`.
  Exactement le même défaut de conception que la Vague 53 avait fermé côté notification persistée —
  laissé ouvert côté push silencieuse. **Scénario concret** : le ringing-timeout gagne la transition vers
  `missed`, diffuse `call:ended` et envoie le push `call_cancel` aux membres jamais rejoints ; le tier GC
  de `CallCleanupService` (ou un `call:leave` qui arrive juste après, lisant le statut déjà `missed`) relit
  le même appel encore `initiated`/`ringing` en base à ce moment précis (fenêtre de course entre la
  transition et son observation par le tier suivant) et rappelle le même chemin — un membre jamais rejoint
  reçoit deux pushes `call_cancel` silencieux pour le même appel (surcharge APNs/FCM, requêtes Prisma
  redondantes, bruit de log). Impact utilisateur faible (le push est un simple kill CallKit idempotent côté
  client — recevoir un deuxième "stop ringing" sur un appel déjà arrêté est un no-op visible), mais le
  pattern est identique à un bug déjà jugé MOYEN en Vague 53 et mérite la même garde par cohérence.
  **Fix** : nouvelle map `callCancellationPushSentAt` (miroir exact de `missedCallNotifiedAt` — même TTL
  600s, même balayage dans l'intervalle 60s existant), vérifiée/posée au tout début de
  `sendCallCancellationPushes` (après les gardes existantes `pushService`/`conversationId`/`reason`, avant
  toute requête Prisma).
- **Tests TDD** : 2 nouveaux cas dans `CallEventsHandler-gc-missed-cancel-push.test.ts` — (1) deux appels
  successifs de `sendMissedCallCancellationPushForTerminatedCall` pour le MÊME callId → `sendToUser` appelé
  1 seule fois (RED confirmé par `git stash` du seul fichier source : 2 appels avant le fix) ; (2) deux
  callIds DIFFÉRENTS → chacun reçoit son propre push (`sendToUser` appelé 2 fois, prouve l'absence de
  sur-déduplication globale). GREEN après restauration du fix. Suite calling gateway complète filtrée
  (`CallEventsHandler|CallService|CallCleanupService|calls-routes|call-`) : 44 suites / 1053 tests verts —
  aucune régression. Suite gateway complète (`bunx jest`, hors coverage) : 587/587 suites, 15348/15348
  tests verts. `tsc --noEmit` gateway : 0 erreur (après `npx prisma generate --generator client` +
  `packages/shared` `bun run build`, prérequis documentés dans `CLAUDE.md`).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans
  ce sandbox Linux ; changement strictement gateway (`CallEventsHandler.ts`, 1 fichier de test).
- **[FAIBLE, web, documenté seulement, PAS corrigé]** `apps/web/hooks/conversations/use-video-call.ts` —
  `answerCall`/`rejectCall`/`endCall`/`toggleAudio`/`toggleVideo` (exportés via `UseVideoCallReturn`, tous
  pleinement implémentés — émissions socket réelles, pas des stubs) n'ont aucun site d'appel en
  production : les deux seuls consommateurs (`ConversationLayout.tsx`, `CallSystemMessage.tsx`) ne
  déstructurent que `startCall`. Le flux d'appel réel passe entièrement par `CallManager.tsx` (composant
  séparé), pas par ce hook. Candidat de suppression dead-code (5 méthodes + champs d'interface + ~280
  lignes de tests dédiés dans `use-video-call.test.tsx`) — non traité cette vague, `CallManager.tsx` étant
  en vol sur #2581 et une suppression de cette taille méritant sa propre vague dédiée plutôt qu'un ajout
  en fin de session déjà chargée.
- **Reste ouvert** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel (peu de XCUITest
  bout-en-bout) ; `enableSimulcast()` scaffolding SFU Phase 2 (intentionnel) ; **nouveau** — dead code
  `use-video-call.ts` (5 méthodes non consommées, voir ci-dessus, candidat pour une prochaine vague).

## Vague 57 — dead code `use-video-call.ts` : 5 méthodes + `isCallSupported`/`error` jamais consommés (2026-08-06)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-46anby`, redémarrée depuis `origin/main` à jour (`f8f2eaae`, aucune PR calling
ouverte au démarrage). Suite directe de la Vague 56, qui avait explicitement flagué ce fichier comme
candidat de nettoyage sans le traiter (scope disjoint de `CallManager.tsx`/`call-store.ts` alors en vol).

- **[FAIBLE, web, dead code, CONFIRMÉ + SUPPRIMÉ]** `apps/web/hooks/conversations/use-video-call.ts` —
  vérification exhaustive (grep sur les 2 seuls call sites de production, `ConversationLayout.tsx` et
  `CallSystemMessage.tsx`) : les deux ne déstructurent **que** `startCall`. `answerCall`, `rejectCall`,
  `endCall`, `toggleAudio`, `toggleVideo` (5 méthodes socket pleinement implémentées) — déjà identifiées
  Vague 56 — n'avaient aucun appelant hors de leurs propres tests. Vérification étendue cette vague :
  `isCallSupported` (dérivé de `conversation?.type === 'direct'`, redondant avec la garde déjà inline dans
  `startCall`) et `error` (state posé uniquement par `answerCall`, donc mort dès que celui-ci l'est) sont
  eux aussi absents de tout call site de production — le retour du hook est réduit à `{ startCall }`
  uniquement. Le flux réel de réponse/rejet/raccroché/toggle audio-vidéo passe entièrement par
  `CallManager.tsx` + `call-store.ts` (composant séparé, cf. Vagues 54-56), jamais par ce hook.
  **Fix** : `UseVideoCallReturn` réduit à `{ startCall }` ; suppression des 5 callbacks socket morts, du
  state `error`, de la constante dérivée `isCallSupported`, de la variable `callStore` (devenue inutilisée
  — `startCall` lit déjà `useCallStore.getState()` directement) et de l'import `CallJoinAck` devenu
  inutile. JSDoc du hook mis à jour pour documenter explicitement le contrat "startCall only" et éviter
  qu'un futur ajout naïf de méthode y re-glisse du code mort.
- **Tests** : suppression des blocs `describe('isCallSupported')`, `describe('answerCall')`,
  `describe('rejectCall')`, `describe('endCall')`, `describe('toggleAudio')`, `describe('toggleVideo')`
  (≈280 lignes) — comportement `startCall` (media constraints, ICE servers, ack success/failure, cleanup
  stream, P0 currentCall init) intégralement conservé et vert. `__tests__/hooks/conversations/use-video-call.test.tsx` :
  28/28 tests verts (down from ~50, suppression pure sans perte de couverture comportementale — aucun des
  blocs retirés ne testait un chemin atteignable en production). Suite élargie `video-call`/`video-calls`/
  `call-store`/`hooks/conversations` : 34 suites / 462 tests verts, aucune régression.
- **`tsc --noEmit`** : 17 erreurs pré-existantes dans `ConversationLayout.tsx` (comptées identiques avant/
  après via `git stash`/`pop`) — aucune introduite par ce diff ; `use-video-call.ts`/`CallSystemMessage.tsx`
  zéro erreur. ESLint indisponible dans ce sandbox (crash `Converting circular structure to JSON` sur la
  config flat `eslint-config-next`, pré-existant et indépendant du diff — non bloquant, `tsc` + tests font
  foi).
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans
  ce sandbox Linux ; changement strictement web (1 fichier modifié + 1 fichier de test).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel ; `enableSimulcast()`
  scaffolding SFU Phase 2 (intentionnel) ; plafond P2P (max 2 participants actifs) vs conversations GROUP
  autorisées côté `initiateCall` (Vague 55, defense-in-depth, inatteignable via l'UI normale actuelle).

## Vague 58 — `handleSwitchCamera` laissait la nouvelle caméra allumée après un `replaceTrack` en échec (2026-08-06)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-pse5rq`, redémarrée depuis `origin/main` à jour (`53f77a9c`, aucune PR calling
ouverte au démarrage). Audit dédié (agent général, lecture seule, croisé avec les 57 vagues précédentes
et `tasks/calls-audit-2026-07-11.md` pour éviter tout doublon) sur `CallEventsHandler.ts`, `CallService.ts`,
`CallCleanupService.ts`, `TURNCredentialService.ts`, `routes/calls.ts`, `call-store.ts`, `CallManager.tsx`,
`VideoCallInterface.tsx` — la couche gateway reste exceptionnellement propre (chaque Map en mémoire
tracée — `missedCallNotifiedAt`, `callCancellationPushSentAt`, `qualityDegradedStreaks`, `bufferedOffers`,
`signalSessionCache`, `disconnectGraceTimers`, `heartbeats`/`heartbeatDbWriteTimers`/
`backgroundedParticipants` — a déjà sa garde d'idempotence/ordre posée en Vagues 42-57) ; la surface la
plus fraîche s'est révélée côté web, sur le nettoyage de piste média du changement de caméra.

- **[MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `VideoCallInterface.tsx` `handleSwitchCamera` (~ligne 386) —
  `getUserMedia` acquiert la nouvelle caméra (facing mode opposé) AVANT que `RTCRtpSender.replaceTrack`
  ne soit tenté sur chaque peer connection ; en cas de rejet de `replaceTrack` (sender/connection en train
  de se fermer en même temps qu'un raccroché concurrent, renégociation codec/device en échec — exactement
  le scénario déjà couvert par le test existant « keeps the old track alive »), le bloc `catch` se
  contentait de logger/toaster l'erreur sans jamais arrêter le flux `newStream` fraîchement acquis. Le
  nouveau track vidéo n'ayant jamais été attaché à `localStream` (l'attache n'arrive qu'après le succès
  de `replaceTrack`), aucun autre chemin de nettoyage — pas même `call-store.reset()`, qui ne stoppe que
  les tracks qu'il connaît via `localStream`/`remoteStreams` — n'en a jamais connaissance. **Impact
  concret** : la caméra physique de l'autre côté (front/back) reste allumée et capture sans qu'aucun
  consommateur ne lise le flux — exactement la classe de régression de confidentialité que
  `stopPreauthorizedStream` (`lib/calls/call-media-constraints.ts`) documente déjà explicitement pour le
  chemin de join d'appel (« leaving the mic/camera hot after a failed join is a privacy regression of its
  own »), jamais répliquée ici. Le test dédié existant pour ce rejet (`VideoCallInterface.test.tsx`,
  « surfaces cameraSwitchFailed and keeps the old track alive ») n'avait même jamais instrumenté cette
  piste (`newVideoTrack = {}`, sans mock `stop`) — le trou n'était pas juste non corrigé, il n'était pas
  détectable. **Fix** : `newStream` déplacé hors du `try` (variable `let`), stoppé (`getVideoTracks()
  .forEach(track => track.stop())`) dans le `catch`, et remis à `null` juste après l'échange réussi pour
  que le `catch` ne stoppe jamais un track désormais vivant dans `localStream`.
- **Tests TDD** : `newVideoTrack` du test de rejet existant enrichi d'un spy `stop: jest.fn()` (au lieu de
  `{}`) + nouvelle assertion `expect(newVideoTrack.stop).toHaveBeenCalledTimes(1)` — RED confirmé avant le
  fix (`TypeError: track.stop is not a function` en réutilisant le fixture nu, puis `0` appels avec un
  fixture instrumenté séparément), GREEN après. Suite `VideoCallInterface.test.tsx` : 16/16 verts. Suite
  élargie `video-call`/`video-calls`/`call-store` (27 suites, filtre `--testPathPatterns`) : 209/209 tests
  verts, aucune régression.
- **`tsc --noEmit`** (`apps/web`) : 11 erreurs pré-existantes dans `VideoCallInterface.tsx` (`TS2571`/
  `TS18046`, socket typé `unknown` ailleurs dans le fichier — hors du diff de cette vague), comptées
  identiques avant/après via `git stash`/`pop` ; aucune introduite par ce diff.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans
  ce sandbox Linux ; changement strictement web (1 fichier modifié + 1 fichier de test).
- **Reste ouvert (inchangé)** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel ; `enableSimulcast()`
  scaffolding SFU Phase 2 (intentionnel) ; plafond P2P (max 2 participants actifs) vs conversations GROUP
  autorisées côté `initiateCall` (Vague 55) ; busy-path — un TROISIÈME appelant simultané remplace
  silencieusement la bannière call-waiting du deuxième sans le décliner explicitement sur le fil
  (`CallManager.tsx:309-315`, FAIBLE-MOYEN, edge case rare non corrigé cette vague) ;
  `pendingParticipantsByCallId` (`call-store.ts:139`) sans TTL par appel, borné en pratique par le
  `reset()` générique plutôt qu'une éviction ciblée (FAIBLE, non corrigé).

## Vague 59 — busy-path : un TROISIÈME appelant simultané ne déclinait jamais le deuxième bumpé (2026-08-06)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-irfbtv`, redémarrée depuis `origin/main` à jour (`7179a685`, aucune PR calling ouverte
au démarrage). Suite directe du "reste ouvert" de la Vague 58, qui avait explicitement flaggé ce point sans
le traiter.

- **[FAIBLE-MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `CallManager.tsx` `handleIncomingCall` (branche busy-path,
  ~ligne 309) — quand un utilisateur est déjà en appel actif ET qu'une bannière `CallWaitingBanner` affiche
  déjà un DEUXIÈME appelant (`waitingCall`), l'arrivée d'un `call:initiated` pour un TROISIÈME appelant
  passait par la même branche `busyInCall && busyCall && busyCall.id !== event.callId` et faisait
  `setWaitingCall(event)` + `startWaitingTimeout(event.callId)` sans jamais regarder l'état `waitingCall`
  courant. `setWaitingCall` écrase silencieusement l'objet du deuxième appelant par celui du troisième (React
  state, pas une queue), et `startWaitingTimeout` fait `clearTimeout(waitingTimeoutRef.current)` avant de
  poser le nouveau timer — le timer d'auto-déclin 45s du DEUXIÈME appelant est donc annulé sans qu'aucun
  `rejectWaitingCall` (le `call:end reason=rejected` normalement émis par le bouton Decline ou par ce même
  timeout) ne soit jamais émis pour lui. **Scénario concret** : appel actif A↔B ; C appelle → bannière
  call-waiting affichée pour C, timer 45s armé ; D appelle avant que C ne raccroche/timeout → la bannière
  bascule sur D, le timer de C est silencieusement annulé, AUCUN signal de déclin n'est jamais envoyé au fil
  de C. Le device de C continue de sonner jusqu'à SON PROPRE timeout côté client (ou le ringing-timeout
  serveur ~60s de `CallService`) au lieu de recevoir immédiatement le même `call:end reason=rejected`
  qu'un déclin explicite — écart de parité avec le chemin "Decline" normal, confirmé en lisant `call-store.ts`
  (aucune structure de type queue/historique par callId, `pendingParticipantsByCallId` n'a aucun rapport avec
  ce chemin) et le gateway (`CallEventsHandler.ts`/`CallService.ts` ne font que relayer `call:initiated` à
  tous les participants de la conversation — le "bump" est purement un artefact d'état local `useState` côté
  web, aucune correction serveur nécessaire). **Fix minimal** : dans la branche busy, si `waitingCall` existe
  déjà ET a un `callId` différent du nouvel événement, on appelle `clearWaitingTimeout()` +
  `rejectWaitingCall(waitingCall.callId)` (exactement le même chemin que le bouton Decline/l'auto-timeout,
  aucun nouveau mécanisme) AVANT de promouvoir le troisième appelant dans la bannière. Un re-`call:initiated`
  pour le MÊME `callId` que la bannière déjà affichée (retransmission réseau) ne déclenche pas de déclin —
  gardé par la comparaison `waitingCall.callId !== event.callId`, déjà couvert par test dédié.
- **Tests TDD** : nouveau fichier `CallManager.callWaitingBump.test.tsx` (2 cas) — (1) appel actif + deuxième
  appelant en attente + troisième appelant arrive → assert `socket.emit(CLIENT_EVENTS.CALL_END, {callId:
  DEUXIÈME, reason: 'rejected'})` ET la bannière affiche maintenant le troisième (RED confirmé par
  `git stash` du seul fichier source : `endCall` était `undefined`, exactement l'absence de signal décrite
  ci-dessus) ; (2) un `call:initiated` répété pour le MÊME deuxième appelant ne redéclenche pas de déclin.
  GREEN après le fix. Suite élargie `video-call`/`video-calls`/`call-store`/`CallManager` (28 suites) :
  211/211 tests verts, aucune régression (y compris les 6 cas existants de
  `CallManager.callWaiting.test.tsx` et les 4 de `CallManager.answeredElsewhereWaiting.test.tsx`, tous deux
  dans la même zone de code).
- **`tsc --noEmit`** (`apps/web`) : 30 erreurs pré-existantes dans `CallManager.tsx` (mêmes que Vague 55/58,
  socket typé `unknown` ailleurs dans le fichier, hors du diff de cette vague), comptées identiques avant/
  après via `git stash`/`pop` ; aucune introduite par ce diff.
- **Autres pistes explorées, rien trouvé de nouveau à corriger** : relecture complète de `call-store.ts`
  (568 lignes) — `reset()`, `setLocalStream`/`removeRemoteStream`/`clearRemoteStreams`/
  `clearPeerConnections` stoppent bien tous les tracks/connections, `pendingParticipantsByCallId` reste
  borné par `reset()` (déjà documenté comme reste-ouvert FAIBLE, pas de nouveau chemin de fuite trouvé) ;
  `handleAnsweredElsewhere`/`handleCallEnded` déjà couverts par les gardes des Vagues 55/58, aucun trou
  supplémentaire identifié dans le temps imparti à cette passe.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans ce
  sandbox Linux ; changement strictement web (1 fichier modifié + 1 nouveau fichier de test).
- **Reste ouvert** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel ; `enableSimulcast()`
  scaffolding SFU Phase 2 (intentionnel) ; plafond P2P (max 2 participants actifs) vs conversations GROUP
  autorisées côté `initiateCall` (Vague 55) ; `pendingParticipantsByCallId` (`call-store.ts:139`) sans TTL
  par appel, borné en pratique par le `reset()` générique plutôt qu'une éviction ciblée (FAIBLE, non
  corrigé). **Busy-path troisième appelant retiré de cette liste** (confirmé résolu cette vague, voir
  ci-dessus).

## Vague 60 — un DEUXIÈME appelant non-busy bumpait le premier `incomingCall` sans décliner (2026-08-07)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/modest-cori-3j5xym`, redémarrée depuis `origin/main` à jour (`38640e69`, aucune PR calling ouverte
au démarrage — la précédente instance de cette branche était déjà mergée en #2599 et purgée). Audit dédié
(agent général, lecture seule, croisé avec les 59 vagues précédentes) sur `CallEventsHandler.ts`,
`CallService.ts`, `TURNCredentialService.ts`, `routes/calls.ts`, `call-store.ts`, `CallManager.tsx`,
`use-video-call.ts` — gateway toujours "exceptionnellement propre" (aucun nouveau trou trouvé sur
`CallEventsHandler.ts`/`TURNCredentialService.ts`/`routes/calls.ts`, cf. candidats rejetés ci-dessous) ; le
bug trouvé est le jumeau exact de la Vague 59, sur la branche NON-busy de la même fonction.

- **[FAIBLE-MOYEN, web, CONFIRMÉ + CORRIGÉ, TDD]** `CallManager.tsx` `handleIncomingCall` (branche callee,
  ~ligne 328) — quand l'utilisateur n'est PAS busy (`isInCall === false`, donc la branche busy-path de la
  Vague 59 ne s'exécute jamais) et qu'un `incomingCall` est déjà affiché (premier appelant, pas encore
  répondu/décliné), l'arrivée d'un second `call:initiated` pour un callId différent tombait directement dans
  `setIncomingCall(event)` + `startCallTimeout(event.callId)` sans jamais regarder l'état `incomingCall`
  courant — écrasement silencieux de l'état React ET du `callTimeoutRef` partagé (le second appel de
  `startCallTimeout` fait `clearCallTimeout()` avant de poser son propre timer), sans jamais émettre le
  `call:end reason=rejected` que Decline/l'auto-timeout envoient normalement. **Scénario concret** : C est
  disponible (aucun appel actif) ; A appelle → `incomingCall = A`, notification plein écran, timer 45s armé ;
  avant que C ne réponde/décline, B appelle aussi (conversation différente) → `incomingCall` bascule
  silencieusement sur B, le timer de A est annulé sans déclin explicite — A continue de sonner jusqu'à SON
  PROPRE timeout client (~45s) ou le ringing-timeout serveur (~60s) au lieu de recevoir immédiatement le
  `call:end` qu'un Reject explicite envoie. Exactement le trou que la Vague 59 avait bouché sur la branche
  busy-path (`waitingCall`), jamais répliqué sur la branche callee "pas encore en appel du tout".
  **Fix minimal** : dans la branche callee, si `incomingCall` existe déjà ET a un `callId` différent du
  nouvel événement, on appelle `clearCallTimeout()` + `rejectWaitingCall(incomingCall.callId)` — réutilisation
  directe du helper `rejectWaitingCall` existant (générique malgré son nom : il ne fait qu'émettre
  `CLIENT_EVENTS.CALL_END` pour le callId passé en paramètre, aucun état `waitingCall` interne) — avant de
  promouvoir le second appelant. Un re-`call:initiated` pour le MÊME callId que `incomingCall` (retransmission
  réseau) ne déclenche pas de déclin, gardé par la comparaison `incomingCall.callId !== event.callId`.
- **Tests TDD** : nouveau fichier `CallManager.doubleIncomingCall.test.tsx` (2 cas, miroir exact de
  `CallManager.callWaitingBump.test.tsx` mais SANS `enterActiveCall()`) — (1) premier `call:initiated` puis
  second callId différent, `isInCall` restant `false` tout du long → assert `socket.emit(CLIENT_EVENTS.CALL_END,
  {callId: PREMIER, reason: 'rejected'})` ET la notification affiche maintenant le second (RED confirmé par
  `git stash` du seul fichier source : `endCall` était `undefined`) ; (2) un `call:initiated` répété pour le
  MÊME premier appelant ne redéclenche pas de déclin. GREEN après le fix. Suite élargie `video-call`/
  `video-calls`/`call-store`/`CallManager` (29 suites) : 213/213 tests verts, aucune régression (y compris les
  6 cas de `CallManager.callWaiting.test.tsx` et les 2 de `CallManager.callWaitingBump.test.tsx`, tous deux
  dans la même zone de code).
- **`tsc --noEmit`** (`apps/web`) : 30 erreurs pré-existantes dans `CallManager.tsx` (mêmes que Vagues 55/58/
  59, socket typé `unknown` ailleurs dans le fichier, hors du diff de cette vague), comptées identiques
  avant/après via `git stash`/`pop` ; aucune introduite par ce diff.
- **Autres candidats explorés, rien trouvé de nouveau** : (1) commentaire de `CallEventsHandler.ts` (branche
  RECONNECTING, ~3508-3539) évoquant un "guard `!call.answeredAt` ci-dessus" absent textuellement du handler
  — tracé jusqu'à `CallService.updateCallStatus` (ligne 845), qui applique bien ce garde à chaque transition
  `newStatus === reconnecting` ; imprécision de commentaire sur la couche, pas un bug fonctionnel — rejeté.
  (2) `TURNCredentialService.ts` relu intégralement (validation secrets, floor/NaN TTL, parsing ports) —
  aucun trou trouvé, déjà très durci — rejeté. (3) `routes/calls.ts` (fin/leave REST) — invalidation
  signal-cache (Vague 50), dédup cancellation-push (Vague 56/59), câblage `call:ended` déjà corrects — rejeté.
  (4) `pendingParticipantsByCallId` sans TTL (item reste-ouvert #6) — toujours vrai mais impact réel plus
  faible (borné par le prochain appel réussi ou `reset()`, aucun symptôme utilisateur direct) que le bug
  trouvé — dépriorisé au profit de cette vague.
- **iOS/Android (lecture seule, aucun changement)** : hors périmètre — aucune toolchain Swift/Kotlin dans ce
  sandbox Linux ; changement strictement web (1 fichier modifié + 1 nouveau fichier de test).
- **Reste ouvert** : dead code / god-objects `CallManager.swift`/`CallEventsHandler.ts` ; ADR
  `actor CallEventQueue` non implémenté ; couverture E2E iOS des écrans d'appel ; `enableSimulcast()`
  scaffolding SFU Phase 2 (intentionnel) ; plafond P2P (max 2 participants actifs) vs conversations GROUP
  autorisées côté `initiateCall` (Vague 55) ; `pendingParticipantsByCallId` (`call-store.ts:139`) sans TTL
  par appel, borné en pratique par le `reset()` générique plutôt qu'une éviction ciblée (FAIBLE, non
  corrigé). **Deuxième-appelant-non-busy retiré de cette liste** (confirmé résolu cette vague, voir
  ci-dessus).

## Vague 61 — `P2PWebRTCClient.switchCamera()` ne revertait pas `usingFrontCamera` sur un `startCapture` en échec (2026-08-07)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/upbeat-dirac-oev17i`, redémarrée depuis `origin/main` à jour (`c6867c134`, aucune PR calling ouverte
au démarrage). Sandbox Linux sans toolchain Xcode — comme les vagues iOS précédentes (PR #2606/#2603
mergées le jour même), fix source-guardé + CI `ios-tests.yml` déclenché manuellement (non auto-déclenché sur
PR, cf. `.github/workflows/ios-tests.yml`) pour la validation réelle. Audit dédié (agent Explore, lecture
seule) sur `P2PWebRTCClient.swift`, `WebRTCService.swift`, `CallManager.swift`, `VoIPPushManager.swift`,
`VoIPDedupRing.swift`, `PiPCallController.swift`, `VideoSurvivalController.swift` + suites de tests
correspondantes — la quasi-totalité des callbacks/délégués porte déjà un garde d'identité/staleness ; le
gap trouvé est dans le voisinage caméra déjà identifié comme fragile par les commentaires du code lui-même
(`stopCapture()`/`startCapture()` concurrents sur le même `RTCCameraVideoCapturer`).

- **[MOYEN, iOS, CONFIRMÉ + CORRIGÉ, TDD source-guard]** `P2PWebRTCClient.swift` `switchCamera()`
  (~ligne 1006) — la fonction bascule `usingFrontCamera.toggle()` de façon optimiste à l'entrée, puis
  revert ce toggle sur les DEUX guard-throws précoces (pas de caméra / pas de format), mais le
  `try await capturer.startCapture(...)` final — le point d'échec le plus probable sur matériel réel
  (caméra occupée, appareil mono-caméra, erreur de configuration `AVCaptureSession`) — n'avait AUCUN
  revert : un throw ici laissait `usingFrontCamera` affirmer que le switch avait réussi alors que le
  capturer restait stoppé (aucune caméra, avant ou après, en cours de capture). **Distinct du fix déjà en
  place** : `CallManagerSwitchCameraFailureCorrectionSourceTests` garde le revert du flag UI-facing
  `CallManager.isUsingFrontCamera` (mirroring self-preview) sur ce même échec signalé par
  `WebRTCService.switchCamera(completion:)` — mais ce flag est une COPIE côté CallManager, à une couche
  au-dessus ; `P2PWebRTCClient.usingFrontCamera` (privé) est un état interne SÉPARÉ, jamais touché par ce
  fix-là. **Scénario concret** : switch caméra échoue (capteur occupé par une autre app, timing bord) →
  `CallManager.isUsingFrontCamera` revert correctement (mirroring self-preview correct) MAIS
  `P2PWebRTCClient.usingFrontCamera` reste sur la valeur post-toggle (fausse) → `restartCapturerIfStopped()`
  (déclenché par ex. par un retour au premier plan après backgrounding pendant l'appel) lit ce flag pour
  choisir quelle caméra physique reprendre → tente de relancer la MAUVAISE caméra (celle qui vient
  d'échouer) au lieu de celle que l'utilisateur voyait avant la tentative ratée — désynchronisation
  UI-affichée vs capture-réellement-tentée qui ne se corrige jamais d'elle-même.
  **Fix minimal** : `do { try await capturer.startCapture(...) } catch { usingFrontCamera.toggle(); throw error }`
  — même geste que les deux guards précédents, appliqué au 3e point d'échec de la fonction. Pas de
  changement de comportement sur le chemin succès (le flag garde sa valeur post-toggle, déjà correcte).
- **Tests** : `P2PWebRTCClientSwitchCameraFailureRevertSourceTests.swift` (nouveau, miroir du patron
  `P2PWebRTCClientConcurrencySourceTests`/`CallManagerSwitchCameraFailureCorrectionSourceTests` — lecture du
  source en `String`, assertions sur la présence du `do/catch` et du revert avant le `throw error`, plus un
  garde de non-régression sur le nombre total de `usingFrontCamera.toggle()` dans la fonction, 1 flip
  optimiste + 3 reverts). Pas de test comportemental possible : `RTCCameraVideoCapturer` exige du matériel
  caméra réel, absent de l'hôte de test unitaire — même contrainte documentée par les gardes-source
  existants de ce fichier.
- **Autres candidats explorés par l'audit, rien corrigé ici** : `buildLocalVideoTrackAndStartCapture()`
  laisse `localVideoTrack_`/`videoCapturer` posés sur tout échec (donc `hasLocalVideoTrack` répond `true`
  après un build raté) ; `WebRTCService.switchCamera()`'s `switchCameraTask` ne se sérialise qu'avec
  lui-même, pas avec `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/`iceRestartTask`. Les deux sont
  plus larges (le premier touche le chemin de démarrage vidéo initial, contrat `hasLocalVideoTrack` déjà
  documenté "kept alive but disabled" ailleurs — nécessite de vérifier qu'aucun appelant ne dépend du
  comportement actuel avant de le changer ; le second est une question de sérialisation multi-tâches plus
  large, hors du scope d'une vague ciblée) — laissés pour une vague dédiée.
- **iOS Tests CI** : déclenché manuellement via `workflow_dispatch` sur `ios-tests.yml` (branche
  `claude/upbeat-dirac-oev17i`) après push — aucun trigger `pull_request` sur ce workflow (cf. commentaire
  du fichier), donc validation explicite requise avant merge plutôt qu'implicite via check PR.
- **Reste ouvert** : dead code / god-objects `CallManager.swift` (5717 lignes) ; ADR `actor CallEventQueue`
  non implémenté ; `hasLocalVideoTrack` menteur après un `buildLocalVideoTrackAndStartCapture()` raté ;
  `switchCameraTask` non sérialisé avec les autres tâches caméra/vidéo de `WebRTCService`.

## Vague 62 — `buildLocalVideoTrackAndStartCapture()` laissait `hasLocalVideoTrack` répondre `true` après un échec de build vidéo (2026-08-07)

Point d'entrée : routine calling-feature (agent Cowork non interactif, mandat PHASE 1-12). Branche
`claude/upbeat-dirac-mgf1ve` redémarrée depuis `origin/main` à jour. **PR orpheline trouvée au démarrage** :
`claude/upbeat-dirac-oev17i` (#2609, Vague 61 ci-dessus) était ouverte, CI standard verte, mergée en premier
(aucun `ios-tests.yml` déclenchable — 403 sur `workflow_dispatch` depuis ce token — mais ce workflow n'a
**aucun** trigger `pull_request`/branch-protection, donc ne bloque jamais un merge par design, cf. son
commentaire d'en-tête). Prend directement la Vague 61 comme point de départ (item « reste ouvert » n°1).

- **[MOYEN-ÉLEVÉ, iOS, CONFIRMÉ + CORRIGÉ, TDD source-guard]** `P2PWebRTCClient.swift`
  `buildLocalVideoTrackAndStartCapture()` (~ligne 253) — `videoTrack.isEnabled = true` +
  `localVideoTrack_ = videoTrack` + `videoCapturer = capturer` s'exécutent AVANT les 3 points d'échec
  restants de la fonction (`Self.pickCaptureDevice` → `noCameraAvailable`, `selectFormat` →
  `noCameraFormatAvailable`, `capturer.startCapture` → erreur native). Aucun des 3 ne revertait ces
  propriétés avant de propager : un throw ici laissait `localVideoTrack_` posé avec `isEnabled == true`.
  `hasLocalVideoTrack` (ligne 913) est délibérément keyé sur `isEnabled`, pas sur une simple nil-check
  (cf. son doc-comment — nécessaire pour que `disableLocalVideo()` puisse garder le track vivant en vue
  d'un `enableLocalVideo()` bon marché) : ce choix de design rend CE bug particulièrement sournois, il
  contourne exactement la garde que `hasLocalVideoTrack` pense avoir. **Scénario concret** : appel
  entrant vidéo, caméra occupée par une autre app → `startCapture` échoue → `performLocalMediaStart`
  bascule en repli audio-only (`isVideoEnabled = false`) MAIS ne touche jamais `hasLocalVideoTrack` sur ce
  chemin (repose sur sa valeur initiale `false`, correcte par accident) ; en revanche tout appelant qui
  RELIT `webRTCService.hasLocalVideoTrack` après un échec similaire de `upgradeToVideo()` (mid-call
  audio→vidéo) — `toggleVideo`'s `catch` générique (CallManager.swift:2482-2487), le `catch` générique de
  la récupération vidéo post-unhold (CallManager.swift:3347-3351) — écrase `self.hasLocalVideoTrack` avec
  cette valeur MENTEUSE (`true`) juste après avoir mis `isVideoEnabled = false` : `CallView.swift`
  (`swapStreams && callManager.hasLocalVideoTrack`, ligne 1103) et le self-preview gate lisent alors un
  état incohérent — vidéo affichée/permise comme active alors qu'aucune caméra ne capture réellement,
  désynchronisation qui ne se corrige jamais d'elle-même avant la fin de l'appel.
  **Fix minimal, même geste que la Vague 61** : `pickCaptureDevice`/`selectFormat`/`startCapture` passent
  dans un `do { … } catch { revert; throw error }` — le `catch` re-nil `localVideoTrack_`/`videoCapturer`/
  `videoFilterDelegate` (identity-guardé sur `videoCapturer === capturer`, même garde que le nettoyage
  `isStale` déjà présent juste en dessous pour le cas SŒUR — session terminée pendant le warm-up — resté
  inchangé et indépendant) avant de rethrow. `await MainActor.run` autour du revert : le throw de
  `startCapture` peut reprendre sur un executor arbitraire (même raison que le check `isStale` voisin).
  Pas de changement de comportement sur le chemin succès.
- **Tests** : `P2PWebRTCClientBuildVideoTrackFailureRevertSourceTests.swift` (nouveau, même patron que
  `P2PWebRTCClientSwitchCameraFailureRevertSourceTests` — lecture du source en `String`, 3 assertions :
  les 3 points d'échec sont bien à l'intérieur du `do`, le `catch` re-nil les 3 propriétés identity-guardé
  puis rethrow, et le nettoyage `isStale` voisin (cas SŒUR distinct) n'a ni été fusionné ni supprimé —
  garde de non-régression sur le compte de sites `if videoCapturer === capturer {` (attendu : 2). Toutes
  les assertions vérifiées manuellement contre le source réel (`python3` string-matching) avant commit —
  aucune toolchain Swift/Xcode disponible dans ce sandbox Linux.
- **Autre candidat exploré, rien corrigé ici** : `WebRTCService.switchCamera()`'s `switchCameraTask` ne se
  sérialise qu'avec lui-même (`await previousTask?.value` où `previousTask` = l'ancien `switchCameraTask`),
  pas avec `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/`iceRestartTask` — un switch caméra
  pourrait courir en concurrence avec un upgrade/downgrade vidéo ou une reprise post-hold sur le même
  `RTCCameraVideoCapturer`. Portée plus large qu'une vague ciblée (toucherait la chaîne de sérialisation
  de 5 tâches distinctes dans `WebRTCService`) — laissé pour une vague dédiée.
- **Reste ouvert** : dead code / god-objects `CallManager.swift` (5717 lignes) ; ADR `actor CallEventQueue`
  non implémenté ; `switchCameraTask` non sérialisé avec les autres tâches caméra/vidéo de `WebRTCService`.

## Vague 63 — `CXAnswerCallAction` était le seul handler CallKit mutant non gardé par `activeCallUUID` (2026-08-07)

Point d'entrée : suite immédiate de la Vague 62, même session. Audit dédié (agent Explore, lecture seule)
mandaté explicitement pour chercher la suite de `a1206ca3` (PR #2606, mergée plus tôt cette routine) sur
`CallManager.swift`, `P2PWebRTCClient.swift`, `WebRTCService.swift`, `CallTranscriptionService.swift`,
`CallView.swift`, `CallStarter.swift`, `CallsViewModel.swift`, `PiPCallController.swift`,
`CallPiPPolicy.swift` + signalisation gateway (`call:*` events). Verdict de l'audit : codebase très
durcie par les vagues précédentes (guards d'identité/génération quasi-systématiques, `[weak self]`
partout, chaînage de tâches sérialisé pour hold/survival/ICE-restart) — un seul écart réel trouvé,
confirmé par lecture directe du source avant tout fix.

- **[ÉLEVÉ, iOS, CONFIRMÉ + CORRIGÉ, TDD source-guard]** `CallManager.swift`
  `CallKitDelegateProxy.provider(_:perform: CXAnswerCallAction)` (~ligne 5360) — `a1206ca3` a ajouté le
  garde `action.callUUID == manager.activeCallUUID` à `CXEndCallAction`, `CXSetMutedCallAction`,
  `CXSetHeldCallAction` et `CXPlayDTMFCallAction`, mais **pas** à `CXAnswerCallAction` — le 5e handler
  mutant, et objectivement le plus destructeur à laisser sans garde. Confirmé par lecture directe :
  `reportIncomingVoIPCall`'s busy path (ligne ~1301) génère un `uuid` LOCAL, le reporte via
  `reportNewIncomingCall` puis le retire immédiatement via `reportCall(endedAt:)` — **sans jamais écrire
  `activeCallUUID`** (qui n'est posé qu'à la ligne 1340, sur la branche idle/succès). `activeCallUUID`
  pointe donc en permanence vers l'appel PRIMAIRE réel pendant toute la durée du busy path.
  `holdPendingAnswerAction` (ligne 434) n'a AUCUN garde d'identité propre : elle supersede-et-fail
  inconditionnellement tout `pendingAnswerAction` déjà tenu dès qu'un nouveau `CXAnswerCallAction` arrive.
  **Scénario concret** : appel A actif et connecté (answer action déjà fulfilled) ; VoIP push pour un
  appel B pendant que A est actif → busy path → CallKit reporte B avec un UUID fantôme puis le retire
  aussitôt ; si CallKit délivre malgré tout un `CXAnswerCallAction` tagué de cet UUID fantôme dans la
  fenêtre de timing étroite qui suit → sans garde, `holdPendingAnswerAction` l'aurait tenu comme LE
  pending-answer courant — anodin ici puisque A n'a plus d'action en attente à ce stade, mais le VRAI
  danger est l'inverse : un appel entrant C en cours de sonnerie (pending-answer réel en attente) reçoit
  un `CXAnswerCallAction` fantôme d'un busy-path concurrent (D) → `holdPendingAnswerAction` supersede
  et `.fail()` l'action de C — désynchronisant CallKit (qui croit C toujours en attente de réponse) de
  l'app (qui vient d'échouer la vraie tentative de réponse de l'utilisateur).
  **Fix minimal, même geste que `a1206ca3`** : garde `action.callUUID == manager.activeCallUUID` ajouté
  juste avant `manager.holdPendingAnswerAction(action)`, avec `Logger.calls.warning` + `action.fail()`
  sur mismatch (pas `.fulfill()` — CallKit sait déjà que cet appel est terminé via `reportCall(endedAt:)`,
  compléter par « répondu » serait un mensonge ; `.fail()` est aussi la sémantique déjà utilisée par
  `settlePendingAnswerAction(fulfilled: false, …)` pour un answer action supersédé). Aucun changement sur
  le chemin identity-matched (chemin normal : appel unique, `action.callUUID` égale toujours
  `activeCallUUID`).
- **Tests** : `CallManagerTests.swift` → nouveau `test_cxAnswerCallAction_guardsOnActiveCallUUIDBeforeHoldingAnswerAction`
  dans `CallKitActionCallUUIDGuardTests` (même classe que les 4 gardes de `a1206ca3`), même patron
  (extraction du corps du handler en `String`, offset du garde < offset de l'action protégée) + assertion
  sur la présence de `action.fail()`. Fenêtre `handlerBody` élargie à 3500 caractères (vs 2000 par défaut)
  pour ce handler spécifiquement : son commentaire de doc pré-existant (historique `[Fix 2026-07-02]`/
  `[Fix 2026-07-03]`) plus le nouveau commentaire du garde repoussent la position du garde au-delà de la
  fenêtre par défaut — vérifié en rejouant l'extraction en Python contre le source réel avant commit.
- **Reste ouvert** : dead code / god-objects `CallManager.swift` (5717+ lignes) ; ADR `actor CallEventQueue`
  non implémenté ; `switchCameraTask` non sérialisé avec les autres tâches caméra/vidéo de `WebRTCService` ;
  busy-path `reportNewIncomingCall` failure handler (ligne ~1310) ne nettoie que le dedup VoIP, jamais
  `pendingIncomingCall`/`showCallWaitingBanner` (contrairement au chemin idle qui route par `failCall`) —
  UI-only, s'auto-corrige au prochain `endCurrentAndAnswerPending()`, sévérité faible, non corrigé cette
  vague (candidat pour un futur balayage ciblé « busy-path parity »).

## Vague 64 — audit gateway signaling + dead code CallManager : verdict propre, spec prête pour la sérialisation caméra (2026-08-07)

Point d'entrée : suite de la Vague 63, même session. Audit dédié (agent Explore, lecture seule) mandaté
sur 3 axes explicitement listés en « reste ouvert » des vagues précédentes : signalisation gateway
(glare/autorisation/dead code socket), dead code mécanique de `CallManager.swift` (5737 lignes), et le
gap de sérialisation `switchCameraTask` déjà repéré en Vague 61/63.

- **Signalisation gateway (`call:signal`/`call:join`/`call:end`, `signalSessionCache`)** : **rien trouvé**
  au niveau de confiance déjà établi par cette routine. Lecture complète de `CALL_EVENTS.SIGNAL` (garde de
  fraîcheur `refreshSignalSession`, rate-limit ICE par appel, émission ciblée via `resolveTargetSockets`
  scopée `ROOMS.call(callId) ∩ targetUserId` — pas de fuite possible vers la mauvaise room/participant),
  `CALL_EVENTS.JOIN` (replay d'offre bufferisée re-validé contre `leftAt` courant), `CALL_EVENTS.END`
  (autorisation stricte AVANT le broadcast fast-path, `resolveActiveCallParticipantId` pas la vérification
  de membership plus faible), et les 7 sites d'invalidation de `signalSessionCache`. Le rôle poli/impoli de
  perfect-negotiation est **entièrement côté client** (`setNegotiationRole`) — la question « rôle assigné
  déterministiquement côté gateway » ne s'applique pas, rien à trouver là. Les entrées apparemment mortes
  du registre `CALL_EVENTS` (`MODE_CHANGED`, `TRANSCRIPTION*`) sont déjà `@deprecated` et documentées comme
  intentionnellement conservées-mais-non-câblées (audit 2026-07-11 #4) — déjà disposé, pas une nouvelle
  trouvaille.
- **Dead code mécanique `CallManager.swift`** : **rien trouvé**. Extraction des 139 déclarations
  `private`/`fileprivate` (`func`/`var`/`let`) + 31 `@Published`, comptage des sites d'usage dans le fichier
  et dans le reste de `apps/ios`. Chaque déclaration a ≥1 usage réel (les plus bas : `isLinkQualityDegraded`,
  `isRemoteAudioEnabled`, `isRemoteScreenCapturing`, `selectedCameraId`, `showCallWaitingBanner` — 1 binding
  de View légitime chacun, pas mort). Cohérent avec le fait que Vague 47/54 ont déjà retiré le mort évident.
  Le god-object (5737 lignes, un seul type portant CallKit + orchestration WebRTC + analytics + TURN refresh
  + task-chaining hold/survival/ICE-restart + audio session + PiP + screen-capture monitoring) reste de la
  dette d'architecture **valide** mais hors du périmètre d'un balayage mécanique mono-vague.
- **[MOYEN-ÉLEVÉ, iOS, CONFIRMÉ PAR LECTURE DIRECTE, PAS ENCORE CORRIGÉ]** `WebRTCService.switchCamera()`/
  `switchToCamera()` (WebRTCService.swift:272-301) et `CallManager.switchCamera()`/`selectCamera()`
  (CallManager.swift:2492-2527) ne rejoignent PAS la famille `videoToggleTask`/`holdVideoTask`/
  `survivalVideoTask`/`iceRestartTask`/`signalOfferAnswerTask` (doc-comment `survivalVideoTask`,
  CallManager.swift:598-627) — `CallManager.switchCamera()` appelle `webRTCService.switchCamera(completion:)`
  directement, fire-and-forget, sans capturer/attendre AUCUN des 5 tasks trackés. Confirmé par lecture
  directe des deux côtés : `P2PWebRTCClient.switchCamera()`/`switchToCamera(uniqueID:)`
  (P2PWebRTCClient.swift:1035-1084, 1117-1140) font leur propre cycle `stopCapture()`→`startCapture()` sur
  LE MÊME `RTCCameraVideoCapturer` que `enableLocalVideo()`/`disableLocalVideo()`
  (P2PWebRTCClient.swift:949-1000, pilotés par `toggleVideo`/`handleHold`/`applySurvivalVideoSend`).
  **Scénario concret** : double-geste plausible en vrai usage — l'utilisateur désactive la vidéo (tap) puis
  bascule immédiatement la caméra (ou l'inverse). `videoToggleTask` atteint
  `await webRTCService.downgradeFromVideo()` → `client.disableLocalVideo()` → `await
  videoCapturer?.stopCapture()` EN COURS ; concurremment, `switchCamera()` déclenche son propre
  `stopCapture()`→`startCapture()` sur le MÊME capturer. Cas grave possible : le `startCapture()` du switch
  termine APRÈS le `stopCapture()` du toggle → caméra physiquement ALLUMÉE et en train de streamer alors que
  `isVideoEnabled == false` / `hasLocalVideoTrack == false` — régression de confidentialité (LED caméra
  allumée sans rien qui consomme le flux), dans la même famille de sévérité que la Vague 58
  (`stopPreauthorizedStream`) et la Vague 62 (mensonge `hasLocalVideoTrack`). Item explicitement laissé
  ouvert par la Vague 61 (« switchCameraTask… hors du scope d'une vague ciblée ») et reconduit en reste
  ouvert par les Vagues 62/63 — confirmé maintenant par lecture directe des DEUX côtés (pas seulement
  supposé), donc élevé de « candidat » à « bug confirmé, spec de fix prête ».
  **Pourquoi NON corrigé cette vague** : une fermeture correcte exige une exclusion mutuelle
  BIDIRECTIONNELLE — `switchCamera()` doit attendre les 5 tasks existants ET chacun des 5 doit désormais
  attendre un nouveau `cameraSwitchTask`, ce qui touche ~9 sites d'édition dans un fichier de 5737 lignes
  (1 dans `toggleVideo`, 2 dans `handleHold` — lignes ~3262 et ~3304, 1 dans `applySurvivalVideoSend` —
  ligne ~5673, 1 dans `scheduleICERestart` — ligne ~5207, 4 dans les sites de création de
  `signalOfferAnswerTask` — lignes ~1750, ~1797, ~1927, ~2013/2043 — plus la réécriture de `switchCamera()`
  elle-même avec un pont continuation pour attendre la complétion réelle du `completion:` de
  `webRTCService.switchCamera`). Sans toolchain Swift/Xcode dans ce sandbox Linux pour compiler-vérifier
  9 sites d'édition simultanés dans du code déjà densément audité, le risque d'introduire une régression
  de compile non détectée avant merge dépasse la valeur d'un fix mono-vague — décision cohérente avec le
  jugement déjà porté 3 fois par cette routine sur ce même item (Vagues 61/62/63).
  **Spec de fix prête pour la prochaine vague avec accès compilateur** :
  1. `private var cameraSwitchTask: Task<Void, Never>?` (nouvelle propriété, après `signalOfferAnswerTask`
     ligne 627) + addendum au doc-comment de `survivalVideoTask` expliquant la course sur le capturer
     (distincte de la réentrance `RTCPeerConnection` déjà documentée).
  2. `switchCamera()` : capturer `previousToggle/Hold/Survival/ICERestart/Answer` + `previousCameraSwitch`
     (les 6), `cameraSwitchTask = Task { @MainActor … await tous les 6 …; pont
     `withCheckedContinuation` autour de `webRTCService.switchCamera(completion:)` pour que
     `cameraSwitchTask.value` ne résolve qu'à la fin réelle du switch, pas à l'enqueue }`.
  3. Ajouter la capture + `await previousCameraSwitch?.value` aux 8 sites existants listés ci-dessus
     (même geste répétitif que les 5 autres, un seul pattern à dupliquer 8 fois).
  4. `selectCamera(id:)`/`switchToCamera(uniqueID:)` (picker caméra externe Mac/Continuity, chemin
     beaucoup plus rare que le flip avant/arrière) : `WebRTCService.switchToCamera` n'a AUCUN completion
     aujourd'hui (fire-and-forget, log d'erreur seul) — fermer complètement ce second chemin nécessite
     aussi de lui ajouter un completion, une extension d'API en plus des 9 sites ci-dessus. Peut être
     scindé en une vague séparée si la première (flip avant/arrière) est jugée suffisante à elle seule.
  5. `endCallInternal` (ligne ~3640-3646) : ajouter `cameraSwitchTask = nil` au nettoyage des 4 autres
     tasks.
  6. Tests : source-guard uniquement (même contrainte que Vagues 61-63) — vérifier que les 9 sites
     capturent bien `cameraSwitchTask` et l'attendent, plus que `switchCamera()` attend les 5 autres.
- **Reste ouvert** : dead code / god-objects `CallManager.swift` (5737 lignes) ; ADR `actor CallEventQueue`
  non implémenté ; sérialisation `switchCamera`/`selectCamera` contre la famille de 5 tasks vidéo (spec
  ci-dessus, prête pour exécution avec accès compilateur) ; busy-path `reportNewIncomingCall` failure
  handler ne nettoie pas `pendingIncomingCall`/`showCallWaitingBanner` (UI-only, faible, auto-corrigé).

## Vague 66 — exécution de la spec caméra : cameraSwitchTask rejoint la chaîne bidirectionnelle (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling). Reprise directe
de la spec laissée « prête » par la Vague 64 (`switchCamera()`/`selectCamera(id:)` non sérialisés contre
la famille `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/`iceRestartTask`/`signalOfferAnswerTask`).
Toolchain Swift/Xcode toujours absente de ce sandbox Linux — implémentation par lecture directe exhaustive
(pas de subagent aveugle), verdict laissé au compilateur macOS de la CI « iOS Tests » au push.

- **Découverte en cours de route** : la spec Vague 64 énumérait « 8 sites d'édition » (en réalité 9 dans
  son propre détail : 1 toggleVideo + 2 handleHold + 1 survival + 1 ICE-restart + 4 signalOfferAnswerTask).
  Un **10ᵉ site** existe et n'était listé nulle part : le handler `thermalStateDidChange` (downgrade vidéo
  thermal-critique, CallManager.swift ~4787) assigne aussi `self.videoToggleTask = Task { … }` avec la
  même famille de captures — oublié par l'énumération précédente. Sans ce site, la fermeture aurait été
  incomplète (le flip caméra n'aurait pas attendu un downgrade thermal en vol, et réciproquement).
  Confirmé par grep exhaustif des assignations `xxxTask = Task {` sur tout le fichier avant d'écrire le
  moindre correctif — pas seulement les sites listés dans la doc.
- **Implémentation** (10 sites + 2 nouveaux) :
  1. `cameraSwitchTask: Task<Void, Never>?` (nouvelle propriété), doc-comment de `survivalVideoTask` mis à
     jour (« cinq »→« six », `cameraSwitchTask` cité explicitement dans la liste canonique référencée par
     tous les autres sites).
  2. `switchCamera()` : capture les 5 autres + `previousCameraSwitch` (chaîné, PAS annulé — un double-flip
     rapide doit s'appliquer deux fois dans l'ordre, pas perdre le premier), pont `withCheckedContinuation`
     autour de `webRTCService.switchCamera(completion:)` pour que `cameraSwitchTask.value` ne résolve qu'à
     la fin réelle du switch (pas à l'enqueue).
  3. `selectCamera(id:)` : même schéma. `WebRTCService.switchToCamera(uniqueID:)` gagne un paramètre
     `completion: ((Bool) -> Void)? = nil` (défaut nil, rétrocompatible) pour permettre le même pont.
  4. Les 10 sites existants (toggleVideo, handleHold×2, applySurvivalVideoSend, scheduleICERestart,
     signalOfferAnswerTask×4, thermalStateDidChange) capturent désormais aussi `previousCameraSwitch` et
     l'attendent avant d'actuer — fermeture bidirectionnelle complète.
  5. `endCallInternal` : `cameraSwitchTask?.cancel(); cameraSwitchTask = nil` ajouté au nettoyage.
- **Vérification de non-régression sur la suite existante AVANT d'écrire un seul nouveau test** : la
  suite `CallManagerRenegotiationSerializationTests`/`ToggleVideoCXUpdateTests`/etc. (source-guards très
  denses, ancrés sur des marqueurs de signature exacts) a été relue site par site contre le diff — aucune
  signature de fonction déplacée/modifiée (seul le corps grossit), donc tous les marqueurs `from:`/`to:`
  existants restent valides. Une seule casse trouvée et corrigée : `WebRTCServiceTests
  .test_switchToCamera_chainsOntoPreviousTask` ancrait sur la signature COMPLÈTE
  `"func switchToCamera(uniqueID: String)"`, cassée par l'ajout du paramètre `completion:` — même piège
  que celui déjà documenté et corrigé pour `switchCamera()` dans le commentaire du test voisin (ancrer sur
  le nom + la parenthèse ouvrante, pas la liste de paramètres complète). Corrigé à l'identique.
- **Tests ajoutés** : `CallManagerCameraSwitchSerializationTests` (17 tests, source-guard uniquement —
  même contrainte que les Vagues 61-64, pas de toolchain pour exécuter) : propriété, capture+attente des
  6 tâches dans `switchCamera()`/`selectCamera(id:)`, pont `withCheckedContinuation`, et attente de
  `cameraSwitchTask` dans chacun des 10 sites existants (y compris le 10ᵉ site thermal découvert ici).
- **Reste ouvert** : dead code / god-object `CallManager.swift` (~5770 lignes après cette vague) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` failure handler ne nettoie pas
  `pendingIncomingCall`/`showCallWaitingBanner` (UI-only, faible, auto-corrigé — reconduit sans changement).

## Vague 65 — `BackSoundProcessor` routait la musique de fond vers les haut-parleurs locaux en plus du mix sortant (2026-08-07)

Point d'entrée : suite de la Vague 64, même session, sans toolchain Swift dans ce sandbox (confirmé à
nouveau — `switch`/`xcodebuild` absents). Audit dédié (agent Explore, lecture seule) mandaté sur les zones
web de la stack calling non encore couvertes par les vagues précédentes (signalisation gateway déjà
blanchie en Vague 64) : `audio-effects/**` (voix FX), hooks de call web, TURN/ICE refresh, screen-share,
sécurité `call:join`.

- **[MOYEN, web, CONFIRMÉ PAR LECTURE DIRECTE, CORRIGÉ]** `BackSoundProcessor.loadSound()`
  (`apps/web/utils/audio-effects.ts:512-518`, effet "Ambiance sonore" du carrousel d'effets audio d'appel)
  construisait le lecteur de musique de fond avec `new Tone.Player({...}).toDestination()` **en plus** du
  branchement légitime `this.player.connect(this.playerGain)` de la ligne suivante — `playerGain` étant
  lui-même déjà branché vers `outputNode` → `mediaStreamDestination` (le flux sortant WebRTC réel).
  `Tone.ToneAudioNode.toDestination()` branche vers `Tone.getDestination()`, c'est-à-dire les
  haut-parleurs/écouteurs RÉELS de l'utilisateur, pas seulement le mix envoyé au pair — aucun autre
  processor du fichier (VoiceCoder/BabyVoice/DemonVoice) ne fait ce double branchement.
  **Scénario concret** : utilisateur en appel actif ouvre le carrousel d'effets, active "Ambiance sonore"
  et choisit une piste — dès `play()`, la piste est audible directement depuis les haut-parleurs locaux de
  l'utilisateur (pas seulement "envoyée au pair" comme l'UI le suggère). Sur tout appareil sans écouteurs
  (haut-parleur du laptop/téléphone — le cas courant en appel vidéo), le micro re-capte ce même son de
  haut-parleur et le remixe une seconde fois dans le même flux sortant (écho/comb-filtering par-dessus ce
  que l'écho-cancellation de `getUserMedia` peut compenser), et l'utilisateur local entend une piste de fond
  non désirée et non coupable par le mute micro pendant toute la durée de l'effet.
  **Fix** : retrait du chaînage `.toDestination()` — ne conserver que
  `this.player = new Tone.Player({...}); this.player.connect(this.playerGain);`. Diff d'une ligne,
  commentaire ajouté expliquant pourquoi `.toDestination()` ne doit jamais être chaîné ici.
  **Tests** : `apps/web/utils/__tests__/audio-effects.test.ts` → nouveau describe `BackSoundProcessor.loadSound`
  (2 tests : `toDestination` jamais appelé sur le player chargé, `connect` appelé exactement une fois avec
  `playerGain`). RED confirmé avant fix (1er test échoue avec le code bogué, `toDestination` appelé 1 fois),
  GREEN après. Mock `apps/web/__mocks__/tone.js` étendu avec `Player` (instance chaînable auto-référencée,
  même pattern que le vrai Tone.js où `toDestination()`/`connect()` retournent `this`), `loaded`, `start` —
  seuls les 2 fichiers du repo import `'tone'` directement (`audio-effects.ts`, `use-audio-effects.ts`),
  extension du mock partagé sans risque de régression ailleurs (vérifié par grep avant modification).
  Suite `utils/` + `hooks/use-audio-effects` complète : 52 suites / 1229+53 tests verts (1 suite
  préexistante en échec de configuration corrigée en cours de route en rebuildant `packages/shared`, sans
  rapport avec ce fix). `tsc --noEmit` : les 3 erreurs qu'introduisait le premier jet du test (type
  `LoopMode` incorrect, cast `jest.Mock` direct sur un type union) corrigées ; 0 erreur nouvelle sur les 3
  fichiers touchés (reste des erreurs tsc du repo pré-existantes, sans rapport, non touchées par ce diff).
  `next lint`/`eslint` cassent dans ce sandbox avec une erreur de config circulaire indépendante du diff
  (confirmé en lançant sur des fichiers non touchés aussi) — non bloquant, connu comme limitation
  d'environnement.
- **Note secondaire (non corrigée)** : `VoiceCoderProcessor` (auto-tune) laisse tourner sa boucle
  `requestAnimationFrame` de détection de pitch (analyse FFT par frame) après désactivation de l'effet —
  `disconnect()` (appelé par `rebuildAudioGraph()` au toggle off) ne coupe que le graphe audio, jamais
  `stopPitchDetection()` (réservé à `destroy()`, appelé seulement au démontage/fin d'appel). Coût CPU/
  batterie continu sans bénéfice audible pour le reste de l'appel après un simple toggle off. Confirmé par
  lecture directe des deux côtés (`audio-effects.ts` + `use-audio-effects.ts`) mais nécessite un mock
  `AudioContext`/`AnalyserNode` plus lourd (constructeur crée `audioContext.createAnalyser()` avant même le
  routing) — reporté à une vague dédiée pour ne pas mélanger deux fixes de nature différente dans le même
  diff minimal.
- `useVideoFilters.ts` (`apps/web/components/video-calls/hooks/`) : pipeline WebGL complet de filtres vidéo
  (température/luminosité/contraste/saturation/exposition) sans AUCUN appelant en production (ni exporté
  depuis `components/video-calls/index.ts`, ni importé nulle part) et sans cleanup d'effet — même forme que
  `useWebRTC.ts` retiré en Vague 33. Candidat dead-code pour une future vague de nettoyage, pas de bug
  actif tant que rien ne l'instancie — non touché cette vague.
- **Nouveau constat** : TURN credential refresh + ICE restart web (`use-webrtc-p2p.ts`, `webrtc-service.ts`,
  `use-call-quality.ts`, `use-active-peer-connection.ts`) relus intégralement, cohérents avec les fixes des
  vagues précédentes (RC-1, refresh périodique 80% TTL, escalade disconnect-grace→ICE-restart) — rien trouvé.
  Web n'a aucune implémentation de partage d'écran (`getDisplayMedia`) — item hors périmètre web tel quel.
- **Reste ouvert** : `VoiceCoderProcessor` rAF de pitch-detection non arrêté au toggle off (spec ci-dessus,
  prête pour une vague dédiée avec mock `AnalyserNode`) ; `useVideoFilters.ts` dead code (candidat nettoyage) ;
  items iOS des Vagues 61-64 (sérialisation `switchCamera`, god-object `CallManager.swift`) toujours bloqués
  sur l'absence de toolchain Swift dans ce sandbox.

## Vague 67 — exécution de la spec `VoiceCoderProcessor` : le rAF de pitch-detection s'arrête réellement au toggle off (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling). Suite immédiate des
Vagues 65/66 (mergées cette session — Vague 65 web `BackSoundProcessor`, Vague 66 iOS `cameraSwitchTask`),
même session. Reprise directe de la spec laissée « prête » par la Vague 65 : `VoiceCoderProcessor` (auto-tune)
laisse tourner sa boucle `requestAnimationFrame` de détection de pitch (analyse FFT par frame) après que
l'utilisateur a désactivé l'effet — coût CPU/batterie continu sans bénéfice audible pour le reste de l'appel.

- **Root cause confirmée par lecture directe** : `disconnect()` ne coupait QUE `outputNode.disconnect()`,
  jamais `stopPitchDetection()` (réservé à `destroy()`, appelé seulement au démontage du hook/fin d'appel).
  Mais le vrai piège n'était pas seulement cet oubli : `rebuildAudioGraph()` (`hooks/use-audio-effects.ts`)
  appelle `processor.disconnect()` sur **tous** les processors à **chaque** changement de `effectsState` —
  y compris quand un effet complètement différent est togglé — puis ne reconnecte que les processors des
  effets encore activés via un câblage **manuel** des nœuds Tone internes (`currentNode.connect(processor.inputNode)`),
  qui **contourne** la méthode `processor.connect()` de l'interface `AudioEffectProcessor`. Confirmé par grep
  exhaustif : `processor.connect(` n'est appelé **nulle part** dans le hook. Conséquence : un simple
  `disconnect()`→`stopPitchDetection()` n'aurait fait qu'introduire une régression pire — un `VoiceCoderProcessor`
  réactivé après avoir été désactivé une fois resterait figé (`pitchShift.pitch` bloqué à sa dernière valeur),
  puisqu'aucun signal de reconnexion n'existe dans ce chemin pour relancer la détection.
- **Fix** : nouvelle méthode `setActive(active: boolean)` sur `VoiceCoderProcessor` — source de vérité
  explicite indépendante du câblage du graphe, gardée par `animationFrame === null`/`!== null` pour être
  idempotente (un double `setActive(false)` ou double `setActive(true)` ne relance jamais une seconde chaîne
  rAF concurrente). `rebuildAudioGraph()` l'appelle désormais sur **chaque** processor après le calcul de
  `enabledEffects`, avec l'état d'activation réel de CET effet précis (pas un simple écho du `disconnect()`
  global) — cast `as AudioEffectProcessor & { setActive?: ... }` avec appel optionnel, même patron déjà
  utilisé dans ce hook pour les méthodes spécifiques à `BackSoundProcessor` (`loadSound`/`play`/`stop`),
  donc aucun changement à l'interface partagée `AudioEffectProcessor` ni aux 3 autres classes de processor.
  `disconnect()` appelle aussi `stopPitchDetection()` en plus de `outputNode.disconnect()` : invariant
  défensif (« disconnect ne laisse jamais de travail de fond en suspens »), sans incidence sur la correction
  ci-dessus puisque `setActive(true)` — appelé juste après dans le même rebuild pour un effet resté activé —
  relance immédiatement une détection fraîche (`animationFrame === null` après le stop).
- **Tests** (TDD, RED confirmé avant fix — `git stash` du seul code source, tests laissés en place — 5 échecs
  observés : 3 `processor.setActive is not a function`, 1 assertion `disconnect()` insatisfaite, GREEN après
  `git stash pop`) : nouveau describe `VoiceCoderProcessor.setActive` dans `audio-effects.test.ts` (7 tests) —
  démarrage à la construction, arrêt sur `setActive(false)`, idempotence des deux sens, reprise sur
  `setActive(true)`, et `disconnect()` qui coupe aussi la boucle. Nécessitait un mock `AnalyserNode`/
  `AudioContext` que ce sandbox n'avait jamais eu (constructeur de `VoiceCoderProcessor` crée
  `Tone.context.rawContext.createAnalyser()` avant même le routing) — étendu `__mocks__/tone.js`
  (`context.rawContext.createAnalyser`, `context.sampleRate`, `Chorus`, `CrossFade`, `disconnect` sur
  `Gain`/`PitchShift`, même patron self-référençant que le mock `Player` de la Vague 65) et `__mocks__/pitchy.js`
  (`PitchDetector.forFloat32Array`, absent du mock alors que le code de production l'appelle — sans cet ajout
  `VoiceCoderProcessor` n'était tout simplement pas instanciable en test, ce qui explique l'absence totale de
  couverture sur cette classe jusqu'ici).
- **Vérification** : suite `utils/` complète (52 suites / 1281 tests) verte après `packages/shared && bun run build`
  (requis pour `__tests__/utils/user-language-preferences.test.ts`, sans rapport avec ce diff — non buildé au
  démarrage de cette session). `tsc --noEmit` : 0 nouvelle erreur sur les 5 fichiers touchés (la seule erreur
  préexistante du repo, `components/video-calls/audio-effects/hooks/useAudioEffects.ts:41`, est un fichier
  distinct jamais touché par ce diff). `next lint`/`eslint` cassent dans ce sandbox avec l'erreur de config
  circulaire déjà documentée en Vague 65 — non bloquant, limitation d'environnement connue.
- **Reste ouvert** : `useVideoFilters.ts` dead code (candidat nettoyage, Vague 65) ; dead code / god-object
  `CallManager.swift` (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
  `reportNewIncomingCall` failure handler UI-only (Vague 63/64) ; `rebuildAudioGraph()` refait le câblage
  complet de TOUS les processors à chaque changement d'état de N'IMPORTE QUEL effet — fonctionnellement
  correct (chaque `disconnect()`+reconstruction est idempotent) mais coûte un aller-retour stop/redémarrage
  de la détection de pitch à chaque toggle d'un effet non lié pendant que voice-coder reste actif ; pas un bug,
  candidat d'optimisation mineure pour une vague dédiée si mesuré comme significatif en pratique.

## Vague 68 — exécution de la spec `useVideoFilters.ts` : retrait du dead code confirmé (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling). Reprise du candidat
laissé ouvert par la Vague 65 (« `useVideoFilters.ts` dead code, candidat nettoyage »), reconduit sans
action à travers les Vagues 66/67. Vérification exhaustive avant retrait plutôt que confiance dans
l'étiquette du cycle précédent — même discipline que les cycles gateway 14-16 (« une énumération se
revérifie, elle ne se recopie pas »).

- **Vérification** : `grep -rn "useVideoFilters\|VideoFilterConfig\|FILTER_PRESETS"` sur tout le repo
  (hors `node_modules`) ne renvoie **aucune** occurrence en dehors du fichier lui-même — ni import, ni
  test, ni mention dans `components/video-calls/index.ts` (barrel public) ou dans les README/ARCHITECTURE
  du dossier. Pipeline WebGL complet (temperature/brightness/contrast/saturation/exposure, shaders
  vertex/fragment, `processStream`/`renderFrame`/`startProcessing`/`stopProcessing`) sans un seul
  appelant en production — même forme que `useWebRTC.ts` retiré en Vague 33 (voir garde-test barrel
  ci-dessous), à la différence que `useVideoFilters` n'a jamais été exporté du tout, même pas comme
  footgun accessible via le barrel.
- **Fix** : suppression de `apps/web/components/video-calls/hooks/useVideoFilters.ts` (262 lignes) et du
  dossier `hooks/` devenu vide (ne contenait plus que ce fichier depuis le retrait de `useWebRTC.ts` en
  Vague 33).
- **Tests** : extension de la garde-barrel existante `__tests__/components/video-calls/index.test.ts`
  (celle qui verrouille déjà l'absence de `useWebRTC.ts`) avec le même patron — 2 nouveaux tests :
  le barrel n'exporte pas `useVideoFilters`, le fichier n'existe plus sur disque. Choix délibéré de
  réutiliser le fichier de garde existant plutôt que d'en créer un nouveau : un seul emplacement où
  vérifier « qu'est-ce que ce barrel a refusé d'exporter, et pourquoi » plutôt que la dispersion que la
  duplication aurait produite.
- **Vérification de non-régression** : suite `__tests__/components/video-calls/` + `components/video-calls/`
  complète (10 suites / 55 tests, incluant les 4 de la garde-barrel étendue) verte. `packages/shared &&
  bun run build` (prérequis CLAUDE.md) sans erreur. `tsc --noEmit` sur `apps/web` : aucune nouvelle erreur
  imputable à ce diff (le fichier supprimé n'apparaissait dans AUCUNE des ~1600 lignes d'erreurs
  pré-existantes de ce sandbox avant le retrait, confirmant qu'il n'était référencé nulle part y compris
  par le compilateur). `next lint`/`eslint` : erreur de config circulaire pré-existante de ce sandbox,
  non liée à ce diff (déjà documentée Vagues 65/67).
- **Reste ouvert** : dead code / god-object `CallManager.swift` (~5770 lignes) ; ADR `actor CallEventQueue`
  non implémenté ; busy-path `reportNewIncomingCall` failure handler UI-only (Vague 63/64) ;
  `rebuildAudioGraph()` re-câblage complet à chaque toggle d'effet (optimisation mineure, Vague 67) ;
  items iOS bloqués sur l'absence de toolchain Swift dans ce sandbox (sérialisation `switchCamera` déjà
  fermée en Vague 66, reste le god-object et l'ADR `CallEventQueue`).

## Vague 69 — `VoiceCoderProcessor.disconnect()` ne coupe plus la détection de pitch : fin du churn stop/redémarrage à chaque toggle d'effet non lié (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling). Reprise du candidat
d'optimisation mineure laissé ouvert par la Vague 67/68 (« `rebuildAudioGraph()` re-câblage complet à
chaque toggle d'effet ... coûte un aller-retour stop/redémarrage de la détection de pitch à chaque toggle
d'un effet non lié pendant que voice-coder reste actif »), mesuré cette vague plutôt que reporté une
troisième fois.

- **Root cause confirmée par lecture directe** : `rebuildAudioGraph()` (`hooks/use-audio-effects.ts`)
  exécute, sur **chaque** changement de `effectsState` (n'importe quel effet, pas seulement voice-coder) :
  `processorsRef.current.forEach(p => p.disconnect())` PUIS, dans la même fonction, immédiatement après,
  `processorsRef.current.forEach((p, type) => p.setActive?.(enabledEffects.some(e => e.type === type)))`
  sur **tous** les processors. Depuis la Vague 67, `VoiceCoderProcessor.disconnect()` appelait
  `stopPitchDetection()` en plus de `outputNode.disconnect()` (ajouté comme « invariant défensif »). Séquence
  concrète quand `backSound` est togglé alors que `voiceCoder` reste actif : `disconnect()` de TOUS les
  processors annule la boucle rAF de voice-coder (`cancelAnimationFrame` + `animationFrame = null`) → juste
  après, `setActive(true)` est rappelé pour voice-coder (toujours dans `enabledEffects`) → comme
  `animationFrame === null`, `startPitchDetection()` redémarre une boucle **neuve**. Sur un appel où
  l'utilisateur bascule plusieurs effets (fond sonore, baby/demon voice) pendant que l'auto-tune reste actif,
  chaque toggle non lié annule et reprogramme la chaîne rAF de détection de pitch, avec une frame de
  correction perdue à chaque fois — exactement le churn que l'« invariant défensif » de la Vague 67 était
  censé prévenir dans l'autre sens (fuite) mais réintroduisait dans celui-ci (churn).
- **Fix** : `disconnect()` ne fait plus que `this.outputNode.disconnect()` — pur détachement du graphe audio,
  aucun effet de bord sur le travail de fond. `setActive()` reste l'unique autorité sur le
  démarrage/arrêt de la boucle (déjà idempotent depuis la Vague 67 via la garde `animationFrame === null`),
  et `rebuildAudioGraph()` l'appelle systématiquement pour tous les processors juste après le
  `disconnect()` global — donc `setActive(true)` sur un processor resté actif redevient un no-op réel (plus
  de redémarrage), tandis que `setActive(false)` continue de tout arrêter correctement quand l'effet est
  réellement désactivé. `destroy()` n'est pas affecté : il appelle déjà `stopPitchDetection()` explicitement
  AVANT `disconnect()`, donc son comportement d'arrêt définitif à la destruction du hook est inchangé.
  Seul appelant de `processor.disconnect()` dans tout le repo (vérifié par grep — `AudioEffectProcessor`
  n'est référencé nulle part hors de `use-audio-effects.ts`/`audio-effects.ts`) : `rebuildAudioGraph()`,
  toujours suivi du `setActive()` de tous les processors dans le même appel — aucun autre chemin ne pouvait
  compter sur l'ancien comportement de `disconnect()` pour arrêter la boucle.
- **Tests** (TDD, RED confirmé avant fix — 2 échecs observés sur les assertions `cafSpy`/`rafSpy` avant le
  retrait de `stopPitchDetection()` de `disconnect()`, GREEN après) : le test existant « disconnect()
  (called on every graph rebuild) also stops the loop » de la Vague 67 est remplacé par son inverse —
  `disconnect()` seul ne stoppe plus la boucle — et deux tests ajoutés : régression bout-en-bout de la
  séquence exacte de `rebuildAudioGraph()` (`disconnect()` puis `setActive(true)` sur un processor resté
  actif ⇒ ni `cancelAnimationFrame` ni un second `requestAnimationFrame` ne sont appelés, la boucle continue
  sans interruption) et confirmation explicite que `destroy()` arrête toujours la boucle (`stopPitchDetection()`
  appelé avant `disconnect()`, comportement inchangé).
- **Vérification de non-régression** : suite `utils/__tests__/audio-effects.test.ts` (17 tests, 2 nouveaux
  + 1 inversé) verte. Suite calling-stack complète (`--testPathPatterns="use-audio-effects|video-calls|call"`,
  41 suites / 369 tests) verte — aucune régression sur `CallManager`, `VideoCallInterface`,
  `use-call-quality`, `AudioEffectsPanel`, etc. `packages/shared && bun run build` (prérequis CLAUDE.md)
  sans erreur. `tsc --noEmit` sur `apps/web` : 0 nouvelle erreur imputable à ce diff — la seule erreur
  touchant un fichier `audio-effects` dans la sortie complète (`components/video-calls/audio-effects/hooks/useAudioEffects.ts:41`)
  est le fichier distinct pré-existant déjà documenté en Vague 67/68, non touché par ce diff.
  `next lint`/`eslint` : erreur de config circulaire pré-existante de ce sandbox, non liée à ce diff
  (déjà documentée Vagues 65/67/68).
- **Reste ouvert** : dead code / god-object `CallManager.swift` (~5770 lignes) ; ADR `actor CallEventQueue`
  non implémenté ; busy-path `reportNewIncomingCall` failure handler UI-only (Vague 63/64) ; items iOS
  bloqués sur l'absence de toolchain Swift dans ce sandbox.

## Vague 70 — premier audit du calling Android : 6 trouvailles, AUCUNE corrigée (ni Gradle local, ni CI Android n'existent) (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling). Web/iOS étant audités
en continu depuis les Vagues 25-68 sans terrain neuf évident cette session, premier passage de cette
routine sur `apps/android/**` (`feature/calls`, `sdk-core/call`, `sdk-core/socket/CallSignalManager`).
Contexte : `apps/android/tasks/webrtc-calls-plan.md` documente un moteur WebRTC construit en phases
P1-P4 (signaling, `WebRtcEngine`, coordinateur, vidéo), P5 (test réel 2-appareils) jamais exécutable en
sandbox. Audit dédié (agent Explore, lecture seule) mandaté sur les mêmes catégories que ce que cette
routine traque côté iOS/web : races, thread-safety, fuites mémoire/ressources, glare, parité des
transitions d'état (cf. Leçon 84), dead code.

- **Tentative Gradle** : `./gradlew :feature:calls:testDebugUnitTest` échoue à la résolution du plugin
  `com.android.application:8.7.3` — `dl.google.com` renvoie 403 sur le CONNECT à travers le proxy de ce
  sandbox. Confirmé comme limitation réseau/environnement (pas un problème de code) : `java 21` et
  `gradle`/`gradlew` sont fonctionnels, seule la résolution de dépendances Google Maven est bloquée.
  **Aucun workflow `.github/workflows/*.yml` ne construit ou ne teste `apps/android` non plus** (seule
  mention "android" du dossier `.github/workflows/` est un flag de nettoyage disque sans rapport dans
  `docker.yml`) — un futur fix Android ne serait donc vérifié NI par ce sandbox NI par la CI de ce repo.
  Conséquence directe : **aucune des 6 trouvailles ci-dessous n'a été corrigée cette vague**, exactement
  la même discipline que les items iOS bloqués sans toolchain Swift (Vagues 61-64) — un correctif non
  vérifiable par compilateur/tests sur du code déjà en production est un risque de régression silencieuse
  supérieur à sa valeur. Spec de fix prête pour une vague future avec accès Android Studio/CI Android.

1. **[ÉLEVÉ, confirmé par lecture directe]** `CallScreen.withMediaPermissions()`
   (`apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt:103-110`) ne teste QUE
   `RECORD_AUDIO` avant de lancer `action()` directement (sans passer par le launcher de permission), alors
   que `requiredPermissions` inclut `CAMERA` pour un appel vidéo (`CallPermissions.required(isVideo)`).
   Un utilisateur qui a déjà accordé le micro (typiquement après un premier appel audio) et démarre
   ENSUITE un appel vidéo ne voit jamais la demande caméra : `action()` s'exécute immédiatement →
   `WebRtcEngine.addLocalVideo()` → `capturer.startCapture()` lève un `SecurityException` non rattrapé
   nulle part sur la chaîne (`viewModelScope` n'a pas de `CoroutineExceptionHandler`) → **crash** en plein
   démarrage d'appel. Fix : gate sur `requiredPermissions.all { hasSelfPermission(context, it) }`, pas sur
   `RECORD_AUDIO` seul — diff d'une ligne, mais untestable dans ce sandbox (Compose UI, pas de JVM unit
   test existant sur ce fichier).
2. **[ÉLEVÉ, confirmé par lecture directe]** `WebRtcEngine.addLocalVideo()`
   (`apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt:99-111`) n'assigne
   `videoCapturer`/`videoSource`/`surfaceTextureHelper` qu'APRÈS `capturer.startCapture(...)`, qui peut
   lever (le `SecurityException` de #1, mais aussi caméra déjà occupée, échec HAL). Si ça lève, les
   variables locales `capturer`/`helper`/`source` ne sont jamais stockées dans les champs de l'instance ;
   `close()` ne dispose que les champs → `SurfaceTextureHelper` (thread dédié + surface EGL) et le
   capturer/la source restent orphelins. `WebRtcEngine` étant `@Singleton`, la fuite (thread + éventuel
   verrou caméra partiel) survit à tout l'appel raté et peut faire échouer la TENTATIVE SUIVANTE (caméra
   occupée) même après que la permission a été accordée. Fix : assigner les champs immédiatement après
   chaque allocation, avant les appels qui peuvent lever.
3. **[MOYEN-ÉLEVÉ, confirmé par lecture directe]** `WebRtcCallCoordinator.observe()`
   (`apps/android/feature/calls/.../WebRtcCallCoordinator.kt:155-158`) — le collecteur
   `incomingSignals.onEach { onRemoteSignal(it) }.launchIn(scope)` n'a AUCUNE frontière d'exception ; la
   branche `"answer"` (lignes ~254-279) appelle `engine.setRemoteDescription(...)` sans comparer
   `signal.negotiationId` au `negotiationId` courant du coordinateur (vérifié seulement côté `"offer"`).
   `applyDescription()` rejette (`resumeWithException`) sur tout `onSetFailure` natif. Un `Flow.onEach` qui
   lève termine DÉFINITIVEMENT le `launchIn(scope)` — plus aucun signal entrant n'est traité pour le reste
   de l'appel, sans diagnostic visible. Scénario concret : deux `restartIceAndRenegotiate()` rapprochés sur
   un lien instable (chacun bump `negotiationId` et ré-offre) → une réponse en retard du PREMIER restart
   arrive après que le côté local a déjà avancé sa description locale vers le SECOND → collision d'état de
   signalisation côté natif → exception → silence radio pour le reste de l'appel, précisément sur la
   condition de lien instable que le restart ICE existe pour surmonter. Fix (deux volets indépendants) :
   try/catch autour de `onRemoteSignal` (logguer + jeter la frame, ne jamais tuer le collecteur) + valider
   `signal.negotiationId == negotiationId` avant d'appliquer une `"answer"`, même garde que celle qui existe
   déjà pour `restartIceAndRenegotiate()` côté `isCaller`.
4. **[MOYEN, confirmé par lecture directe]** `CallViewModel.onCleared()`
   (`CallViewModel.kt:640-643`) ne fait QUE `toneController.release()` +
   `telecomReporter.release()` — jamais `coordinator.end()`. `CallViewModel` est volontairement scopé à
   l'Activity (documenté dans `MeeshyApp.kt`, pour survivre à la minimisation) : `onCleared()` ne se
   déclenche donc PAS sur simple changement de config, mais s'exécute bien sur une recréation d'Activity
   sans préservation d'état (mémoire faible, option développeur « Ne pas conserver les activités » pendant
   un appel en arrière-plan). Dans ce cas le `WebRtcEngine` singleton garde `PeerConnection`, capture
   caméra et `AudioManager.mode = MODE_IN_COMMUNICATION` ouverts, et le gateway n'apprend jamais `call:end`
   — appel zombie côté device ET serveur jusqu'à l'appel suivant (auto-guérison via
   `createConnection()`→`close()`) ou la mort du process. Fix : appeler `coordinator.end()` depuis
   `onCleared()` si `callState.isActive`, miroir du teardown déjà fait dans `hangUp()`/`decline()`.
5. **[MOYEN, confirmé par lecture directe]** `WebRtcEngine.close()` (`WebRtcEngine.kt:182-183`) appelle
   `videoCapturer?.stopCapture()` de façon SYNCHRONE — documenté upstream comme bloquant jusqu'à l'arrêt
   réel du thread de capture caméra (peut prendre plusieurs centaines de ms selon l'OEM). `close()` est
   invoqué directement depuis `hangUp()`/`decline()`, câblés sur des `onClick` Compose — donc sur le thread
   UI. Chaque raccroché d'un appel vidéo bloque potentiellement le thread principal. Fix : déporter
   `engine.close()` (au moins la partie capture vidéo) sur `Dispatchers.Default`/IO.
6. **[FAIBLE]** Dead code : `CallSignalManager.emitJoin`/`emitLeave` (`CallSignalManager.kt:221,224`) —
   zéro site d'appel production, superseded par `emitJoinAwaitingAck` (le commentaire de `accept()` le dit
   explicitement) — même famille que la Leçon 63 (« FIXED » documenté mais l'ancien code jamais retiré).
   `participantLeft` (lignes 111-112) est émis mais n'a AUCUN collecteur dans `CallViewModel.init{}` — le
   commentaire de doc sur ce champ décrit un comportement (« le consumer élague les médias du partant »)
   qui n'existe pas dans ce code — probablement sans impact tant que l'app reste 1:1, mais le commentaire
   sur-affirme.

- **Vérifié propre (rien trouvé)** : hygiène des `Job` de tickers/watchdogs/budget (tous `?.cancel()`
  avant réassignation) ; glare à la négociation initiale (seul le caller offre, restart ICE gated
  `isCaller`) ; `CallStateMachine` (réducteur total, chaque phase a un `terminal(event)`, aucune asymétrie
  façon Leçon 84 trouvée) ; `CallHistoryViewModel`/`CallToneController`/`TelecomCallReporter`/
  `ScreenRecordingDetector`/`CallQualitySampler` (les deux derniers sont des stubs interimaires
  explicitement documentés comme tels, pas du dead code) ; `WebRtcEngine.createConnection()` ferme
  toujours l'ancienne connexion avant d'en ouvrir une nouvelle (pas de double-allocation possible).
- **Reste ouvert** : les 6 trouvailles ci-dessus (spec prête, aucune corrigée — Android n'a ni toolchain
  sandbox fonctionnel ni CI dans ce repo) ; dead code / god-object `CallManager.swift` iOS (~5770 lignes) ;
  ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ;
  `rebuildAudioGraph()` re-câblage complet à chaque toggle (Vague 67, corrigé ci-dessous, Vague 71).

## Vague 71 — exécution de la spec `rebuildAudioGraph()` : lifecycle des processors sauté quand leur bit `enabled` ne bouge pas (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), même session que la
Vague 70. Reprise directe de l'optimisation laissée « mineure, candidate » depuis la Vague 67 :
`rebuildAudioGraph()` (`apps/web/hooks/use-audio-effects.ts`) rewire l'intégralité du graphe Web Audio à
CHAQUE changement de `effectsState` — y compris un toggle sur un effet totalement différent, ou même un
simple changement de paramètre (`updateEffectParams` produit aussi une nouvelle référence `effectsState`,
qui redéclenche le même `useEffect`).

**Collision de cycle détectée pendant le rebase** : une session concurrente de cette routine avait ouvert
plus tôt le même jour la PR #2638 (branche `claude/upbeat-dirac-jfgote`, sa propre « Vague 69 » ci-dessus)
qui ferme déjà la moitié « VoiceCoderProcessor » de ce même symptôme — son `disconnect()` ne coupe plus
`stopPitchDetection()`, laissant `setActive()` seule autorité sur la boucle de détection de pitch — mais
était restée non mergée. Repérée via `list_pull_requests` en tout début de cycle, mergée (squash, `e2d574af`)
avant de pousser ce fix-ci, conformément à la règle de la routine de toujours finir le développement
précédent avant d'en commencer un nouveau — et le root cause ci-dessous est écrit contre l'état du code
APRÈS ce merge, pas contre l'état constaté au moment où ce fix a été commencé.

- **Root cause confirmée (après le merge de la Vague 69)** : la boucle appelait `processor.disconnect()`
  (méthode de cycle de vie complet) et `processor.setActive?.(...)` sur TOUS les processors à chaque
  rebuild, sans jamais comparer l'état `enabled` du processor à sa valeur précédente. La Vague 69 a déjà
  fermé l'instance la plus visible de ce symptôme (`VoiceCoderProcessor`, pitch-detection) en retirant
  l'effet de bord de SON `disconnect()`. Le même `disconnect()` générique appelle cependant TOUJOURS
  `.stop()` sur `BackSoundProcessor` (`utils/audio-effects.ts:612-615`, non touché par la Vague 69) — un
  toggle non lié coupe donc encore la musique de fond en cours de lecture à chaque rebuild tant que ce
  fix-ci ne retire pas l'appel `disconnect()` complet lui-même pour les processors inchangés.
- **Fix** : nouveau `previouslyEnabledTypesRef: Set<AudioEffectType>` trackant les types activés au rebuild
  précédent. Pour chaque processor existant : si son propre bit `enabled` n'a pas changé
  (`wasEnabled === isEnabled`), on ne fait qu'un `processor.outputNode.disconnect()` brut (coupe seulement
  l'arête sortante du graphe, sans effet de bord) pour permettre son re-câblage à sa nouvelle position dans
  la chaîne — le `processor.disconnect()`/`setActive()` complet n'est PAS appelé. Seuls les processors dont
  le bit a réellement basculé passent par le cycle de vie complet, préservant l'invariant de la Vague 67
  (désactiver un processor le fait TOUJOURS taire complètement) et fermant, cette fois côté APPELANT et
  pour TOUS les processors d'un coup plutôt que processor-par-processor, la même classe de bug que la
  Vague 69 avait fermée spécifiquement pour VoiceCoder côté callee.
  **Piège écarté** : la topologie du graphe (position dans la chaîne input→effet A→effet B→destination)
  PEUT changer pour un processor dont le bit `enabled` n'a pas bougé, si un voisin bascule — donc les
  arêtes du graphe sont TOUJOURS reconstruites (`outputNode.disconnect()` + reconnection dans la boucle qui
  suit), seul le cycle de vie/travail de fond du processor est conditionné au changement de SON bit.
- **Bug adjacent trouvé, volontairement non corrigé cette vague** : `previouslyEnabledTypesRef` a été
  audité contre le cycle de vie de `processorsRef` (reset attendu quand `inputStream` change) — l'audit a
  révélé que remplacer la référence `inputStream` du hook ne réinitialise en réalité JAMAIS le pipeline :
  `initializeAudioPipeline()` lit une fermeture `isInitialized` périmée dans le MÊME effet de
  cleanup/re-setup, donc le `setIsInitialized(false)` programmé ne déclenche jamais de chemin de réinit
  fonctionnel. Bug réel (un swap de source micro/caméra en cours d'appel perdrait silencieusement le
  pipeline d'effets) mais orthogonal à cette vague — reproduit par un test jetable (retiré du diff final),
  noté en reste ouvert plutôt que mélangé à ce fix.
- **Tests** (TDD, RED confirmé avant fix — 3/5 échouaient sur les comptages d'appels du code courant) :
  nouveau fichier `apps/web/hooks/__tests__/use-audio-effects.test.ts` (5 tests) — pas de re-`disconnect()`/
  `setActive()` sur un toggle non lié, pas de re-`setActive()` sur un changement de params seul, les arêtes
  du graphe sont bien reconstruites même pour un processor inchangé, quiescence complète au passage
  enabled→disabled, activation complète au passage disabled→enabled. Docstring de test et commentaire
  source réécrits après le merge de la Vague 69 pour ne plus citer VoiceCoderProcessor comme exemple de
  processor à effet de bord (devenu inexact) — l'exemple concret restant est `BackSoundProcessor`.
- **Vérification** : suite `utils/__tests__/audio-effects.test.ts` + `components/video-calls/**` complète
  (12 suites / 73 tests) verte, suite `utils/`+`hooks/` complète (167 suites / 3498 tests) verte (2 skips
  pré-existants sans rapport) — **re-exécutée après le merge de la Vague 69** pour confirmer l'absence de
  régression croisée entre les deux fixes. `packages/shared && npx prisma generate && bun run build`
  (prérequis CLAUDE.md) sans erreur. `npx tsc --noEmit` sur `apps/web` : 0 nouvelle erreur imputable à
  `use-audio-effects.ts`.
- **Reste ouvert** : le bug de non-réinitialisation sur swap de `inputStream` ci-dessus (spec à écrire pour
  une vague dédiée) ; dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable).

## Vague 72 — `VideoStream` latchait l'overlay « Disconnected » : plus jamais d'écran figé après un rejoin same-session (2026-08-08)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Reprise via audit dédié (subagent) du périmètre web/gateway uniquement — aucune toolchain Swift/Gradle
disponible dans ce sandbox, items iOS/Android restent hors d'atteinte (cf. Vagues 64-71 ci-dessus). Vérifié
en tête de cycle qu'aucune session concurrente n'avait déjà touché `VideoStream.tsx` (fichier absent de
toutes les Vagues précédentes, `git log` propre).

- **Root cause confirmée par lecture directe** : `VideoCallInterface.tsx` (handler `handleParticipantLeft`,
  ~L497-568) préserve délibérément l'instance `VideoStream` d'un pair à travers un rejoin same-session
  (coupure réseau, reload d'onglet) survenant dans la fenêtre de grâce de 2 s — commentaire explicite en
  tête d'effet : le `peerConnection` capturé au moment du leave (`connectionAtLeave`) est comparé à celui du
  store au moment du cleanup différé ; s'il a changé (nouvelle connexion déjà enregistrée sous le même
  `participantId`), la prop `isDisconnected` de `VideoStream` retombe à `false` **sur la même instance**
  (clé stable = `participantId`, jamais démontée). Mais `VideoStream.tsx` (`showDisconnected`, state local)
  ne faisait QUE passer à `true` sur `isDisconnected → true` — jamais réinitialisé à `false` dans le sens
  inverse. Résultat : après n'importe quelle coupure transitoire suivie d'un rejoin dans la fenêtre de 2 s,
  la vidéo du pair restait masquée derrière l'overlay « Disconnected » (`hidden` sur `<video>`, overlay
  rouge pulsant affiché) pour le reste de l'appel, alors même que la connexion était pleinement rétablie —
  défaisant silencieusement la logique de préservation soigneusement construite côté parent.
  `VideoStream.tsx` n'avait AUCUNE couverture de test avant ce fix (aucun `VideoStream.test.tsx` dans le
  repo), ce qui explique qu'il ait échappé à ~69 vagues d'audit précédentes, concentrées sur les couches
  gateway/store.
- **Fix** : l'effet de gestion de déconnexion (`useEffect([isDisconnected, onRemove])`) réinitialise
  désormais `showDisconnected` à `false` dans la branche `else` (⇒ `isDisconnected === false`) au lieu de ne
  rien faire. Le cleanup de l'effet (déjà présent, exécuté à chaque re-render avant la nouvelle branche)
  annule déjà le `setTimeout` d'`onRemove` en attente — aucun changement nécessaire de ce côté, le rejoin
  dans la fenêtre de grâce annule donc aussi la suppression programmée sans code additionnel.
- **Tests** (TDD, RED confirmé avant fix — 2/5 échouaient : overlay encore affiché après retour à
  `isDisconnected=false`, `<video>` encore `hidden`) : nouveau fichier
  `apps/web/__tests__/components/video-calls/VideoStream.test.tsx` (5 tests) — overlay affiché pendant la
  déconnexion, overlay disparaît au retour à `false`, `<video>` redevient visible au retour à `false`,
  `onRemove` programmé annulé par un rejoin dans la fenêtre de 2 s, `onRemove` toujours déclenché après 2 s
  si le pair reste parti. Mock `useI18n` (`t` = identité), même patron que
  `DraggableParticipantOverlay.test.tsx`/`LocalVideoTile.test.tsx`.
- **Vérification** : suite `video-calls|video-call|use-webrtc|use-call` complète (36 suites / 296 tests)
  verte. `packages/shared && npx prisma generate --generator client && bun run build` (prérequis CLAUDE.md,
  sandbox sans `node_modules` au démarrage — `bun install --ignore-scripts` requis, `grpc-tools` échoue son
  postinstall binaire réseau mais n'est pas un prérequis des tests gateway/web touchés). `npx tsc --noEmit`
  sur `apps/web` : 0 nouvelle erreur imputable au diff (1187 erreurs pré-existantes du sandbox, aucune sur
  `VideoStream.tsx` ni son test). `eslint` : erreur de config circulaire pré-existante du sandbox, déjà
  documentée Vagues 65/67/68/69 — non bloquant, limitation d'environnement connue.
- **Livré** : PR #2644 (`claude/upbeat-dirac-1ulg4y`), mergée sur `main` (`c9c824ab`) après CI verte
  (Security + Quality bun), sans conflit avec les Vagues 70/71 mergées en parallèle le même jour (fichiers
  disjoints : `VideoStream.tsx` vs `use-audio-effects.ts`/Android).
- **Reste ouvert** (reconduit) : le bug de non-réinitialisation sur swap de `inputStream` (Vague 71) ; dead
  code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 (spec
  prête, non corrigées faute de toolchain vérifiable). Aucune nouvelle piste web/gateway identifiée cette
  vague au-delà du fix livré — l'audit dédié (grep exhaustif + lecture directe de
  `CallEventsHandler.ts`/`CallService.ts`/`CallCleanupService.ts`/`callHistory.ts`/
  `callAnalyticsAggregate.ts`/`call-push-mirroring.ts`/`callEndedFanout.ts`/`call-session-response.ts`/
  `call-schemas.ts`/`routes/calls.ts` + hooks/composants web moins fréquemment cités) n'a rien trouvé
  d'autre à ce niveau de maturité.

## Vague 73 — `use-audio-effects`: le pipeline audio ne se réinitialise jamais sur un swap d'`inputStream` (2026-08-08)

Point d'entrée : reprise directe du bug laissé « reste ouvert » à la Vague 71 ci-dessus (corrigé en parallèle, indépendamment, par une session concurrente ; les deux PRs touchaient `tasks/calls-fonctionnel-todo.md` au même point d'ancrage — renumérotée Vague 73 au merge pour garder la séquence continue, aucun changement de fond). Backlog Android
(Vague 70) et iOS (`CallManager.swift`, `actor CallEventQueue`) toujours bloqués faute de toolchain
vérifiable dans ce sandbox — reconfirmé cette vague (`./gradlew :feature:calls:help` échoue toujours à
résoudre `com.android.application:8.7.3` via `dl.google.com`, aucun `xcodebuild`/`swift` disponible) — donc
nouvelle cible : le bug web déjà diagnostiqué.

- **Root cause confirmée par lecture directe** : l'effet de montage (`use-audio-effects.ts:266-284`, deps
  `[inputStream]`) gère à la fois le teardown de l'ancien pipeline (cleanup) ET l'initialisation du nouveau
  (corps de l'effet) à chaque changement d'`inputStream`. Son cleanup appelait `setIsInitialized(false)` —
  une mise à jour d'état React, donc asynchrone/différée à un futur rendu — puis, dans le MÊME flush
  d'effets, le corps du MÊME effet (nouvelle instance) s'exécutait immédiatement après en lisant la
  variable d'état `isInitialized` capturée par la closure du dernier rendu COMPLET, c'est-à-dire encore
  `true` (la mise à jour du cleanup n'a pas encore été commitée). La garde `if (inputStream &&
  !isInitialized)` échouait donc systématiquement juste après un swap de stream, et `initializeAudioPipeline`
  elle-même regardait la même closure périmée (`isInitialized` dans ses deps `useCallback`) — double
  verrou stale. Résultat : `inputNodeRef`/`mediaStreamDestinationRef` sont bien nettoyés et remis à `null`,
  mais plus jamais reconstruits pour le nouveau stream — un swap de source micro/caméra en cours d'appel
  routait silencieusement vers un pipeline audio mort pour le reste de l'appel (aucun crash, aucun log
  d'erreur — juste plus aucun effet audio appliqué au flux réellement envoyé).
- **Fix** : nouveau `isInitializedRef` (ref, mutation synchrone) tenu en miroir de l'état `isInitialized`
  (qui reste nécessaire pour les autres effets qui doivent re-render sur ce changement, ex. lignes 284/293).
  Le cleanup met `isInitializedRef.current = false` de façon synchrone AVANT que le corps de l'effet suivant
  ne s'exécute dans le même flush ; `initializeAudioPipeline` et la garde de montage lisent désormais cette
  ref plutôt que l'état. Bug adjacent corrigé dans la même passe : `previouslyEnabledTypesRef` (tracking
  Vague 71) n'était jamais réinitialisée sur un swap d'`inputStream` — un effet resté `enabled` à travers le
  swap aurait fait lire `wasEnabled === isEnabled` comme `true` par `rebuildAudioGraph()` pour un processor
  pourtant flambant neuf (recréé après le `processorsRef.current.clear()` du même cleanup), lui faisant
  sauter son cycle de vie complet (`setActive(true)` jamais appelé) — même classe de bug que celui fermé à
  la Vague 71, déclenché par le même swap ; fix : `previouslyEnabledTypesRef.current = new Set()` dans le
  même cleanup.
- **Tests** (TDD, RED confirmé avant fix — l'assertion sur le second appel à `createMediaStreamSource`
  échouait, 1 reçu au lieu de 2) : nouveau fichier
  `apps/web/hooks/__tests__/use-audio-effects-input-stream.test.ts` — rerender du hook avec un second
  `MediaStream`, vérifie que `createMediaStreamSource` est rappelé avec le nouveau stream et que
  `onOutputStreamReady` est notifié une seconde fois.
- **Vérification** : `hooks/__tests__/use-audio-effects*.test.ts` (2 suites / 6 tests) vert ; suite complète
  `hooks/` + `utils/__tests__/audio-effects.test.ts` + `components/video-calls/**` (128 suites / 2295 tests,
  2295 passed + 2 skips pré-existants sans rapport) verte. `packages/shared && npx prisma generate && bun
  run build` (prérequis CLAUDE.md) sans erreur. `npx tsc --noEmit` sur `apps/web` : 0 nouvelle erreur
  imputable à `use-audio-effects.ts`. `eslint` : même échec sandbox-only de config circulaire que documenté
  aux vagues précédentes (indépendant de ce diff).
- **Reste ouvert** : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague).

## Vague 74 — `VideoCallInterface`: le routage audio effets/brut dépendait d'une closure de cleanup périmée, jamais couverte par un test (2026-08-08)

Point d'entrée : après avoir fusionné à la main les deux PRs concurrentes laissées ouvertes par le cycle
précédent (#2647 docs Vague 72, #2648 fix Vague 73 — conflit sur le même point d'ancrage de
`tasks/calls-fonctionnel-todo.md`, résolu en conservant les deux entrées et en renumérotant la seconde),
audit dédié (subagent, lecture directe) du périmètre web/gateway restant. Backlog Android (Vague 70) et iOS
(`CallManager.swift`, `actor CallEventQueue`, `reportNewIncomingCall`) toujours hors d'atteinte faute de
toolchain dans ce sandbox — reconfirmé.

- **Root cause confirmée par lecture directe** : `VideoCallInterface.tsx` (effet de routage audio, alors
  L258-321) réappliquait inconditionnellement `processedAudioStream` à tous les senders à chaque changement
  de `processedAudioStream`/`localStream`/`audioEffectsActive`/`peerConnectionsCount`, puis tentait de
  restaurer la piste brute dans le CLEANUP de ce même effet via `if (!audioEffectsActive && localStream)`.
  Or le cleanup d'un effet React s'exécute avec la closure capturée au rendu qui l'a programmé — donc
  toujours l'ANCIENNE valeur de `audioEffectsActive`, jamais celle qui vient de déclencher le re-render :
  activer un effet (`false→true`) faisait lire `audioEffectsActive=false` au cleanup → restauration
  parasite de la piste brute juste avant que le nouveau corps d'effet ne réapplique la piste traitée (glitch
  audio audible) ; désactiver un effet (`true→false`) faisait lire `audioEffectsActive=true` au cleanup →
  la restauration attendue ne se déclenchait JAMAIS, laissant la piste traitée active indéfiniment après
  désactivation. Un changement non lié de `peerConnectionsCount` (un participant rejoint/quitte un appel de
  groupe) déclenchait le même cleanup périmé et pouvait re-router à tort les pairs déjà connectés. Fichier
  jamais couvert par un test exerçant ces transitions (`VideoCallInterface.test.tsx` existait mais aucun cas
  ne touchait `audioEffectsActive`/`replaceTrack` sur la piste audio), ce qui explique qu'il ait échappé aux
  73 vagues précédentes.
- **Fix** : effet unique sans cleanup — la piste cible (`processedAudioStream` si un effet est actif,
  `localStream` sinon) est calculée directement dans le corps de l'effet, qui voit toujours les valeurs du
  rendu COURANT (jamais périmées). Un garde-fou supplémentaire (`audioSender.track?.id === targetTrack.id`)
  évite un `replaceTrack` redondant quand le sender porte déjà la bonne piste (ex. montage initial, pair déjà
  correctement routé). Élimine toute la classe de bug sans réintroduire de dépendance à l'ordre
  cleanup/setup.
- **Tests** (TDD, RED confirmé avant fix — 3 nouveaux tests échouaient) : nouveau describe
  `VideoCallInterface.test.tsx` → « audio effects track routing » (3 tests) — route via la piste brute
  quand aucun effet n'est actif, bascule brute→traitée à l'activation, restaure traitée→brute à la
  désactivation. Mock `useAudioEffects` rendu contrôlable par test (`useAudioEffectsMock.mockReturnValue`,
  même patron que `useAdaptiveDegradationMock` déjà présent dans ce fichier). Effet de bord découvert en
  cours de RED : deux tests préexistants du bloc `handleSwitchCamera` utilisaient un `localStream` sans
  `getAudioTracks`, qui plantait désormais sur la branche audio du nouvel effet (le code fixé lit
  légitimement `localStream.getAudioTracks()` quand les effets sont inactifs, alors que l'ancien bug ne le
  faisait qu'au cleanup) — fixtures corrigées (`getAudioTracks: () => []`), pas de changement de
  comportement testé.
- **Vérification** : `VideoCallInterface.test.tsx` (19 tests) vert ; suite complète `hooks/` +
  `utils/__tests__/audio-effects.test.ts` + `components/video-calls/**` (128 suites / 2298 tests, 2296
  passed + 2 skips pré-existants sans rapport) verte. `packages/shared && npx prisma generate --generator
  client && bun run build` (prérequis CLAUDE.md, sandbox sans `node_modules` au démarrage — `bun install
  --ignore-scripts` requis) sans erreur. `npx tsc --noEmit` sur `apps/web` : 0 nouvelle erreur imputable au
  diff (les 11 erreurs restantes sur `VideoCallInterface.tsx` sont toutes préexistantes, pattern
  `(socket as unknown).emit(...)` déjà présent ailleurs dans le fichier).
- **Note complémentaire (spec, non corrigée cette vague)** : `apps/web/utils/ringtone.ts` (`playRingPattern`,
  L216-251) programme sa propre ré-invocation via un `setTimeout` récursif jamais stocké/annulé par `stop()`
  — sur deux sessions de sonnerie rapprochées (< 2.3 s, ex. deux appels entrants consécutifs) sur le
  singleton `getRingtone()`, un timeout périmé peut ré-armer un second cycle de sonnerie par-dessus le
  nouveau (glitch audio, pas de crash). Confiance moyenne, cosmétique, candidat pour la prochaine vague.
- **Reste ouvert** : le glitch `ringtone.ts` ci-dessus ; dead code / god-object `CallManager.swift` iOS
  (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only
  (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain
  vérifiable, reconfirmé cette vague).

## Vague 75 — `ringtone.ts` : le cycle de sonnerie se ré-armait tout seul et n'était jamais annulé par `stop()` (2026-08-08)

Point d'entrée : reprise directe de la « note complémentaire » laissée en candidat par la Vague 74
ci-dessus. Audit préalable du reste du périmètre web (`utils/`, `services/socketio/`) pour la même classe de
bug — `ringtone.ts` était le SEUL timer auto-reprogrammé du répertoire ; `orchestrator.service.ts`
(`pendingMessageTimeouts`, `clearPendingTimeout`) et `use-auto-retry-failed-messages.ts` (jeton
`activeRun`) sont déjà durcis par les vagues précédentes, rien à reprendre. Backlog Android (Vague 70) et
iOS (`CallManager.swift`, `actor CallEventQueue`, `reportNewIncomingCall`) toujours hors d'atteinte faute de
toolchain dans ce sandbox — reconfirmé.

- **Root cause confirmée par lecture directe** : `playRingPattern()` (`apps/web/utils/ringtone.ts`, alors
  L216-251) programmait sa propre ré-invocation via `setTimeout(..., 2300)` sans jamais stocker le handle,
  et `stop()` n'annulait que `vibrationInterval` — jamais ce timer-là. Le timer périmé survivait donc à
  `stop()`, et son unique garde était `if (this.isPlaying)`. Or `getRingtone()` est un SINGLETON partagé
  (`CallNotification` fait `getRingtone().play()` au montage et `.stop()` au démontage) : toute séquence
  stop→play à moins de 2,3 s — deux appels entrants consécutifs, un appel refusé immédiatement suivi d'un
  autre, un remontage de `CallNotification` — retrouvait `isPlaying === true` au réveil du timer périmé, qui
  relançait alors une SECONDE boucle de sonnerie par-dessus la nouvelle. Les deux boucles, déphasées,
  sonnaient en parallèle jusqu'au prochain `stop()`, et chaque nouvelle séquence rapprochée en ajoutait une
  de plus (cacophonie cumulative, pas de crash).
- **Second effet, plus insidieux** : le callback fait `this.oscillators = []` avant de récurser. Avec deux
  boucles concurrentes, le reset de l'une jette les références des oscillateurs fraîchement créés par
  l'autre — `stop()` ne pouvait plus ni les `stop()` ni les `disconnect()`. Oscillateurs orphelins,
  déconnectés du graphe seulement à la fermeture du contexte.
- **Fix** : le timer devient un état possédé (`private ringPatternTimeout`), avec un `stopRingPattern()`
  privé symétrique du `stopVibration()` déjà présent. Appelé (a) dans `stop()`, pour qu'aucun timer ne
  survive à une session de sonnerie, et (b) défensivement juste avant chaque re-programmation, pour qu'une
  boucle ne puisse jamais en armer deux. Le callback remet le handle à `null` avant de récurser. Une seule
  boucle peut désormais exister par instance, par construction.
- **Tests** (TDD, RED confirmé avant fix — 2 des 4 nouveaux tests échouaient) : nouveau fichier
  `apps/web/__tests__/utils/ringtone.test.ts` (4 tests) avec un faux `AudioContext` traçant les
  oscillateurs créés — re-sonne un cycle par période tant que ça joue ; ne crée plus rien après `stop()` ;
  **ne sonne qu'un seul cycle quand on redémarre dans la fenêtre de 2,3 s** (RED : 4 oscillateurs au lieu
  de 2 = deux boucles) ; **tout oscillateur programmé après un redémarrage dans la fenêtre reste
  arrêtable** (RED : les orphelins ne recevaient ni `stop()` ni `disconnect()`). Le fichier n'avait aucun
  test avant cette vague, ce qui explique qu'il ait échappé aux 74 précédentes.
- **Vérification** : `__tests__/utils/ringtone.test.ts` (4 tests) vert ; sweep
  `components/video-call/**` + `__tests__/utils/**` + `__tests__/services/socketio/**` + `hooks/__tests__/**`
  (86 suites / 1734 tests) verte. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) :
  `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client && bun run
  build` — sans quoi 1 suite échoue sur `@meeshy/shared/utils/languages` non résolu (échec d'environnement,
  sans rapport avec le diff ; vert une fois `dist/` construit). `npx tsc --noEmit` sur `apps/web` : 0 erreur
  sur `ringtone.ts`.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague). Candidat mineur repéré cette vague, non corrigé : `orchestrator.service.ts`
  `setCurrentUser()` arme un `setInterval` de reprise d'auth (3 tentatives, 200 ms) sans mémoriser le
  handle — deux appels rapprochés à `setCurrentUser()` peuvent armer deux intervalles concurrents et donc
  appeler `initializeConnection()` deux fois. Confiance moyenne, impact faible (la connexion est
  idempotente côté `ensureConnection`), candidat pour la prochaine vague.

## Vague 76 — `VideoCallInterface`: `handleToggleVideo`/`handleSwitchCamera` sans garde de ré-entrance — un double-tap fuit une capture caméra orpheline (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. En
tête de cycle, revue des PR ouvertes de la routine via `list_pull_requests` — la seule trouvée (#2656,
« cancel the recursive ring-pattern timer on stop() ») s'est avérée un doublon exact du fix déjà mergé en
Vague 75 via une PR concurrente (#2655, commit `176cc3ed` — même mécanisme `ringPatternTimeout`/
`stopRingPattern()`, vérifié ligne à ligne contre `main`) ; fermée avec commentaire explicatif plutôt que
mergée, pour éviter un diff no-op en conflit avec l'entrée Vague 75 déjà présente dans ce fichier. Audit
dédié (subagent, lecture directe) du périmètre web/gateway ensuite. Backlog iOS/Android toujours hors
d'atteinte faute de toolchain dans ce sandbox (reconfirmé : `xcodebuild`/`swift` absents, `gradle` présent
mais non testé à nouveau ce cycle).

- **Root cause confirmée par lecture directe** : `VideoCallInterface.tsx` — `handleToggleVideo` (bouton
  micro/caméra manuel) et `handleSwitchCamera` (bascule avant/arrière) sont tous deux des handlers `async`
  wirés directement sur un `onClick` (`CallControls.tsx`, sans `disabled` pendant l'opération) et n'avaient
  **aucune** garde de ré-entrance — contrairement à leur cousin `CallManager.handleAcceptCall`
  (`acceptingCallIdRef`, Vague 33) qui suit exactement ce patron pour la même classe de risque. Le chemin
  `handleToggleVideo → enableVideo() (use-webrtc-p2p.ts) → getUserMedia() + replaceTrack() par pair
  (webrtc-service.ts)` est une fenêtre asynchrone de plusieurs centaines de ms à &gt;1s, sans aucun verrou
  intermédiaire (le garde `makingOffer` de `negotiate()` ne protège que l'étape SDP, pas
  `localStream.addTrack()`/`sender.replaceTrack()` en amont). Deux invocations concurrentes (double-tap,
  plausible sur mobile faute de feedback « busy » visuel — OU le contrôleur `use-adaptive-degradation.ts`
  qui appelle le même `enableVideo()`/`disableVideo()` de façon totalement indépendante et non synchronisée
  dès que la qualité du lien récupère/se dégrade, cf. `VideoCallInterface.tsx` L157-169) acquièrent chacune
  leur propre piste caméra via `getUserMedia()`, toutes deux ajoutées au même `localStream` /
  `replaceTrack()`-ées sur le même transceiver — la dernière à résoudre « gagne ». La piste PERDANTE n'est
  plus référencée par rien capable de l'arrêter : `disableVideoSend()` ne stoppe que `sender.track` (le
  gagnant), donc l'autre reste une capture caméra orpheline vivante pour tout le reste de l'appel (voyant
  caméra allumé sans raison visible, CPU/bande passante gaspillés) — un défaut visible-vie-privée réel
  (« j'ai coupé ma caméra mais le voyant reste allumé »). `handleSwitchCamera` porte exactement le même
  trou : la Vague 58 avait déjà durci son chemin d'erreur (stopper `newStream` si `replaceTrack` échoue,
  `let newStream` local à l'appel) mais cette garde est PAR INVOCATION, donc inopérante contre une seconde
  invocation concurrente qui acquiert sa propre piste sans jamais apprendre l'existence de la première.
- **Fix** : deux nouveaux `useRef(false)` (`videoToggleInFlightRef`, `cameraSwitchInFlightRef`), même
  patron que `acceptingCallIdRef` — vérifié/posé à `true` en tout début de handler (`if (ref.current) return;
  ref.current = true;`), remis à `false` dans un `finally` enveloppant l'intégralité du corps existant (pas
  seulement le bloc `try` interne de `handleToggleVideo`, pour que le garde couvre aussi `setControls`/
  l'émission socket qui suivent l'`await`). Aucune autre ligne de logique métier modifiée — le corps de
  chaque handler reste identique, seul le garde d'entrée/sortie change.
- **Tests** (TDD, RED confirmé avant fix — les 3 nouveaux tests échouaient tous sur `toHaveBeenCalledTimes(1)`
  reçu `2`, doublement prédit par le root cause) : nouveau describe dans
  `VideoCallInterface.test.tsx` → « re-entrancy guards » (3 tests, même style que le describe
  `handleSwitchCamera` déjà présent — promesses contrôlables manuellement pour figer l'état « en vol ») —
  un second clic avant qu'`enableVideo()` ne résolve n'appelle `enableVideo` qu'une fois (et un TROISIÈME
  clic après résolution est bien traité comme un nouveau toggle légitime, prouvant que le garde se relâche) ;
  même chose pour `disableVideo()` ; un second clic sur « switch camera » avant que `getUserMedia()` ne
  résolve n'appelle `getUserMedia` qu'une fois.
- **Vérification** : `VideoCallInterface.test.tsx` (22 tests) vert ; sweep
  `video-call|use-webrtc|use-call|use-adaptive-degradation` complet (37 suites / 309 tests) vert.
  `bun install --ignore-scripts` + `packages/shared && npx prisma generate --generator client && bun run
  build` (prérequis CLAUDE.md, sandbox sans `node_modules` au démarrage) sans erreur. `npx tsc --noEmit` sur
  `apps/web` : nombre d'erreurs identique avant/après le diff (11 sur `VideoCallInterface.tsx`, 1610 au
  total — vérifié par `git stash`/`stash pop` — aucune nouvelle, toutes préexistantes sur le pattern
  `(socket as unknown).emit(...)`). `eslint` : même échec sandbox-only de config circulaire que documenté
  aux vagues précédentes (65/67/68/69/72/73/74/75), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable) ;
  `orchestrator.service.ts` `setCurrentUser()` `setInterval` non mémorisé (Vague 75, confiance
  moyenne/impact faible, non repris ce cycle) ; audit noté par le subagent de cette vague sans confirmation
  complète — `enableVideo()`/`disableVideo()` (`use-webrtc-p2p.ts`) n'ont pas de synchronisation MUTUELLE
  (enable-vs-disable, pas seulement enable-vs-enable) au-delà du garde posé ici côté `VideoCallInterface` ;
  plausible mais non tracé exhaustivement, candidat pour une vague dédiée si un chemin d'appel direct au
  hook (hors `VideoCallInterface`) apparaît.

## Vague 77 — `SocketIOOrchestrator.setCurrentUser()` : le timer de retry d'auth survivait à un second appel ou à `cleanup()` (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. En
tête de cycle, une PR de cette même routine (#2656, tentative de Vague 75 sur `ringtone.ts`) s'est révélée
être un doublon d'une session concurrente déjà mergée sur `main` (#2655, commit `176cc3ed6`, elle-même
Vague 75 — implémentation plus complète : 4 tests au lieu de 2, corrige en plus l'orphelinage des
oscillateurs d'une boucle concurrente) — fermée sans merge par la revue automatisée, conformément à la règle
de la routine de ne jamais dupliquer un fix déjà présent sur `main`. Branche resynchronisée sur `main` à
jour, reprise directe du candidat mineur laissé en spec à la fin de la Vague 75 ci-dessus :
`orchestrator.service.ts` `setCurrentUser()`. Backlog Android (Vague 70, reconfirmé bloqué —
`gradle :feature:calls:help --offline` échoue toujours à résoudre `com.android.application:8.7.3`) et iOS
(`CallManager.swift`, `actor CallEventQueue`, `reportNewIncomingCall`) toujours hors d'atteinte faute de
toolchain dans ce sandbox.

- **Pourquoi ce fichier est dans le périmètre de la routine calls** : bien que `orchestrator.service.ts` ne
  soit pas un fichier calls-spécifique, `initializeConnection()`/`setCurrentUser()` établissent la connexion
  Socket.IO dont dépend TOUT le signaling d'appel (offer/answer/ICE candidates, `call:*` events) — c'est la
  même classe de bug (timer auto-programmé jamais annulé) que celle fermée sur `ringtone.ts` à la Vague 75,
  et le candidat avait déjà été spécifié par cette session.
- **Root cause confirmée par lecture directe** : `setCurrentUser()` (`apps/web/services/socketio/orchestrator.service.ts`)
  arme, quand aucun token n'est encore disponible, un `setInterval` de retry (3 tentatives, 200ms) stocké
  dans une variable LOCALE (`retryInterval`), jamais assignée à `this`. Deux effets :
  1. **Deux appels rapprochés à `setCurrentUser()`** (ex. l'objet `user` du store se met à jour deux fois
     avant que le token ne soit persisté) arment chacun leur propre intervalle sur le même cadencement
     200ms. Quand un token apparaît, LES DEUX intervalles le détectent à leur prochain tick et appellent
     chacun `initializeConnection()` — un appel en trop.
  2. **`cleanup()` (appelé au logout)** n'avait aucune référence vers l'intervalle en cours — un logout
     survenant pendant la fenêtre de retry (600ms max) laissait le timer armé ; s'il restait un token
     résiduel ou qu'un nouveau apparaissait dans cette fenêtre, l'intervalle rappelait
     `initializeConnection()` **après** le cleanup, ressuscitant une connexion que le logout était censé
     avoir démontée — pas juste un gaspillage de cycles, un vrai défaut de cohérence session.
- **Fix** : nouveau champ `authRetryInterval` (mirroir du `ringPatternTimeout` de la Vague 75) + méthode
  privée symétrique `stopAuthRetry()`. Appelée (a) en tête de la branche retry de `setCurrentUser()`, pour
  qu'un second appel ne puisse jamais laisser deux intervalles vivants côte à côte, et (b) dans `cleanup()`,
  pour qu'un logout ne puisse plus jamais laisser un retry survivre à la destruction de la session.
- **Tests** (TDD, RED confirmé avant fix — les 2 nouveaux tests échouaient : 2 appels à
  `initializeConnection()` au lieu de 1 attendu sur le scénario double-`setCurrentUser()` ; 1 appel au lieu
  de 0 attendu sur le scénario cleanup-mid-retry) : 2 nouveaux tests dans
  `__tests__/services/socketio/orchestrator.service.test.ts` — describe `setCurrentUser` (annule un retry
  encore en vol avant d'en armer un nouveau) et describe `cleanup` (annule un retry en vol, un logout ne
  ressuscite pas la connexion).
- **Vérification** : `orchestrator.service.test.ts` + `orchestrator-e2ee.test.ts` (2 suites / 110 tests)
  vert ; sweep `__tests__/services/socketio/**` + `__tests__/components/video-call/**` +
  `__tests__/components/video-calls/**` + `hooks/**` (152 suites / 2776 tests, 2774 passed + 2 skips
  pré-existants sans rapport) vert. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) :
  `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client && bun run
  build` sans erreur. `npx tsc --noEmit` sur `apps/web` : 0 nouvelle erreur imputable au diff (les 14 erreurs
  `TS2349` sur `orchestrator.service.test.ts` sont préexistantes — confirmées identiques en comptage avec et
  sans les 2 nouveaux tests, indépendantes de ce fix). `eslint` : même échec sandbox-only de config
  circulaire que documenté aux vagues précédentes.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague). Aucun nouveau candidat web/gateway identifié au-delà du fix livré cette vague.

## Vague 78 — `VideoCallInterface` sans error boundary + fuite de listeners sur `app/call/[callId]/page.tsx` (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. En
tête de cycle, revue des PR ouvertes de la routine via `list_pull_requests` — deux trouvées (#2661 « auth
retry interval », #2662 « re-entrancy guards »), toutes deux CI verte, mergées avant de démarrer un nouveau
travail (règle de la routine : ne jamais empiler un nouveau cycle sur un backlog non fermé). #2662 avait un
conflit de merge avec `main` mis à jour par #2661 (les deux avaient ajouté une entrée « Vague 76 » au même
point d'ancrage de ce fichier) — résolu à la main en gardant les deux entrées et en renumérotant la seconde
« Vague 77 », sans perte de contenu. Deux audits dédiés (subagents indépendants, iOS + web) lancés ensuite ;
le rapport iOS (`CallManager.selectCamera` n'annule pas `selectedCameraId`/`isUsingFrontCamera` en cas
d'échec, contrairement à son jumeau `switchCamera` du même commit du 2026-08-08) reste hors d'atteinte —
sandbox Linux sans Xcode/Swift (`which xcodebuild swift` → rien), confirmé à nouveau ce cycle ; noté ci-dessous
pour la prochaine session avec toolchain iOS. Le rapport web a fourni les deux fixes de cette vague.

- **Root cause 1 — `VideoCallInterface` jamais protégé par un error boundary** : `CallErrorBoundary`
  (`components/video-calls/CallErrorBoundary.tsx`) existe, est testé et exporté du barrel `video-calls`,
  mais n'était monté nulle part. `VideoCallInterface` (768 lignes, une douzaine d'effets : callbacks WebRTC,
  pipeline effets audio, dégradation adaptative, timers watchdog) était rendu SANS protection aux deux seuls
  points de montage réels — `components/video-call/CallManager.tsx:1130` et
  `app/call/[callId]/page.tsx:201` — en contradiction directe avec la règle déjà écrite dans
  `apps/web/CLAUDE.md` : « Each feature MUST have its own ErrorBoundary. A crash in message list MUST NOT
  crash the conversation list. » Une exception de rendu n'importe où dans cet arbre remontait donc au-delà
  de la frontière dédiée jusqu'au premier boundary ancêtre de l'app, au lieu d'un écran « Call Error »
  contenu et réinitialisable.
- **Fix 1** : `<CallErrorBoundary><VideoCallInterface .../></CallErrorBoundary>` aux deux sites de montage.
  Aucun autre changement.
- **Root cause 2 — `app/call/[callId]/page.tsx` : l'effet de jointure ne nettoyait jamais rien** : l'effet
  enregistrait les listeners `call:participant-joined`/`call:initiated` et le timeout de jointure (10s)
  DEPUIS L'INTÉRIEUR d'une closure `async () => {...}`, puis appelait cette closure comme une simple
  instruction (`joinCall();` au lieu de `return joinCall();`). React n'exécute jamais qu'une fonction de
  nettoyage renvoyée SYNCHRONEMENT par le callback de l'effet — la valeur de résolution éventuelle d'une
  Promise lui est invisible. `useEffect` n'avait donc lui-même aucun `return`, et enregistrait toujours
  `undefined` comme cleanup : ni au démontage, ni à la ré-exécution de l'effet (changement de `callId`/
  `currentCall`) les deux listeners n'étaient jamais retirés du socket singleton partagé — chaque visite de
  cette route empilait deux listeners de plus, chacun fermé sur un `callId` et des setters d'état obsolètes.
  Bug adjacent dans le même effet : `event: unknown` était déréférencé directement (`event.callId`, etc.) —
  ne type-check même pas sous `tsc --noEmit` (7 erreurs `TS18046` avant fix), signe que ce fichier n'avait
  plus été relu depuis un moment.
- **Fix 2** : l'enregistrement des listeners/timeout sort de la closure async et vit directement dans le
  corps de l'effet (synchrone) ; l'effet renvoie désormais sa VRAIE fonction de nettoyage
  (`clearTimeout` + double `socket.off`). `event: unknown` remplacé par les types partagés
  `CallParticipantJoinedEvent`/`CallInitiatedEvent` (`@meeshy/shared/types/video-call`) — les 7 erreurs
  `TS18046` disparaissent avec le typage correct, aucune nouvelle erreur introduite (1625 erreurs
  `tsc --noEmit` sur `apps/web` après diff contre 1632 avant, écart exactement expliqué par ces 7).
- **Tests** (TDD, RED confirmé avant chaque fix via `git stash` du fichier source correspondant) :
  - `__tests__/components/video-call/CallManager.errorBoundary.test.tsx` (2 tests, nouveau fichier) — sans
    le boundary, `render(<CallManager/>)` avec un `VideoCallInterface` mocké pour jeter à l'exception lève
    (RED : `toThrow()`) ; avec le fix, ne lève plus et affiche le fallback « Call Error ».
  - `__tests__/app/call/CallPage.test.tsx` (3 tests, nouveau fichier — première couverture de cette route)
    — un faux socket enregistrant les handlers passés à `on`/`off` ; RED confirmé sur 2 des 3 tests avant
    fix (`socket.off` jamais appelé au démontage ; un événement `call:participant-joined` reçu APRÈS
    démontage flippait quand même `isInCall` sur le store partagé) ; le 3e test (parcours heureux : join +
    événement AVANT démontage) passait déjà avant et après, confirmant l'absence de régression sur le
    chemin nominal. `page.tsx` utilise `use(params)` (React 19) — pour rester synchrone sans dépendre du
    scheduling Suspense/act de l'environnement Bun/Jest-compat de ce sandbox, la Promise passée en prop est
    pré-timbrée `status: 'fulfilled'`/`value` (le mécanisme interne que `use()` reconnaît pour une Promise
    déjà observée résolue), évitant tout aller-retour de suspension.
- **Vérification** : les deux nouveaux fichiers + sweep complet `components/video-call/**` +
  `components/video-calls/**` + `app/call/**` (29 suites / 135 tests) verts. `bun install --ignore-scripts`
  + `packages/shared && npx prisma generate --generator client && bun run build` (prérequis CLAUDE.md,
  sandbox sans `node_modules` au démarrage) sans erreur. `npx tsc --noEmit` sur `apps/web` : 1625 erreurs
  après diff contre 1632 avant (7 de moins, exactement les `TS18046` de `page.tsx` ; `CallManager.tsx`
  strictement identique — mêmes 28 erreurs préexistantes décalées d'une ligne par l'import ajouté, aucune
  nouvelle). `eslint` : même échec sandbox-only de config circulaire que documenté aux vagues précédentes
  (65/67/68/69/72/73/74/75/76/77), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague). **Nouveau candidat iOS (spec prête, non corrigé — sandbox sans toolchain Swift)** :
  `CallManager.selectCamera(id:)` (`~L2566`) n'annule pas `selectedCameraId`/`isUsingFrontCamera` en cas
  d'échec de la sélection caméra, contrairement à son jumeau `switchCamera()` écrit dans le même commit
  (2026-08-08, « serialize switchCamera/selectCamera ») qui a lui un test de régression dédié
  (`CallManagerSwitchCameraFailureCorrectionSourceTests`) pour exactement ce revert. `selectCamera` ignore
  entièrement le flag de succès de la completion — aucun test équivalent. La même famille de tâches
  (`cameraSwitchTask`) ne re-valide pas non plus `currentCallId` après ses `await` chaînés, contrairement à
  ses cousines (`applySurvivalVideoSend`, `scheduleICERestart`, tâches hold-vidéo) qui le font toutes — un
  flip/select mis en file peut dans de rares fenêtres de timing s'appliquer à un appel déjà raccroché/
  re-composé. Root cause de fond notée par l'audit : le boilerplate de chaînage de tâches (6 lignes) est
  dupliqué tel quel à 10 sites sans helper partagé — explique directement pourquoi ces deux trous ont
  échappé à ce pair de nouveaux call sites. Candidat prioritaire pour la prochaine session disposant d'un
  toolchain Xcode/Swift.

## Vague 79 — `CallManager` dupliquait la fermeture WebRTC de `VideoCallInterface` sur `CALL_PARTICIPANT_LEFT`, en amont de sa fenêtre de grâce anti-rejoin (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. En
tête de cycle, revue des PR ouvertes de la routine via `list_pull_requests` — aucune trouvée (les PR ouvertes
du dépôt appartiennent toutes à une routine différente, `keen-hamilton`, plus un PR dependabot) : cycle
démarré sur une base propre, sans backlog à merger d'abord. Toolchains iOS (`xcodebuild`/`swift`) et Android
(`gradle :feature:calls:help --offline` échoue toujours à résoudre `com.android.application:8.7.3`)
reconfirmées hors d'atteinte dans ce sandbox — le candidat iOS `CallManager.selectCamera(id:)` laissé en spec
à la Vague 78 reste donc en attente d'une session avec toolchain Xcode/Swift. Audit dédié (subagent, lecture
directe) du périmètre web (+ signaling gateway) ensuite, qui a remonté 3 candidats ; celui retenu est
confirmé ligne à ligne avant implémentation (les deux autres — piste vidéo clonée orpheline en appel de
groupe sur `webrtc-service.ts`, absence de garde de ré-entrance sur `use-video-call.ts` `startCall()` —
notés ci-dessous comme candidats non retenus ce cycle, confiance moindre / effort de fix plus large).

- **Root cause confirmée par lecture directe** : `CallManager.tsx` et `VideoCallInterface.tsx` avaient
  chacun leur PROPRE listener `socket.on(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, ...)` pour le même événement,
  avec deux stratégies contradictoires. `VideoCallInterface.tsx` (L518-595) est la version correcte,
  documentée par son propre commentaire : elle retarde le nettoyage de 2s, prend un instantané de la
  connexion au moment du départ pour détecter un rejoin dans la même session (reload d'onglet, coupure
  réseau) pendant cette fenêtre de grâce, et appelle `removeParticipant` de `useWebRTCP2P` — qui ferme le
  `WebRTCService` ET vide les maps internes `webrtcServicesRef`/`remoteDescriptionSetRef`/
  `iceCandidateQueueRef`/`offerInFlightRef` (`use-webrtc-p2p.ts` L396-414), pas seulement la
  `RTCPeerConnection` du store. `CallManager.tsx` (L398-423, avant fix), lui, appelait DIRECTEMENT et
  SYNCHRONEMENT `removeRemoteStream`/`removePeerConnection` du store dès réception de l'événement — sans
  fenêtre de grâce, sans détection de rejoin, et surtout sans jamais toucher aux maps internes de
  `use-webrtc-p2p.ts`. Le listener de `CallManager` est attaché de façon inconditionnelle dès le montage
  (avant même qu'un appel soit actif), alors que celui de `VideoCallInterface` n'existe qu'une fois l'appel
  effectivement en cours — Socket.IO invoquant les listeners d'un même événement dans leur ordre
  d'enregistrement, celui de `CallManager` s'exécutait donc TOUJOURS en premier, fermant la
  `RTCPeerConnection` à t=0 pendant que les maps de `use-webrtc-p2p.ts` restaient périmées jusqu'à 2s plus
  tard (ou indéfiniment si la détection de rejoin de `VideoCallInterface` sautait alors le nettoyage). Un
  rejoin survenant dans cette fenêtre envoyait une offre fraîche que `handleIncomingSignal` routait à tort
  vers la branche de renégociation (connexion jugée « déjà établie » via les maps périmées) au lieu de créer
  une nouvelle connexion — `setRemoteDescription` sur une `RTCPeerConnection` déjà fermée lève une
  `InvalidStateError`, capturée et affichée en simple toast « Failed to renegotiate call » côté pair
  restant. Le reconnect échouait silencieusement et DÉFINITIVEMENT jusqu'à raccrocher/rappeler manuellement
  tout l'appel.
- **Fix** : `CallManager.handleParticipantLeft` ne fait plus que mettre à jour la liste des participants
  (`removeParticipant` du store, indexé par `participantId` base de données) — plus aucun appel direct à
  `removeRemoteStream`/`removePeerConnection` (indexés par `userId`), qui restent la responsabilité exclusive
  de `VideoCallInterface`. Les deux références désormais inutilisées retirées du destructuring du store en
  tête de composant. Aucune autre ligne de logique métier modifiée.
- **Tests** (TDD, RED confirmé avant fix) : nouveau fichier
  `__tests__/components/video-call/CallManager.participantLeftOwnership.test.tsx` (2 tests, même patron de
  mock socket que `CallManager.reconnect.test.tsx`) — un test confirme que la liste des participants se met
  toujours à jour ; l'autre pré-peuple le store avec une fausse `RTCPeerConnection`/un faux `MediaStream`
  gardés par `userId`, déclenche l'événement, et vérifie qu'ils restent intacts dans le store et que
  `connection.close()` n'est jamais appelé par `CallManager` — RED confirmé avant fix (`peerConnections.get`
  retournait `undefined`, la connexion ayant été fermée et retirée directement par l'ancien code).
- **Vérification** : les 2 nouveaux tests + sweep complet `video-call|use-webrtc|use-call|orchestrator`
  (40 suites / 416 tests) verts. `bun install --ignore-scripts` + `packages/shared && npx prisma generate
  --generator client && bun run build` (prérequis CLAUDE.md, sandbox sans `node_modules` au démarrage) sans
  erreur. `npx tsc --noEmit` sur `apps/web` : 1624 erreurs après diff contre 1625 avant (vérifié par `git
  stash`/`stash pop`) — une de MOINS, aucune nouvelle ; le diff ne touche que deux imports de store retirés
  et le corps d'un seul handler. `eslint` : même échec sandbox-only de config circulaire que documenté aux
  vagues précédentes (65/67/68/69/72-78), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague) ; candidat iOS `CallManager.selectCamera(id:)` (Vague 78, prêt, sandbox sans toolchain Swift,
  reconfirmé cette vague). **Nouveaux candidats web identifiés cette vague, non retenus (confiance/priorité
  moindre)** : (1) `webrtc-service.ts` `enableVideoSend`/`close` — en appel de groupe avec vidéo activée,
  la piste vidéo CLONÉE propre à un pair (par opposition à la piste caméra de base partagée) n'est ni
  arrêtée ni retirée du `MediaStream` local partagé quand ce pair quitte (`close({ stopLocalTracks: false
  })` ne distingue pas piste partagée vs. piste clonée dédiée à ce pair) — fuite de ressource réelle mais
  qui ne se manifeste qu'en appel à 3+ participants avec vidéo, candidat pour une vague dédiée avec un test
  de régression sur le nombre de pistes vidéo du stream partagé après un cycle join/leave ; (2)
  `use-video-call.ts` `startCall()` n'a pas de garde de ré-entrance contrairement à ses cousins
  (`acceptingCallIdRef` Vague 33, `videoToggleInFlightRef`/`cameraSwitchInFlightRef` Vague 76) — un
  double-clic sur « Démarrer un appel » avant le premier aller-retour `call:initiate` peut écraser
  `window.__preauthorizedMediaStream` et orpheliner une capture caméra/micro, même classe de défaut déjà
  corrigée ailleurs, confiance moyenne (dépend du gateway pour rejeter ou non le doublon), candidat pour une
  prochaine vague.

## Vague 80 — `WebRTCService.close({stopLocalTracks:false})` orpheline la piste vidéo exclusive d'un pair en appel de groupe (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` a montré une PR ouverte de cette même routine (#2668, Vague 79, CI verte, `mergeable_state:
clean`) — mergée avant tout nouveau travail (règle de la routine : ne jamais empiler un nouveau cycle sur un
backlog non fermé). Branche resynchronisée sur `main` à jour. iOS (`xcodebuild`/`swift` absents,
`which xcodebuild swift` → rien) et Android (toolchain gradle non vérifiable) restent hors d'atteinte dans ce
sandbox, reconfirmé ce cycle. Reprise directe du candidat #1 laissé en spec à la fin de la Vague 79 :
`webrtc-service.ts` `enableVideoSend`/`close`.

- **Root cause confirmée par lecture directe** : en appel de groupe, `use-webrtc-p2p.ts` garde une instance
  `WebRTCService` par pair distant, mais toutes reçoivent la MÊME référence `MediaStream` locale via
  `addLocalMedia(stream, ...)` (`ensureLocalStream()` retourne le stream unique du store). Quand la vidéo est
  activée en cours d'appel (`enableVideo()`, upgrade audio→vidéo façon FaceTime), le premier pair reçoit la
  piste caméra littérale et chaque pair suivant reçoit `baseTrack.clone()` — précisément pour qu'aucune piste
  vidéo ne soit jamais partagée entre deux `sender` de pairs différents (contrairement à la piste audio,
  toujours partagée littéralement). Mais `WebRTCService.enableVideoSend()` n'enregistrait cette piste
  qu'auprès de `this.localStream.addTrack(track)` — sans en garder de référence dédiée sur l'instance. Quand
  ce pair quitte l'appel, `removeParticipant()` appelle `close({ stopLocalTracks: false })` (correct : ne
  jamais arrêter les pistes matérielles partagées, sous peine de couper micro/caméra pour tous les autres
  pairs encore connectés) — mais ce garde-fou, correct pour la piste AUDIO réellement partagée, s'appliquait
  aussi à la piste vidéo, qui elle n'est JAMAIS partagée. Résultat : la piste vidéo propre à ce pair (clonée,
  ou la piste de base si c'est le pair d'index 0 qui part) n'était ni arrêtée ni retirée du `MediaStream`
  local partagé — elle restait attachée indéfiniment, piste morte accumulée à chaque cycle join/leave d'un
  appel à 3+ participants avec vidéo active.
- **Fix** : nouveau champ `exclusiveVideoTrack` sur `WebRTCService`, posé dans `enableVideoSend()` (la piste
  qu'elle reçoit n'est, par construction de l'appelant, jamais partagée avec un autre pair) et vidé dans
  `disableVideoSend()` (qui arrête/retire déjà explicitement cette piste). Dans `close()`, la branche
  `stopLocalTracks: false` arrête et retire désormais CETTE piste précise du stream local partagé — même
  logique que `disableVideoSend()`, appliquée au moment de la fermeture plutôt qu'au toggle vidéo. La piste
  audio (et toute piste vidéo attachée via `addLocalMedia` plutôt que via `enableVideoSend`, seule
  authentiquement partagée entre pairs) reste intouchée par un teardown non complet, comme avant.
- **Tests** (TDD, RED confirmé avant fix) : nouveau test dans `__tests__/services/webrtc-service.coverage.test.ts`
  (describe `close`) — deux instances `WebRTCService` partagent un stream audio-only, chacune reçoit une piste
  vidéo distincte via `enableVideoSend` (piste de base pour A, clone pour B, miroir exact de
  `use-webrtc-p2p.ts`), puis `serviceA.close({ stopLocalTracks: false })` : RED confirmé (`baseTrack.stop`
  jamais appelé, `sharedStream.removeTrack` jamais appelé avec `baseTrack`) ; GREEN après fix, et vérifie en
  négatif que la piste audio partagée et la piste vidéo indépendante de B restent intouchées.
- **Vérification** : `webrtc-service.coverage.test.ts` + `webrtc-service.test.ts` (2 suites / 173 tests) vert.
  Sweep `video-call|use-webrtc|use-call|orchestrator` (40 suites / 416 tests) vert — aucune régression sur
  `CallManager.participantLeftOwnership.test.tsx` (Vague 79) ni sur le test `close({stopLocalTracks:false})`
  déjà existant (scénario `addLocalMedia` avec piste réellement partagée, non touché par ce fix). Prérequis
  CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`, puis
  `packages/shared && npx prisma generate --generator client && bun run build` sans erreur. `npx tsc --noEmit`
  sur `apps/web` : 1181 erreurs avant et après le diff (`git stash`/`stash pop`), zéro nouvelle. `eslint` :
  même échec sandbox-only de config circulaire que documenté aux vagues précédentes (65/67/68/69/72-79), non
  bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague) ; candidat iOS `CallManager.selectCamera(id:)` (Vague 78, prêt, sandbox sans toolchain Swift,
  reconfirmé cette vague) ; `use-video-call.ts` `startCall()` sans garde de ré-entrance (Vague 79, confiance
  moyenne, non repris ce cycle).

## Vague 81 — `use-video-call.ts` `startCall()` sans garde de ré-entrance, orphelinant un flux caméra/micro sur double invocation (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. En tête
de cycle, `list_pull_requests` a remonté un PR ouvert de cette routine (#2671, Vague 80, tous les checks CI
verts — `Build (bun)`, `Test web`, `Test gateway`, `Test shared`, `Prisma`, `Security`, `Quality (bun)`,
etc. —, `mergeable_state: clean`) : mergé en premier (squash) per la règle de la routine de ne jamais empiler
un nouveau cycle sur un backlog non fermé. Branche `claude/upbeat-dirac-q6wfqh` recréée depuis `origin/main`
post-merge. Toolchains iOS (`xcodebuild`/`swift` absents) et Android (`gradle` présent mais aucun SDK Android
sous `/opt`) reconfirmées hors d'atteinte dans ce sandbox. Repris le candidat #1 laissé spécifié à la fin de
la Vague 79 (confiance moyenne à l'époque, confirmé ligne à ligne cette vague avant implémentation) :
`use-video-call.ts` `startCall()`.

- **Root cause confirmée par lecture directe** : `startCall()` n'a aucune garde de ré-entrance, contrairement
  à ses cousins de la même famille de bug déjà corrigés dans cette codebase — `acceptingCallIdRef`
  (`CallManager.tsx`, Vague 33), `videoToggleInFlightRef`/`cameraSwitchInFlightRef`
  (`VideoCallInterface.tsx`, Vague 76). Un double-clic sur le bouton d'appel (ou un double rendu déclenchant
  le handler deux fois) avant que le premier aller-retour `getUserMedia` + `call:initiate` ne se résolve
  déclenchait DEUX capture caméra/micro distinctes ; la seconde à se résoudre écrasait sans discussion
  `window.__preauthorizedMediaStream` (ligne `(window as any).__preauthorizedMediaStream = stream`), sans
  jamais appeler `stop()` sur les pistes de la première — orphelinant silencieusement une capture caméra/
  micro pour le reste de la session (indicateur caméra/micro du navigateur resté allumé). Un test existant
  (`should handle rapid multiple startCall invocations`) documentait ce comportement bogué comme acceptable
  (« each should have been processed (though in practice would be deduplicated) », 3 appels `getUserMedia`
  attendus) — signe que le trou était connu mais non corrigé.
- **Fix** : nouveau `startCallInFlightRef` (`useRef(false)`), posé synchroniquement après les deux validations
  précoces (conversation nulle / non-directe, qui ne consomment aucune ressource et ne doivent donc pas être
  bloquées par la garde) et avant tout `await`. Contrairement à ses cousins, la garde ne peut PAS être un
  simple `try/finally` autour de toute la fonction : l'accusé de réception de `socket.emit` arrive de façon
  asynchrone via callback, bien après que la fonction async englobante ait déjà retourné (Socket.IO ack-style,
  pas de Promise) — un `finally` sur la fonction lèverait la garde immédiatement après l'appel synchrone à
  `emit()`, pendant que la requête est encore en vol. La garde est donc levée explicitement sur chacun des
  chemins de sortie : le retour anticipé « socket non connecté », le `catch` de `getUserMedia`, et en tête du
  callback d'accusé de réception (succès ou échec confondus).
- **Tests** (TDD, RED confirmé avant fix) : le test existant documentant le bug (`should handle rapid
  multiple startCall invocations`) renommé et réécrit (`should ignore rapid re-invocations while a call is
  already starting`) pour asserter le comportement corrigé — RED confirmé sur le code d'avant fix
  (`toHaveBeenCalledTimes(1)` reçoit 3). Deux nouveaux tests couvrant chaque chemin de levée de la garde :
  un nouvel appel est accepté après qu'un précédent se soit résolu via son ack (succès), et après qu'un
  précédent ait échoué sur `getUserMedia` (rejet) — les deux verts avant et après fix (aucune régression sur
  le chemin nominal), confirmant que la garde ne bloque jamais un appel légitime suivant, seulement les
  doublons pendant que l'un est déjà en vol.
- **Vérification** : `use-video-call.test.tsx` (30 tests, +2 net) vert. Sweep complet
  `video-call|use-webrtc|use-call|orchestrator` (40 suites / 418 tests) vert. Prérequis CLAUDE.md rejoués
  (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx
  prisma generate --generator client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` : 1181
  erreurs avant et après le diff (`git stash`/`stash pop`), zéro nouvelle. `eslint` : même échec sandbox-only
  de config circulaire que documenté aux vagues précédentes (65/67/68/69/72-80), non bloquant, indépendant de
  ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague) ; candidat iOS `CallManager.selectCamera(id:)` (Vague 78, prêt, sandbox sans toolchain Swift,
  reconfirmé cette vague).

## Vague 82 — `VideoCallInterface` : le toggle vidéo manuel et le contrôleur `adaptive-degradation` n'étaient jamais synchronisés l'un contre l'autre (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` n'a remonté aucune PR ouverte de cette routine (la Vague 81, #2674, était déjà mergée sur
`main`). Toolchains iOS (`xcodebuild`/`swift` absents) et Android (`gradle` présent, aucun SDK) reconfirmées
hors d'atteinte dans ce sandbox. Audit dédié (lecture directe) du périmètre web/gateway, avec un candidat
explicitement laissé en spec à la fin de la Vague 76 : la synchronisation MUTUELLE entre `handleToggleVideo`
et le contrôleur `adaptive-degradation`.

- **Root cause confirmée par lecture directe** : la Vague 76 avait posé `videoToggleInFlightRef` pour empêcher
  UN double-clic manuel sur `handleToggleVideo` d'appeler `enableVideo()`/`disableVideo()` (`use-webrtc-p2p.ts`)
  deux fois en vol — mais son propre commentaire de clôture documentait explicitement le trou restant : «
  `enableVideo()`/`disableVideo()` n'ont pas de synchronisation MUTUELLE (enable-vs-disable, pas seulement
  enable-vs-enable) ». `VideoCallInterface.tsx` lignes 157-169 (avant fix) construisait `degradationActions`
  (passé à `useAdaptiveDegradation`) avec `suspend: async () => { await disableVideo(); ... }` et
  `resume: async () => { await enableVideo(); ... }` — appelant les MÊMES primitives que `handleToggleVideo`,
  mais SANS jamais lire ni poser `videoToggleInFlightRef`. Le contrôleur `use-adaptive-degradation.ts` invoque
  `actions.suspend()`/`actions.resume()` de façon totalement autonome (hystérésis sur la qualité du lien,
  `lib/calls/adaptive-degradation.ts`), indépendamment de tout clic utilisateur. Un utilisateur qui clique
  « caméra ON » pendant que le contrôleur automatique déclenche `suspend()` (lien dégradé pendant 6 s
  sustained, `SUSPEND_AFTER_POOR_MS`) — ou l'inverse, un `resume()` automatique pendant qu'un clic manuel est
  en vol — fait courir DEUX chemins `getUserMedia()`/`replaceTrack()` concurrents sur les mêmes instances
  `WebRTCService`, sans aucun verrou partagé : exactement la même classe de bogue que la Vague 76 (capture
  caméra orpheline, dernière piste "gagnante" jamais référencée par rien capable de l'arrêter), mais sur un
  chemin d'appel que le guard posé à la Vague 76 ne couvrait pas.
- **Fix** : `videoToggleInFlightRef` remonté avant `degradationActions` (même ref, réutilisée telle quelle par
  `handleToggleVideo` plus bas — aucun changement de comportement pour le clic manuel seul) ; nouveau helper
  `runGuardedVideoToggle(op)` qui lève si le guard est déjà tenu, sinon l'arme/le relâche autour de `op()`.
  `degradationActions.suspend`/`resume` passent désormais par ce helper. Le rejet est délibérément laissé
  remonter jusqu'au contrôleur : ses `.catch()` existants (`use-adaptive-degradation.ts`) réagissent déjà
  correctement à un échec de `suspend()`/`resume()` en annulant la transition d'état tentée (`sending`/
  `poorSince`/`goodSince` restaurés), donc une collision de guard se dégrade proprement — la décision
  automatique est simplement retentée au prochain échantillon de qualité. Un seul fichier de production modifié
  (`VideoCallInterface.tsx`) ; `use-adaptive-degradation.ts`/`webrtc-service.ts` intouchés.
- **Tests** (TDD, RED confirmé avant fix) : nouveau describe dans `VideoCallInterface.test.tsx` — « mutual
  exclusion — manual toggle vs. adaptive-degradation controller » (2 tests). Le contrôleur étant mocké dans ce
  fichier de test, les `actions` passées à `useAdaptiveDegradation` sont capturées directement depuis
  `useAdaptiveDegradationMock.mock.calls` (aucune dépendance à la logique interne d'hystérésis, qui a sa propre
  suite `lib/adaptive-degradation.test.ts`, non modifiée). RED confirmé : un clic manuel en vol suivi d'un
  `actions.suspend()` capturé timeoutait (pas de rejet possible avant fix, `disableVideo` jamais résolu dans le
  test) ; l'ordre inverse (`actions.suspend()` en vol puis clic manuel) appelait `disableVideo` deux fois. Les
  deux verts après fix — la seconde invocation (quel que soit l'ordre) n'appelle jamais `disableVideo` une
  deuxième fois, et le rejet est bien observable côté appelant. Gap de mock découvert au passage : le mock
  `sonner` du fichier n'exposait pas `toast.warning` (jamais exercé avant ce fix car `degradationActions`
  n'était jamais réellement invoqué par les tests existants) — ajouté.
- **Vérification** : `VideoCallInterface.test.tsx` (24 tests, +2 net) vert. Sweep
  `video-call|use-webrtc|use-call|orchestrator|adaptive-degradation` (42 suites / 436 tests) vert — aucune
  régression, notamment sur `use-adaptive-degradation.test.tsx` et `lib/adaptive-degradation.test.ts`
  (logique pure d'hystérésis, non touchée). Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au
  démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator
  client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` : 1624 erreurs avant et après le
  diff (`git stash`/`stash pop`, comparaison ligne-à-ligne normalisée sur les numéros de ligne pour absorber
  le déplacement du code) — zéro nouvelle après correction d'une régression transitoire d'1 erreur de typage
  introduite par le test lui-même (`mock.calls` non typé sur un `jest.fn()` sans generic, cast `as unknown as`
  ajouté, même patron que le reste du fichier). `eslint` : même échec sandbox-only de config circulaire que
  documenté aux vagues précédentes, non bloquant, indépendant de ce diff (non ré-exécuté ce cycle, aucune
  raison de diverger).
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 (spec prête, non corrigées faute de toolchain vérifiable, reconfirmé
  cette vague) ; candidat iOS `CallManager.selectCamera(id:)` (Vague 78, prêt, sandbox sans toolchain Swift,
  reconfirmé cette vague) ; passe de lecture ce cycle sur `CallEventsHandler.ts`/`CallService.ts`/
  `CallCleanupService.ts` (gateway, focus timers/listeners : `disconnectGraceTimers`, le timer de traduction
  scoped `translationCompleted:*`, `bufferCleanupInterval`) et sur `webrtc-service.ts`/`use-webrtc-p2p.ts`
  (web) au-delà du candidat retenu, sans trouver de second candidat de confiance équivalente — voir le
  rapport de session pour les pistes écartées et leur raison.

## Vague 83 — `WebRTCService.addLocalMedia()` ne pré-associe pas le m-line vidéo réservé au stream de l'appel : l'upgrade audio→vidéo ne s'affiche jamais côté pair distant (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` a montré une PR ouverte de cette même routine (#2677, Vague 82, 15/15 checks CI verts,
aucun conflit avec `main` — les deux seuls commits mergés sur `main` depuis sa base touchent la modération de
posts et `tasks/todo.md`/`tasks/lessons.md`, aucun chevauchement) — mergée en premier (squash), règle de la
routine de ne jamais empiler un nouveau cycle sur un backlog non fermé. Branche resynchronisée sur `main` à
jour. iOS (`xcodebuild`/`swift` absents) et Android (`gradle` présent, aucun SDK Android sous `/opt`)
restent hors d'atteinte dans ce sandbox, reconfirmé ce cycle. Audit délégué à un agent d'exploration sur
l'ensemble de la pile web calling (hooks, services, stores, composants) au-delà des fichiers déjà couverts
par les Vagues 76-82 — 3 candidats remontés, le premier retenu après relecture ligne à ligne directe (pas de
confiance aveugle dans le rapport d'agent).

- **Root cause confirmée par lecture directe** : `addLocalMedia()` crée le m-line vidéo de deux façons selon
  que l'appel démarre en vidéo ou en audio-only. Branche vidéo (`sendVideo: true`) :
  `addTransceiver(videoTrack, { direction: 'sendrecv', streams: [stream] })` — le sender est associé au
  `MediaStream` de l'appel dès sa création. Branche audio-only (m-line vidéo réservé `recvonly`, sans piste,
  pour un upgrade ultérieur façon FaceTime) : `addTransceiver('video', { direction: 'recvonly' })` — **sans
  `streams`**. Cette asymétrie est invisible tant que l'appel reste audio-only, mais `enableVideoSend()`
  (l'upgrade mi-appel) attache la caméra à ce transceiver réservé via `sender.replaceTrack(track)` puis
  bascule la direction à `sendrecv` — et `replaceTrack()` ne modifie JAMAIS l'association stream/MSID d'un
  sender (spec WebRTC 1.0) : elle est figée au moment de `addTransceiver()`. Résultat : la renégociation
  déclenchée par l'upgrade envoie un m-line vidéo sans groupement MSID. Côté pair distant,
  `RTCPeerConnection.ontrack` se déclenche avec `event.streams` vide — et le handler `onTrack` de
  `use-webrtc-p2p.ts` ne fait `addRemoteStream(participantId, event.streams[0])` QUE
  `if (event.streams && event.streams[0])` (ligne confirmée par lecture directe). L'upgrade caméra du pair
  émetteur ne s'affiche donc jamais chez le pair distant — silencieusement, sans erreur ni log côté
  destinataire — alors que le flux inverse (appel démarré directement en vidéo) fonctionne, ce qui a
  probablement masqué le défaut jusqu'ici (le chemin FaceTime « démarrer en audio, activer la caméra en
  cours d'appel », le seul qui emprunte la branche `recvonly` non associée, est un chemin moins testé
  manuellement que « démarrer directement en vidéo »).
- **Fix** : ajout de `streams: [stream]` à la branche `recvonly` de `addLocalMedia()`, symétrique à la
  branche `sendrecv` juste au-dessus — une ligne. Le m-line vidéo réservé est désormais pré-associé au même
  `MediaStream` que l'audio dès la création de l'appel, qu'il porte une piste tout de suite ou seulement
  plus tard via `enableVideoSend()`. Aucune autre ligne de logique métier modifiée ; `enableVideoSend()` /
  `disableVideoSend()` inchangés (le bug était uniquement dans l'association initiale, pas dans le cycle
  toggle).
- **Tests** (TDD, RED confirmé avant fix) : test existant `reserves a recvonly video m-line for an
  audio-only call` (verrouillait le comportement bogué, `toHaveBeenCalledWith('video', { direction:
  'recvonly' })` sans `streams`) réécrit pour asserter `{ direction: 'recvonly', streams: [stream] }` — RED
  confirmé (l'appel réel n'incluait pas `streams`). Nouveau test dans le describe « mid-call A/V switch » :
  « groups the upgraded video track under the call stream so the remote ontrack event carries streams[0] »
  — vérifie l'association au moment de `addLocalMedia()` ET que `enableVideoSend()` ne recrée pas le
  transceiver (un seul appel `addTransceiver('video', …)` au total, pas deux) — RED confirmé avant fix
  (assertion `streams: [stream]` échouait, seul `{ direction: 'recvonly' }` reçu).
- **Vérification** : `webrtc-service.test.ts` + `webrtc-service.coverage.test.ts` (2 suites / 174 tests, +2
  net) verts. Sweep complet `video-call|use-webrtc|use-call|orchestrator|adaptive-degradation` (42 suites /
  436 tests) vert — aucune régression sur les fixes des Vagues 76-82 (mutual exclusion toggle manuel/auto,
  garde de ré-entrance `startCall`, piste vidéo exclusive au `close()`, ownership `participantLeft`).
  Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`,
  puis `packages/shared && npx prisma generate --generator client && bun run build` sans erreur. `npx tsc
  --noEmit` sur `apps/web` : 1624 erreurs avant et après le diff (`git stash`/`stash pop`), zéro nouvelle.
  `eslint` : même échec sandbox-only de config circulaire que documenté aux vagues précédentes
  (65/67/68/69/72-82), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit + nouveaux candidats de l'agent d'exploration cette vague, non retenus) : dead
  code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ;
  candidat iOS `CallManager.selectCamera(id:)` (Vague 78) — tous reconfirmés hors d'atteinte faute de
  toolchain iOS/Android vérifiable dans ce sandbox. Nouveaux candidats web (confiance moindre, non repris ce
  cycle) : (1) `use-webrtc-p2p.ts` `enableVideo()` retourne tôt (no-op) si aucun pair n'existe encore (appel
  encore en sonnerie), mais `VideoCallInterface.handleToggleVideo` traite ce retour comme un succès et
  bascule quand même `controls.videoEnabled` — désynchronise l'état UI de l'état média réel pour cette
  connexion tant qu'aucun pair n'a rejoint ; (2) `call-store.ts` `addRemoteStream` n'arrête pas les pistes
  d'un stream remplacé, contrairement à `setLocalStream` (testé explicitement pour ce comportement) —
  confirmé comme un vrai trou de couverture de test, mais le chemin d'exploitation (un stream remplacé sans
  `removeRemoteStream` intercalé) n'a été que partiellement établi, confiance moyenne.
## Vague 76 — XSS stocké via les liens de suivi, et open redirect (CWE-601) dans le flux d'authentification (2026-08-08)

Point d'entrée : audit systématique des fichiers du périmètre web SANS AUCUN test (la Vague 75 venait de
montrer qu'un fichier non couvert peut traverser 74 vagues d'audit). 13 fichiers de `apps/web/utils/`
étaient dans ce cas ; `safe-redirect.ts` — un module dont l'unique raison d'être est de bloquer les
redirections ouvertes — en faisait partie. Deux vulnérabilités distinctes, vérifiées de bout en bout.

### Trouvaille 1 — XSS stocké via `originalUrl` d'un lien de suivi (sévérité HAUTE)

- **Chaîne d'exploitation confirmée** : (1) `POST /api/v1/tracking-links` valide `originalUrl` avec
  `z.url('URL invalide')` — or `z.url()` demande seulement que la valeur PARSE : `javascript:alert(1)`,
  `data:text/html,...`, `file:///etc/passwd` sont tous ACCEPTÉS (vérifié en exécutant le schéma).
  L'authentification est optionnelle sur cette route tant qu'on ne rattache pas le lien à une conversation,
  donc même un appelant anonyme peut forger la charge. (2) L'attaquant partage le lien `mshy://TOKEN` dans
  une conversation. (3) Au clic, `components/chat/message-with-links.tsx` (L58-61 et L219-222) et
  `components/messages/MarkdownMessage.tsx` (L98-100) passaient `result.originalUrl` DIRECTEMENT à
  `window.open(...)` puis à `window.location.href` — sans aucune validation de schéma. Résultat :
  exécution de JavaScript arbitraire sur l'origine `meeshy.me`, dans la session de la victime, avec accès
  au token d'authentification en stockage local.
- **Pourquoi ça a échappé aux vagues précédentes** : la page de redirection dédiée `app/l/[token]/page.tsx`
  valide BIEN, via `safeExternalUrl` — l'équipe connaissait donc le garde-fou. Ce sont les trois chemins de
  clic *dans le fil de messages* qui ré-implémentaient chacun la même danse « ouvrir un onglet, sinon
  naviguer » en oubliant la validation. Trois copies, un seul garde-fou, et aucun test sur les trois copies.
- **Fix, deux couches** :
  - *Client* : nouveau `openExternalUrl()` dans `apps/web/utils/safe-redirect.ts` — valide via
    `safeExternalUrl` PUIS navigue (onglet, repli même onglet), et retourne `false` si la destination est
    refusée pour que l'appelant retombe sur le lien de suivi. Les trois sites appellent désormais ce
    helper : la triplication disparaît en même temps que la faille, et le prochain point d'appel ne peut
    plus oublier le contrôle. Les six chemins de REPLI (échec d'enregistrement du clic, exception réseau)
    ré-implémentaient la même danse et passent aussi par le helper : plus une seule occurrence de
    `window.open` / `location.href` brute dans les deux fichiers, et les URLs de repli — jusqu'ici
    ouvertes sans contrôle elles non plus — sont validées au même titre.
  - *Gateway* : nouveau `isHttpUrl()` + `httpUrlSchema` dans `packages/shared/utils/validation.ts`
    (source de vérité TS de la règle « URL sortante sûre », conformément au principe Single Source of
    Truth). `createTrackingLinkSchema.originalUrl` l'utilise à la place de `z.url()`. La route d'ÉDITION
    (`routes/tracking-links/creation.ts`) validait avec un `new URL()` nu — qui parse `javascript:` tout
    aussi volontiers — et rouvrait donc le vecteur que la création aurait interdit : elle partage
    maintenant le même prédicat.

### Trouvaille 2 — open redirect (CWE-601) dans magic-link et 2FA (sévérité MOYENNE)

- **Root cause** : `safeInternalPath()` rejetait `//evil.example` et `/\evil.example` par inspection de
  préfixe, mais le parseur d'URL SUPPRIME tabulation, LF et CR de l'entrée AVANT de la résoudre (WHATWG
  URL, « basic URL parser »). La chaîne inspectée par le garde-fou n'est donc pas celle que le navigateur
  résout : `/\t/evil.example` passe le contrôle comme un chemin banal et atteint le réseau comme
  `//evil.example` — relatif au protocole, hors origine. Vérifié contre le parseur WHATWG :
  `new URL("/\t/evil.example", "https://meeshy.me").origin === "https://evil.example"`.
- **Sinks réels** : `app/auth/verify-2fa/page.tsx` L191 et `app/auth/magic-link/validate/page.tsx` L100,
  tous deux `window.location.href = safeInternalPath(returnUrl, '/dashboard')`, où `returnUrl` sort d'un
  paramètre de query. Un lien `?returnUrl=/%09/evil.example` envoie donc l'utilisateur chez l'attaquant
  APRÈS authentification réussie — phishing post-auth depuis une origine de confiance.
- **Fix** : rejet de tout caractère de contrôle C0 et DEL (plage `U+0000-U+001F` plus `U+007F`) AVANT les
  contrôles de préfixe — ceux-ci n'ont de sens que si la chaîne qu'ils inspectent est celle que le
  navigateur résoudra. Refuser toute la plage plutôt que les trois caractères connus évite que le
  garde-fou dépende de la liste exacte de code points qu'un parseur donné laisse tomber.

- **Tests** (TDD, RED confirmé avant chaque fix) : nouveau `apps/web/__tests__/utils/safe-redirect.test.ts`
  (17 tests) — 4 en RED prouvaient l'open redirect (tabulation, LF, CR, plus un test de propriété
  « ne retourne jamais un chemin que le navigateur résoudrait hors origine ») ; les cas `openExternalUrl`
  couvrent le refus de `javascript:`/`data:`/`file:`/`vbscript:` aux deux sinks. Nouveau
  `services/gateway/src/__tests__/unit/routes/tracking-links/schema-url-scheme.test.ts` (22 tests) —
  RED établi en exécutant `z.url().safeParse('javascript:alert(1)')` qui retournait ACCEPTED. Note
  d'infra : jsdom garde `window.location` en propriété propre non-inscriptible (le helper de
  `jest.setup.js` qui redéfinit l'accesseur sur le PROTOTYPE est masqué par elle), donc une affectation à
  `location.href` n'est pas observable depuis un test ; les assertions portent sur `window.open` et sur la
  valeur de retour — le garde-fou étant un `return` anticipé unique placé AVANT les deux sinks, prouver
  qu'une destination hostile n'atteint pas `window.open` prouve qu'elle n'atteint pas `location.href` non
  plus.
- **Vérification** : `apps/web` 243 suites / 5299 tests (5290 passed, 9 skips préexistants) verte ;
  gateway liens de suivi 9 suites / 216 tests verte ; `packages/shared` 49 fichiers / 1462 tests verte.
  `npx tsc --noEmit` sur `apps/web` : 37 erreurs sur les fichiers touchés — exactement le compte de
  référence mesuré sur le code non modifié (toutes préexistantes, patrons `unknown` de react-markdown),
  0 sur `safe-redirect.ts`.
- **Suites identifiées, NON corrigées cette vague** (périmètre volontairement limité au sink de
  navigation, le seul exploitable en exécution de script) : `z.url()` reste utilisé pour
  `admin-user.avatar`/`banner`, `posts/types.audioUrl`, `notification-schemas.senderAvatar` et
  `admin/agent.baseUrl`. Les quatre premiers alimentent des `<img src>`/lecteurs audio (un `javascript:`
  n'y exécute rien sur les navigateurs modernes) ; `agent.baseUrl` est une cible de fetch côté serveur
  réservée aux admins — angle SSRF plutôt que XSS, à traiter séparément. `updateAvatarSchema` de
  `packages/shared/utils/validation.ts` a déjà, lui, un refine http(s) explicite : à généraliser via
  `httpUrlSchema` dans une prochaine vague.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; le double `setInterval` de `setCurrentUser()` repéré Vague 75
  (impact faible confirmé cette vague : `initializeConnection()` est idempotent, gardé par
  `listenersAttachedSocket`).

## Vague 84 — `CallManager.toggleSpeaker()` (iOS) ne revertait pas `isSpeaker` quand `overrideOutputAudioPort` échoue (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session,
mandat explicitement recentré sur la qualité plateforme Apple (CallKit/PushKit/AVFoundation) pour ce
cycle. `list_pull_requests` n'a remonté aucune PR ouverte de cette routine (branche `upbeat-dirac`
inexistante côté remote, `HEAD == origin/main`) — cycle démarré sur une base propre, sans backlog à
merger d'abord. Le candidat iOS laissé « prioritaire pour la prochaine session Xcode » à la fin de la
Vague 78 (`CallManager.selectCamera(id:)` ne revertait pas son état optimiste sur échec) s'est avéré
**déjà corrigé** — `git log` montre le commit `7a5770e85` (« revert optimistic picker state when
selectCamera fails », #2685), postérieur à la dernière mise à jour de ce fichier ; le texte « reste
ouvert » reconduit tel quel à travers les Vagues 79-83 n'a jamais été recoupé avec le code réel après ce
fix — même piège de confusion documenté par l'audit du 2026-07-01, reconfirmé ici. Toolchain Swift
(`swift`/`xcodebuild`) toujours absente de ce sandbox Linux — audit délégué à un agent dédié (lecture
directe intégrale de `CallManager.swift`, `VoIPPushManager.swift`, `WebRTCService.swift`,
`PiPCallController.swift`, cross-check systématique contre les `*FailureCorrectionSourceTests.swift` /
`*SourceGuardTests.swift` existants pour ne pas re-trouver un candidat déjà couvert), confirmé ligne à
ligne avant implémentation.

- **Root cause confirmée par lecture directe** : `toggleSpeaker()` (`~L2388`, avant fix) flippe
  `isSpeaker` de façon optimiste puis appelle `applySpeakerRoute()` (`~L3987`, avant fix) sans jamais
  inspecter son résultat :
  ```swift
  func toggleSpeaker() {
      isSpeaker.toggle()
      applySpeakerRoute()
      HapticFeedback.light()
  }
  ```
  `applySpeakerRoute()` appelle `RTCAudioSession.overrideOutputAudioPort(port)` dans un `do/catch` qui ne
  fait que logger l'échec (`Logger.calls.error(...)`) — `isSpeaker` reste à sa valeur optimiste quoi
  qu'il arrive. `overrideOutputAudioPort` est connu pour lever `insufficientPriority` quand une route de
  priorité supérieure (un casque Bluetooth/AirPods connecté, autorisé par `.allowBluetoothHFP` à la
  config de catégorie, `~L3885`) est active — le fichier lui-même documente déjà cette classe d'échec
  ailleurs (`WebRTCTypes.swift:1349-1354`, « can silently fail on some hardware »). Scénario concret :
  appel actif avec AirPods connectés, tap « Haut-parleur » → `overrideOutputAudioPort(.speaker)` échoue,
  `isSpeaker` reste `true` (bouton affiché actif, VoiceOver annonce « Désactiver le haut-parleur »,
  `CallView.swift:1572`) alors que l'audio continue de sortir par Bluetooth ; un second tap flip
  `isSpeaker` à `false` et appelle `overrideOutputAudioPort(.none)` — un no-op relatif à l'override jamais
  réellement appliqué — rendant le bouton complètement inerte, désynchronisé jusqu'à ce qu'un événement de
  route sans rapport (`.oldDeviceUnavailable`, déconnexion Bluetooth) réapplique par coïncidence la bonne
  valeur via `handleAudioRouteChange`.
- **Fix, même patron que `switchCamera()`/`selectCamera(id:)`** (déjà établis dans ce fichier pour la même
  forme de bug — flip optimiste avant une opération async faillible sur la même famille caméra) :
  `applySpeakerRoute()` devient `@discardableResult fileprivate func applySpeakerRoute() -> Bool`, retourne
  `true` sur son early-return (`!callState.isActive` — rien à revert, la route n'a simplement pas encore
  été appliquée) et sur succès, `false` quand `overrideOutputAudioPort` lève (`succeeded = false` posé dans
  le `catch`). `toggleSpeaker()` capture `previousSpeaker` avant le flip et revert `isSpeaker` si
  `applySpeakerRoute()` retourne `false`. `@discardableResult` préserve les 5 autres sites d'appel
  (`handleAudioRouteChange` ×3, `handleMediaServicesReset`, `CXProviderDelegate.didActivate`) qui
  continuent d'ignorer la valeur de retour sans avertissement compilateur — leur comportement est
  inchangé, hors scope de ce fix (ils réagissent à des événements système, pas à un tap utilisateur, et
  ont chacun leur propre re-application différée qui absorbe un échec transitoire).
- **Tests** (source-level regression guard, RTCAudioSession nécessite une route audio réelle donc non
  exerçable en comportemental — même limite documentée que
  `CallManagerSwitchCameraFailureCorrectionSourceTests`) : nouveau fichier
  `CallManagerToggleSpeakerFailureCorrectionSourceTests.swift`, deux tests — l'un verrouille la capture +
  le revert conditionnel dans le corps de `toggleSpeaker()`, l'autre verrouille que `applySpeakerRoute()`
  track et retourne bien son issue. Non exécutable dans ce sandbox (pas de toolchain Swift) — la seule
  preuve définitive reste la CI `ios-tests` (macOS runner), comme pour tous les fix Swift de cette
  routine.
- **Vérification** : lecture ligne à ligne des deux fonctions modifiées + des 6 sites d'appel de
  `applySpeakerRoute()` pour confirmer qu'aucun ne dépend de son ancien type `Void` de façon incompatible
  avec `@discardableResult Bool`. CI `ios-tests` à surveiller au push (seule vérification de compile
  disponible pour ce diff).
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` relevée
  par l'agent d'audit cette vague (confiance basse, needs on-device confirmation — CallKit peut ne jamais
  délivrer l'action ou terminer l'appel directement quand `supportsHolding=false`, indéterminable par
  lecture seule) ; candidats web Vague 83 non repris (`enableVideo()` no-op pré-connexion désynchronisant
  `controls.videoEnabled`, `call-store.ts.addRemoteStream` ne stoppant pas les pistes remplacées).

## Vague 85 — `call-store.ts` `addRemoteStream` ne stoppait pas les pistes du stream remplacé (2026-08-09)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`HEAD == origin/main` au démarrage (Vague 84 déjà mergée, aucune PR ouverte de cette routine) — cycle
démarré sur une base propre. Candidat repris directement du « reste ouvert » de la Vague 83/84
(confiance moyenne à l'origine, vérifié ligne à ligne avant implémentation, cf. leçon 18 du journal :
« reprendre la piste comme une hypothèse à réfuter, pas une consigne »).

- **Root cause confirmée par lecture directe** : `addRemoteStream(participantId, stream)`
  (`apps/web/stores/call-store.ts`) écrasait l'entrée `remoteStreams.get(participantId)` sans jamais
  stopper les pistes du stream précédent — contrairement à `setLocalStream` (guard symétrique déjà
  présent juste au-dessus dans le même fichier) et `removeRemoteStream`. Le call-site
  (`use-webrtc-p2p.ts`, handler `onTrack` de `RTCPeerConnection`) rappelle `addRemoteStream` à chaque
  livraison de piste distante, y compris en RENÉGOCIATION (ICE restart, switch A/V mi-appel — le chemin
  d'association de m-line corrigé par cb7aeabd est justement une renégociation qui matérialise une
  nouvelle association de stream). Un stream remplacé pour le même participant laissait donc ses pistes
  (capture/décodage actifs) tourner indéfiniment jusqu'à la fin de l'appel.
- **Fix** : même patron que `setLocalStream` — stopper les pistes du stream précédent uniquement s'il
  diffère du nouveau (`previousStream !== stream`), pour ne pas pénaliser une re-livraison du même objet
  stream (cas déjà couvert par le test « multiple remote streams », participants différents).
- **Tests** (TDD, RED confirmé avant fix) : 2 nouveaux tests dans
  `__tests__/stores/call-store.test.ts` — « should stop tracks of the previous stream when replacing it
  for the same participant » (RED confirmé : `oldTrack.stopped === false` avant fix) et « should not stop
  tracks when the same stream is reported again for the same participant » (garde la non-régression du
  cas re-livraison identique).
- **Vérification** : suite `call-store.test.ts` (68 tests) verte. Sweep complet
  `call|webrtc|video-call` (48 suites / 609 tests) vert, aucune régression. `npx tsc --noEmit` : compte
  d'erreurs inchangé avant/après (1179), 0 sur le fichier touché. `packages/shared` : `prisma generate` +
  `bun run build` propres (prérequis CLAUDE.md rejoués, sandbox sans `node_modules` au démarrage — `bun
  install --ignore-scripts`). `next lint` : échec sandbox-only de config ESLint v9 circulaire déjà
  documenté (Vagues 65-84), non bloquant, indépendant de ce diff. PR #2706 ouverte, CI à surveiller.
- **Reste ouvert** (reconduit, un candidat en moins) : dead code / god-object `CallManager.swift` iOS
  (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall`
  UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
  `supportsHolding = false` (confiance basse, needs on-device confirmation). **Nouveau candidat
  prioritaire pour la prochaine session** : `use-webrtc-p2p.ts` `enableVideo()` retourne tôt (no-op,
  aucune exception) si `webrtcServicesRef.current` est vide — cas réel avant que le pair réponde
  (`services.length === 0`, ex. sonnerie). `VideoCallInterface.handleToggleVideo` ne détecte pas ce
  no-op silencieux (pas de throw → pas de `catch` → `setControls({ videoEnabled: true })` s'exécute quand
  même) : désynchronise l'état UI de l'état média réel — le bouton affiche vidéo activée alors qu'aucune
  piste caméra n'a été acquise ni attachée à aucun pair. Investigation entamée mais pas menée à bout ce
  cycle (portée du fix — faire lever une erreur explicite depuis `enableVideo()` vs. gérer le cas dans
  l'appelant — pas encore tranchée) ; à vérifier ligne à ligne avant d'implémenter (leçon 18).

## Vague 86 — `enableVideo()` (use-webrtc-p2p.ts) résolvait silencieusement sans pair, désynchronisant `controls.videoEnabled` de l'état média réel (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session. Deux
PR ouvertes trouvées au démarrage (`list_pull_requests`) : #2706 (`claude/upbeat-dirac-mildu6`) et #2701
(`claude/upbeat-dirac-9xg0k7`), toutes deux le MÊME correctif Vague 85 livré en parallèle (comparaison de
diff : guard identique dans `addRemoteStream`, tests équivalents) — 15/15 checks CI verts sur les deux.
Règle de la routine (reconduite depuis la Vague 82) : ne jamais empiler un nouveau cycle sur un backlog non
fermé. #2706 mergée (squash, base la plus récente des deux) ; #2701 fermée avec commentaire de renvoi vers
#2706. Branche resynchronisée sur `main` à jour (fast-forward). Candidat repris directement du « nouveau
candidat prioritaire » laissé par la Vague 85 : `use-webrtc-p2p.ts enableVideo()` no-op silencieux sans
pair. Vérifié ligne à ligne avant implémentation (leçon 18 : hypothèse à réfuter, pas une consigne).

- **Root cause confirmée par lecture directe** : `enableVideo()` (`use-webrtc-p2p.ts`, ~L669) faisait
  `if (services.length === 0) return;` — un retour anticipé silencieux, sans exception, quand
  `webrtcServicesRef.current` est vide (aucun `RTCPeerConnection` créé pour aucun participant). Ce Map est
  peuplé par `getWebRTCService()`, appelé depuis `createOffer` (côté appelant) ou depuis le handler de
  signal `offer` reçu (côté destinataire) — donc `services.length === 0` signifie littéralement « aucune
  signalisation n'a encore commencé avec personne », une fenêtre réelle bien que courte (le montage de
  `VideoCallInterface` est inconditionnel dès `currentCall` existe, `CallManager.tsx:1134`, y compris
  pendant la sonnerie). `handleToggleVideo` (`VideoCallInterface.tsx`) appelle `await enableVideo()` dans un
  `try` dont le `catch` gère déjà l'échec (toast + `return` avant `setControls`) — mais un retour résolu
  sans erreur ne déclenche jamais ce `catch` : le code tombe directement sur
  `setControls({ videoEnabled: true })` PUIS émet `CALL_TOGGLE_VIDEO` au pair via socket — sans qu'aucune
  piste caméra n'ait été acquise ni attachée à qui que ce soit. Le bouton affiche « vidéo activée », le pair
  distant est informé que la vidéo locale est active, et rien ne corrige automatiquement cet état une fois
  qu'un pair se connecte (pas de file d'attente, pas de retry).
- **Fix** : `enableVideo()` lève désormais `new Error('NO_PEER_CONNECTION')` au lieu de résoudre
  silencieusement quand `services.length === 0`. `handleToggleVideo` n'a besoin d'AUCUNE modification — son
  `catch` existant (déjà exercé et testé pour un échec de renégociation mi-appel) absorbe le rejet
  correctement : toast `videoSwitchFailed`, `return` avant `setControls`/l'émission socket. Un seul fichier
  de production modifié (`use-webrtc-p2p.ts`, +7/-1 lignes) ; `VideoCallInterface.tsx` intouché — la
  correctivité de son chemin d'erreur était déjà là, seule la source (l'exception jamais levée) manquait.
  Docstring de `enableVideo()` mise à jour : l'ancienne mention « Works while ringing or connected » était
  fausse dans ce cas précis (sonnerie SANS signalisation encore engagée) — remplacée par une explication du
  contrat d'erreur.
- **Tests** (TDD, RED confirmé avant fix) : nouveau test dans `use-webrtc-p2p.test.tsx`
  (describe « Mid-call A/V switch (FaceTime-style) ») — « enableVideo rejects without touching the camera
  when no peer connection exists yet » : appelle `enableVideo()` SANS `createOffer` préalable (aucun
  service), attend un rejet ET vérifie que `getUserMedia` n'a jamais été invoqué (pas d'acquisition caméra
  pour rien). RED confirmé : la promesse résolvait `undefined` avant le fix. Nouveau test bout-en-bout dans
  `VideoCallInterface.test.tsx` (describe dédié Vague 86) — simule le rejet via le mock du hook
  (`webrtc.enableVideo.mockRejectedValueOnce`), clique le bouton toggle, et verrouille que `setControls`
  n'est PAS appelé et que le socket n'émet PAS `call:toggle-video` — ce test était déjà vert avant le fix
  (le `catch` de `handleToggleVideo` existait déjà et n'a pas changé) : il ne prouve pas la régression du
  bug lui-même (c'est le rôle du test du hook), mais verrouille que le chemin de bout en bout — la vraie
  raison d'être du fix — fonctionne réellement une fois `enableVideo()` corrigé, pas seulement en théorie.
- **Vérification** : `use-webrtc-p2p.test.tsx` (43 tests, +1 net) et `VideoCallInterface.test.tsx`
  (25 tests, +1 net) verts. Sweep complet `video-call|use-webrtc|use-call|orchestrator|adaptive-degradation|
  call-store` (43 suites / 506 tests, +2 net vs. Vague 85) vert — aucune régression, notamment sur les
  guards de re-entrance (Vague 76), l'exclusion mutuelle toggle manuel/auto (Vague 82) et le
  pré-association m-line (Vague 83). Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au
  démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator
  client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` : 1622 erreurs avant et après le
  diff (`git stash`/`stash pop`, diff normalisé ligne-à-ligne), zéro nouvelle. `eslint` : même échec
  sandbox-only de config circulaire documenté aux vagues précédentes (65-85), non bloquant, indépendant de
  ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor
  CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84,
  needs on-device confirmation) ; toolchains iOS (`xcodebuild`/`swift`) et Android (SDK) reconfirmées hors
  d'atteinte dans ce sandbox ce cycle.

## Vague 87 — `rejectSupersededPendingCall` (iOS) bypassait `emitCallReject`, désynchronisant `reason` et le différé socket-down (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`HEAD == origin/main` au démarrage après merge de la Vague 86 (PR #2716, `enableVideo()` no-op silencieux)
— trouvée déjà ouverte et verte (CI complète passée) au début de ce cycle, mergée directement avant de
lancer un nouvel audit, aucune duplication avec cette vague.

- **Root cause confirmée par lecture directe** (`apps/ios/Meeshy/Features/Main/Services/CallManager.swift`,
  fonction `rejectSupersededPendingCall(replacingWithCallId:)`, introduite Vague/Audit 2026-07-07 Finding
  2) : son propre doc comment affirme « Mirror `rejectPendingCall()`'s socket signal » — mais le corps
  appelait `MessageSocketManager.shared.emitCallEnd(callId: superseded.callId)` (le socket brut, sans
  `reason`), alors que `rejectPendingCall()`, cinq lignes au-dessus dans le même fichier, appelle
  `emitCallReject(callId: pending.callId)`, l'helper dédié de la classe. Deux divergences concrètes :
  1. `emitCallReject` envoie `call:end` avec `reason: "rejected"` ; l'appel brut n'envoie aucune raison.
     Côté gateway, `CallService.endCall()` résout un `call:end` pré-décroché sans `reason` en
     `CallStatus.missed`/`CallEndReason.missed` (`resolveEndReason` retombe sur `completed` puis le
     branchement `!wasPreAnswered ? .ended : resolvedReason === .rejected ? .rejected : .missed` choisit
     `.missed`) — l'appelant déplacé reçoit une fausse notification « appel manqué » et son historique
     classe l'appel dans le filtre « manqués » alors qu'il n'a jamais sonné dans le vide (A était joignable,
     juste occupé à jongler entre deux appels entrants).
  2. `emitCallReject` garde sur `MessageSocketManager.shared.isConnected` et diffère l'émission
     (`pendingEndReconciliationCallId`/`Reason`, rejoué à la reconnexion) si la socket est down ; l'appel
     brut `emitCallEnd` est silencieusement jeté par le SDK dans ce cas. Un des deux sites d'appel
     (`reportIncomingVoIPCall`) peut s'exécuter de façon synchrone directement depuis la livraison d'un push
     VoIP à froid — la socket peut plausiblement ne pas encore être connectée à cet instant précis, ce qui
     rendrait le log « Superseded waiting call ended » trompeur (rien n'a été réellement signalé), l'appel
     déplacé restant sonnant jusqu'au timeout serveur (~60-120s).
  Trouvaille via un audit dédié : un audit antérieur (Vague 25) avait déjà mentionné en passant que cette
  fonction « termine proprement le 2e appelant côté serveur » sans vérifier qu'elle envoyait bien
  `reason=rejected` ni qu'elle survivait à une socket down — pris pour argent comptant, jamais reproduit.
- **Fix** : une ligne, remplace l'appel brut par l'helper que le doc comment prétendait déjà utiliser :
  `emitCallReject(callId: superseded.callId)`. Pas de changement de signature (`emitCallReject` est
  `Void`, comme l'était l'appel remplacé), pas de nouvel import — les deux fonctions sont privées dans la
  même classe/fichier.
- **Tests** (source-level regression guard — `RTCAudioSession`/socket réels non exerçables en
  comportemental dans ce sandbox, même limite que les fixes Vague 25/84) : le test existant
  `test_rejectSupersededPendingCall_helperExists_andSignalsCallEnd`
  (`CallManagerTests.swift`, classe `CallWaitingSupersedeTests`) verrouillait littéralement l'appel bugué
  (`body.contains("MessageSocketManager.shared.emitCallEnd(callId: superseded.callId)")`) — RED confirmé
  par lecture (l'assertion matche exactement l'ancien code, donc passait à tort avant ce fix). Mis à jour :
  assertion positive sur `emitCallReject(callId: superseded.callId)` + nouvelle assertion négative
  (`XCTAssertFalse`) interdisant explicitement le retour de l'appel brut, pour qu'une régression future ne
  puisse pas re-matcher les deux formes à la fois. Les deux autres tests de la classe (ordre
  reject-avant-overwrite dans `reportIncomingVoIPCall`/`handleIncomingCallNotification`) restent inchangés
  — ils testent l'ordonnancement de l'appel, pas son implémentation interne.
- **Vérification** : lecture ligne à ligne de `emitCallReject`/`emitCallEnd` (SDK
  `MessageSocketManager.swift`) et de `CallService.endCall` (gateway) pour confirmer la divergence
  `reason`/`missed` avant d'écrire le fix. Non exécutable dans ce sandbox (pas de toolchain Swift/Xcode) —
  seule preuve définitive : CI `iOS Tests`/`ci.yml` (déclenché sans filtre de chemin sur toute PR, cf.
  leçon opérationnelle `tasks/ios-debt-routine-progress.md` Run #2) à surveiller au push avant merge.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84,
  needs on-device confirmation) ; toolchains iOS (`xcodebuild`/`swift`) et Android (SDK) toujours hors
  d'atteinte dans ce sandbox.

## Vague 88 — `acceptOrJoinCall`'s `call:join` ack (web) n'avait aucun timeout : une ack perdue bloquait le join pour toujours (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`HEAD == origin/main` au démarrage (Vague 87, PR #2719, mergée avant le lancement de cette vague — aucune
PR ouverte trouvée pour ce périmètre au démarrage, `list_pull_requests`/`search_pull_requests`). Audit dédié
(agent Explore, lecture seule) mandaté sur tout le périmètre calling non déjà blanchi par les vagues 1-87 ni
bloqué par l'absence de toolchain (iOS god-object, Android Vague 70) — deux candidats web/gateway trouvés,
tous deux dans la même famille de bug (ack Socket.IO sans timeout).

- **Root cause confirmée par lecture directe** (`apps/web/components/video-call/CallManager.tsx`, fonction
  `acceptOrJoinCall`, ~L629 — chemin partagé par `handleAcceptCall` (Accept d'un appel entrant),
  `handleEndAndAnswerWaiting` (bascule call-waiting) et l'effet `joinRequest` (join depuis la bulle live,
  ré-hydratation à froid)) : `const ack = await new Promise((resolve) => { socket.emit(CLIENT_EVENTS.CALL_JOIN,
  ..., resolve); })` — la promesse n'a NI timeout NI branche `reject`. Socket.IO client 4.8 (utilisé ici) ne
  rejette PAS automatiquement un callback d'ack en attente quand le transport tombe entre l'émission et la
  réponse, sauf opt-in explicite via `socket.timeout(ms)` — jamais utilisé nulle part dans ce fichier. Un
  paquet d'ack perdu (coupure transitoire juste après l'emit, redémarrage gateway en cours de requête,
  flakiness mobile ordinaire) laisse le `await` ne jamais se résoudre :
  1. Le `finally { acceptingCallIdRef.current = null; }` de `handleAcceptCall` ne s'exécute jamais — le
     re-clic sur Accept est avalé indéfiniment par le guard de ré-entrance
     (`if (acceptingCallIdRef.current === incomingCall.callId) return;`).
  2. La bannière d'appel entrant (`CallNotification`) reste affichée pour toujours, bouton Accept inerte.
  3. Le flux micro/caméra pré-autorisé (`getUserMedia` déjà résolu, `__preauthorizedMediaStream` déjà posé)
     n'est jamais arrêté — LED caméra allumée indéfiniment, aucune piste jamais relâchée.
  4. Aucune erreur n'est jamais montrée à l'utilisateur — seul un rechargement de page répare l'état.
  Un pattern identique existe déjà ailleurs dans le même repo (`SOCKET_ACK_TIMEOUT_MS = 10_000` +
  `setTimeout(() => reject(...), SOCKET_ACK_TIMEOUT_MS)` / `clearTimeout(timer)` dans
  `use-post-mutations.ts`/`use-comment-mutations.ts`) — jamais repris pour le chemin d'appel.
- **Fix** : ajout de `CALL_JOIN_ACK_TIMEOUT_MS = 10_000` (même valeur que le pattern existant) et d'un
  `setTimeout`/`clearTimeout` autour de l'emit `CALL_JOIN`, qui `reject`ie la promesse avec
  `Error('CALL_JOIN_ACK_TIMEOUT')` si l'ack n'arrive pas à temps. Le `catch` existant de `acceptOrJoinCall`
  (`stopPreauthorizedStream(stream); throw error;`) absorbe ce rejet sans aucune modification — il arrête déjà
  le flux et repropage vers les 3 appelants, dont les `catch` existants (déjà exercés/testés pour un échec de
  join classique) affichent déjà le toast `joinFailed` et remettent l'état à zéro. Un seul fichier de
  production modifié (`CallManager.tsx`, +12/-3 lignes) ; les 3 sites d'appel (`handleAcceptCall`,
  `handleEndAndAnswerWaiting`, l'effet `joinRequest`) sont corrigés d'un coup car ils partagent tous
  `acceptOrJoinCall`. Le site séparé de re-join après reconnexion (`rejoinActiveCallAfterReconnect`, ~L830)
  a le même défaut mais n'est pas `await`é (fire-and-forget avec callback), donc aucun état ne reste bloqué
  si son ack se perd — laissé de côté, pas la même gravité, candidat pour une vague future si confirmé réel.
- **Tests** (TDD, RED confirmé avant fix) : nouveau fichier `CallManager.joinAckTimeout.test.tsx` (4 tests,
  timers falsifiés) — (1) ack jamais résolue → `jest.advanceTimersByTime(CALL_JOIN_ACK_TIMEOUT_MS + 1)` doit
  déclencher le toast `joinFailed` et laisser `isInCall`/`currentCall` à leur état initial (RED confirmé :
  timeout de test à l'infini avant le fix, faux avant que `advanceTimersByTime` ne débloque rien) ; (2) les
  pistes du flux pré-autorisé sont bien arrêtées (`track.stop()`) au timeout ; (3) le guard de ré-entrance
  `acceptingCallIdRef` est bien relâché après le timeout — un second Accept après coup relance vraiment
  `getUserMedia`/`call:join` (2 appels chacun) ; (4) régression négative : une ack réussie AVANT le délai
  n'est pas invalidée rétroactivement par `advanceTimersByTime` après coup (`clearTimeout` bien appelé dans
  le callback d'ack). Les 3 premiers RED confirmés par exécution (`bun run jest`) avant le fix, GREEN après.
- **Vérification** : sweep complet `video-call|use-webrtc|use-call|orchestrator|adaptive-degradation|
  call-store` (44 suites / 510 tests, +1 suite/+4 tests net vs. Vague 86) vert — aucune régression, incluant
  les 5 tests `CallManager.acceptCall.test.tsx` existants (ack succès/échec, ré-entrance, privacy) qui
  exercent le même code modifié. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) :
  `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client && bun run
  build` sans erreur. `npx tsc --noEmit` sur `apps/web` : 1188 erreurs avant et après le diff (`git
  stash`/`stash pop`, comparaison directe), zéro nouvelle. `eslint` : même échec sandbox-only de config
  circulaire documenté aux vagues précédentes (65-87), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84,
  needs on-device confirmation) ; `rejoinActiveCallAfterReconnect` (web) partage le même défaut d'ack sans
  timeout que le fix de cette vague mais en fire-and-forget, gravité moindre, à réévaluer ; sibling candidat
  identifié par l'audit de cette vague dans `apps/web/hooks/conversations/use-video-call.ts` `startCall()`
  (`CLIENT_EVENTS.CALL_INITIATE` ack sans timeout non plus — `startCallInFlightRef` resterait bloqué à `true`
  indéfiniment sur une ack perdue, rendant tout bouton d'appel sortant silencieusement inerte) — bon candidat
  pour la Vague 89 ; toolchains iOS (`xcodebuild`/`swift`) et Android (SDK) toujours hors d'atteinte dans ce
  sandbox.

## Vague 89 — `startCall()` (`use-video-call.ts`) : le sibling `call:initiate` du fix Vague 88 avait le même défaut d'ack sans timeout (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`HEAD == origin/main` au démarrage après merge de la Vague 88 (PR #2725, `call:join` ack timeout) — trouvée
déjà ouverte et verte (15/15 checks CI) au début de ce cycle, mergée directement (squash) avant de lancer un
nouvel audit ; aucune autre PR ouverte sur le périmètre calling (`list_pull_requests` complet, 21 PR open au
total, le reste 100% Dependabot + #2748 hors périmètre). Candidat repris directement du « Reste ouvert »
laissé par la Vague 88 elle-même (déjà identifié en fin de cycle précédent) et confirmé indépendamment par un
audit dédié (agent Explore, lecture seule, ligne à ligne, sans se fier au log — leçon 18).

- **Root cause confirmée par lecture directe** (`apps/web/hooks/conversations/use-video-call.ts`, hook
  `useVideoCall`, fonction `startCall`, ~L112) : `socket.emit(CLIENT_EVENTS.CALL_INITIATE, callData, (ack) =>
  {...})` — exactement le même patron bugué que `acceptOrJoinCall` avant la Vague 88 (aucun `socket.timeout(ms)`,
  aucun `setTimeout`/`clearTimeout`), mais côté appel SORTANT cette fois (le seul autre call-site socket.emit
  ack-style sur le chemin calling avec `startCallInFlightRef` comme guard de ré-entrance, cf. commentaire du
  hook citant explicitement `acceptingCallIdRef` de `CallManager.tsx` comme la même famille de bug). Un ack
  `call:initiate` perdu (coupure transitoire juste après l'emit, redémarrage gateway en cours de requête,
  flakiness mobile ordinaire) laisse le callback ne jamais s'exécuter :
  1. `startCallInFlightRef.current` reste bloqué à `true` pour toujours — la garde de ré-entrance en tête de
     `startCall` (`if (startCallInFlightRef.current) return;`) avale silencieusement tout clic ultérieur sur
     le bouton Appeler, sans jamais relancer `getUserMedia`/`call:initiate`.
  2. Le flux micro/caméra pré-autorisé (`getUserMedia` déjà résolu, `__preauthorizedMediaStream` déjà posé)
     n'est jamais arrêté — LED caméra/micro allumée indéfiniment.
  3. Aucune erreur n'est jamais montrée à l'utilisateur — le bouton Appeler devient silencieusement inerte,
     seul un rechargement de page répare l'état.
- **Fix** : ajout de `CALL_INITIATE_ACK_TIMEOUT_MS = 10_000` (même valeur/convention que
  `CALL_JOIN_ACK_TIMEOUT_MS`) et remplacement du callback brut par `ack = await new Promise<CallInitiateAck>(
  (resolve, reject) => { const timer = setTimeout(() => reject(...), CALL_INITIATE_ACK_TIMEOUT_MS);
  socket.emit(CLIENT_EVENTS.CALL_INITIATE, callData, (response) => { clearTimeout(timer); resolve(response); });
  })`, enveloppé dans un `try/catch` dédié qui, sur timeout, relâche `startCallInFlightRef`, arrête le flux
  pré-autorisé et affiche le même toast de repli que la branche `!ack?.success` existante — sans passer par
  `handleMediaError` (qui aurait affiché un message trompeur de type « Failed to access camera/microphone:
  CALL_INITIATE_ACK_TIMEOUT », ce n'est pas une erreur média). Le reste du corps (branches succès/échec,
  `setIceServers`, `setCurrentCall`, toast succès) est inchangé, seulement déplacé hors du callback puisque
  l'ack est maintenant attendu de façon linéaire. Un seul fichier de production modifié
  (`use-video-call.ts`, +32/-24 lignes).
- **Effet de bord découvert en cours de route** : `startCall()` attendait auparavant le résultat de l'ack de
  façon purement fire-and-forget (le callback socket.emit s'exécutait bien après que la fonction async ait déjà
  rendu la main) ; il attend désormais réellement l'ack (ou le timeout) avant de se résoudre. Sans impact
  production — le seul appelant (`CallSystemMessage.tsx`) fait déjà `void startCall(...)`, jamais `await`é — mais
  a cassé 32 tests existants qui appelaient `mockEmit` sans jamais invoquer son callback (le test attendait alors
  réellement les 10s du VRAI timer, dépassant le timeout Jest de 5s, avec effet de cascade sur les tests
  suivants). Corrigé en ajoutant un callback d'ack par défaut (`{ success: true, ... }`) dans le `beforeEach`
  partagé du fichier de test — les tests qui vérifient un ack spécifique continuent de surcharger ce mock comme
  avant.
- **Tests** (TDD, RED confirmé avant fix) : nouveau describe `call:initiate ack timeout (Vague 89)` dans
  `use-video-call.test.tsx` (4 tests, timers falsifiés, même structure que
  `CallManager.joinAckTimeout.test.tsx`) — (1) ack jamais résolue → toast d'échec affiché après
  `advanceTimersByTime` ; (2) les pistes du flux pré-autorisé sont arrêtées au timeout ; (3) le guard de
  ré-entrance est bien relâché — un retry après timeout relance réellement `getUserMedia`/`emit` (2 appels
  chacun) ; (4) régression négative : un ack réussi AVANT le délai n'est pas invalidé rétroactivement par
  `advanceTimersByTime` après coup. Les 3 premiers RED confirmés par exécution (`bun run test`) avant le fix
  (échec sur les assertions, la 4e passait déjà trivialement faute de timer armé), GREEN après (34/34 tests du
  fichier).
- **Vérification** : suite `use-video-call.test.tsx` (34 tests, +4 net) verte. Sweep complet
  `video-call|use-webrtc|use-call|orchestrator|adaptive-degradation|call-store` (44 suites / 514 tests) vert,
  aucune régression. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage, bun 1.3.11 local
  vs. 1.3.14 CI — écart déjà documenté, non résolu ce cycle) : `bun install --ignore-scripts`, puis
  `packages/shared && npx prisma generate --generator client && bun run build` sans erreur. `npx tsc --noEmit`
  sur `apps/web` : 1188 erreurs avant et après le diff (`git stash`/`stash pop`, diff normalisé ligne-à-ligne —
  seul bruit résiduel : ordre non-déterministe des membres d'union dans les messages TS, déjà documenté), zéro
  nouvelle erreur, zéro sur les fichiers touchés. `next lint` : même échec sandbox-only de config ESLint v9
  circulaire documenté aux vagues précédentes (65-88), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5865 lignes, en légère
  hausse vs. Vague 87) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall`
  UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
  `supportsHolding = false` (Vague 84, needs on-device confirmation) ; `rejoinActiveCallAfterReconnect` (web,
  ~L830 `CallManager.tsx`) partage le même défaut d'ack sans timeout mais en fire-and-forget, gravité
  moindre, à réévaluer ; toolchains iOS (`xcodebuild`/`swift`) et Android (SDK) toujours hors d'atteinte dans
  ce sandbox ; bun local 1.3.11 vs. 1.3.14 attendu par CLAUDE.md (`bun upgrade` non tenté ce cycle, hors
  périmètre calling).

## Vague 90 — `handleIncomingCall`'s "second caller bumps unanswered call" branch rejetait la call en cours d'acceptation (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`HEAD == origin/main` au démarrage après merge de PR #2749 (Vague 89, `startCall()` ack timeout) — trouvée
déjà ouverte et 15/15 checks CI verts, mergée directement (squash) avant de lancer un nouvel audit, aucune
duplication. `rejoinActiveCallAfterReconnect` (piste laissée par la Vague 89) réévaluée en premier : fire-
and-forget, aucun ref/ressource à fuir, le `call:ended` serveur récupère déjà le client en cas d'échec —
confirmée non-régression (leçon 18 appliquée : hypothèse réfutée, pas suivie). Nouvel audit dédié (agent
Explore, lecture seule, périmètre web+gateway — seules stacks avec toolchain dans ce sandbox) mandaté pour
trouver un candidat frais.

- **Root cause confirmée par lecture directe** (`apps/web/components/video-call/CallManager.tsx`,
  `handleIncomingCall`, branche « second incoming call bumping unanswered call », introduite Vague 60) :
  `handleAcceptCall` (~L715) ne fait `setIncomingCall(null)` qu'APRÈS que `acceptOrJoinCall` (~L640) se
  résolve — un aller-retour `getUserMedia` + ack `call:join` pouvant durer jusqu'à `CALL_JOIN_ACK_TIMEOUT_MS`
  (10s, Vague 88). `isInCall`/`currentCall` ne reflètent pas non plus l'acceptation en cours :
  `setInCall(true)` est la TOUTE DERNIÈRE instruction d'`acceptOrJoinCall`. Pendant toute cette fenêtre,
  `incomingCall` reste donc la call en cours d'acceptation et `isInCall` reste `false` — la branche
  `busyInCall` (L320) ne se déclenche jamais. Un `call:initiated` non lié arrivant dans cette fenêtre tombe
  alors dans la branche « second caller » (L347, sans connaissance d'`acceptingCallIdRef`) qui exécute
  `rejectWaitingCall(incomingCall.callId)` — un `call:end reason=rejected` envoyé pour la call que
  l'utilisateur vient précisément de taper Accept dessus, en course avec son propre `call:join` en attente
  pour le MÊME callId. Scénario atteignable sans timing adverse : deux personnes tentant de joindre le même
  utilisateur B à quelques secondes d'écart pendant que B accepte le premier appel (fenêtre ~1-10s, ordinaire
  sur un groupe/DM actif). Si le join finit par réussir malgré tout, l'appelant A voit un reject fantôme
  alors que B est réellement en train de le rejoindre ; côté gateway, le `call:end` et le `call:join` pour le
  même `callId` arrivent sur le même socket coup sur coup, deux handlers async pouvant s'entrelacer.
- **Fix** : dans la branche « second caller », un garde `acceptingCallIdRef.current === incomingCall.callId`
  détourne vers le même traitement que le cas déjà-occupé (`setWaitingCall(event)` +
  `startWaitingTimeout`) au lieu de rejeter la call en cours d'acceptation — avec la MÊME garde « ne pas
  bumper silencieusement une waiting call existante » que la Vague 59 avait ajoutée à la branche sœur
  (`busyInCall`), pour ne pas réintroduire la même classe de bug sur ce nouveau chemin `setWaitingCall`.
  Aucun changement de dépendances `useCallback` : `waitingCall`, `clearWaitingTimeout`, `rejectWaitingCall`,
  `startWaitingTimeout` étaient déjà dans le tableau de deps (réutilisés par la branche `busyInCall`
  existante). Un seul fichier de production modifié, +18/-3 lignes.
- **Tests** (TDD, RED confirmé avant fix) : nouveau fichier `CallManager.acceptInFlightBump.test.tsx`
  (2 tests, patron du fake-socket avec ack capturé/différé réutilisé de `CallManager.acceptCall.test.tsx`
  combiné au patron double-incoming de `CallManager.doubleIncomingCall.test.tsx`) — (1) un deuxième
  `call:initiated` pendant l'ack `call:join` en attente ne déclenche AUCUN `call:end` pour le premier callId,
  affiche le second comme waiting call, et le join du premier réussit normalement une fois son ack résolu
  (RED confirmé : `call:end reason=rejected` reçu pour FIRST_CALL_ID avant le fix) ; (2) un troisième caller
  pendant la même fenêtre bump correctement la waiting call mise en file par le second (même garde Vague 59,
  vérifie la symétrie du nouveau chemin). Les deux RED confirmés par exécution (`bun run jest`) avant le fix,
  GREEN après.
- **Vérification** : sweep complet `call|webrtc|video-call|orchestrator|adaptive-degradation` — **54 suites
  / 747 tests verts**, aucune régression (notamment `CallManager.doubleIncomingCall.test.tsx` et
  `CallManager.callWaitingBump.test.tsx`, les deux branches sœurs de celle modifiée, et
  `CallManager.acceptCall.test.tsx`, qui exerce `acceptingCallIdRef`). Prérequis CLAUDE.md rejoués (sandbox
  sans `node_modules` au démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx prisma
  generate --generator client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` : **1657
  erreurs avant et après le diff** (`git stash`/`stash pop`, comparaison directe), zéro nouvelle, zéro sur
  les lignes touchées (347-388, vérifié par grep ciblé). `next lint` : même échec sandbox-only de config
  ESLint v9 circulaire documenté aux vagues précédentes (65-89), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor
  CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84,
  needs on-device confirmation) ; `rejoinActiveCallAfterReconnect` (web, réévaluée ce cycle, confirmée
  non-régression — retirée du backlog) ; toolchains iOS (`xcodebuild`/`swift`) et Android (SDK) toujours hors
  d'atteinte dans ce sandbox ; bun local 1.3.11 vs. 1.3.14 attendu par CLAUDE.md (hors périmètre calling).

## Vague 91 — `startCall()`'s ack-success handler clobbers an already-active different call when the ack lands after the user accepted an unrelated incoming call (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` n'a remonté aucune PR ouverte de cette routine (la Vague 90, #2755, était déjà mergée
sur `main`). Un premier passage sur `main` s'est avéré STALE (fetch initial du sandbox pointait sur un ref
`main` obsolète, 24h en retard — le git local a signalé un "forced update" en re-fetchant, ce qui a d'abord
semblé être une réécriture d'historique inquiétante ; vérifié via `mcp__github__list_commits` sur `main`
côté API GitHub que le tip réel était légitime, récent, linéaire, auteur réel — juste un cache local
périmé). Deux candidats identifiés en cours de route (`call-store.ts` `addRemoteStream`, `enableVideo()`
early-return desync) se sont révélés DÉJÀ corrigés par des sessions concurrentes de cette même routine
(Vagues 85 et 86, mergées entre-temps) — travail redondant découvert et abandonné avant tout push, aucune
duplication publiée. Toolchains iOS (`xcodebuild`/`swift`) et Android (`gradle` présent, aucun SDK) toujours
hors d'atteinte. Audit dédié (agent Explore, lecture seule, périmètre web+gateway, mandaté pour éviter les 2
doublons déjà rencontrés) a remonté 3 candidats frais ; le premier (confiance haute) retenu après relecture
ligne à ligne directe de tous les fichiers cités.

- **Root cause confirmée par lecture directe** : `use-video-call.ts` `startCall()` et `CallManager.tsx`
  `acceptOrJoinCall()` sont deux flux TOTALEMENT INDÉPENDANTS qui écrivent tous les deux dans le même
  singleton `currentCall`/`isInCall` (`call-store.ts`), sans aucune coordination entre eux — contrairement
  aux races déjà corrigées à l'intérieur d'UN SEUL de ces flux (Vague 90 : deux appels ENTRANTS pendant une
  acceptation en cours). `startCall()` attend son ack `call:initiate` jusqu'à `CALL_INITIATE_ACK_TIMEOUT_MS`
  (10 s, Vague 89) avant d'appeler `useCallStore.getState().setCurrentCall({...})` — SANS jamais vérifier si
  `currentCall` a, entre-temps, déjà été pris par un AUTRE appel. Scénario atteignable sans timing adverse :
  utilisateur A tape sur « Appeler » (conversation X) → `getUserMedia` + `call:initiate` en vol. Pendant les
  jusqu'à 10 s d'attente de l'ack, un appel entrant non lié (conversation Y) sonne — `CallNotification` est
  une bannière flottante non bloquante (`fixed top-4`), pas un modal plein écran, donc parfaitement tapable
  pendant que X est encore en train de composer. A accepte Y → `acceptOrJoinCall` fait son propre
  `getUserMedia` + ack `call:join`, réussit, `setCurrentCall(Y)` + `setInCall(true)` — `VideoCallInterface`
  se monte sur Y. QUAND l'ack de X arrive enfin (succès), `setCurrentCall(X)` s'exécute SANS CONDITION,
  écrasant Y dans le store unique pendant que `VideoCallInterface` reste monté et câblé sur les
  `WebRTCService`/peer connections de Y — son prop `callId` change sous ses pieds, en pleine conversation
  active.Ct scénario n'exige aucune fenêtre de course étroite : n'importe quel délai réseau ordinaire sur
  l'ack de X pendant que l'utilisateur — raisonnablement — répond à un autre appel suffit. Coté serveur, rien
  ne bloque ce doublon : le nettoyage phantom cross-conversation (`CallService.initiateCall` →
  `isPhantomCallStale`) épargne DÉLIBÉRÉMENT tout appel réel en cours dans une autre conversation, donc le
  `call:initiate` de X est bien accepté par le gateway pendant que Y est déjà actif.
- **Fix** : dans la branche succès de l'ack (`ack.data?.callId && user`), lecture de
  `useCallStore.getState().currentCall` juste avant `setCurrentCall` — si un appel DIFFÉRENT est déjà actif
  (`activeCall && activeCall.id !== ack.data.callId`), le nouvel appel (celui que l'utilisateur vient
  d'abandonner en acceptant l'autre) est terminé sur le fil (`call:end reason=rejected`, même pattern que
  `rejectWaitingCall` dans `CallManager.tsx` pour le cas symétrique côté callee) au lieu d'écraser l'appel en
  cours, et le média pré-autorisé acquis pour lui est libéré (`stopPreauthorizedStream`) — sinon le
  correspondant de X resterait à sonner indéfiniment et la caméra/micro acquis pour X resterait chaud sans
  jamais être consommé. `socket.emit` casté en interface minimale (`{ emit: (e, d) => void }`), même pattern
  que `rejectWaitingCall` — le typage strict de `ClientToServerEvents[CALL_END]` exige un callback d'ack que
  ce site n'a pas besoin de consommer (fire-and-forget, comme son homologue). Un seul fichier de production
  modifié (+14/-0 lignes).
- **Tests** (TDD, RED confirmé avant fix) : nouveau test dans `use-video-call.test.tsx` (describe « startCall
  sets currentCall for the initiator ») — pose un `currentCall` actif différent AVANT `startCall()`, force
  l'ack de `call:initiate` à réussir avec un AUTRE `callId`, vérifie que l'appel actif survit intact
  (référence stricte `toBe`), que `call:end {callId: newcomer, reason: 'rejected'}` est émis, que les pistes
  du stream pré-autorisé sont arrêtées et le handoff global nettoyé, et que le toast de succès ne se déclenche
  PAS. RED confirmé (le currentCall actif était bien écrasé par l'appel « newcomer » avant fix). **Effet de
  bord découvert au RED** : `useCallStore` est un singleton de MODULE non réinitialisé entre tests dans ce
  fichier (seul le describe « startCall sets currentCall » le faisait, localement) — rien avant cette vague
  ne LISAIT jamais `currentCall` dans ce hook, donc l'absence de reset global était invisible. Le nouveau
  garde en lit désormais un à chaque succès d'ack, ce qui a fait échouer 4 tests préexistants sans rapport
  (`should allow a new startCall once the previous one has resolved via its ack`, 2 tests du describe
  « call:initiate ack timeout (Vague 89) ») dont le `currentCall` résiduel d'un test antérieur dans le même
  fichier collidait désormais avec leur propre 2e `startCall()`. Fixé à la racine : reset explicite de
  `currentCall`/`isInCall` dans le `beforeEach` DE TOUT LE FICHIER (miroir du reset déjà local au describe
  « startCall sets currentCall »), pas un correctif au cas par cas des 4 tests touchés — la prochaine
  assertion sensible à cet état n'aura pas à redécouvrir le même trou.
- **Vérification** : `use-video-call.test.tsx` (35 tests, +1 net, 4 régressions ci-dessus corrigées par le
  reset) vert. Sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-degradation`
  (45 suites / 517 tests) vert — aucune régression, notamment `CallManager.acceptInFlightBump.test.tsx`
  (Vague 90, scénario sœur côté callee) et `CallManager.acceptCall.test.tsx`. Prérequis CLAUDE.md rejoués
  (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx
  prisma generate --generator client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` :
  1 erreur neuve détectée au premier passage (`TS2554: Expected 3 arguments, but got 2` sur l'emit non casté)
  — corrigée en adoptant le même cast que `rejectWaitingCall` ; diff final **0 erreur neuve** vs. la
  baseline 1657 mesurée sur `git stash`/`stash pop` du seul diff de cette vague. `eslint`/`next lint` : même
  échec sandbox-only de config ESLint v9 circulaire documenté aux vagues précédentes (65-90), non bloquant,
  indépendant de ce diff (non ré-exécuté ce cycle).
- **Reste ouvert** (reconduit + nouveaux candidats de l'agent d'exploration cette vague, non retenus) : dead
  code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
  `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ; toolchains
  iOS/Android toujours hors d'atteinte dans ce sandbox. Nouveaux candidats web non repris ce cycle : (2,
  confiance moyenne-haute) `VideoCallInterface.tsx` `handleSwitchCamera` garde toujours son propre
  `cameraSwitchInFlightRef` séparé, jamais unifié avec `videoToggleInFlightRef`/le contrôleur
  adaptive-degradation (Vague 76 leur avait délibérément donné des refs distinctes, Vague 82 n'a unifié QUE
  toggle-manuel-vs-dégradation) — un switch caméra concurrent à une suspension/reprise automatique du
  contrôleur peut orpheliner une capture caméra, même classe de bug que Vagues 76/82 sur un chemin qu'elles ne
  couvrent pas ; candidat sérieux pour la prochaine vague. (3, confiance basse) `use-audio-effects.ts` ne
  dispose jamais l'ancien `MediaStreamAudioDestinationNode` si `inputStream` change de référence en cours de
  montage — actuellement un piège latent plutôt qu'un bug actif, aucun chemin d'appel actuel ne remplace la
  référence du stream en cours d'appel (le switch caméra mute le stream existant plutôt que de le remplacer).

## Vague 92 — `handleSwitchCamera` kept its own re-entrancy ref, disconnected from the manual-toggle/adaptive-degradation guard (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` n'a remonté aucune PR ouverte de cette routine (la Vague 91, #2762, était déjà mergée
sur `main`). `HEAD == origin/main` au démarrage. Candidat repris directement du "reste ouvert" laissé par la
Vague 91 (confiance moyenne-haute, déjà scopé par lecture directe) plutôt qu'un nouvel audit dédié — la piste
était suffisamment précise pour aller droit à la vérification ligne à ligne.

- **Root cause confirmée par lecture directe** (`apps/web/components/video-calls/VideoCallInterface.tsx`) :
  Vague 82 avait unifié le toggle manuel (`handleToggleVideo`) et le contrôleur adaptive-degradation
  (`suspend()`/`resume()` via `runGuardedVideoToggle`) sur un seul ref `videoToggleInFlightRef`, mutuel dans
  les deux sens. `handleSwitchCamera` — qui mute EXACTEMENT la même ressource (la piste vidéo de
  `localStream` + les `senders` vidéo des peer connections, via `replaceTrack`) — gardait son propre ref
  `cameraSwitchInFlightRef`, jamais croisé avec l'autre. Un flip caméra en vol pendant un toggle manuel ou une
  suspension/reprise automatique (typiquement : le lien se dégrade PENDANT que l'utilisateur retourne sa
  caméra) laisse un chemin appeler `replaceTrack`/`stop()` sur une piste que l'autre est encore en train
  d'acquérir — capture caméra orpheline, ou vidéo ranimée alors que l'utilisateur/le contrôleur venait de
  l'éteindre. Même classe de bug que Vagues 76/82, sur le chemin qu'elles ne couvraient pas.
- **Fix** : `runGuardedVideoToggle` et les deux handlers (`handleToggleVideo`, `handleSwitchCamera`) vérifient
  désormais le ref de l'AUTRE en plus du leur. Le ref `cameraSwitchInFlightRef` est simplement remonté à côté
  de `videoToggleInFlightRef` (même bloc de refs, commentaire mis à jour) — aucun renommage, aucune fusion en
  un ref unique, pour garder le diff minimal et chaque chemin capable de continuer à se garder lui-même.
  Un seul fichier de production modifié, +20/-9 lignes (dont commentaires).
- **Tests** (TDD, RED confirmé avant fix, `git stash` du seul fichier de production) : 4 nouveaux tests dans
  `VideoCallInterface.test.tsx` (describe « mutual exclusion — camera switch vs. manual toggle /
  adaptive-degradation controller ») — camera-switch-bloque-toggle-manuel, toggle-manuel-bloque-camera-switch,
  camera-switch-bloque-auto-suspend, auto-suspend-bloque-camera-switch. Les 4 RED confirmés par exécution
  (`bun run jest -t "Vague 92"`) avant le fix, GREEN après (`git stash pop`).
- **Vérification** : sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-
  degradation` — **45 suites / 521 tests verts** (+4 net vs. la Vague 91), aucune régression. Prérequis
  CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`, puis
  `packages/shared && npx prisma generate --generator client && bun run build` sans erreur. `npx tsc
  --noEmit` sur `apps/web` : **1657 erreurs avant et après le diff** (`git stash`/`stash pop`, comparaison
  directe), zéro nouvelle. `next lint` : même échec sandbox-only de config ESLint v9 circulaire documenté aux
  vagues précédentes (65-91), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor
  CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles
  Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite
  confirmation on-device) ; toolchains iOS/Android toujours hors d'atteinte dans ce sandbox ; (confiance
  basse, non repris) `use-audio-effects.ts` ne dispose jamais l'ancien `MediaStreamAudioDestinationNode` si
  `inputStream` change de référence en cours de montage — piège latent, aucun chemin d'appel actuel ne
  déclenche ce remplacement.

## Vague 93 — `useAudioEffects` never disposed the old `MediaStreamAudioDestinationNode` on an `inputStream` swap (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests`/`search_pull_requests` n'ont remonté aucune PR ouverte de cette routine (la Vague 92,
#2765, était déjà mergée sur `main`). Branche fast-forwardée sur `origin/main` (1 commit de retard, chore
lane-cursor) avant tout travail. Candidat repris directement du "reste ouvert" laissé par la Vague 92
(confiance basse à l'origine — le doute portait sur l'atteignabilité, pas sur le défaut lui-même) plutôt
qu'un nouvel audit dédié.

- **Root cause confirmée par lecture directe** (`apps/web/hooks/use-audio-effects.ts`) : le mount effect
  `[inputStream]` reconstruit tout le pipeline Web Audio à chaque changement de référence de `inputStream`
  (mic/caméra swap). Sa fonction de nettoyage disposait déjà le `Tone.Gain` d'entrée et détruisait les
  processeurs d'effets, mais ne touchait JAMAIS `mediaStreamDestinationRef.current` — `initializeAudioPipeline`
  se contente d'écraser la ref avec un nouveau `audioContext.createMediaStreamDestination()` au ré-init
  suivant. Le noeud orphelin reste câblé dans le graphe du `AudioContext` partagé (singleton Tone.js à
  durée de vie de l'app) et continue à générer de l'audio dans un `MediaStream` que plus personne ne lit —
  une fuite CPU/batterie qui s'accumule à chaque nouvelle acquisition de flux.
- **Vérification de l'atteignabilité** (le doute laissé par la Vague 92) : dans `VideoCallInterface.tsx`,
  `inputStream: localStream` ne change JAMAIS de référence pendant un appel actif — `handleSwitchCamera`
  mute les tracks du MÊME objet `MediaStream` (`removeTrack`/`addTrack`), et `enableVideo`/`disableVideo`
  (togle vidéo manuel + dégradation adaptative) ne touchent jamais l'audio ni `setLocalStream`. En revanche
  `AudioRecorderWithEffects.tsx` (même hook partagé, chemin « enregistrer un message vocal avec effets »)
  appelle `setRawStream(newRawStream)` avec un **nouveau** `MediaStream` à CHAQUE `startRecording()` —
  un flux produit ordinaire (enregistrer, annuler, ré-enregistrer) sans jamais démonter le composant. Le
  défaut est donc réellement atteignable via ce second consommateur du hook partagé, pas seulement
  théorique — la Vague 92 avait correctement identifié le défaut mais sous-estimé sa portée réelle en ne
  vérifiant qu'un seul appelant.
- **Fix** : dans la fonction de nettoyage du mount effect, avant de réinitialiser `isInitializedRef`/
  `isInitialized` — si `mediaStreamDestinationRef.current` existe, arrêt de tous ses tracks de sortie
  (`stream.getTracks().forEach(track => track.stop())`), `disconnect()` du noeud, puis remise à `null` de
  la ref. Optional chaining (`?.()`) sur `getTracks`/`disconnect` par cohérence avec le reste du fichier
  (`dispose?.()`, `setActive?.()`). Un seul fichier de production modifié, +9/-0 lignes.
- **Tests** (TDD, RED confirmé avant fix) : nouveau test dans `use-audio-effects-input-stream.test.ts`
  (« stops the previous MediaStreamAudioDestinationNode output tracks when inputStream is swapped mid-call »)
  — mock `createMediaStreamDestination` renvoyant un noeud distinct par appel avec son propre track
  `stop()` traçable ; swap `inputStream`, vérifie que le PREMIER noeud voit son track stoppé et lui-même
  déconnecté exactement une fois, et que le SECOND (nouveau) noeud n'est pas touché. RED confirmé (0 appel
  à `stop()` avant le fix), GREEN après.
- **Vérification** : sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-
  degradation|audio-effect` — **49 suites / 552 tests verts** (+4 suites / +31 tests net vs. la Vague 92,
  la pattern inclut désormais `audio-effect`), aucune régression. Prérequis CLAUDE.md rejoués (sandbox sans
  `node_modules` au démarrage) : `bun install --ignore-scripts`, puis `packages/shared && npx prisma
  generate --generator client && bun run build` sans erreur. `npx tsc --noEmit` sur `apps/web` : **1657
  erreurs avant et après le diff** (`git stash`/`stash pop`, comparaison directe), zéro nouvelle.
- **Reste ouvert** (reconduit, aucun nouveau candidat web à haute confiance identifié ce cycle) : dead code /
  god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
  `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
  `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ;
  toolchains iOS/Android toujours hors d'atteinte dans ce sandbox.

## Vague 94 — `useAudioEffects` never disconnected the upstream `MediaStreamAudioSourceNode` (+ mono upmix pair) on an `inputStream` swap (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests`/`search_pull_requests` n'ont remonté aucune PR ouverte de cette routine (la Vague 93,
#2771, était déjà mergée sur `main`). `HEAD == origin/main` au démarrage, aucun backlog non fermé. Nouvel
audit dédié (agent Explore, lecture seule, périmètre web+gateway — seules stacks avec toolchain dans ce
sandbox) mandaté avec la liste complète des vagues 89-93 pour éviter toute redite.

- **Root cause confirmée par lecture directe** (`apps/web/hooks/use-audio-effects.ts`,
  `initializeAudioPipeline`) : le graphe Web Audio construit est
  `source (createMediaStreamSource) → [splitter → merger si mono] → Tone.Gain (inputNodeRef) →
  MediaStreamAudioDestinationNode (mediaStreamDestinationRef)`. `source`/`splitter`/`merger` sont de simples
  `const` locales à la fonction — jamais posées dans une ref. La Vague 93 a corrigé le nettoyage du NOEUD
  DE SORTIE (`mediaStreamDestinationRef`), mais `AudioNode.disconnect()` ne coupe que les arêtes SORTANTES
  d'un noeud : déconnecter le Gain (`inputNodeRef`, déjà fait avant la Vague 93) laisse intacte l'arête
  AMONT `source → Gain.input` — l'ancien `MediaStreamAudioSourceNode` (et sa paire splitter/merger
  d'upmixing mono) reste câblé indéfiniment dans le graphe partagé, à durée de vie de l'app, du
  `Tone.context`, épinglant une référence à l'ancien `MediaStream`/ses tracks. Atteignabilité vérifiée par
  le même chemin que la Vague 93 avait déjà confirmé pour le noeud de sortie :
  `AudioRecorderWithEffects.tsx` appelle `setRawStream(newRawStream)` (nouvelle référence `MediaStream`) à
  CHAQUE `startRecording()` — un cycle enregistrer/annuler/ré-enregistrer ordinaire, sans démontage du
  composant, fuit un noeud source de plus (jusqu'à trois avec l'upmix mono) à chaque itération.
- **Fix** : trois nouvelles refs (`sourceNodeRef`, `channelSplitterRef`, `channelMergerRef`) posées au
  moment de la création dans `initializeAudioPipeline` (miroir exact du pattern déjà en place pour
  `mediaStreamDestinationRef`). Dans le nettoyage du mount effect, avant le nettoyage des processeurs :
  `channelSplitterRef`/`channelMergerRef` (si présentes) puis `sourceNodeRef` sont chacune `disconnect()`ées
  puis remises à `null` — ordre aval→amont, cohérent avec le sens du graphe. Un seul fichier de production
  modifié, +24/-0 lignes.
- **Tests** (TDD, RED confirmé avant fix) : 2 nouveaux tests dans `use-audio-effects-input-stream.test.ts`
  (patron du test destination-node de la Vague 93, mêmes noeuds factices trackés par tableau) — (1)
  `sourceNodeRef` : swap `inputStream`, vérifie que le PREMIER noeud source voit `disconnect()` appelé
  exactement une fois et que le SECOND (nouveau) n'est pas touché ; (2) même vérification pour
  `channelSplitterRef`/`channelMergerRef` sur un `inputStream` mono (`createMediaStreamSource` mocké à
  `channelCount: 1` pour forcer la branche d'upmix). Les mocks `disconnect: jest.fn()` ajoutés aux noeuds
  factices de ces deux fichiers de test (`use-audio-effects-input-stream.test.ts` et `use-audio-effects.test.ts`,
  ce dernier partageant le même `beforeEach` de mocks Tone.js) — absents avant ce cycle car rien n'appelait
  encore `disconnect()` sur ces noeuds. RED confirmé (0 appel à `disconnect()` avant le fix sur les deux
  tests neufs), GREEN après.
- **Vérification** : sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-
  degradation|audio-effect` — **49 suites / 554 tests verts** (+2 net vs. la Vague 93), aucune régression.
  Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`,
  puis `packages/shared && npx prisma generate --generator client && bun run build` sans erreur. `npx tsc
  --noEmit` sur `apps/web` : **1657 erreurs avant et après le diff** (`git stash`/`stash pop`, diff direct
  ligne à ligne), zéro nouvelle, zéro sur les fichiers touchés.
- **Reste ouvert** (reconduit, aucun nouveau candidat web à haute confiance identifié ce cycle — le backup
  `use-webrtc-p2p.ts` `removeParticipant()` ne nettoyant pas `connectedPeersRef`/`stalledPeersRef`, contra
  `cleanup()`, a été jugé plausible mais de faible impact pratique par l'agent d'audit lui-même, le handler
  `call:reconnected` côté gateway étant déjà idempotent — candidat à réévaluer une prochaine vague) : dead
  code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
  `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ;
  toolchains iOS/Android toujours hors d'atteinte dans ce sandbox.

## Vague 95 — `handleSwitchCamera` replaced every peer's video sender with a SINGLE shared track, orphaning per-peer clones in a group call (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` a remonté une PR ouverte de cette routine (#2776, Vague 94 — `useAudioEffects`
upstream source-node leak), CI 15/15 verte, mergée directement (squash) avant tout nouvel audit — aucune
duplication. Branche locale réinitialisée sur `origin/main` (`git reset --hard`, aucun commit local
antérieur à préserver). Toolchains iOS (`xcodebuild`/`swift`) et Android (`gradle` présent, aucun SDK)
toujours hors d'atteinte. Audit dédié (agent Explore, lecture seule, périmètre web+gateway, mandaté avec
la liste des Vagues 89-94 déjà fixées pour éviter toute redite) a remonté un candidat unique retenu après
relecture ligne à ligne directe de tous les fichiers cités.

- **Root cause confirmée par lecture directe** : `enableVideo()` (`use-webrtc-p2p.ts`) établit, pour un
  appel de groupe (mesh complet, un `WebRTCService` par pair distant), un modèle de propriété explicite —
  « une vraie piste caméra pour le premier pair, un `.clone()` pour chacun des autres » — précisément
  parce que `WebRTCService.exclusiveVideoTrack` (champ documenté comme « jamais partagé entre pairs »,
  utilisé par `close({stopLocalTracks:false})` pour ne libérer QUE la piste de l'instance qui part) a
  besoin d'un objet track distinct par pair pour rester exact. `handleSwitchCamera`
  (`VideoCallInterface.tsx`) ignorait entièrement ce modèle : il lisait `localStream.getVideoTracks()[0]`
  (indexé, en supposant UNE seule piste vidéo), remplaçait le sender de **CHAQUE** connexion pair avec un
  **unique** nouvel objet track obtenu via un seul `getUserMedia`, puis ne stoppait/retirait que la piste
  d'INDICE 0 de `localStream`. Dans un appel à 3 (A, B, C), après `enableVideo()`, `localStream` porte
  légitimement 2 pistes vidéo (`baseTrack` pour B, `clone_C` pour C, le clone d'un pair non-index-0 n'étant
  JAMAIS le même objet). Un premier flip caméra remplace les DEUX senders par un nouvel objet partagé,
  stoppe/retire `baseTrack` (indice 0) — mais `clone_C`, débranché de tout sender depuis ce remplacement,
  n'est ni stoppé ni retiré : une piste caméra orpheline, toujours vivante, invisible à tout chemin de
  nettoyage (`WebRTCService` de C garde un `exclusiveVideoTrack` pointant sur `clone_C`, désormais faux).
  Un second flip lit `localStream.getVideoTracks()[0]` — devenu l'orphelin `clone_C`, pas la piste
  réellement attachée aux deux senders — et le cycle recommence en alternant systématiquement quelle piste
  reste orpheline : fuite non bornée de captures caméra vivantes pour toute la durée d'un appel de groupe
  dont l'utilisateur local flip la caméra plus d'une fois, un geste mobile ordinaire (aucun timing adverse
  requis).
- **Fix** : nouvelle méthode `WebRTCService.switchVideoSendTrack(track)` (`webrtc-service.ts`), miroir
  bookkeeping-complet d'`enableVideoSend`/`disableVideoSend` — lit la piste sortante RÉELLEMENT attachée
  au sender (`this.videoTransceiver.sender.track`, même technique de vérité-terrain que
  `disableVideoSend`, plutôt que de faire confiance à `exclusiveVideoTrack`), `replaceTrack()` sur LE
  sender de CETTE instance uniquement, MAJ `localStream` (ajoute la nouvelle, retire l'ancienne SI elle
  existait), stoppe l'ancienne, et remet à jour `exclusiveVideoTrack`. Aucune renégociation nécessaire
  (transceiver déjà `sendrecv`, `replaceTrack()` seul suffit). Nouvelle fonction `switchCamera(facingMode)`
  (`use-webrtc-p2p.ts`), miroir structurel d'`enableVideo()` : un seul `getUserMedia`, la piste littérale
  au premier pair, un `.clone()` à chacun des autres, chaque pair reçoit l'ordre via son propre
  `switchVideoSendTrack`. `handleSwitchCamera` (`VideoCallInterface.tsx`) perd toute la logique
  d'acquisition/remplacement bas niveau (plus d'accès direct à `useCallStore.getState().peerConnections`
  ni à `navigator.mediaDevices.getUserMedia`) — son seul rôle restant est de dériver le `facingMode` cible
  à partir de la piste courante et de déléguer à `switchCamera()`. Trois fichiers de production modifiés :
  `webrtc-service.ts` (+31), `use-webrtc-p2p.ts` (+33), `VideoCallInterface.tsx` (+15/-32, net plus simple
  que l'implémentation remplacée).
- **Tests** (TDD, RED confirmé avant fix à chaque couche) :
  - `webrtc-service.coverage.test.ts` — 6 nouveaux tests `switchVideoSendTrack` (throw sans transceiver ;
    replace + MAJ localStream + stop de l'ancienne ; aucun effet quand le sender n'avait pas de piste
    préalable ; pas de renégociation ; propriété exclusive préservée en appel de groupe — la piste de A
    est seule stoppée, celle de B jamais touchée ; `close({stopLocalTracks:false})` après un switch libère
    la NOUVELLE piste, pas l'ancienne déjà traitée par le switch lui-même).
  - `use-webrtc-p2p.test.tsx` — 3 nouveaux tests `switchCamera` (pair unique → pas de clone ; appel de
    groupe → premier pair reçoit la piste littérale, chaque autre reçoit un `.clone()` distinct ; rejette
    sans toucher la caméra quand aucune connexion pair n'existe encore, même garde qu'`enableVideo`).
  - `VideoCallInterface.test.tsx` — les tests bas niveau qui simulaient `peerConnections`/`getUserMedia`
    directement (désormais la responsabilité de la couche service/hook, déjà couverte ci-dessus) sont
    réécrits pour mocker `webrtc.switchCamera` : dérivation du `facingMode` cible (user→environment et
    inverse), toast succès/échec, garde de non-réentrance (second clic avant résolution), et les 4 tests de
    Vague 92 (exclusion mutuelle camera-switch ↔ toggle manuel/contrôleur adaptatif) portés sur les mêmes
    assertions au niveau `webrtc.switchCamera` plutôt que `getUserMedia`.
  RED confirmé à chaque couche par exécution (`TypeError: ... is not a function` avant l'implémentation),
  GREEN après.
- **Vérification** : sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-
  degradation|audio-effect` — **49 suites / 559 tests verts** (+5 net vs. la Vague 94), plus
  `webrtc-service.test.ts`/`webrtc-service.coverage.test.ts` (hors du sweep par nom de fichier) — **180/180
  verts**. Aucune régression. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun
  install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client && bun run
  build` sans erreur. `npx tsc --noEmit` sur `apps/web` : **1190 erreurs avant et après le diff**
  (`git stash`/`stash pop`, comparaison directe — le chiffre diffère de la baseline 1657 des vagues
  précédentes, delta pré-existant sans rapport avec ce diff, non investigué ce cycle), zéro nouvelle
  erreur, zéro sur les trois fichiers de production touchés (`webrtc-service.ts`, `use-webrtc-p2p.ts` :
  aucune ; `VideoCallInterface.tsx` : les erreurs présentes y préexistaient déjà, même nombre avant/après).
  `next lint` : même échec sandbox-only de config ESLint v9 circulaire documenté aux vagues précédentes
  (65-94), non bloquant, indépendant de ce diff.
- **Reste ouvert** (reconduit, aucun nouveau candidat web/gateway à haute confiance identifié ce cycle) :
  dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
  `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ;
  `removeParticipant()` ne nettoie pas `connectedPeersRef`/`stalledPeersRef` (Vague 91, réévaluée non-
  régression) ; toolchains iOS/Android toujours hors d'atteinte dans ce sandbox ; delta de comptage
  `tsc --noEmit` (1190 vs. 1657 legacy) à investiguer si un futur cycle a besoin d'un chiffre de référence
  fiable.

## Vague 96 — `addLocalMedia` attached every new peer's outbound video directly from the shared stream, aliasing sender.track objects across independent peer connections (2026-08-10)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` n'a remonté aucune PR ouverte de cette routine — la Vague 95 (#2784) était déjà mergée
sur `main`. `HEAD == origin/main` au démarrage. Toolchains iOS (`xcodebuild`/`swift`) et Android (gradle
présent, aucun SDK) toujours hors d'atteinte. Audit dédié (agent Explore, lecture seule, périmètre
web+gateway, mandaté avec la liste complète des Vagues 57-95 pour éviter toute redite) a remonté un
candidat unique, vérifié ensuite ligne à ligne directement dans le code courant plutôt que pris tel quel.

- **Root cause confirmée par lecture directe** : `addLocalMedia()` (`webrtc-service.ts`) — appelée une
  fois par NOUVELLE connexion pair (`createOffer`/`handleOffer`, `use-webrtc-p2p.ts`) — attachait
  directement `stream.getVideoTracks()[0]` au transceiver vidéo du pair, sans jamais cloner. `stream` est
  la MÊME `MediaStream` partagée par TOUTES les instances `WebRTCService` d'un appel de groupe (documenté
  explicitement dans `removeParticipant()` : « it's the same MediaStream reference every other still-
  connected participant's service is sending »). Dès qu'un appel de groupe a déjà de la vidéo active sur
  au moins un pair, `getVideoTracks()[0]` sur ce flux partagé N'EST PAS un master neutre : c'est déjà
  l'objet `sender.track` **vivant** d'un pair déjà connecté — `enableVideo()`/`switchCamera()`
  (`use-webrtc-p2p.ts`, Vague 95) donnent cet objet littéral au pair « index 0 » de leur instantané courant.
  Un NOUVEAU pair rejoignant pendant cette fenêtre (`addLocalMedia` appelé pour lui) hérite donc du même
  objet `MediaStreamTrack`, sans le savoir — deux `RTCRtpSender` indépendants pointant sur UN SEUL objet.
  N'importe quel événement ordinaire qui arrête ensuite ce track côté pair « index 0 » —
  `switchVideoSendTrack()` (flip caméra) ou `disableVideoSend()` (couper la caméra), toutes deux lisent
  `sender.track` en vérité-terrain et l'arrêtent sans condition — gèle silencieusement la vidéo sortante du
  nouveau pair aussi, sans aucun chemin de réparation avant le PROCHAIN `switchCamera()`/`enableVideo()` où
  ce pair est enfin inclus dans l'instantané (s'il l'est un jour). Second défaut, indépendant de toute
  fenêtre de course, découvert en traçant le premier : `addLocalMedia` ne renseignait JAMAIS
  `exclusiveVideoTrack` (champ dont le commentaire affirmait déjà, à tort, que le track initial de
  `addLocalMedia` « CAN be the same literal object across every peer's sender » — un compromis assumé mais
  jamais bouclé). Résultat : le track vidéo qu'UN SEUL pair possède réellement (cas courant : pas de course,
  jamais partagé avec personne) n'était jamais libéré par `close({ stopLocalTracks: false })` quand ce pair
  quittait seul un appel de groupe encore actif — `else if (this.exclusiveVideoTrack)` restait `null`, fuite
  déterministe d'une capture caméra vivante à chaque départ scoped d'un pair dont la vidéo avait démarré via
  `addLocalMedia` (tout appel qui démarre directement en vidéo, pas seulement les upgrades audio→vidéo).
- **Fix** : `addLocalMedia` clone désormais TOUJOURS `stream.getVideoTracks()[0]` avant de l'attacher
  (`sourceVideoTrack.clone()`), l'ajoute au `localStream` partagé (`this.localStream.addTrack`, même
  bookkeeping que `enableVideoSend`/`switchVideoSendTrack`), et l'enregistre comme `exclusiveVideoTrack` —
  étendant à ce site le seul et même invariant que tous les autres points d'attache respectent déjà : chaque
  instance `WebRTCService` possède un objet track exclusif, jamais partagé, toujours correctement libéré par
  son propre `close()`/`disableVideoSend()`/`switchVideoSendTrack()`. Élimine la classe de bug entièrement
  (aucun sender ne référence plus jamais l'objet littéral d'un autre) plutôt que de rétrécir la fenêtre de
  course. Un seul fichier de production modifié : `webrtc-service.ts` (+31/-8, dont commentaires).
- **Tests** (TDD, RED confirmé par `git stash` du seul diff source avant implémentation — les 3 tests neufs
  échouaient précisément comme attendu, aucune régression annexe) : nouveau describe
  `addLocalMedia — outgoing video track ownership (Vague 96)` (`webrtc-service.test.ts`) — (1) clone le
  track source au lieu de l'attacher directement (`.clone()` appelé une fois, le track attaché au
  transceiver EST le résultat du clone, ajouté au `localStream`) ; (2) `close({ stopLocalTracks: false })`
  libère le clone de CETTE instance, jamais le track source partagé ; (3) deux instances `WebRTCService`
  attachées au MÊME flux partagé reçoivent des objets track indépendants — l'une quittant l'appel de groupe
  n'arrête jamais la vidéo de l'autre. Les deux fabriques de mocks `makeTrack` (`webrtc-service.test.ts` et
  `webrtc-service.coverage.test.ts`, dupliquées, aucune préexistante n'exposait `.clone()`) gagnent un `id`
  unique et un `clone: jest.fn(() => makeTrack(kind))` — chaque appel produit un objet frais et distinct,
  fidèle à la sémantique réelle de `MediaStreamTrack.clone()`.
- **Vérification** : `webrtc-service.test.ts` + `webrtc-service.coverage.test.ts` — **183/183 verts**
  (180 préexistants + 3 neufs). Sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|
  adaptive-degradation|audio-effect|webrtc-service` — **51 suites / 742 tests verts**, aucune régression.
  Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts`
  (racine + `apps/web`), puis `packages/shared && npx prisma generate --generator client && bun run build`
  sans erreur. `npx tsc --noEmit` sur `apps/web` : **1657 erreurs avant et après le diff** (`git stash`/
  `stash pop`, diff ligne à ligne des deux sorties complètes) — décalages de NUMÉRO DE LIGNE uniquement
  (mes lignes ajoutées poussent les erreurs préexistantes plus bas dans le même fichier de test), aucun
  message d'erreur nouveau, zéro sur `webrtc-service.ts` lui-même. Diff strictement scopé à 3 fichiers web
  (aucun fichier gateway touché) — suite gateway non rejouée ce cycle, hors du diff.
- **Reste ouvert** (reconduit, aucun nouveau candidat web/gateway à haute confiance identifié ce cycle) :
  dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor CallEventQueue` non implémenté ;
  busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
  `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ;
  `removeParticipant()` ne nettoie pas `connectedPeersRef`/`stalledPeersRef` (Vague 91, réévaluée non-
  régression) ; toolchains iOS/Android toujours hors d'atteinte dans ce sandbox ; delta de comptage
  `tsc --noEmit` (1190 vs. 1657 legacy, Vague 95) toujours non investigué.

## Vague 97 — `enableVideo()`/`switchCamera()` snapshotted the connected-peer list BEFORE awaiting `getUserMedia()`, silently excluding any peer that joined during the camera-permission prompt (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` n'a remonté aucune PR ouverte de cette routine — la Vague 96 (#2790,
`addLocalMedia` clone ownership) était déjà mergée sur `main`. Un premier `git status` a montré la
branche locale en retard d'un commit sur `origin/main` (le fetch initial du sandbox précédait le merge
de la Vague 96 de quelques minutes) — `git fetch origin main` + `git reset --hard origin/main` avant tout
travail, aucun commit local antérieur perdu. Aucune section « Vague 96 » n'existait encore dans ce
fichier au moment du premier `grep` (juste avant le fetch) : fausse alerte, le fetch l'a fait apparaître.
Toolchains iOS (`xcodebuild`/`swift`) et Android (gradle présent, aucun SDK) toujours hors d'atteinte.
Audit dédié (lecture directe de `webrtc-service.ts`, `use-webrtc-p2p.ts`, `call-store.ts`, mandaté avec
la liste complète des Vagues 57-96 pour éviter toute redite) a remonté un candidat unique.

- **Root cause confirmée par lecture directe** (`apps/web/hooks/use-webrtc-p2p.ts`) : `enableVideo()`
  (audio→vidéo mid-call) et `switchCamera()` (flip caméra, Vague 95) partagent le même schéma —
  `const services = Array.from(webrtcServicesRef.current.values())` capturé **AVANT**
  `await navigator.mediaDevices.getUserMedia(...)`, puis réutilisé APRÈS pour distribuer la piste
  (`Promise.all(services.map(...))`). `getUserMedia()` déclenche l'invite de permission caméra du
  navigateur — un délai à échelle humaine, potentiellement plusieurs secondes, pas un timing adverse.
  Un pair rejoignant l'appel de groupe PENDANT cette fenêtre (`createOffer`/`handleOffer`, qui alimente
  `webrtcServicesRef.current` de façon quasi synchrone) n'apparaît jamais dans le tableau `services` déjà
  figé : `enableVideoSend`/`switchVideoSendTrack` ne sont jamais appelés pour lui. Pour `enableVideo()`,
  la conséquence est totale et permanente — le transceiver vidéo de ce pair reste `recvonly` pour le
  reste de l'appel, aucun évènement ultérieur ne re-déclenchant l'envoi, alors que
  `controls.videoEnabled` (UI) et les AUTRES pairs voient bien la vidéo active : désync silencieux entre
  ce que l'utilisateur croit envoyer et ce que ce pair reçoit réellement. Séquence atteignable sans
  timing adverse : appel de groupe déjà actif (audio), l'utilisateur local active sa caméra (invite de
  permission affichée) pendant qu'un troisième participant rejoint la conversation — un enchaînement
  ordinaire sur une conversation de groupe active. `switchCamera()` partage le même défaut structurel
  (impact moindre : le pair exclu continue de recevoir l'ANCIENNE caméra plutôt qu'aucune vidéo, mais
  reste corrigé pour cohérence — même schéma dupliqué ligne pour ligne, précédent direct de la Vague 92
  qui avait déjà unifié deux handlers partageant un seul défaut).
- **Fix** : dans les deux fonctions, le tableau `services` est désormais lu à DEUX reprises — une
  première fois (juste `.size === 0`, sans matérialiser le tableau) AVANT `getUserMedia()` pour échouer
  vite sans déclencher l'invite caméra quand personne n'est encore connecté (comportement Vague 86
  préservé, testé), puis une seconde fois juste APRÈS que `getUserMedia()` se résout, immédiatement avant
  la distribution de la piste — capturant ainsi tout pair arrivé entre-temps. Edge case symétrique
  couvert : si le second relevé revient vide (tous les pairs sont partis pendant l'attente), la caméra
  tout juste acquise est libérée (`cam.getTracks().forEach(t => t.stop())`) avant de rejeter avec
  `NO_PEER_CONNECTION` — plutôt que de laisser une capture caméra vivante et non rattachée fuir en
  silence, même philosophie anti-fuite que les Vagues 85/93/94/95/96. Un seul fichier de production
  modifié (`use-webrtc-p2p.ts`, +33/-4 lignes dont commentaires).
- **Tests** (TDD, RED confirmé par exécution avant fix) : 3 nouveaux tests dans `use-webrtc-p2p.test.tsx`
  — (1) `enableVideo` : un second pair rejoint (`createOffer`) pendant qu'une promesse `getUserMedia`
  contrôlée manuellement reste en attente ; une fois résolue, `enableVideoSend` est appelé pour les DEUX
  pairs (le premier avec la piste littérale, le second avec un `.clone()`) ; (2) `enableVideo` : tous les
  pairs partent (`removeParticipant`) pendant la même attente ; une fois résolue, la piste caméra acquise
  voit `stop()` appelé et la promesse rejette, `enableVideoSend` jamais appelé ; (3) `switchCamera` :
  même scénario que (1) transposé à `switchVideoSendTrack`. Les 3 RED confirmés par exécution
  (`bunx jest` — 2 échouaient sur le compte d'appels attendu, 1 sur une promesse résolue au lieu de
  rejetée) avant le fix, GREEN après (49/49 tests du fichier, +3 net).
- **Vérification** : `use-webrtc-p2p.test.tsx` (49 tests, +3 net) vert. Sweep complet
  `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-degradation|audio-effect|webrtc-service`
  — **51 suites / 745 tests verts** (+3 net vs. la Vague 96), aucune régression. Prérequis CLAUDE.md
  rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts` (racine), bun
  1.3.11 local vs. 1.3.14 attendu par CI (écart déjà documenté, non résolu ce cycle). `npx tsc --noEmit`
  sur `apps/web` : **1190 erreurs avant et après le diff** (`git stash`/`stash pop`, comparaison
  directe — seul le bruit npm notice différait entre les deux sorties), zéro nouvelle erreur, zéro sur
  `use-webrtc-p2p.ts`. Diff strictement scopé à 2 fichiers web (aucun fichier gateway touché) — suite
  gateway non rejouée ce cycle, hors du diff.
- **Reste ouvert** (reconduit, aucun nouveau candidat web/gateway à haute confiance identifié en dehors
  de celui traité ce cycle) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR `actor
  CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
  (Vague 84, nécessite confirmation on-device) ; `removeParticipant()` ne nettoie pas
  `connectedPeersRef`/`stalledPeersRef` (Vague 91, réévaluée non-régression) ; toolchains iOS/Android
  toujours hors d'atteinte dans ce sandbox ; delta de comptage `tsc --noEmit` (1190 vs. 1657 legacy,
  Vague 95) toujours non investigué.

## Vague 98 — `useCallAnalyticsReporter`'s reconnection counter could never increment: it compared a real `RTCPeerConnectionState` against the unreachable literal `'reconnecting'` (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
`list_pull_requests` a remonté une PR ouverte de cette routine (#2796, Vague 97 — snapshot des pairs
avant `getUserMedia()`), CI 15/15 verte contre un `main` vieux de plusieurs commits ; rebasée localement
sur `origin/main` (merge sans conflit), sweep complet + `tsc --noEmit` rejoués (51 suites/745 tests,
1657 erreurs pré-existantes identiques avant/après), poussée, CI verte à nouveau (15/15), mergée. Audit
dédié (agent Explore, lecture seule, périmètre web+gateway, mandaté avec la liste complète des Vagues
9-97 pour éviter toute redite) a remonté un candidat unique, vérifié ensuite ligne à ligne directement
dans le code courant plutôt que pris tel quel.

- **Root cause confirmée par lecture directe** : `useCallAnalyticsReporter` (`use-call-analytics-reporter.ts`)
  détectait un stall mid-call avec `connectionState === 'reconnecting' && prevStateRef.current !== 'reconnecting'`.
  Son unique appelant (`VideoCallInterface.tsx`) lui passe le `connectionState` renvoyé par `useWebRTCP2P()`
  (`use-webrtc-p2p.ts`), typé `RTCPeerConnectionState` et alimenté EXCLUSIVEMENT par
  `RTCPeerConnection.connectionState` natif (`webrtc-service.ts`, `onconnectionstatechange`). Le type
  `RTCPeerConnectionState` du spec W3C vaut `'closed' | 'connected' | 'connecting' | 'disconnected' |
  'failed' | 'new'` — **`'reconnecting'` n'en fait pas partie**, et un grep complet du dépôt confirme
  qu'aucun code n'assigne jamais ce littéral à cette variable précise. `markReconnecting` était donc du
  code mort : sur un blip réseau ordinaire (WiFi↔cellulaire, micro-coupure) — exactement le cas que le
  grace timer ICE et `restartIce()` de `webrtc-service.ts` existent pour absorber, et que
  `use-webrtc-p2p.ts` suit déjà en interne via `stalledPeersRef` pour émettre `call:reconnecting`/
  `call:reconnected` au serveur — le check `=== 'reconnecting'` ne matchait jamais. Le payload
  `call:analytics` envoyé à la fin de CHAQUE appel web rapportait `reconnectionCount: 0`, y compris pour
  des appels ayant réellement stall/récupéré, aveuglant silencieusement le dashboard de fiabilité sur
  l'un de ses deux indicateurs phares (l'autre étant la distribution de qualité). Effet de bord découvert
  en traçant le signal réel : le test existant du fichier (`use-call-analytics-reporter.test.tsx`)
  ré-armait artificiellement `connectionState: 'reconnecting'` — une forme que la production ne produit
  JAMAIS — même défaut de fixture que la Leçon 95 (`lessons.md`) : la suite était verte et décrivait
  fidèlement un monde où le défaut n'existe pas.
- **Fix** : `use-webrtc-p2p.ts` expose désormais un état réel `isReconnecting` (nouveau `useState`),
  dérivé du même `stalledPeersRef` qui pilote déjà `call:reconnecting`/`call:reconnected` — `true` posé au
  moment où un pair rejoint `stalledPeersRef` (stall mid-call détecté), `false` reposé quand
  `stalledPeersRef` redevient vide (tous les pairs stallés ont récupéré) ou à `cleanup()`. Aucune
  renégociation ni changement de la logique d'émission socket existante — uniquement l'ajout du miroir
  d'état React manquant sur un signal déjà calculé. `VideoCallInterface.tsx` relaie `isReconnecting` à
  `useCallAnalyticsReporter`, qui compare désormais `isReconnecting` (transition false→true) au lieu de
  `connectionState === 'reconnecting'` pour appeler `markReconnecting` — `connectionState === 'connected'`
  reste inchangé pour `markConnected` (cette valeur-là EST un `RTCPeerConnectionState` réel). Trois
  fichiers de production modifiés : `use-webrtc-p2p.ts` (+20/-8), `use-call-analytics-reporter.ts`
  (+14/-6), `VideoCallInterface.tsx` (+2/-2, fils de props uniquement).
- **Tests** (TDD, RED confirmé avant fix — les 2 assertions `isReconnecting` échouaient avec `undefined`
  reçu, aucune régression annexe) :
  - `use-webrtc-p2p.test.tsx` — 2 nouveaux tests dans le describe `TURN credential refresh` existant
    (`isReconnecting` bascule à `true` pendant un stall mid-call puis `false` à la reconnexion ; reste
    `false` pour un flottement ICE pré-connexion, même garde que les tests `call:reconnecting` voisins).
    `driveIce` (helper partagé) retourne désormais `result` pour permettre ces assertions d'état sans
    dupliquer le montage.
  - `use-call-analytics-reporter.test.tsx` — fixture `baseProps` porte désormais `isReconnecting: false`
    par défaut ; le test « accumulates a reconnection » réécrit pour piloter `isReconnecting` (transitions
    booléennes réelles) au lieu du littéral `connectionState: 'reconnecting'` inatteignable en production
    (corrige le défaut de fixture de type Leçon 95 découvert au passage) ; nouveau test couvrant la
    non-double-comptabilisation quand `isReconnecting` reste `true` sur plusieurs re-renders consécutifs.
  GREEN après implémentation.
- **Vérification** : `use-webrtc-p2p.test.tsx` + `use-call-analytics-reporter.test.tsx` — **58/58 verts**
  (55 préexistants + 3 neufs). Sweep complet `video-call|use-webrtc|use-call|orchestrator|call-store|
  adaptive-degradation|audio-effect|webrtc-service` — **51 suites / 748 tests verts** (+3 net vs. Vague
  97), aucune régression. Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun
  install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client && bun run
  build` sans erreur. `npx tsc --noEmit` sur `apps/web` : **1657 erreurs avant et après le diff** (`git
  stash`/`stash pop`, comparaison ligne à ligne des deux sorties complètes sur les 3 fichiers touchés) —
  décalages de NUMÉRO DE LIGNE uniquement sur `use-call-analytics-reporter.ts`/`VideoCallInterface.tsx`
  (erreurs préexistantes sans rapport : `CALL_ANALYTICS` absent du type `CLIENT_EVENTS` généré dans ce
  sandbox, `TS2571`/`TS18046` sur des sites `unknown` non liés à ce diff), zéro nouvelle erreur, zéro sur
  `use-webrtc-p2p.ts` lui-même. Diff strictement scopé à `apps/web` (aucun fichier gateway touché) — suite
  gateway non rejouée ce cycle, hors du diff.
- **Reste ouvert** (reconduit, aucun nouveau candidat web/gateway à haute confiance identifié ce cycle
  hors celui traité) : dead code / god-object `CallManager.swift` iOS (~5770 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague
  84, nécessite confirmation on-device) ; `removeParticipant()` ne nettoie pas
  `connectedPeersRef`/`stalledPeersRef` (Vague 91, réévaluée non-régression) ; `call-store.ts`'s
  `setReconnecting(attempt)`/`isReconnecting` reste un signal mort, jamais invoqué par le flux d'appel
  (constaté pendant cet audit, hors périmètre — surface store distincte de celle corrigée ici) ;
  toolchains iOS/Android toujours hors d'atteinte dans ce sandbox ; `CALL_ANALYTICS` absent du type
  généré `CLIENT_EVENTS` dans ce sandbox (préexistant, cause probable : génération de types partagés
  obsolète localement, non investigué).

## Vague 99 — `emitCallReject` avait un fire-and-forget sans ACK/reconciliation là où `emitCallEnd` a les deux, laissant un refus perdu en vol résoudre `missed` au lieu de `rejected` (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling, cible iOS explicite
cette fois — CallKit/PushKit/WebRTC), nouvelle session. Aucune PR ouverte sur cette branche, aucun
doublon avec le backlog `iOS/Android` déjà listé en fin de Vague 98. Audit dédié (agent Explore, lecture
seule, périmètre `apps/ios` calling stack complet — `CallManager.swift` 5865 lignes, PiP, CallKit, PushKit,
AVAudioSession interruption/route-change, toutes les Views d'appel) mandaté pour ne pas redire les
défauts déjà fermés (263 commits `fix(ios/calls)` antérieurs). Verdict de l'audit : codebase inhabituellement
mature et déjà auto-auditée — quasiment tous les motifs classiques (retain cycles, races CallKit/PushKit,
interruption/route-change) portent déjà un fix daté et un test de garde. Le seul écart net trouvé est une
**asymétrie de fiabilité de signalisation** reproduisant, sur `call:reject`, une classe de bug déjà fermée
deux fois pour des signaux voisins (`offer`, `call:end`) mais jamais étendue au refus.

- **Root cause confirmée par lecture directe** : `emitCallEndReliably` (le raccroché normal) a DEUX
  paliers de protection contre la perte de `call:end` — bâtis spécifiquement parce qu'un hang-up perdu
  laisse le PAIR zombie (« Chaos-test prod 2026-07-02, EXIGENCE №1 ») : `emitCallEndWithAck` (ACK 3s) +
  fallback fire-and-forget si l'ACK échoue, **et** armement de `pendingEndReconciliationCallId` rejoué au
  prochain `connectionState == .connected`. `emitCallReject` (le refus, même risque « décliné pendant un
  réseau instable ») n'implémentait QUE la moitié socket-DÉCONNECTÉ de cette même protection
  (`guard MessageSocketManager.shared.isConnected`) : si le socket paraissait connecté à l'instant du
  refus mais que le seul `socket?.emit("call:end", [...])` sous-jacent (`MessageSocketManager.emitCallReject`,
  fire-and-forget, aucun ACK) se perdait en vol — un blip qui s'auto-répare avant que `connectionState`
  n'observe la coupure — rien ne le rattrapait. Le déclinant avait déjà fermé localement
  (`endCallInternal(reason: .rejected)`), l'appelant sonnait alors jusqu'au timeout
  (`outgoingRingTimeoutSeconds` 45s ou le reaper gateway ~60s), et l'appel se résolvait **`missed`, pas
  `declined`** — exactement le mislabel que l'arc reject 2026-07-12 (`d371f3505`, `f67c39ac0`) fermait déjà
  sur tous les AUTRES chemins de refus. Le propre test de la codebase pour le signal jumeau (`offer`,
  `test_emitCallOffer_usesAtLeastOnceWithAck_notFireAndForget`) rend la sévérité explicite dans son
  commentaire : « the offer is the single most critical signal ». Aucun `emitCallRejectWithAck` n'existait
  nulle part dans le SDK (seuls `emitCallSignalWithAck`/`emitCallEndWithAck` existent).
- **Fix** : `MessageSocketManager.emitCallRejectWithAck(callId:) async -> Bool` ajouté au SDK, réplique
  exacte de `emitCallEndWithAck` avec `reason: "rejected"` dans le payload (ACK 3s, même event
  `call:end` — le handler gateway est déjà générique sur ce champ, c'est ce que `emitCallReject` fire-
  and-forget prouve depuis l'arc 2026-07-12). `CallManager.emitCallReject` (le helper privé) réplique
  exactement la forme de `emitCallEndReliably` : `Task { [weak self] in }` attend l'ACK, et sur échec
  ré-émet le fallback fire-and-forget **et** arme `pendingEndReconciliationCallId`/`Reason = "rejected"`
  — la plomberie de réconciliation existait déjà et gère déjà le rejeu d'un refus différé (le guard
  socket-down partage le même state). Seule la fenêtre « connecté mais jamais livré » restait ouverte.
  Non ajouté au protocole `MessageSocketProviding` ni aux deux Mocks — `emitCallReject` lui-même n'y
  est pas non plus (CallManager appelle systématiquement le singleton concret `MessageSocketManager.shared`,
  jamais une dépendance typée protocole, pour toute cette famille de refus/fin d'appel).
- **Tests** (TDD, RED confirmé avant fix — les 4 assertions échouaient : pas de `emitCallRejectWithAck`
  dans le corps, pas de `if !acked`, et le compte de `pendingEndReconciliationReason = "rejected"` valait
  1 au lieu de 2) :
  - `CallManagerTests.swift` — nouveau `test_emitCallReject_usesAtLeastOnceWithAck_notFireAndForget` dans
    `RejectDeferredReconciliationTests`, même idiome source-inspection que
    `test_emitCallOffer_usesAtLeastOnceWithAck_notFireAndForget` (le fichier n'a pas de mock socket
    injectable pour `CallManager` — toute la suite reject/end utilise ce patron). Vérifie : présence de
    `emitCallRejectWithAck`, branche `if !acked`, fallback fire-and-forget conservé, et **double**
    armement de `pendingEndReconciliationReason = "rejected"` (guard socket-down + fallback ACK-échoué).
  - Tests existants relus pour non-régression : `test_emitCallReject_defersWhenSocketDown` (le guard
    socket-down est inchangé, littéralement la même sous-chaîne) et `test_reconnectReplay_preservesRejectedReason`
    (rejeu inchangé) — toujours verts par lecture, aucune modification requise.
  - Pas de test SDK dédié pour `emitCallRejectWithAck` — même précédent que `emitCallEndWithAck`/
    `emitCallSignalWithAck`, ni l'un ni l'autre n'a de test unitaire direct (wiring `emitWithAck` trop
    fin pour être testé sans un vrai client Socket.IO ; couvert indirectement via les tests source-
    inspection côté `CallManager`).
- **Vérification** : build/tests iOS **non exécutables dans ce sandbox** (conteneur Linux, aucun Xcode/
  xcodebuild/simulateur — cf. `apps/ios/CLAUDE.md`, la CI « iOS Tests » tourne sur runner macOS). Diff
  relu ligne à ligne contre les deux réplicas existants (`emitCallEndWithAck`/`emitCallEndReliably`) pour
  garantir une forme structurellement identique ; comptage d'accolades avant/après sur les 3 fichiers
  touchés pour exclure toute erreur de syntaxe grossière. Vérification réelle déléguée à la CI GitHub
  Actions (macOS) au push — PR ouverte et suivie jusqu'au vert avant merge.
- **Reste ouvert** (reconduit, rien de plus grave trouvé ce cycle côté iOS) : dead code / god-object
  `CallManager.swift` (~5880 lignes après ce fix) ; 3 `Task { @MainActor in }` imbriqués sans `[weak self]`
  interne (`ThermalStateMonitor.swift:31-33`, `CallManager.swift:1114`, `CallManager.swift:1659`) — écart
  de convention réel (cf. `apps/ios/CLAUDE.md` § Common Retain Cycle Traps) mais inerte en pratique
  (singletons app-lifetime) ; candidat trivial en piggyback d'un prochain cycle iOS, pas assez pour un
  cycle dédié seul. ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only
  (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
  `supportsHolding = false` (Vague 84, nécessite confirmation on-device) ; `removeParticipant()` ne
  nettoie pas `connectedPeersRef`/`stalledPeersRef` web (Vague 91, réévaluée non-régression) ;
  `call-store.ts`'s `setReconnecting(attempt)` reste un signal mort web (Vague 98) ; toolchains
  iOS/Android toujours hors d'atteinte dans ce sandbox.

## Vague 100 — les 3 `Task { @MainActor in }` imbriqués sans `[weak self]` reconduits par la Vague 99 comme « candidat trivial en piggyback » (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling, cible iOS explicite
cette fois — CallKit/PushKit/WebRTC), nouvelle session. Aucune PR ouverte sur cette branche
(`claude/upbeat-dirac-3kjztn`, vierge). Base explicite sur le développement précédent de cette routine :
la Vague 99 (mergée sur `main` en `9477dd74f` avant le début de cette session) reconduisait ces 3 sites
nommément comme le candidat le plus mûr pour le prochain cycle. Un audit fraîchement mandaté (agent
Explore, lecture seule, web + gateway — hors périmètre déjà couvert par la liste de reconduits de la
Vague 99) tourne en parallèle pour ne pas se limiter au seul piggyback si un défaut plus substantiel
émerge ce cycle ; ce commit couvre le piggyback pendant que l'audit se termine.

- **Root cause confirmée par lecture directe** : les 3 sites (`ThermalStateMonitor.swift:32`,
  `CallManager.swift:1114`, `CallManager.swift:1659`) suivent tous le même patron — une closure
  externe capture déjà `[weak self]` (respectivement l'observateur `NotificationCenter`, la completion
  `callController.request`, la completion `reportNewIncomingCall`), mais le `Task { @MainActor in ... }`
  imbriqué qu'elle spawn en cas d'échec/notification ne répète PAS `[weak self]`. Un `Task` non structuré
  capture ce qu'il référence indépendamment de la liste de capture de sa closure englobante — omettre
  `[weak self]` y recapture donc `self` FORTEMENT pour la durée du Task, exactement le piège que
  `apps/ios/CLAUDE.md` § « Common Retain Cycle Traps » documente pour les closures `DispatchQueue`/`Task`,
  et que `P2PWebRTCClientConcurrencySourceTests`/`CallManagerAudioSessionTests` gardent déjà ailleurs dans
  ce même fichier pour des Tasks non structurés analogues. Impact pratique confirmé inerte par la Vague 99
  (les 3 objets sont des singletons/services à durée de vie app, et les Tasks sont courts et one-shot) —
  corrigé ici pour la cohérence de convention et pour fermer l'écart avant qu'un futur site structurellement
  similaire (copié-collé) ne le reproduise dans un contexte où il ne serait plus inerte (ex. un futur objet
  à durée de vie plus courte que la fenêtre du Task).
- **Fix** : `[weak self]` ajouté aux 3 `Task { @MainActor in ... }` imbriqués. Aucun changement de
  comportement runtime attendu (les 3 chemins restent joignables/fonctionnels via `self?.` déjà présent) —
  strictement une correction de convention de capture.
- **Tests** (TDD, RED confirmé par lecture — les 3 assertions `body.contains(...)`/`source.contains(...)`
  cherchent la sous-chaîne exacte `Task { @MainActor [weak self] in ... }`, absente avant le fix) :
  - `CallManagerTests.swift` — `test_startCall_callKitFailureTask_capturesSelfWeakly` (source-inspection,
    même idiome `sourceText()`/`body(of:in:)` que les tests `reportNewIncomingCall` voisins) et
    `test_handleIncomingCallNotification_callKitFailureTask_capturesSelfWeakly` (miroir pour l'autre site).
  - `ThermalStateMonitorTests.swift` — `test_startMonitoring_notificationTask_capturesSelfWeakly`, nouveau
    guard source-level (le fichier n'avait pas encore de lecture de source ; ajouté sur le même modèle que
    `P2PWebRTCClientConcurrencySourceTests`, avec la même justification « non comportementalement
    exerçable sans driver une vraie notification thermique sur une queue de fond »).
  GREEN après implémentation (relecture ligne à ligne).
- **Vérification** : build/tests iOS **non exécutables dans ce sandbox** (conteneur Linux, aucun Xcode —
  cf. `apps/ios/CLAUDE.md`). Diff relu ligne à ligne (3 lignes modifiées, changement `[weak self]` seul) ;
  comptage d'accolades avant/après sur les 4 fichiers touchés (2 fichiers prod + 2 fichiers de test) pour
  exclure toute erreur de syntaxe grossière — delta identique avant/après sur chaque fichier (les tests
  ajoutés sont eux-mêmes équilibrés). Vérification réelle déléguée à la CI GitHub Actions (macOS) au
  push — PR ouverte et suivie jusqu'au vert avant merge, comme la Vague 99.
- **Reste ouvert** : dead code / god-object `CallManager.swift` (~5880 lignes, inchangé) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
  trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
  (Vague 84, nécessite confirmation on-device) ; `removeParticipant()` web (Vague 91, non-régression) ;
  toolchains iOS/Android toujours hors d'atteinte dans ce sandbox. `call-store.ts`'s
  `setReconnecting(attempt)` (Vague 98) : **confirmé mort et traité en Vague 101 ci-dessous**, retiré de
  cette liste.

## Vague 101 — `handleCallEnded` dismissait une bannière d'appel entrant SANS RAPPORT quand `currentCall` n'était pas encore posé (2026-08-11)

Point d'entrée : audit dédié (agent Explore, lecture seule, `apps/web` calling + `services/gateway`
`CallEventsHandler.ts`/`CallService.ts`/`CallCleanupService.ts`/`TURNCredentialService.ts`) mandaté en
parallèle de la Vague 100 pour ne pas se limiter au seul piggyback iOS si ce cycle offrait un défaut plus
substantiel — exclusion explicite de toute la liste des trouvailles déjà closes des Vagues 1-99. Deux
livrables : un bug réel neuf et la confirmation d'une piste de dead-code déjà suspectée (Vague 98).

- **Root cause confirmée par lecture directe** (`CallManager.tsx`, `handleCallEnded`, ~ligne 464-547) :
  le garde anti-callId-obsolète (Vague ~ audit 2026-08-04, `CallManager.callEndedStaleGuard.test.tsx`)
  ne compare `event.callId` qu'à `currentCall` (le store — l'appel ACCEPTÉ/actif). Avant que l'utilisateur
  n'ait répondu à quoi que ce soit, `currentCall` vaut `null` — le garde `trackedCall && trackedCall.id
  !== event.callId` court-circuite alors à `false` et la fonction tombe dans le `reset()` +
  `setIncomingCall(null)` INCONDITIONNELS, sans jamais comparer à `incomingCall` (état local séparé, la
  bannière encore SONNANTE, pas encore acceptée). Scénario concret : l'utilisateur A voit sonner un appel
  entrant de Bob (`incomingCall` = appel X, `currentCall` toujours `null` car A n'a pas encore tapé
  Accepter). Un AUTRE appel dont A est simple membre de conversation (jamais participant) se termine
  ailleurs — le fan-out `call:ended` du gateway diffuse délibérément à TOUS les membres de la conversation,
  pas seulement aux participants de l'appel (`callEndedFanout.ts`'s `resolveCallEndedRooms` — c'est ce qui
  permet à un callee encore sonnant, jamais entré dans aucune room, d'apprendre qu'un appel s'est terminé).
  Ce broadcast atteint le socket de A pour l'appel Y bien que A n'ait jamais été proche de Y.
  `handleCallEnded(eventPourY)` tourne, `trackedCall` est `null` (A n'a rien accepté), le garde est
  sauté, et `setIncomingCall(null)` fait taire silencieusement l'appel X de Bob, TOUJOURS activement
  sonnant — aucun toast, aucune trace visible, l'appel de Bob s'arrête simplement de s'afficher et sonne
  dans le vide jusqu'à résolution `missed`, sans que A ne l'ait jamais vu ni refusé.
- **Fix** : garde étendu au cas pré-acceptation, miroir de `handleAnsweredElsewhere` qui se scope déjà à
  `incomingCall?.callId === event.callId` — `if (!trackedCall && incomingCall && incomingCall.callId !==
  event.callId) { return; }`, posé juste après le garde `trackedCall` existant. `incomingCall` ajouté au
  tableau de dépendances du `useCallback`.
- **Tests** (TDD, RED confirmé en exécutant réellement la suite AVANT le fix — `TestingLibraryElementError:
  Unable to find an element by: [data-testid="incoming-call-card"]`, la bannière disparaissait bien) :
  nouveau test dans `CallManager.callEndedStaleGuard.test.tsx` — appel entrant sonnant (`currentCall`
  encore `null`) + `call:ended` pour un callId DIFFÉRENT non accepté → la bannière doit survivre. Le mock
  `CallNotification` du fichier (`() => null`) a dû être enrichi d'un `data-testid="incoming-call-card"`
  (aligné sur le mock de `CallManager.answeredElsewhere.test.tsx`, qui teste exactement la même classe de
  bug pour `call:already-answered`) pour pouvoir observer la présence/absence de la bannière — les 4 tests
  existants du fichier (assertions sur le store, pas le DOM) restent inchangés et verts.
- **Vérification** (sandbox Linux, suite web réellement exécutable ici — contrairement à iOS) :
  `bun install --ignore-scripts` + `packages/shared && npx prisma generate --generator client && bun run
  build` (prérequis CLAUDE.md, `node_modules` absent au démarrage de cette session) ; suite ciblée
  **5/5 verts** (RED confirmé avant fix, GREEN après) ; sweep complet
  `video-call|video-calls|use-webrtc|use-call|call-store|call-infrastructure` — **39 suites / 360 tests
  verts**, 0 régression (362 avant retrait des 2 tests `setReconnecting` obsolètes, voir dead-code
  ci-dessous). `npx tsc --noEmit` sur `apps/web` : **1653 erreurs avant et après le diff** (comparaison
  ligne à ligne complète), zéro nouvelle erreur — les seuls deltas sont des décalages de numéro de ligne
  sur `CallManager.tsx` (+14 lignes ajoutées) et 3 erreurs préexistantes d'ordre d'union non-déterministe
  sans rapport (`BubbleMessage.tsx`, `ConversationMessages.tsx`, `ConversationSettingsModal.tsx` — le
  même union type imprimé dans un ordre différent d'une exécution à l'autre, pas causé par ce diff).
- **Dead code confirmé et retiré** (Vague 98 tranchée) : `call-store.ts`'s `reconnectAttempt`/
  `isReconnecting`/`setReconnecting` — grep de tous les call sites de `apps/web` : aucun composant, hook
  ou handler n'appelle jamais `setReconnecting(...)` ni ne lit `isReconnecting`/`reconnectAttempt` du
  store en dehors de ses propres tests. Le SEUL `isReconnecting` réellement consommé (`VideoCallInterface`
  → `useCallAnalyticsReporter`) est un `useState` LOCAL distinct posé dans `use-webrtc-p2p.ts` par la
  Vague 98 — signal câblé différent, jamais lié au store. Retiré : interface `CallStoreState` (3 champs),
  defaults, l'action elle-même, les 2 lignes de `reset()`, et les tests dédiés
  (`describe('setReconnecting', ...)`, 2 tests + 2 assertions dans le test de reset). Ne change AUCUN
  comportement observable (rien ne l'observait).
- **Reste ouvert** (reconduit, rien de plus trouvé côté web/gateway ce cycle au-delà de ce qui précède) :
  dead code / god-object `CallManager.swift` iOS (~5880 lignes) ; ADR `actor CallEventQueue` non
  implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la
  Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
  `removeParticipant()` web (Vague 91, non-régression) ; toolchains iOS/Android hors d'atteinte dans ce
  sandbox.

## Vague 102 — `use-video-call.ts` (le seul point d'entrée d'appel sortant web) émettait tous ses toasts en anglais codé en dur, hors du pipeline i18n (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch`/reset sur `origin/main` (branche 1 commit en
retard, `a5da9b036`), aucune PR ouverte de cette routine (`list_pull_requests` vide côté
`claude/upbeat-dirac-*`/`calls`) — Vague 101 (`951b0ab79`, PR #2815) déjà mergée avant le début de cette
session. Deux audits dédiés en parallèle (agents Explore, lecture seule) mandatés avec la liste complète
des items déjà clos/déjà triés des Vagues 1-101 pour éviter toute redite : un sur web+gateway, un sur
iOS (CallKit/PushKit/WebRTC/AVAudioSession/accessibilité/dead-code). L'audit iOS n'a rien trouvé de neuf
après un balayage complet (retain cycles, PushKit, CXProvider, a11y, dead code) — codebase mature,
verdict honnête plutôt qu'une trouvaille forcée. L'audit web+gateway a remonté un candidat unique à
haute confiance.

- **Root cause confirmée par lecture directe** : `apps/web/hooks/conversations/use-video-call.ts` —
  SEUL point d'entrée de production pour initier un appel web (câblé depuis le bouton « Appeler » de
  `ConversationLayout.tsx` et depuis le rappel `CallSystemMessage.tsx`) — n'importait jamais `useI18n`.
  Les 8 `toast.error`/`toast.success` de `startCall()` et de son helper `handleMediaError()` étaient des
  littéraux anglais bruts (`'Please select a conversation first'`, `'Calls are only available for direct
  conversations'`, `'Connection error. Please try again.'`, `'Failed to start call. Please try again.'`
  x2, `'Starting call...'`, `'Camera/microphone permission denied.'`, `'No camera or microphone found.'`,
  ``Failed to access camera/microphone: ${error.message}``, `'Failed to access camera/microphone'`) —
  alors que TOUS les fichiers soeurs du même feature (`CallManager.tsx`, `CallControls.tsx`,
  `VideoCallInterface.tsx`, `use-call-retry-toast.ts`) passent déjà par `useI18n('calls')`. Les locales
  `fr`/`es`/`pt` de `calls.toasts.connectionError` existent et sont traduites, mais ce hook n'y touchait
  jamais. Un utilisateur avec l'interface en français/espagnol/portugais qui n'a pas de conversation
  sélectionnée, tente d'appeler un groupe, subit une déconnexion socket, se voit refuser l'appel par le
  gateway, ou refuse l'accès caméra/micro — voit du texte anglais brut dans les 8 cas, sur le chemin
  d'initiation d'appel le plus emprunté de toute la feature.
- **Fix** : `useI18n('calls')` câblé dans le hook ; les 8 littéraux remplacés par des clés
  `calls.toasts.*` — 1 réutilisée (`connectionError` pour le socket down/null, existante) et 8
  nouvelles ajoutées aux 4 locales (`en`/`fr`/`es`/`pt`) : `selectConversation`, `directOnly`,
  `startFailed`, `startingCall`, `micPermissionDenied`, `micNotFound`, `micAccessFailed` (avec
  interpolation `{message}`, seule clé paramétrée), `micAccessFailedGeneric`. `handleMediaError`
  (fonction module-level, hors du hook) reçoit désormais `t: TFunction` en paramètre plutôt que d'appeler
  `toast` avec un littéral. `ack?.error?.message` (texte serveur, hors périmètre i18n client) reste
  inchangé — seul le FALLBACK quand le serveur ne fournit aucun message passe par `t()`.
- **Tests** (TDD, RED confirmé par `git stash` du seul fichier de production — 12 assertions ont échoué
  exactement sur les 8 sites migrés, aucune régression annexe — puis `git stash pop` pour repasser GREEN) :
  `use-video-call.test.tsx` — les 12 assertions littérales migrées vers les clés de traduction, plus un
  mock `jest.mock('@/hooks/useI18n', ...)` identité (même convention que `use-call-retry-toast.test.tsx` :
  `t: (k) => k`), avec la particularité que `t` est défini HORS de l'objet retourné par le mock (référence
  stable module-scope, miroir du `useMemo` du vrai hook) — un piège trouvé en cours de route : un mock
  naïf recréant `t` à chaque appel de `useI18n()` cassait `should return stable startCall reference`
  (`useCallback([conversation, user, t])` recalculait son identité à chaque rerender uniquement à cause du
  mock, pas du vrai hook). Le cas `micAccessFailed` (seule clé paramétrée) est vérifié en faisant
  concaténer au mock la clé et les params sérialisés, pour garder l'assertion sur le message d'erreur
  original sans réimplémenter la vraie substitution `{message}`.
- **Vérification** (sandbox Linux, suite web réellement exécutable) : `bun install --ignore-scripts` +
  `packages/shared && npx prisma generate --generator client && bun run build` (prérequis CLAUDE.md,
  `node_modules` absent au démarrage) ; suite ciblée `bunx jest use-video-call.test.tsx` **35/35 verts**
  (RED confirmé avant fix : 12 échecs exacts sur les littéraux migrés ; GREEN après). Sweep complet
  `video-call|use-webrtc|use-call|orchestrator|call-store|adaptive-degradation|audio-effect|
  webrtc-service|call-infrastructure` — **52 suites / 760 tests verts**, 0 régression. `npx tsc --noEmit`
  sur `apps/web` : **1193 erreurs avant et après le diff** (comparaison ligne à ligne complète, `git
  stash`/`stash pop`), zéro nouvelle erreur — les 3 seuls deltas restants sont les mêmes erreurs
  préexistantes d'ordre d'union non-déterministe déjà documentées Vague 101 (`BubbleMessage.tsx`,
  `ConversationMessages.tsx`, `ConversationSettingsModal.tsx`), sans rapport avec ce diff. `eslint` sur
  les fichiers touchés : échoue dans CE sandbox avec une erreur de sérialisation JSON circulaire
  pré-existante à l'environnement (reproduite sur un fichier totalement étranger au diff,
  `hooks/use-i18n.ts`, non causée par ce changement) — vérification réelle déléguée au job lint de la CI.
  JSON des 4 locales validé par parsing Python round-trip, diff `git diff` propre (formatage identique,
  10 lignes ajoutées par fichier). Diff strictement scopé à `apps/web` (aucun fichier gateway/iOS/Android
  touché) — audit iOS de ce cycle n'a rien trouvé de neuf (voir plus haut), suites gateway/iOS/Android non
  rejouées, hors du diff.
- **Reste ouvert** (reconduit, rien de plus trouvé côté web/gateway ce cycle au-delà de ce qui précède) :
  dead code / god-object `CallManager.swift` iOS (~5880 lignes) ; ADR `actor CallEventQueue` non
  implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la
  Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
  `removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en string
  literals hors du type-map partagé (cosmétique, basse priorité) ; toolchains iOS/Android hors d'atteinte
  dans ce sandbox.

## Vague 103 — `CallNotification` pouvait orpheliner la sonnerie sur un démontage rapide, avant que le `import()` dynamique ne résolve (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch`/vérif sur `origin/main`, branche `claude/
upbeat-dirac-iyvpcu` strictement à jour avec `main` au démarrage (aucun commit propre à cette routine en
attente), aucune PR ouverte de cette routine. Vague 102 (`2d1f65e7`, PR #2836) déjà mergée avant le début
de cette session. Un audit dédié (agent Explore, lecture seule) mandaté avec la liste complète des items
déjà clos/déjà triés des Vagues 1-102 pour éviter toute redite, scope web+gateway (sandbox Linux, sans
toolchain iOS/Android).

- **Root cause confirmée par lecture directe** : `apps/web/components/video-call/CallNotification.tsx`
  — la bannière montée pour TOUT appel entrant sonnant sur web — charge l'utilitaire de sonnerie via un
  `import('@/utils/ringtone')` dynamique et n'assigne `ringtoneRef.current` QUE dans le `.then()` de
  cette promesse. Si la bannière se démonte AVANT que ce chunk ne résolve (appel décroché ailleurs,
  annulé, ou supplanté par un appelant plus prioritaire — tous des chemins que `CallManager` résout déjà
  rapidement), le cleanup de l'effet tourne contre une ref encore `null` et n'arrête rien. Le `.then()`
  se déclenche ensuite inconditionnellement quelques instants plus tard, démarrant le singleton
  `Ringtone` partagé (boucle audio + vibration répétée, `ringPatternTimeout` se re-planifiant tous les
  2,3 s tant que `isPlaying` reste `true`) pour un appel déjà disparu, sans plus rien dans l'arbre capable
  d'appeler `.stop()` dessus. Comme `getRingtone()` retourne un singleton module-level dont `play()`
  ne fait rien si `isPlaying` vaut déjà `true`, le PROCHAIN vrai appel entrant voit sa propre requête
  `play()` silencieusement avalée par la boucle orpheline — un appel réel sonne sans le moindre son.
- **Fix** : un flag `cancelled`, posé `true` dans le cleanup de l'effet, vérifié dans le `.then()` du
  `import()` avant d'assigner `ringtoneRef.current` ou d'appeler `.play()` — le patron standard React de
  garde d'annulation sur effet asynchrone, appliqué ici pour la première fois à cet effet précis. Aucun
  changement à `utils/ringtone.ts` : le singleton et ses gardes `stop()`/`play()` étaient déjà corrects ;
  le défaut vivait entièrement dans le composant qui n'atteignait jamais `stop()` faute de référence.
- **Tests** (TDD, RED confirmé en exécutant réellement la nouvelle suite AVANT le fix — `play()` appelé
  une fois malgré le démontage préalable, exactement l'échec prédit) :
  `CallNotification.ringtoneUnmountRace.test.tsx` (nouveau fichier) — deux témoins : (1) démontage
  synchrone juste après le rendu, avant que le microtask du `import()` ne résolve → `play()`/`stop()`
  jamais appelés ; (2) montage/démontage normal (non-régression) → `play()` une fois au montage,
  `stop()` une fois au démontage. Le premier témoin exploite directement l'ordre d'exécution JS
  (synchrone avant microtask) plutôt qu'un mock à délai artificiel — le rendu + démontage tournent avant
  que la promesse mockée `import()` n'ait la moindre chance de résoudre.
- **Vérification** (sandbox Linux, suite web réellement exécutable ici — contrairement à iOS) :
  `bun install --ignore-scripts` + `packages/shared && npx prisma generate --generator client && bun run
  build` (prérequis CLAUDE.md, `node_modules` absent au démarrage de cette session) ; suite ciblée
  **2/2 verts** (RED confirmé avant fix, GREEN après) ; sweep complet `video-call|use-webrtc|use-call|
  orchestrator|call-store|adaptive-degradation|audio-effect|webrtc-service|call-infrastructure|
  CallNotification|ringtone` — **54 suites / 766 tests verts**, 0 régression. `npx tsc --noEmit` sur
  `apps/web` : **1753 erreurs avant et après le diff** (comparaison ligne à ligne complète via `git
  stash`/`stash pop`), zéro nouvelle erreur. `eslint` sur les fichiers touchés : échoue dans CE sandbox
  avec la même erreur de sérialisation JSON circulaire pré-existante déjà documentée Vague 101/102
  (résolution du plugin React dans `@eslint/eslintrc`, reproduite sur un fichier étranger au diff) —
  vérification réelle déléguée au job lint de la CI. Diff strictement scopé à `apps/web` (aucun fichier
  gateway/iOS/Android touché) ; suites gateway/iOS/Android non rejouées, hors du diff.
- **Reste ouvert** (reconduit, rien de plus trouvé côté web/gateway ce cycle au-delà de ce qui précède) :
  dead code / god-object `CallManager.swift` iOS (~5880 lignes) ; ADR `actor CallEventQueue` non
  implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la
  Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
  `removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en string
  literals hors du type-map partagé (cosmétique, basse priorité) ; toolchains iOS/Android hors d'atteinte
  dans ce sandbox.

## Vague 104 — `ALREADY_ANSWERED` faux-positif multi-device au join (gateway) + `MediaSessionCoordinator.callActive`/`events` non synchronisés (iOS SDK) (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch`/vérif sur `origin/main`, branche
`claude/upbeat-dirac-ozao52` strictement à jour avec `main` au démarrage (0 commit d'avance, 0 de
retard), aucune PR ouverte de cette routine. Vague 103 (`1f1f2700f`, PR #2843) déjà mergée avant le
début de cette session. Deux audits dédiés en parallèle (agents Explore, lecture seule) mandatés avec
un résumé synthétique des trouvailles déjà closes/déjà triées des Vagues 1-103 pour éviter toute
redite : un scope iOS (CallKit/PushKit/WebRTC/AVAudioSession/accessibilité/dead-code/concurrency), un
scope gateway (`CallService.ts`, `CallEventsHandler.ts`, `CallCleanupService.ts`,
`call-push-mirroring.ts`, `TURNCredentialService.ts`, `callHistory.ts`, `call-schemas.ts`). Les deux
ont chacun remonté un candidat neuf à haute confiance — les deux traités dans ce cycle (2 commits
distincts, même PR), le gateway étant intégralement vérifiable dans ce sandbox contrairement à l'iOS.

### 1. Gateway — `call:join` émettait `CALL_EVENTS.ALREADY_ANSWERED` inconditionnellement, faisant
taire à tort un device qui sonne toujours légitimement en multi-device

- **Root cause confirmée par lecture directe** : `CallEventsHandler.ts`, handler `call:join` — émettait
  `socket.to(ROOMS.user(userId)).emit(CALL_EVENTS.ALREADY_ANSWERED, {...})` sur CHAQUE join réussi, sans
  aucune garde sur l'état réel de l'appel. Or « Item F » (fix antérieur, documenté dans
  `CallService.ts` autour de `joinCallAttempt`) a changé ce qu'un join SIGNIFIE : il ne transitionne
  JAMAIS l'appel à `active`, seulement à `ringing` — le device qui join reçoit l'offer SDP EN SONNANT,
  avant que l'utilisateur ait répondu. iOS auto-early-join la room dès `call:initiated`
  (`joinCallRoomReliably`), précisément pour recevoir l'offer pendant la sonnerie. Avec un utilisateur
  connecté sur deux devices, le premier des deux à early-join fait taire le SECOND — qui sonne toujours
  réellement, n'a rien répondu — via ce même ALREADY_ANSWERED, dismissant sa bannière d'appel entrant.
  Un appel réel peut ainsi être manqué bien que les deux devices sonnaient authentiquement. Le jumeau
  push de cette même notification (`call_answered_elsewhere`, pour les devices sans socket vivant) avait
  déjà été correctement relocalisé hors de `call:join` en Vague 27 pour exactement cette raison — mais
  le commentaire qui l'accompagne (« the ALREADY_ANSWERED socket event above ») montre que l'auteur de
  la Vague 27 croyait à tort que le jumeau socket-direct restait, lui, correctement scopé.
- **Fix** : émission relocalisée dans `call:signal`, branche `'answer'` (les DEUX branches — relais
  normal ET cible sans socket actif), gardée par le même prédicat pur `shouldMirrorAnsweredElsewhere`
  déjà éprouvé pour le mirror push (première answer réelle uniquement, jamais la propre answer de
  l'initiateur, jamais une renégociation ultérieure).
- **Tests** (TDD, RED confirmé en exécutant réellement la suite AVANT le fix — 4/6 assertions
  échouaient exactement comme prédit : le join émettait toujours, les deux branches signal n'émettaient
  jamais) : nouveau fichier `CallEventsHandler-already-answered-scope.test.ts` (6 cas : join simple,
  join en second device, première answer réelle, renégociation, self-answer de l'initiateur, target
  sans socket actif). L'e2e réel à 3 sockets (`calls-two-socket-e2e.test.ts`) codifiait littéralement
  l'ANCIEN comportement bogué comme son contrat attendu (« B1 join → B2 reçoit already-answered ») —
  réécrit pour vérifier l'ABSENCE de dismiss au join puis le dismiss réel seulement sur la vraie SDP
  answer, avec les mêmes gardes anti-fuite (B1 ne se dismiss jamais lui-même, B2 ne reçoit jamais le
  signal ciblé à A).
- **Vérification** (sandbox Linux, suite gateway réellement exécutable ici) : `bun install
  --ignore-scripts` + `packages/shared && npx prisma generate --generator client && bun run build`
  (prérequis CLAUDE.md) ; nouvelle suite **6/6 verte** (RED confirmé avant fix via `git stash` du seul
  fichier de prod, GREEN après `stash pop`) ; e2e 2-sockets **8/8 vert** ; sweep complet
  `--testPathPatterns="[Cc]all"` — **48 suites / 1115 tests verts**, 0 régression. `npx tsc --noEmit` :
  **0 erreur**. Full `bun run test:coverage` (249 suites) lancé en tâche de fond pour confirmation
  large-spectre — résultat à documenter au cycle suivant si non capturé avant la fin de cette session.

### 2. iOS SDK — `MediaSessionCoordinator.callActive`/`events` non synchronisés malgré une doc affirmant
le contraire

- **Root cause confirmée par lecture directe** (`MediaSessionCoordinator.swift`) : `callActive` était
  un `Bool` `nonisolated(unsafe)` nu, écrit synchrone depuis le MainActor
  (`CallManager.callState.didSet` → `setCallActive`) et lu depuis l'exécuteur sérialisé propre à cet
  ACTOR (`request`/`release`/`deactivateForBackground`) — une vraie race sous le modèle de concurrence
  Swift. Son commentaire affirmait « same pattern as `CallManager.isCallActiveFlag` » — mais ce dernier
  a TOUJOURS été gardé par un `OSAllocatedUnfairLock` (`CallManager.swift:330`, vérifié) ; l'affirmation
  était aspirationnelle, pas réelle. `events` (un `PassthroughSubject`) était publié via `.send(_:)`
  depuis DEUX contextes d'exécution distincts (MainActor synchrone dans `setCallActive`, exécuteur de
  l'actor via un `Task` dans `forward(_:)`) malgré l'absence de garantie Combine de thread-safety
  concurrente pour `send(_:)`.
- **Fix** : `callActive` porté sur le même patron `OSAllocatedUnfairLock` que `CallManager`, en une
  seule transaction atomique lecture-puis-écriture dans `setCallActive` (au lieu de deux accès
  lock-libres séparés). Point d'entrée unique `emit(_:)` sérialisé par lock ajouté ; les deux
  publishers (`setCallActive`, `forward`) y passent désormais exclusivement, plus aucun
  `events.send(_:)` direct. Comportement inchangé — mêmes sémantiques lecture/écriture, maintenant
  synchronisées.
- **Tests** : nouvelle suite source-guard dans `MediaSessionCoordinatorTests.swift`, même idiome que
  `CallManagerIsCallActiveFlagSourceGuardTests` (pas de `nonisolated(unsafe)` non gardé, lock présent,
  `events.send` appelé exactement une fois dans tout le fichier — dans `emit(_:)`), plus un test de
  charge concurrente (`withTaskGroup`, 50×3 tâches hammering `setCallActive`/`isCallActive`/notification
  système en parallèle) qui prouve l'absence de crash/deadlock sous pression réelle.
- **Vérification** : build/tests iOS **non exécutables dans ce sandbox** (conteneur Linux, aucun Xcode
  — cf. `apps/ios/CLAUDE.md`). Relecture ligne à ligne + comptage d'accolades avant/après sur les 2
  fichiers touchés (équilibré). Vérification réelle déléguée à la CI GitHub Actions (macOS, job
  « SDK Tests ») au push — PR ouverte et suivie jusqu'au vert avant merge.

### Reste ouvert

Deux trouvailles gateway supplémentaires de l'audit de ce cycle, MEDIUM, PAS traitées ce cycle (portée
volontairement limitée à un candidat par audit pour garder chaque commit revuable indépendamment) —
**candidats sérieux pour la Vague 105** :

- **`CallService.updateCallStatus`'s terminal-status branch ancre `duration` sur `startedAt` au lieu de
  `answeredAt`**, violant l'invariant que TOUS les 7 autres writers terminaux de ce fichier respectent
  déjà (Vagues 25/27/30 — sinon un « Manqué · N:NN » fantôme apparaît dans l'historique). Confirmé mort
  aujourd'hui (grep : `updateCallStatus` n'est jamais appelé avec un statut terminal actuellement) mais
  une mine pour tout futur appelant/refactor.
- **`callHistory.deriveCallDirection` ne vérifie pas que l'utilisateur a réellement PARTICIPÉ à l'appel**
  — juste qu'il est membre de la conversation. Dans une conversation de groupe avec un appel P2P plafonné
  à 2 participants actifs, un 3e membre jamais joint peut voir l'appel étiqueté « incoming » dans son
  historique bien qu'il n'y ait jamais participé.

Reconduit tel quel (rien de plus trouvé côté iOS au-delà du fix #2 ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en string
literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans ce sandbox.

## Vague 105 — `callHistory.deriveCallDirection` étiquetait « incoming » un membre de groupe jamais entré dans l'appel (gateway) (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche
`claude/upbeat-dirac-j53lvn` recréée depuis `origin/main` (`cceb858c`, qui contient déjà la Vague 104 —
PR #2848 mergée), 0 commit d'avance/retard au démarrage, aucune PR ouverte de cette routine. Candidat
pris directement dans le « Reste ouvert » loggé par la Vague 104 plutôt que ré-auditer à froid — la
routine y avait explicitement laissé deux trouvailles gateway MEDIUM pour la Vague 105 ; celle-ci
traite la seconde (mislabeling fonctionnel visible utilisateur), l'autre (`updateCallStatus`'s
`duration` anchor, confirmée morte aujourd'hui) reste reconduite ci-dessous.

- **Root cause confirmée par lecture directe** : `deriveCallDirection` (`callHistory.ts`) dérivait
  `incoming` vs `missed` uniquement à partir de `CallSession.answeredAt` — un timestamp **call-wide**,
  posé une seule fois par quiconque des (jusqu'à 2) participants actifs a effectivement répondu. Le
  filtre de `CallService.listHistory` inclut, lui, TOUT membre actif de la conversation
  (`conversation: { participants: { some: { userId, isActive: true } } }`), sans aucune relation avec
  `CallParticipant`. Dans une conversation de groupe, un appel reste `mode: p2p` (Phase 1A) et
  `joinCallAttempt` rejette explicitement le 3e joiner (`MAX_PARTICIPANTS_REACHED`,
  `CallService.ts:1330-1339`) — sans jamais créer sa ligne `CallParticipant`. Ce 3e membre n'a donc
  strictement aucune trace de participation pour cet appel, mais `deriveCallDirection` le voyait quand
  même « incoming » dès que les deux autres avaient décroché, lui affirmant à tort avoir reçu un appel
  qui n'a jamais atteint son device. Vérifié que la distinction ne pouvait PAS se réduire à « une ligne
  `CallParticipant` existe pour cet utilisateur » seule (sans le AND sur `answeredAt`) : l'auto-early-join
  côté callee (`joinCallRoomReliably`, cf. Vague 104) crée cette ligne dès la sonnerie, AVANT toute
  réponse réelle — un 1:1 jamais décroché a donc bien une ligne `CallParticipant` pour l'appelé, et doit
  rester `missed`. D'où le nouveau prédicat : `answeredAt && userParticipated`, jamais l'un sans
  l'autre.
- **Fix** : `deriveCallDirection` et `buildCallHistoryItem` (`callHistory.ts`) prennent un 4e paramètre
  `userParticipated: boolean`. `CallService.listHistory` le résout en une requête batchée
  (`callParticipant.findMany({ where: { callSessionId: { in }, participant: { userId } } })`), scopée
  aux seuls appels où `userId` n'est pas l'initiateur (l'initiateur retourne toujours `outgoing`, avant
  même de lire ce champ — pas de requête gaspillée sur son propre historique).
- **Tests** (TDD, RED confirmé par relecture des assertions AVANT le fix — la suite existante
  `deriveCallDirection`/`buildCallHistoryItem` codifiait littéralement l'ancien contrat buggé, comme la
  suite `CallEventsHandler-already-answered-scope` de la Vague 104 sur son propre bug) : `callHistory.test.ts`
  et `CallService.listHistory.test.ts` mis à jour pour le nouveau paramètre + 3 nouveaux cas — group
  bystander jamais joint ⇒ `missed` (jamais `incoming`), pas de requête `callParticipant.findMany`
  quand l'utilisateur est l'initiateur, et la requête est bien scopée aux ids de la page courante + à
  `userId`. **36/36 vert** sur `callHistory|CallService.listHistory` ; sweep complet
  `--testPathPatterns="[Cc]all"` — **48 suites / 1120 tests verts**, 0 régression (1115 + 5 nouveaux).
  `npx tsc --noEmit` : **0 erreur**. `bun run test:coverage` (249 suites) lancé pour confirmation
  large-spectre, résultat documenté avant le merge de cette PR.
- **Portée volontairement non étendue** au champ de retour de l'API (`CallHistoryItem.direction` reste
  `'incoming' | 'outgoing' | 'missed'`, contrat REST inchangé, aucun changement iOS/web requis) — seule
  la logique serveur qui peuple ce champ était fausse.

### Reste ouvert

Un seul candidat gateway restait de la Vague 104, PAS traité ce cycle (portée toujours limitée à un
candidat par audit) — reconduit tel quel, candidat sérieux pour la Vague 106 :

- **`CallService.updateCallStatus`'s terminal-status branch ancre `duration` sur `startedAt` au lieu de
  `answeredAt`**, violant l'invariant que TOUS les 7 autres writers terminaux de ce fichier respectent
  déjà (Vagues 25/27/30 — sinon un « Manqué · N:NN » fantôme apparaît dans l'historique). Confirmé mort
  aujourd'hui (grep : `updateCallStatus` n'est jamais appelé avec un statut terminal actuellement) mais
  une mine pour tout futur appelant/refactor.

Reconduit tel quel (rien de plus trouvé côté gateway au-delà du fix ci-dessus ; iOS/Android hors
d'atteinte dans ce sandbox) : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR
`actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
(Vague 84, on-device requis) ; `removeParticipant()` web (Vague 91, non-régression) ;
`call:force-leave`/`call:check-active` en string literals hors du type-map partagé (cosmétique).

## Vague 106 — `CallService.updateCallStatus` anchrait `duration` sur `startedAt` au lieu de `answeredAt` (gateway) (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch`/vérif sur `origin/main`, branche
`claude/upbeat-dirac-h5nrb8` strictement à jour avec `main` au démarrage (0 commit d'avance/retard),
aucune PR ouverte de cette routine. Vague 105 (PR mergée) déjà intégrée à `main` avant le début de
cette session. Candidat pris directement dans le « Reste ouvert » loggé par la Vague 104/105 plutôt
que ré-auditer à froid — c'était le dernier candidat gateway laissé en attente.

- **Root cause confirmée par lecture directe** (`CallService.ts`, `updateCallStatus`) : la branche
  terminal-status calculait `duration = Math.floor((now - call.startedAt) / 1000)`
  inconditionnellement — le SEUL des 8 writers terminaux du fichier à ne pas suivre l'invariant déjà
  imposé partout ailleurs (`endCall`, `leaveCall`, `forceEndOrphanedCallSession`, la branche
  idempotente de `leaveCall`, les deux sweeps de `CallCleanupService`, `markCallAsMissed` — Vague
  25/27/30) : ancrer `duration` sur `answeredAt` (temps de parole réel), jamais `startedAt` (temps de
  sonnerie + parole), et retomber à `0` si l'appel n'a jamais été décroché. Confirmé mort aujourd'hui
  par grep — aucun appelant actuel ne passe un statut terminal à `updateCallStatus` (seulement `active`
  et `reconnecting`) — mais une mine pour le prochain appelant/refactor, qui résusciterait
  silencieusement le fantôme « Manqué · N:NN » que ces Vagues ont fermé sur tous les autres chemins.
- **Fix** : `updateData.duration = call.answeredAt ? Math.floor((now - call.answeredAt) / 1000) : 0`,
  même patron que les 7 autres writers, avec un commentaire d'audit expliquant pourquoi ce chemin est
  aujourd'hui inatteignable mais reste corrigé préventivement.
- **Tests** (TDD, RED confirmé en exécutant réellement les 2 nouveaux cas AVANT le fix via `git stash`
  du seul fichier de prod — `duration: 300` reçu au lieu de `30`/`0` prédits, GREEN après
  `stash pop`) : un cas appel décroché il y a 30s après avoir sonné 5min (`duration: 30`, pas ~300),
  un cas jamais décroché passant à `rejected` (`duration: 0`, pas le temps de sonnerie).
- **Vérification** (sandbox Linux, suite gateway réellement exécutable ici) : `bun install
  --ignore-scripts` + `packages/shared && npx prisma generate --generator client && bun run build`
  (prérequis CLAUDE.md, `node_modules` absent au démarrage de cette session) ; nouvelle suite ciblée
  **10/10 verte** ; sweep complet `--testPathPatterns="[Cc]all"` — **48 suites / 1122 tests verts**
  (1120 + 2 nouveaux), 0 régression. `npx tsc --noEmit` : **0 erreur**. Full `bun run test:coverage`
  (sweep complet, pas seulement calls) — **653 suites / 16 456 tests verts**, 0 échec.
- **Portée volontairement non étendue** : un audit iOS dédié (agent Explore, lecture readonly) a été
  mandaté en parallèle pour proposer un candidat frais pour la Vague 107 — résultat documenté
  séparément ci-dessous une fois reçu, pas retenu dans ce commit pour garder le diff scopé et
  revuable indépendamment (même politique que les Vagues 103-105).

### Reste ouvert

Le backlog gateway MEDIUM laissé par la Vague 104/105 est maintenant **vide** — les deux candidats
qu'il portait ont été traités (Vague 105, Vague 106 ci-dessus). Reconduit tel quel (rien de plus
trouvé côté gateway ce cycle) : dead code / god-object `CallManager.swift` iOS (~5880 lignes) ; ADR
`actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
(Vague 84, on-device requis) ; `removeParticipant()` web (Vague 91, non-régression) ;
`call:force-leave`/`call:check-active` en string literals hors du type-map partagé (cosmétique) ;
toolchains iOS/Android hors d'atteinte dans ce sandbox.

## Vague 107 — `VideoFilterPipeline.process` (+ ses deux miroirs UI) no-opait le flou d'arrière-plan/lissage peau sans preset colorimétrique (iOS) (2026-08-11)

Point d'entrée : même session que la Vague 106 ci-dessus, PR pas encore mergée. Un audit dédié (agent
Explore, lecture readonly) mandaté avec la liste condensée des items déjà triés (god-object
`CallManager.swift`, ADR `actor CallEventQueue`, busy-path `reportNewIncomingCall`, `CXSetHeldCallAction`,
`removeParticipant()` web, string literals `call:force-leave`/`call:check-active`, la synchronisation
`MediaSessionCoordinator` déjà fixée Vague 104) pour proposer un candidat frais côté iOS. Root cause
vérifiée par lecture directe (pas seulement acceptée du rapport agent) avant tout fix.

- **Root cause confirmée** : `VideoFilterPipeline.process(_:averageBrightness:)`
  (`Services/VideoFilterPipeline.swift:194`) gate TOUT le pipeline (colorimétrie ET flou
  d'arrière-plan ET lissage peau) derrière `guard cfg.isEnabled else { return pixelBuffer }`. Or
  `isEnabled` n'est mis à `true` que par le choix d'un des 5 presets colorimétriques
  (`VideoFilterPreset.config` force `c.isEnabled = true` inconditionnellement avant le `switch`).
  Les deux toggles avancés du panneau (`VideoFiltersPanel`, cases « Flou d'arrière-plan » / « Lissage
  peau ») ne touchent jamais `isEnabled` — ils ne modifient que leur propre champ. Un utilisateur qui
  active l'un des deux SANS jamais choisir un preset laisse `isEnabled` à `false` (sa valeur par
  défaut) : chaque frame capturée tombe dans le early-return et ressort strictement identique — le
  correspondant ne voit jamais le flou/lissage. Rien ne le révèle : le toggle reste visuellement actif,
  le glyphe toolbar « Filtres » (`hasActiveEffects` dans `CallView.swift`, `isActive` dans
  `CallEffectsOverlay.swift`) ne s'allume pas non plus (même lecture de `isEnabled` seul), aucune
  bannière de dégradation n'apparaît (le pipeline ne tourne même pas), aucun log. Silencieux et
  100% reproductible — pas une race, pas dépendant du device. Le type portait déjà l'outil pour
  détecter ce cas — `hasAdvancedFilters` (`backgroundBlurEnabled || skinSmoothingEnabled`, testé
  isolément par `VideoFilterConfigTests`) — mais n'était consulté par AUCUN des trois call-sites.
- **Fix** (3 sites, même patron `|| cfg.hasAdvancedFilters` partout) :
  - `VideoFilterPipeline.process` : `guard cfg.isEnabled || cfg.hasAdvancedFilters else { return
    pixelBuffer }`.
  - `CallView.hasActiveEffects` (glyphe toolbar bas d'écran) : idem.
  - `CallEffectsOverlay`'s « Filtres » toolbar chip `isActive` : idem.
- **Tests** (ajoutés, pas exécutables dans ce sandbox Linux — cf. Vérification) :
  - `VideoFilterPipelineTests` : 3 nouveaux cas exploitant `lastFrameProcessingTime` (déjà nil par
    défaut, signal observable existant que le pipeline a tourné) — flou seul/lissage seul avec
    `isEnabled=false` doivent quand même traiter la frame (`lastFrameProcessingTime != nil`) ; ni
    l'un ni l'autre ni `isEnabled` doit toujours early-return (non-régression, `nil`).
  - `CallViewAccessibilityTests` + `CallEffectsOverlayTests` : gardes source-scan (patron déjà en
    place dans ces fichiers pour des Views non instanciables hors hosting controller) vérifiant que
    `hasAdvancedFilters` apparaît bien dans le voisinage de chaque déclaration corrigée.
- **Vérification** : build/tests iOS **non exécutables dans ce sandbox** (conteneur Linux, aucun
  Xcode). Relecture ligne à ligne des 3 sites de prod + comptage d'accolades avant/après (équilibré,
  cf. session) ; les 3 fichiers de test suivent exactement l'idiome déjà établi dans leurs fichiers
  respectifs (repris de tests voisins existants, pas inventé). Vérification réelle déléguée à la CI
  GitHub Actions (macOS, job « iOS Tests ») au push — PR suivie jusqu'au vert avant merge.
- **Portée volontairement non étendue** : le second candidat de l'audit (`VideoFiltersPanel.activePreset`
  ne se restaure pas depuis la config persistée à la réouverture du panneau — cosmétique, l'indicateur
  de sélection affiche « Natural » alors que le preset réellement appliqué à la vidéo live est correct)
  n'est PAS traité ce cycle (portée limitée à un candidat par audit pour garder chaque commit revuable
  indépendamment) — **candidat pour la Vague 108**.

### Reste ouvert

- **`VideoFiltersPanel.activePreset` ne se restaure pas depuis `filterConfig` à la réouverture du
  panneau** (`@State private var activePreset: VideoFilterPreset? = .natural`, jamais re-dérivé dans
  `.onAppear` contrairement à `filterConfig` qui l'est) — cosmétique/trompeur, pas une perte de
  fonction (le filtre réellement appliqué reste correct). **Candidat sérieux pour la Vague 108.**

Reconduit tel quel (rien de plus trouvé côté iOS au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans
ce sandbox.

## Vague 108 — `VideoFiltersPanel.activePreset` ne se restaurait pas depuis `filterConfig` à la réouverture du panneau (iOS) (2026-08-11)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche `claude/upbeat-dirac-c7hnbb`
strictement à jour avec `origin/main` au démarrage (`2c141a004`, qui contient déjà la Vague 106+107 —
PR #2859 mergée), 0 commit d'avance/retard, aucune PR ouverte de cette routine. Candidat pris
directement dans le « Reste ouvert » loggé par la Vague 107 plutôt que ré-auditer à froid — c'était
l'unique candidat explicitement réservé pour cette vague.

- **Root cause confirmée par lecture directe** (`VideoFiltersPanel.swift`) : `activePreset` était un
  `@State private var activePreset: VideoFilterPreset? = .natural` — initialisé une seule fois à la
  création de la View, jamais re-dérivé. `.onAppear` re-hydrate bien `filterConfig` depuis
  `callManager.videoFilters.config` (la config persistée du call en cours), mais `activePreset` n'était
  touché nulle part dans ce bloc. Toute réouverture du panneau après avoir choisi un preset non-natural
  (`.warm`/`.cool`/`.vivid`/`.muted`) restaurait donc correctement le filtre réellement appliqué
  (`filterConfig`, donc le rendu vidéo live était toujours juste) mais réaffichait le chip « Naturel »
  en surbrillance — un mensonge visuel pur, sans perte de fonction (cf. constat déjà posé par la Vague
  107 qui avait laissé ce candidat de côté). Le même défaut de source unique aurait aussi laissé un chip
  preset en surbrillance après que l'utilisateur ait manuellement dérivé la colorimétrie via un slider
  de `VideoFilterControlView` (`$filterConfig` bindé directement, sans jamais passer par `presetChip`) —
  un second symptôme du même bug de fond, non mentionné par la Vague 107 mais couvert par le même fix.
- **Fix** : `activePreset` n'est plus un `@State` séparé mais une **propriété calculée** dérivée de
  `filterConfig` à chaque rendu (`VideoFilterPreset.matching(filterConfig)`), source unique — élimine la
  classe de bug entière plutôt que rapiécer le seul site `.onAppear`. Nouvelle fonction pure
  `VideoFilterPreset.matching(_:)` (`VideoFilterPipeline.swift`) : reverse-lookup comparant uniquement
  les 6 champs colorimétriques (`temperature`/`tint`/`brightness`/`contrast`/`saturation`/`exposure`)
  contre chaque preset — jamais `isEnabled` (le bouton « Reset » pose la colorimétrie de `.natural` mais
  repasse `isEnabled` à `false`, et doit quand même résoudre `.natural`) ni les deux champs avancés
  (`presetChip` propage déjà volontairement le `backgroundBlurEnabled`/`skinSmoothingEnabled` du
  06/appelant à travers un changement de preset — orthogonaux au preset colorimétrique actif). Retourne
  `nil` si aucun preset ne matche (slider dérivé à la main) — absence légitime de sélection, pas un bug.
  Les deux anciennes affectations manuelles (`activePreset = .natural` dans Reset, `activePreset = preset`
  dans `presetChip`) sont supprimées : la dérivation automatique produit exactement le même résultat
  puisque les deux sites posent `filterConfig` avec la colorimétrie exacte du preset visé.
- **Tests** (ajoutés, pas exécutables dans ce sandbox Linux — cf. Vérification) : 5 nouveaux cas dans
  `VideoFilterPipelineTests.swift` (`VideoFilterPresetTests`) — `matching()` retrouve chaque preset
  depuis sa propre config, ignore `isEnabled` (cas Reset), ignore les champs avancés (cas presetChip),
  retourne `nil` sur une colorimétrie dérivée à la main, et résout `.natural` depuis
  `VideoFilterConfig.default` (comportement par défaut inchangé, panneau jamais touché).
- **Vérification** : build/tests iOS **non exécutables dans ce sandbox** (conteneur Linux, aucun Xcode
  — cf. `apps/ios/CLAUDE.md`). Relecture ligne à ligne des 2 fichiers de prod touchés + comptage
  d'accolades avant/après (équilibré : 78/78 `VideoFilterPipeline.swift`, 31/31 `VideoFiltersPanel.swift`,
  37/37 sur le fichier de tests). Les 2 sites de test source-scan existants
  (`VideoFiltersPanelAccessibilityTests`, `CallViewObservedObjectInjectionTests`) référencent des
  littéraux inchangés par ce diff — vérifiés non affectés par lecture. Vérification réelle déléguée à la
  CI GitHub Actions (macOS, job « iOS Tests ») au push — PR suivie jusqu'au vert avant merge.
- **Portée volontairement non étendue** : aucun nouveau candidat frais audité ce cycle (le backlog
  « Reste ouvert » de la Vague 107 ne portait que ce seul item réservé) — cf. liste reconduite ci-dessous
  pour la Vague 109.

### Reste ouvert

Le backlog iOS laissé par la Vague 107 est maintenant **vide** — son unique candidat réservé a été
traité (Vague 108 ci-dessus). Reconduit tel quel (aucun audit frais mandaté ce cycle, portée limitée à
un candidat par audit) : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR
`actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6
trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
(Vague 84, on-device requis) ; `removeParticipant()` web (Vague 91, non-régression) ;
`call:force-leave`/`call:check-active` en string literals hors du type-map partagé (cosmétique) ;
toolchains iOS/Android hors d'atteinte dans ce sandbox. **Candidat sérieux pour la Vague 109** : un
audit frais (gateway ou iOS) reste à mandater au prochain cycle — aucun nouveau candidat concret n'a
été identifié cette fois-ci au-delà du fix ci-dessus.

## Vague 109 — `translateAndEmitSegment` résolvait la langue cible des sous-titres d'appel via `systemLanguage` seul, contournant le Prisme Linguistique (gateway) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche
`claude/upbeat-dirac-l6bxcd` strictement à jour avec `origin/main` au démarrage (`fc27724ff`, qui
contient déjà la Vague 108 — PR #2859 mergée), 0 commit d'avance/retard, aucune PR ouverte de cette
routine (une seule PR ouverte au repo, `#2870`, sans rapport — stories). Un audit frais (agent
Explore, lecture readonly) a été mandaté avec la liste condensée des items déjà triés/fixés
(Vagues 63-108) pour proposer un candidat neuf.

- **Root cause confirmée par lecture directe** (`CallEventsHandler.ts`, `translateAndEmitSegment`,
  chemin `CALL_EVENTS.TRANSCRIPTION_SEGMENT` qui pousse les sous-titres traduits en temps réel pendant
  un appel) : le `select` Prisma ne lisait que `user.systemLanguage`, et la résolution de langue cible
  par participant faisait `(p.participant.user?.systemLanguage as string | undefined) ?? 'fr'` —
  contournant entièrement `resolveUserLanguage()`, qu'`apps/ios/../services/gateway/CLAUDE.md` impose
  pourtant comme règle dure (« ALWAYS use `resolveUserLanguage()` … NEVER reimplement the priority
  order locally »), et qu'`import { resolveUserLanguage } from '@meeshy/shared/…'` était déjà présent
  en tête de fichier — utilisé 1200 lignes plus haut par `resolveNotificationLangs` (poussé de la
  Vague… antérieure, non renumérotée ici) pour le tout autre problème du push d'appel entrant, mais
  jamais consulté par ce site-ci. Un participant d'appel dont `systemLanguage` est vide (état ordinaire
  : utilisateur n'ayant configuré qu'une langue régionale, une destination personnalisée, ou reposant
  sur sa seule locale appareil) recevait donc ses sous-titres traduits en français quelle que soit sa
  préférence réelle — seule feature du produit à violer le Prisme, toutes les fonctions sœurs du
  même fichier (push d'appel entrant, notification, résolution auth) le respectant déjà.
- **Fix** : `select` étendu à `regionalLanguage`/`customDestinationLanguage`/`deviceLocale` ; la
  résolution par participant appelle désormais `resolveUserLanguage(user, { deviceLocale })`, même
  patron exact que `resolveNotificationLangs` dans le même fichier.
- **Tests** (TDD, RED confirmé en exécutant réellement le nouveau cas AVANT le fix — `translateText`
  jamais appelé du tout dans ce scénario particulier, le participant sans `systemLanguage` retombant
  sur `'fr'` qui égale la langue source du segment donc filtré par le garde anti-langue-identique,
  pire que le comportement attendu, pas seulement "mauvaise langue") : nouveau cas dans
  `CallEventsHandler-transcription-translation.test.ts` — auditeur `systemLanguage: null,
  regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: 'en-US'`, attend
  `translateText(..., 'es', ...)`, jamais `'fr'`. GREEN après le fix. Sweep complet
  `--testPathPatterns="[Cc]all"` — **48 suites / 1123 tests verts**, 0 régression. `npx tsc --noEmit` :
  **0 erreur**. `bun run test:coverage` (sweep complet, pas seulement calls) — **653 suites / 16 463
  tests verts**, 0 échec.
- **Portée volontairement non étendue** : `resolveUserLanguagesOrdered` (variante multi-langues
  ordonnée du même resolver, utilisée ailleurs pour construire des bandes de drapeaux) n'a pas été
  substituée ici — un seul segment ne cible qu'une langue par auditeur, la variante simple suffit et
  reste au plus près du patron `resolveNotificationLangs` déjà en place dans ce fichier.

### Reste ouvert

Reconduit tel quel (rien de plus trouvé ce cycle au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans
ce sandbox. **Candidat pour la Vague 110** : un audit frais (gateway ou iOS) reste à mandater au
prochain cycle.

## Vague 110 — le chrono d'appel du CALLER comptait la durée de sonnerie comme temps de conversation (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche
`claude/upbeat-dirac-njc6x6` remise à `origin/main` (`d368e989`, qui contient déjà la Vague 109 —
PR #2871 mergée par cette même session avant de démarrer ce cycle), aucune autre PR ouverte de cette
routine. Un audit frais (agent Explore, lecture readonly) a été mandaté avec la liste condensée des
items déjà triés/fixés (Vagues 63-109) pour proposer un candidat neuf ; gateway lu en entier
(`CallEventsHandler.ts`, `CallService.ts`, `CallCleanupService.ts`, `TURNCredentialService.ts`,
`call-push-mirroring.ts`) sans rien trouver de nouveau — la stack gateway calls est désormais très
densément auditée. Le candidat retenu vient du client web, jamais touché par les 109 cycles
précédents.

- **Root cause confirmée par lecture directe** (`apps/web/hooks/conversations/use-video-call.ts:207-215`,
  surfaçant via `apps/web/components/video-calls/VideoCallInterface.tsx:73-75` et
  `apps/web/components/video-call/CallManager.tsx`) : `startCall()` (le CALLER) stampe
  `currentCall.startedAt = new Date()` à l'instant où l'ack `call:initiate` réussit — c'est-à-dire
  quand le téléphone du destinataire commence à sonner, pas quand il décroche.
  `CallManager.tsx` monte `VideoCallInterface` dès que `isInCall && currentCall` (aucune garde sur
  `status`), et `VideoCallInterface` injectait ce même `startedAt` directement dans
  `useCallDuration()`, dont le résultat (`CallInfoOverlay`) s'affiche sans condition. Le champ partagé
  `CallSession.answeredAt` (`packages/shared/types/video-call.ts:81`) existe précisément pour éviter
  ça — c'est ce sur quoi le gateway ancre déjà `duration` côté serveur pour les appels terminés
  (Vagues 25/27/30/105/106) — mais n'était référencé **nulle part** sous `apps/web` (`rg answeredAt`
  ne remonte que gateway/iOS/Android/shared, jamais web).
  Scénario concret : l'appelant compose, le téléphone du destinataire sonne 12s avant décroché. Le
  chrono à l'écran de l'appelant affiche déjà « 0:12 » à l'instant même où l'appel se connecte, et
  chaque seconde suivante hérite de ce décalage pour toute la durée de l'appel — exactement la classe
  de bug déjà corrigée côté serveur à plusieurs reprises, jamais adressée côté chrono client. Le côté
  CALLEE n'a pas ce défaut (`acceptOrJoinCall`, `CallManager.tsx`, stampe déjà `startedAt` au moment
  précis de l'acceptation) — asymétrie confirmée par lecture des deux chemins.
- **Fix** : le champ `answeredAt`, déjà défini dans `CallSession` et déjà lu nulle part côté web, est
  maintenant écrit aux deux points où un appel devient réellement actif, et lu à l'unique endroit qui
  alimente le chrono visible :
  - `CallManager.tsx`, `handleParticipantJoined` (CALLER — `call:participant-joined`, le premier
    participant qui rejoint un appel encore `'initiated'` EST le décroché) : ajoute
    `answeredAt: new Date()` au même `setCurrentCall` qui bascule `status` vers `'active'`, sous la
    même garde `status === 'initiated'` — un second/troisième participant rejoignant un appel de
    groupe déjà actif ne réécrit jamais `answeredAt`.
  - `CallManager.tsx`, `acceptOrJoinCall` (CALLEE) : ajoute `answeredAt` (même valeur que `startedAt`,
    le décroché EST l'instant présent pour ce côté).
  - `VideoCallInterface.tsx` : `useCallDuration(currentCall?.startedAt)` →
    `useCallDuration(currentCall?.answeredAt)`. Avant décroché, `answeredAt` est `undefined` →
    `useCallDuration` (déjà correct, jamais modifié) affiche `0:00` ; le chrono ne démarre qu'au
    décroché réel, avec la bonne origine.
- **Tests** (TDD, RED confirmé en exécutant réellement les 5 nouveaux cas AVANT le fix — tous rouges
  avec le message d'assertion attendu, jamais un skip silencieux) :
  - `CallManager.answeredAt.test.tsx` (nouveau) : CALLEE — `acceptOrJoinCall` stampe
    `answeredAt` (instance `Date`) au décroché ; CALLER — `answeredAt` reste `undefined` tant que
    `status === 'initiated'`, puis devient une `Date` à `call:participant-joined` ; un second
    participant rejoignant un appel de groupe déjà `'active'` ne réécrit PAS `answeredAt` (égalité
    stricte avec la valeur capturée au premier join).
  - `VideoCallInterface.test.tsx` (2 nouveaux cas) : `answeredAt` non défini + `startedAt` vieux de
    12s → chrono affiche `0:00` (pas `0:12`) ; `answeredAt` vieux de 5s + `startedAt` vieux de 17s →
    chrono affiche `0:05` (pas `0:17`).
  - Sweep complet `--testPathPatterns="[Cc]all"` — **49 suites / 418 tests verts**, 0 régression.
  - `npx tsc --noEmit` : 1224 erreurs pré-existantes, **identiques bit pour bit avec et sans ce diff**
    (vérifié par `git stash` des deux fichiers de prod touchés puis nouveau run — même compte exact,
    aucune ligne citée dans les deux fichiers modifiés) ; le sandbox n'avait pas
    `packages/shared/dist` généré avant ce cycle (prérequis CLAUDE.md `npx prisma generate` +
    `bun run build`), désormais fait, sans changer ce compte — bruit de configuration sandbox
    préexistant, aucun rapport avec ce diff.
- **Portée volontairement non étendue** : la branche `isInitiator` de `CallManager.tsx`
  (`setCurrentCall` vers la ligne 292, `status: 'initiated'`) reste inchangée — un commentaire déjà en
  place dans `use-video-call.ts` confirme cette branche **inatteignable** côté web (le gateway ne
  réémet jamais `call:initiated` vers le socket de l'initiateur lui-même) ; y ajouter `answeredAt`
  n'aurait aucune valeur de test et sort du scope. Le runner-up de l'audit (`handleParticipantJoined`
  bascule `status` vers `'active'` sur un simple early-join, potentiellement avant un vrai décroché —
  trouvaille déjà notée Vague 104 côté gateway pour un problème distinct) n'est pas traité ici : il
  concerne la SÉMANTIQUE du statut `'active'`, pas l'ancre du chrono, et mériterait son propre cycle
  d'investigation dédié plutôt qu'un fix couplé à celui-ci.

## Vague 111 — le bouton haut-parleur du web ne mutait/démutait jamais aucun audio (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, `origin/main` strictement à
jour avec `HEAD` de la branche dédiée au démarrage (`00c6665c`, qui contient déjà la Vague 110 — PR
mergée), 0 commit d'avance/retard, aucune PR ouverte de cette routine. Candidat repris directement du
runner-up laissé en tête de la Vague 110 (confiance moindre annoncée là-bas — vérifié ici avant fix).

- **Root cause confirmée par lecture directe** : `CallControls.tsx` (`handleSpeakerToggle`) ne
  faisait que basculer un `useState` **local au composant** — jamais lu par personne. Aucune des deux
  surfaces qui jouent réellement l'audio distant (`VideoCallInterface.tsx`, `<VideoStream>` plein
  écran du participant principal ; `DraggableParticipantOverlay.tsx`, `<VideoStream>` des tuiles
  secondaires) ne recevait de prop dérivée de cet état — les deux codaient en dur `muted={false}`.
  `rg setSinkId` sur tout `apps/web` : **zéro résultat**. Le bouton changeait d'icône
  (`Volume2`/`VolumeX`) et de libellé (« Désactiver le haut-parleur » / « Activer ») sans qu'aucun
  `<video>` ne change de volume — 100% cosmétique, sur toute la stack web, quel que soit le nombre de
  participants. Confirme et clôt le runner-up laissé ouvert par la Vague 110 : ce n'est pas une
  limitation navigateur (aucune tentative de `setSinkId`/routage n'existait pour buter dessus), c'est
  un câblage jamais fait.
- **Fix** : `speakerEnabled` devient un état du CONTAINER (`VideoCallInterface`, seul propriétaire des
  éléments `<video>` qui jouent l'audio distant), jamais synchronisé au socket (contrairement à
  `controls.audioEnabled`/`videoEnabled` — c'est un choix de lecture 100% local, sans signification
  pour les autres participants). `CallControls` redevient un composant strictement contrôlé — plus de
  `useState` interne, `speakerEnabled`/`onToggleSpeaker` en props, même patron que
  `audioEnabled`/`onToggleAudio`. `!speakerEnabled` est propagé comme `muted` sur les DEUX surfaces
  (plein écran + `DraggableParticipantOverlay`, qui gagne une nouvelle prop `muted` réexportée vers
  son propre `<VideoStream>`).
- **Tests** (TDD, RED confirmé en exécutant réellement les 7 nouveaux cas AVANT le fix — le composant
  contrôlé n'existait pas encore, `speakerEnabled`/`onToggleSpeaker` non consommés) :
  - `CallControls.test.tsx` (2 nouveaux cas) : le clic invoque `onToggleSpeaker` et NE change PAS son
    propre libellé (preuve que l'état n'est plus géré en interne) ; `speakerEnabled=false` affiche le
    libellé call-to-action inverse.
  - `VideoCallInterface.test.tsx` (3 nouveaux cas, + mock `VideoStream` étendu pour capturer `muted`
    et `isLocal` — nécessaire pour distinguer la tuile locale, toujours mute, de la tuile distante) :
    audio distant audible par défaut ; le clic sur le bouton mute la tuile plein écran ; un second
    clic redémute.
  - `DraggableParticipantOverlay.test.tsx` (2 nouveaux cas) : non-mute par défaut, propage
    `muted=true` reçu du parent vers son `<VideoStream>` interne.
  - Sweep complet `--testPathPatterns="[Cc]all"` — **49 suites / 425 tests verts**, 0 régression.
  - `npx tsc --noEmit` : diff ligne-à-ligne AVANT/APRÈS (`git stash`) — **même 1757 erreurs
    pré-existantes, caractère pour caractère**, seuls les numéros de ligne des fichiers touchés
    décalent des lignes ajoutées ; aucune nouvelle erreur.
  - `eslint`/`next lint` : **non exécutables dans ce sandbox** (config circulaire pré-existante,
    `TypeError: Converting circular structure to JSON` sur le plugin `react`, reproductible sur un
    fichier non touché par ce diff — limitation d'environnement, pas un signal sur ce changement).
- **Portée volontairement non étendue** : le libellé produit reste « haut-parleur » (calqué sur le
  vocabulaire mobile CallKit) alors que le web n'a pas de dichotomie haut-parleur/écouteur — la
  sémantique retenue ici est « l'audio distant est-il audible localement », qui correspond exactement
  au texte affiché (« Désactiver/Activer le haut-parleur ») sans changer les clés i18n existantes
  (4 langues, `speakerOn(Label)`/`speakerOff(Label)`). Une vraie sélection de périphérique de sortie
  (`navigator.mediaDevices.enumerateDevices` + `HTMLMediaElement.setSinkId`, limité aux navigateurs
  Chromium desktop) reste un candidat séparé et plus ambitieux, hors scope d'un fix ciblé sur le
  symptôme rapporté (le bouton ne fait rien).

### Reste ouvert

Reconduit tel quel (rien de plus trouvé ce cycle au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans
ce sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, cf. ci-dessus). **Candidats
pour la Vague 112** (runners-up de la Vague 110, non traités, confiance moindre — à vérifier avant
fix) :
- `handleParticipantJoined` bascule `status` vers `'active'` sur le premier `call:participant-joined`,
  qui peut survenir pendant un early-join/ringing plutôt qu'un vrai décroché (cf. Vague 104 côté
  gateway pour le même symptôme sur un chemin différent).
- `CallInfoOverlay`'s `participantCount` lit `currentCall.participants` initialisé à `[]` côté CALLER
  — affiche brièvement « 0 participant » avant l'arrivée de l'event de join. Cosmétique, faible
  sévérité, probablement pas suffisant pour son propre cycle isolément.

## Vague 112 — le bandeau « appel en cours, rejoindre » (web) ne pouvait jamais s'afficher pour personne (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`. Au démarrage, DEUX PRs
ouvertes de cette routine visaient la MÊME Vague 111 en parallèle (collision entre deux sessions,
cf. leçon 132 dans `tasks/lessons.md`) : #2877 (`setSinkId`, routage réel de périphérique de sortie
audio) et #2881 (mute/unmute des éléments `<video>`). Arbitrage effectué avant de commencer ce cycle :
**#2881 mergée**, #2877 fermée en doublon — les icônes/labels du bouton (`Volume2`/`VolumeX`,
« Désactiver le haut-parleur ») encodent déjà « l'audio distant est-il audible », pas « quel
périphérique de sortie » ; le fix `setSinkId` ciblait par ailleurs `audioOutputDevices[1]` de façon
explicitement arbitraire (son propre texte : « pas nécessairement un haut-parleur ») et masquait le
bouton entier sur Safari/poste mono-périphérique — régression UX plus large que le no-op qu'il
corrigeait. Branche `claude/upbeat-dirac-ax0ee9` ensuite remise à `origin/main` (`374733ce`, qui
contient #2881), 0 commit d'avance/retard, plus aucune PR ouverte de cette routine. Audit frais (agent
Explore, lecture readonly) mandaté avec la liste condensée des items déjà triés/fixés (Vagues 63-111).

- **Root cause confirmée par lecture directe** (`apps/web/components/conversations/header/use-call-banner.ts`,
  consommé par `ConversationHeader.tsx`, rendu via `OngoingCallBanner`) : `hasActiveCall` exigeait
  `currentCall && isInCall` — c'est-à-dire que le spectateur devait **déjà être dans l'appel** avant
  que le bandeau « rejoindre » ne puisse s'afficher. Or `currentCall`/`isInCall` (`useCallStore`) ne
  décrivent JAMAIS un appel dont le spectateur ne fait pas encore partie : les quatre sites d'écriture
  de `setCurrentCall` (`CallManager.handleIncomingCall` pour l'initiateur, `acceptOrJoinCall`,
  `handleParticipantJoined`, `use-video-call.ts`'s `startCall`) posent `isInCall: true` dans le même
  souffle — vérifié exhaustivement, aucun site n'écrit l'un sans l'autre. `currentCall && !isInCall`
  était donc un état **inatteignable par construction**, pas seulement une condition mal ordonnée : le
  bandeau ne s'affichait dans AUCUN des deux seuls états possibles (spectateur pas dans l'appel →
  `currentCall` reste `null` pour lui, jamais posé ; spectateur dans l'appel → `VideoCallInterface`
  plein écran (`fixed inset-0 z-50`) couvre déjà tout, le bandeau du header n'a plus lieu d'être). Un
  membre de conversation qui rate l'incoming-call initial (hors-ligne au démarrage de l'appel, ou
  reload de page en cours d'appel) n'a alors AUCUN moyen de découvrir/rejoindre un appel de groupe déjà
  en cours — le seul équivalent fonctionnel existant, le bouton « Rejoindre » de `CallSystemMessage`
  (bulle `call-live`), est explicitement restreint aux conversations `direct` (`canJoin = isLive &&
  conversationType === 'direct' && !isAnonymous`) : pour un groupe, ce bandeau était la SEULE voie
  prévue, et elle était morte.
  De plus, même dans l'état inatteignable, `handleJoinCall` appelait `onStartCall()` — qui démarre un
  NOUVEL appel plutôt que de rejoindre l'existant — au lieu du chemin `requestJoin` déjà câblé et
  testé pour ce cas exact (bulle `call-live` → `useCallStore.requestJoin` → `CallManager`, revalidation
  REST avant tout accès média).
- **Fix** : `useCallBanner` source désormais « y a-t-il un appel actif dans cette conversation » via
  `GET /conversations/:id/active-call` (`callsService.getActiveCall`, déjà utilisé par le chemin de
  jonction de la bulle `call-live` — même contrat, même endpoint, aucune nouvelle route), pollé
  (`refetchInterval` 15s, React Query — sous la limite de rate-limit documentée 10/min) via une
  nouvelle query key `queryKeys.calls.active(conversationId)`. `hasActiveCall` devient : appel actif
  pour cette conversation, statut non terminal (`CALL_TERMINAL_STATUSES`), ET spectateur PAS dans
  l'appel (`!isInCall`, lu du store réel, seule dépendance restante à `useCallStore`) — condition
  maintenant atteignable dans son seul cas d'usage réel. `handleJoinCall` appelle `requestJoin({
  callId, conversationId, callType })`, `callType` dérivé du type réel de l'appel
  (`participants.some(p => p.isVideoEnabled)`) plutôt que d'un callback de démarrage. Le paramètre
  `onStartCall` — mal employé, jamais nécessaire pour « rejoindre » — est retiré de la signature du
  hook ; `ConversationHeader.tsx` ne le passe plus qu'à son usage légitime (bouton d'appel du header,
  inchangé). `callDuration` s'ancre sur `answeredAt ?? startedAt` (même correction que la Vague 110,
  jamais appliquée à ce hook faute d'accès à `answeredAt` avant ce cycle — le champ existait déjà sur
  `CallSession`, simplement non lu ici).
- **Tests** (TDD, RED confirmé en rejouant réellement les 18 nouveaux cas contre l'ANCIENNE implémentation
  via `git stash` — 14/18 rouges avec les messages d'assertion attendus, les 4 restants passant par
  coïncidence structurelle sans exercer le comportement visé) : suite `use-call-banner.test.tsx`
  entièrement réécrite (source de données changée, wrapper `QueryClientProvider` + mock
  `calls.service`, patron repris de `use-statuses.test.tsx`) — plus d'accès actif/inatteignable,
  isolation par `isInCall`, filtrage conversation/statut terminal, ancrage `answeredAt`/`startedAt`,
  `handleJoinCall` pose bien un `requestJoin` typé vidéo/audio selon les participants et jamais quand
  `activeCall` est absent, `handleDismissCallBanner` masque par id d'appel. `ConversationHeader.test.tsx`
  (30 tests, découvert HORS du sweep `--testPathPatterns="[Cc]all"` car son nom ne contient pas
  « call » — repéré en grep dédié des appelants de `useCallBanner`, pas par le sweep) mockait
  `useCallStore` avec un `mockReturnValue` ignorant tout sélecteur, incompatible avec les nouveaux
  appels `useCallStore(s => s.isInCall)` : remplacé par un mock direct de `useCallBanner` (déjà
  entièrement testé par ailleurs, et `OngoingCallBanner` y était déjà mocké en boîte noire) — les 2 cas
  « Call Banner » reconfigurés sur le contrat du hook plutôt que sur `useCallStore`. Sweep complet
  `--testPathPatterns="[Cc]all|ConversationHeader"` — **50 suites / 452 tests verts**, 0 régression.
  `npx tsc --noEmit` : diff ligne-à-ligne AVANT/APRÈS (`git stash` des 4 fichiers de prod + test
  modifiés) — **1757 erreurs pré-existantes identiques**, seul un ordre d'union TS non-déterministe
  entre deux runs successifs (déjà documenté Vague 110/111) diffère, aucune ligne dans les fichiers
  touchés. `eslint` : indisponible dans ce sandbox (même erreur de config circulaire pré-existante que
  les vagues précédentes, plugin `react`).
- **Portée volontairement non étendue** : le nouveau poll REST n'est pas gardé par un flag anonyme —
  un spectateur en session `X-Session-Token` recevra un 401/403 répété toutes les 15s tant que le
  header d'une conversation reste monté (dégradation gracieuse déjà gérée : `response.success ?
  ... : null`, bandeau simplement jamais affiché, aucune erreur visible), au lieu d'un guard explicite
  `!isAnonymous` qui aurait nécessité de faire remonter ce flag jusqu'à `ConversationHeader` (absent de
  ses props aujourd'hui). Requêtes gaspillées mais sans impact fonctionnel ni de rate-limit (usage
  normal : un seul header monté à la fois). Un vrai sélecteur multi-périphériques audio (setSinkId)
  reste également un candidat séparé, cf. Vague 111.

### Reste ouvert

Reconduit tel quel (rien de plus trouvé ce cycle au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111) ; guard
`!isAnonymous` sur le poll `active-call` du bandeau (cf. ci-dessus). **Candidats pour la Vague 113**
(runners-up de la Vague 110, non traités, confiance moindre — à vérifier avant fix) :
- `handleParticipantJoined` bascule `status` vers `'active'` sur le premier `call:participant-joined`,
  qui peut survenir pendant un early-join/ringing plutôt qu'un vrai décroché (cf. Vague 104 côté
  gateway pour le même symptôme sur un chemin différent).
- `CallInfoOverlay`'s `participantCount` lit `currentCall.participants` initialisé à `[]` côté CALLER
  — affiche brièvement « 0 participant » avant l'arrivée de l'event de join. Cosmétique, faible
  sévérité, probablement pas suffisant pour son propre cycle isolément.

## Vague 113 — `handleParticipantJoined` prenait le room-join pour un décroché : le clock du caller démarrait au premier ring de tout callee iOS (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, `claude/upbeat-dirac-qm5b32`
strictement à jour avec `origin/main` au démarrage (0 commit d'avance/retard), aucune PR ouverte de
cette routine. Vague 112 (`fe8a6577f`, PR #2885) déjà mergée avant le début de cette session — main a
avancé d'un commit non lié (PR #2890, pipeline de traduction) entre-temps, sans conflit. Audit dédié
mandaté (agent Explore, lecture seule, scope iOS calling stack — WebRTC/CallKit/PushKit/concurrency)
avec la liste condensée des items déjà triés/fixés (Vagues 1-112) : verdict zéro trouvaille neuve,
l'iOS calling stack est déjà exhaustivement durci (identity guards sur chaque callback delegate,
`sessionGeneration`/task-chaining serialisant chaque chemin de renégociation, `VoIPDedupRing`,
`CallPiPPolicy`...). Repris directement le premier runner-up laissé en tête de la Vague 112
(confiance moindre annoncée là-bas — vérifié ici avant fix, comme demandé).

- **Root cause confirmée par lecture directe, des DEUX côtés du contrat** (web ET iOS) :
  `CallManager.tsx`'s `handleParticipantJoined` (consommateur de `call:participant-joined`) traitait
  le premier participant à rejoindre un appel encore `'initiated'` comme LE décroché du callee —
  stamp `status: 'active'` + `answeredAt` (Vague 110), point d'ancrage du chrono visible côté caller.
  Cette hypothèse est vraie pour un appel web↔web pur (`CLIENT_EVENTS.CALL_JOIN` n'y est émis QUE par
  un vrai clic Accept — `acceptOrJoinCall`/`handleAcceptCall`). Elle est **fausse** dès que le callee
  est sur iOS : `CallManager.swift` (`reportIncomingVoIPCall` ligne ~1408, incoming call foreground
  ligne ~1676) émet `joinCallRoomReliably(callId:)` **immédiatement** à la réception de l'appel — le
  commentaire de production le dit explicitement (« Bug 2: emit call:join IMMEDIATELY... so the SDP
  offer can be received while ringing ») — pour recevoir l'offer SDP PENDANT la sonnerie, avant toute
  décision humaine. Le gateway (`CallEventsHandler.ts`, handler `call:join`) broadcast
  `PARTICIPANT_JOINED` à tous les autres sockets de la room dès ce join — sans distinction entre
  « quelqu'un vient de décrocher » et « le device du callee vient de pré-charger l'offer en sonnant »,
  une distinction que le protocole ne fait d'ailleurs QUE plus tard, au signal `call:signal` de type
  `'answer'` (cf. Vague 104 : `joinCall` ne transitionne JAMAIS le statut DB à `'active'`, seulement à
  `'connecting'`/`'ringing'`). Résultat : pour TOUT appel web→iOS, le chrono du caller démarrait (et
  `status` passait à `'active'`) à l'instant où le téléphone du callee commençait à sonner, pas à son
  décroché réel — annulant silencieusement le fix ring-time-vs-talk-time de la Vague 110 pour la
  plateforme mobile flagship du produit, pas pour un cas limite multi-device marginal comme le
  soupçonnait la Vague 112. Confirmé par lecture des trois sites d'émission de `joinCallRoomReliably`
  (VoIP push, foreground incoming, rejoin) et du commentaire de production qui documente l'intention
  exacte, plus la suite `CallManager.answeredAt.test.tsx` de la Vague 110 elle-même, qui codifiait
  littéralement l'hypothèse fausse comme contrat attendu (« call:participant-joined — the callee just
  answered ») — un candidat marqué « confiance moindre » qui s'avère être un vrai défaut, pas un faux
  positif : la note de la Vague 112 avait raison de demander la vérification avant fix.
- **Fix** : le stamp `status: 'active'`/`answeredAt` quitte `CallManager.tsx`'s `handleParticipantJoined`
  (qui garde `addParticipant`/`clearCallTimeout`, tous deux corrects et sans rapport avec le décroché)
  et migre vers `useWebRTCP2P`'s `handleAnswer` (`hooks/use-webrtc-p2p.ts`), juste après
  `service.setRemoteDescription(answer)` — le SEUL point du protocole qui représente un décroché réel
  côté caller (le gateway ne relaie ce signal QUE depuis la branche `'answer'` de `call:signal`, jamais
  depuis un join). Même garde `status === 'initiated'` qu'avant (idempotent : une renégociation/ICE-
  restart ultérieure, dont l'answer repasse par le même `handleAnswer`, ne re-stampe jamais). La
  création d'offer (`VideoCallInterface`'s effect sur `currentCall.participants.length`) ne dépend pas
  de `status` — elle reste déclenchée par `addParticipant`, inchangé : aucune régression sur le
  chemin d'offre. Le hook consommait déjà `useCallStore` pour `setError`/`setConnecting`/etc. — lire
  `currentCall`/`setCurrentCall` via `useCallStore.getState()` (pattern déjà utilisé par
  `CallManager.tsx` pour une lecture fraîche sans l'ajouter aux deps) suit la convention existante.
- **Tests** (TDD, RED confirmé en exécutant réellement les 3 nouveaux cas AVANT le fix — le mock du
  store ne portait même pas encore `currentCall`/`setCurrentCall`, ajouté d'abord ; RED effectif sur le
  seul cas positif, `mockSetCurrentCall` jamais appelé) :
  - `use-webrtc-p2p.test.tsx` (3 nouveaux cas, describe dédié) : `handleAnswer` stampe
    `status:'active'`+`answeredAt` (instance `Date`) quand `currentCall.status === 'initiated'` ; ne
    re-stampe JAMAIS quand l'appel est déjà `'active'` (renégociation) ; ne jette jamais quand
    `currentCall` est `null`.
  - `CallManager.answeredAt.test.tsx` (suite de la Vague 110) : le test caller réécrit pour affirmer le
    contrat INVERSE — `call:participant-joined` seul laisse `status` à `'initiated'` et `answeredAt`
    `undefined` ; le test callee (`acceptOrJoinCall` stampe à l'Accept réel) reste inchangé, toujours
    vert, jamais concerné par ce root cause. Le test "ne clobber pas un groupe" de la Vague 110 devient
    sans objet (plus rien à clobberer côté `handleParticipantJoined`) — retiré, son intention
    (idempotence sur re-join) est désormais couverte par le cas "ne re-stampe jamais" côté
    `use-webrtc-p2p.test.tsx`.
  - Sweep complet `--testPathPatterns="[Cc]all"` — **49 suites / 421 tests verts**, 0 régression.
  - `npx tsc --noEmit` : diff normalisé (numéros de ligne/colonne neutralisés) AVANT/APRÈS (`git
    stash`) — **identique caractère pour caractère**, mêmes 1757 erreurs pré-existantes ; aucune
    n'implique `use-webrtc-p2p.ts`. `eslint` : indisponible dans ce sandbox (même config circulaire
    pré-existante que les vagues précédentes, plugin `react`).
- **Portée volontairement non étendue** : le timer 45s « pas de réponse » (`startCallTimeout`) reste
  désarmé par le même `clearCallTimeout()` inconditionnel au premier room-join (comportement
  pré-existant, ligne 398, non touché par ce fix) — un callee iOS qui ne décroche jamais après son
  early-join désarme quand même ce garde-fou côté caller. C'est un défaut PARENT distinct (le timer
  de no-answer, pas le chrono/statut visible), plus risqué à corriger sans casser le cas normal
  (early-join suivi d'un vrai décroché, où désarmer tôt est voulu) — candidat séparé pour une vague
  future, pas couplé à celui-ci. iOS n'a reçu aucune modification (hors d'atteinte de ce sandbox) :
  le fix est entièrement côté web/gateway-contract, et le comportement iOS (`joinCallRoomReliably`)
  reste inchangé et légitime — c'est la lecture web du signal qui était fausse, pas l'émission iOS.

### Reste ouvert

Reconduit tel quel (rien de plus trouvé ce cycle au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111) ; guard
`!isAnonymous` sur le poll `active-call` du bandeau (Vague 112) ; `CallInfoOverlay`'s
`participantCount` affichant brièvement 0 côté caller (Vague 112, cosmétique, non traité).

## Vague 114 — le timer 45s « pas de réponse » du caller était désarmé par le même early-join iOS que Vague 113 avait déjà déplacé (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche dédiée rebasée en
fast-forward sur `origin/main` (`c9a6aa2e5`, un commit de version bump non lié, contient déjà la
Vague 113 — PR #2892 mergée), 0 commit d'avance/retard après rebase, aucune PR ouverte de cette
routine (vérifié via l'API GitHub — les 4 PR ouvertes du dépôt appartiennent à d'autres routines :
messaging cycle 91, réintégration a11y iOS, gateway). Repris directement le premier item de la liste
« Reste ouvert » de la Vague 113, explicitement noté là-bas comme nouveau et non traité — vérifié ici
avant fix, comme demandé.

- **Root cause confirmée par lecture directe** (`CallManager.tsx`) : `handleParticipantJoined`
  appelait encore `clearCallTimeout()` inconditionnellement sur CHAQUE `call:participant-joined` — le
  même événement que la Vague 113 avait déjà requalifié de « room-join, pas décroché » pour le stamp
  `status`/`answeredAt`, sans jamais toucher à ce second appel resté sur l'ancienne hypothèse. Le
  timer 45s « pas de réponse » du CALLER (`startCallTimeout`, armé côté initiateur à `call:initiated`)
  se retrouvait donc désarmé exactement au même instant que le clock visible se mettait à tort à
  démarrer avant la Vague 113 : dès qu'un callee iOS auto-rejoint la room en sonnant
  (`joinCallRoomReliably`, cf. Vague 113), et non à son décroché réel. Conséquence pour tout appel
  web→iOS : un callee iOS qui ne décroche jamais laisse le caller sonner indéfiniment côté client — le
  seul filet restant est le timeout serveur 60s (`CallService.RINGING_TIMEOUT_MS`), 15s plus tard que
  la convention documentée (`CALL_TIMEOUT_MS` commentaire, ligne 34-40) et sans le nettoyage
  local immédiat (reset du store, arrêt de la sonnerie) que le timer client apporte. Confirmé en
  écrivant d'abord le test contre l'ANCIEN code (RED réel, pas un skip) : `git stash` du fichier de
  prod, les 3 nouveaux cas exécutés — 1/3 rouge avec le message d'assertion attendu (`leaveEmit`
  jamais émis), les 2 autres verts par coïncidence structurelle (aucun ne testait le comportement visé
  seul).
- **Fix** : le `clearCallTimeout()` quitte `handleParticipantJoined` (qui garde `setIceServers`/
  `addParticipant`, tous deux corrects et sans rapport). Un nouvel effet réactif, sibling de celui qui
  arme le timer pour l'initiateur (même fichier, juste au-dessus), clôt le timer dès que
  `currentCall.status` bascule à `'active'` — le SEUL signal qui représente un décroché réel des DEUX
  côtés (`useWebRTCP2P`'s `handleAnswer` pour le caller depuis la Vague 113 ; l'accept local du callee
  dans `acceptOrJoinCall`, qui appelait déjà `clearCallTimeout()` directement en plus, l'effet y est
  simplement redondant et sans effet — `clearTimeout` sur une ref déjà nulle est un no-op gardé).
  Aucune modification de `startCallTimeout`/l'armement, aucune modification du chemin de création
  d'offre WebRTC (toujours piloté par `addParticipant`, inchangé).
- **Tests** (TDD, RED confirmé ci-dessus AVANT le fix) :
  - `CallManager.noAnswerEarlyJoin.test.tsx` (nouveau, 3 cas) : le timer 45s reste armé et émet
    `call:leave` après un `call:participant-joined` qui ne fait JAMAIS basculer `status` à `'active'`
    (early-join simulé) ; le timer ne se déclenche plus si `status` bascule à `'active'` après ce même
    early-join (décroché réel simulé via `updateCallStatus('active')`, mirroir de `handleAnswer`) ;
    l'ajout du participant à `currentCall.participants` reste inchangé (non-régression sur le reste du
    handler).
  - Sweep complet `--testPathPatterns="[Cc]all"` — **50 suites / 424 tests verts**, 0 régression.
  - `npx tsc --noEmit` : diff normalisé (numéros de ligne/colonne neutralisés) AVANT/APRÈS (`git
    stash` du fichier de prod touché) — **identique caractère pour caractère**, mêmes 1757 erreurs
    pré-existantes ; aucune n'implique `CallManager.tsx` au-delà de son compte habituel (29 lignes,
    déjà présentes avant ce diff — casts socket `unknown` legacy, sans rapport).
  - `eslint`/`next lint` : indisponible dans ce sandbox (même erreur de config circulaire pré-existante
    que les vagues précédentes, plugin `react`).
- **Portée volontairement non étendue** : `use-webrtc-p2p.ts`'s `handleAnswer` n'a PAS reçu de miroir
  symétrique de ce fix — il n'a jamais eu de dépendance au timer 45s (celui-ci vit exclusivement dans
  `CallManager.tsx`), l'effet réactif ajouté ici couvre déjà les deux côtés via le seul champ partagé
  (`currentCall.status`). iOS n'a reçu aucune modification (hors d'atteinte de ce sandbox) : comme la
  Vague 113, c'est la lecture web du signal qui était fausse, pas l'émission iOS — `joinCallRoomReliably`
  reste inchangé et légitime.

### Reste ouvert

Reconduit tel quel (rien de plus trouvé ce cycle au-delà du fix ci-dessus) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ;
`removeParticipant()` web (Vague 91, non-régression) ; `call:force-leave`/`call:check-active` en
string literals hors du type-map partagé (cosmétique) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111) ; guard
`!isAnonymous` sur le poll `active-call` du bandeau (Vague 112) ; `CallInfoOverlay`'s
`participantCount` affichant brièvement 0 côté caller (Vague 112, cosmétique, non traité).

## Vague 115 — le bandeau « appel en cours, rejoindre » rejoignait TOUJOURS en audio-only, quelle que soit la vraie nature de l'appel (web+gateway) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche locale déjà
alignée sur `origin/main` (`c1d57dbd`, contient la Vague 114 — PR #2898 mergée), 0 commit
d'avance/retard. `list_pull_requests` n'a remonté qu'une seule PR ouverte (#2899, cycle 92 messaging,
messages autodestructibles — sans rapport, aucune collision). Audit dédié (agent Explore, lecture
seule, périmètre web+gateway, mandaté avec le backlog condensé des Vagues 63-114 pour éviter toute
redite) a remonté 5 candidats ; le premier (confiance la plus haute, root cause directement dans la
lignée de la Vague 112) retenu après relecture ligne à ligne directe de tous les fichiers cités.

- **Root cause confirmée par lecture directe** (`packages/shared/types/api-schemas.ts` +
  `apps/web/components/conversations/header/use-call-banner.ts`) : le contrat REST
  `GET /conversations/:id/active-call` sérialise via `callSessionSchema`/`callParticipantSchema` —
  une WHITELIST `fast-json-stringify` qui strippe silencieusement tout champ non déclaré (fix privacy
  2026-05-12, documenté dans `call-session-schema-serialization.test.ts`, qui raconte déjà un premier
  incident de la même classe : iOS lisait `mode=="video"` au lieu de `metadata.type`). Deux champs que
  le hook de la Vague 112 lit directement n'étaient PAS dans cette whitelist :
  - `answeredAt` était absent de `callSessionSchema` (seuls `startedAt`/`endedAt`/`duration` y
    figuraient). `activeCall.answeredAt` était donc TOUJOURS `undefined` sur le fil — le fallback
    `?? startedAt` de la Vague 112 (qui prétendait ancrer le chrono du bandeau sur le décroché réel,
    même correctif que la Vague 110) était inerte : le chrono affiché a toujours compté le temps de
    sonnerie comme temps de conversation, pour CE bandeau spécifiquement.
  - `isVideoEnabled`/`isAudioEnabled` sont absents de `callParticipantSchema` (seuls les champs
    INVERSÉS `isMuted`/`isVideoOff` y figurent, posés par `toCallParticipantResponse`,
    `call-session-response.ts:67-94`). `handleJoinCall` dérivait pourtant `callType` de
    `activeCall.participants.some(p => p.isVideoEnabled)` — toujours `false` sur le fil, donc
    `callType` toujours `'audio'`, quelle que soit la vraie nature de l'appel.
  Scénario concret atteignable via le chemin même que la Vague 112 vient d'ouvrir (le SEUL chemin de
  jonction pour un appel de groupe, `CallSystemMessage`/`call-live` étant restreint aux conversations
  `direct`) : un membre qui rate le ring initial (hors-ligne, autre onglet) voit le bandeau sur un
  appel VIDÉO en cours, tape « Rejoindre » → `requestJoin({callType:'audio'})` →
  `acceptOrJoinCall({isVideo:false})` → `getCallMediaConstraints('audio')` n'acquiert JAMAIS de flux
  vidéo (pas de prompt caméra) → le gate privacy du gateway (`CallService.joinCallAttempt`,
  `:1348-1354`) persiste `isVideoEnabled: false` pour ce joiner. Résultat : rejoint un appel vidéo sans
  jamais pouvoir émettre de vidéo, sans aucune explication visible — pas un cas limite, le seul chemin
  prévu pour ce scénario précis.
- **Fix** : (a) `answeredAt` ajouté à `callSessionSchema` (`packages/shared/types/api-schemas.ts`),
  miroir exact de `startedAt`/`endedAt` déjà présents — additif, aucune régression privacy (le champ
  n'a jamais fait partie du contenu sensible strippé par le fix 2026-05-12). (b) `handleJoinCall`
  dérive désormais `callType` de `activeCall.metadata?.type === 'video'` — `metadata.type` EST déjà
  whitelisté et documenté en commentaire comme « la SEULE source REST fiable du type d'appel »
  (`api-schemas.ts`, `mode` transportant l'architecture WebRTC p2p/sfu, jamais le type). Le champ
  `type?: 'audio' | 'video'` — posé côté serveur depuis toujours (`CallService.initiateCall`, lu à de
  nombreux sites gateway existants), simplement jamais typé côté client — est ajouté à l'interface
  partagée `CallMetadata` (`packages/shared/types/video-call.ts`) avec un commentaire explicite
  proscrivant toute dérivation future depuis `participants[].isVideoEnabled` (état média mutable,
  sans rapport avec la nature de l'appel). Deux fichiers de production modifiés côté contrat
  (`api-schemas.ts`, `video-call.ts`) + un côté consommateur (`use-call-banner.ts`).
- **Tests** (TDD, RED confirmé aux DEUX niveaux avant fix, via `git stash` du seul diff source puis
  ré-exécution réelle des nouveaux cas) :
  - `call-session-schema-serialization.test.ts` (gateway, 2 nouveaux cas) : `answeredAt` traverse la
    sérialisation `fast-json-stringify` intact ; un appel jamais décroché sérialise `answeredAt` à
    `null` (pas de `undefined` muet). RED confirmé : `expect(out.answeredAt).toBe(...)` échouait avec
    `Received: undefined` avant l'ajout au schema.
  - `use-call-banner.test.tsx` (web, 4 cas réécrits/ajoutés dans le describe `handleJoinCall`) :
    `callType` suit `metadata.type` (`'video'`/`'audio'`/absent → `'audio'` pour les sessions
    legacy) ; cas de RÉGRESSION dédié — un appel `metadata.type:'video'` avec tous les participants
    `isVideoEnabled:false` (l'état réel sur le fil AVANT ce fix) doit quand même rejoindre en vidéo.
    RED confirmé : 2/4 cas échouaient avec `Received: "audio"` contre l'ancien code (les deux autres,
    déjà couverts par construction du fallback, passaient par coïncidence). Les 2 tests existants
    fondés sur `participants[].isVideoEnabled` ont été réécrits pour piloter par `metadata.type` —
    l'ancien contrat qu'ils épinglaient était le bug lui-même, pas un comportement à préserver.
  - Sweep complet `--testPathPatterns="[Cc]all"` — **web : 50 suites / 426 tests verts** (+4 net) ;
    **gateway : 48 suites / 1125 tests verts** (+2 net) — 0 régression des deux côtés.
  - `npx tsc --noEmit` : **apps/web 1757 erreurs** (baseline documentée identique, zéro sur les 3
    fichiers touchés) ; **services/gateway 0 erreur** (inchangé). Prérequis CLAUDE.md rejoués (sandbox
    sans `node_modules` au démarrage) : `bun install --ignore-scripts` (racine + gateway), puis
    `packages/shared && npx prisma generate --generator client && bun run build` sans erreur.
    `eslint`/`next lint` : indisponible dans ce sandbox (même erreur de config circulaire
    pré-existante que les vagues précédentes, plugin `react`).
- **Portée volontairement non étendue** : aucun autre site ne dérive `callType`/le type d'appel depuis
  `participants[].isVideoEnabled` côté REST (`rg isVideoEnabled apps/web` : les 13 autres sites sont
  soit socket-fed (état média réel, en direct), soit ce même hook déjà corrigé) — pas de miroir
  nécessaire ailleurs. iOS n'a reçu aucune modification (hors d'atteinte de ce sandbox) : le contrat
  REST whitelisté est commun aux deux plateformes, mais `ActiveCallSession` (iOS) lit déjà
  `metadata.type` depuis l'incident P1-C documenté en tête du fichier de test gateway — seul ce hook
  web, ajouté par la Vague 112, avait la mauvaise lecture.
- **Backlog réévalué ce cycle** (audit dédié, cf. mandat ci-dessus) :
  - Item « `call:force-leave`/`call:check-active` en string literals hors du type-map partagé » —
    **CONFIRMÉ CORRIGÉ**, retiré du backlog. Lecture directe (`CallEventsHandler.ts:2698,1828`) : les
    deux handlers utilisent déjà `CLIENT_EVENTS.CALL_FORCE_LEAVE`/`CLIENT_EVENTS.CALL_CHECK_ACTIVE`
    (`socketio-events.ts:168,472,474`), plus de raw strings.
  - Item « `removeParticipant()` ne nettoie pas `connectedPeersRef`/`stalledPeersRef` » — **rétrogradé,
    probablement mort sous les contraintes actuelles**. Tracé jusqu'au seul call site
    (`VideoCallInterface.tsx`, handler `CALL_PARTICIPANT_LEFT` à délai 2s) contre `CallService.leaveCall`
    et le plafond P2P dur (`joinCallAttempt`, max 2 participants actifs) : sous le backend actuel, TOUT
    départ de participant termine l'appel entier pour l'autre côté, démonte `VideoCallInterface` et
    déclenche le `cleanup()` complet du hook (qui vide déjà toutes les refs) AVANT que
    `removeParticipant()` seul puisse jamais laisser une entrée périmée pour une connexion encore
    vivante. Candidat à retirer du backlog actif tant que le vrai multi-party (SFU) n'atterrit pas.

### Reste ouvert

Reconduit (moins les deux items réévalués ci-dessus) : dead code / god-object `CallManager.swift`
(~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall`
UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
`supportsHolding = false` (Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111, nécessite un vrai
sélecteur multi-périphériques, pas un quick fix) ; guard `!isAnonymous` sur le poll `active-call` du
bandeau (Vague 112, faible sévérité — 401 gaspillés, aucun impact fonctionnel) ; `CallInfoOverlay`'s
`participantCount` affichant brièvement 0 côté caller (Vague 112, cosmétique, non traité).

## Vague 116 — tout le chrome localisé de l'UI d'appel web s'affichait comme des clés brutes (`calls.controls.mute`), dans toutes les langues (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin`, branche locale `HEAD` alignée sur
`origin/main` (`4ecd765e6`, contient la Vague 115 — PR #2900 mergée), 0 commit d'avance/retard.
`list_pull_requests` n'a remonté qu'une seule PR ouverte (#2903, cycle 95 messaging/changelog — sans
rapport, aucune collision). Contrainte de sandbox inchangée : pas de toolchain Swift (`xcodebuild`/
`swift` absents), `ios-tests.yml` ne tourne pas sur PR et cette routine n'a pas `actions: write` pour
le déclencher à la main — périmètre volontairement restreint à web+gateway, vérifiable localement.
Audit dédié (agent Explore, lecture seule, périmètre gateway+web+ios léger) a remonté 2 candidats
UI mineurs (overlays de qualité superposés, un mot anglais isolé) ; en creusant le second à la main
avant de l'implémenter, une classe de bug bien plus large est apparue dans le même hook.

- **Root cause confirmée par exécution directe de la logique du hook** (`apps/web/hooks/use-i18n.ts`) :
  `loadTranslations` charge `locales/{locale}/calls.json`, dont la racine est `{ "calls": {...} }`
  (comme TOUS les namespaces du dépôt — `auth.json` → `{ "auth": {...} }`, etc.), puis
  `if (ns in translations) translations = translations[ns]` **déballe** ce wrapper avant de le confier
  à `t()`. Les 16 fichiers de l'UI d'appel (`components/video-calls/*`, `components/video-call/*`,
  `hooks/conversations/use-video-call.ts`, `use-call-retry-toast.ts`) appellent pourtant
  `useI18n('calls')` puis **`t('calls.controls.mute')`** — la clé porte le préfixe du namespace en
  plus, alors que l'objet déballé ne l'a plus. `t()` cherche `translations['calls']` → absent → tombe
  sur `fallback || key` → **aucun de ces 16 fichiers n'a de fallback** → la clé brute complète
  (`"calls.controls.mute"`, `"calls.error.title"`, `"calls.remoteAlerts.qualityDegraded"`, …) est
  rendue littéralement à l'écran, en `aria-label`, en `title`, en texte visible — dans TOUTES les
  langues, y compris l'anglais. Vérifié par relecture croisée : `PermissionRequest.tsx` et
  `CallInfoOverlay.tsx`, dans le même dossier, avec le même `useI18n('calls')`, appellent correctement
  `t('permissions.error.denied')`/`t('info.participant')` (sans préfixe) — la preuve qu'il existe un
  pattern correct voisin, et que les 16 fichiers fautifs en dérivent par erreur de copier-coller.
  Reproduit en isolant l'exact algorithme de `loadTranslations`/`t()` dans un script Node contre le
  vrai `locales/en/calls.json` : `t('calls.quality.details')` → `"MISS:calls.quality.details"`,
  `t('quality.details')` → `"Connection Quality Details"`.
  Portée : **103 sites d'appel** à travers les 16 fichiers — boutons de contrôle d'appel
  (mute/unmute/haut-parleur/caméra/raccrocher), overlay de qualité de connexion, bannière d'appel en
  cours, notification d'appel entrant, bandeau d'attente, error boundary, sous-titres, tous les toasts
  d'erreur d'appel. Ce n'est pas un défaut cosmétique isolé : c'est l'intégralité du chrome localisé
  de la surface d'appel web qui n'a jamais affiché une seule chaîne traduite depuis l'introduction de
  ces fichiers.
- **Fix** : retrait mécanique du préfixe `calls.` redondant sur les 103 sites `t('calls.xxx')` →
  `t('xxx')` dans les 16 fichiers de production, plus un site en template-ternaire
  (`OngoingCallBanner.tsx:38`, `t(cond ? 'calls.banner.participant' : 'calls.banner.participants', …)`)
  qu'un premier passage par `sed` ciblé sur `t('calls\.` avait manqué (le littéral n'est pas collé à
  l'appel `t(`). Aucun changement de structure des fichiers de locale (`locales/*/calls.json`) —
  le contenu était déjà correct, seule la clé de lookup était fautive.
- **Tests** (TDD, RED confirmé avant fix) :
  - Nouveau fichier `__tests__/components/video-calls/calls-i18n-regression.test.tsx` : contrairement
    à la suite existante de chaque composant (qui mocke `t` en fonction identité `(k) => k` — une clé
    fautive s'y "traduit" par elle-même, donc ne peut PAS détecter cette classe de bug), ce test rend
    `CallControls` avec le VRAI hook `useI18n` et les VRAIS fichiers `locales/{en,fr}/calls.json`
    (seul `@/stores` est mocké, pour piloter la locale), et affirme que les `aria-label` réels des
    boutons "mute"/"end call" égalent les chaînes traduites du catalogue — plus un garde généraliste
    (`queryByText(/^calls\./)`) qui échoue si un préfixe de namespace refait surface n'importe où dans
    l'arbre rendu. RED confirmé par `git stash` du seul fichier `CallControls.tsx` puis
    ré-exécution : les 2 nouveaux cas échouent avec `Received: "calls.controls.mute"` là où
    `findByRole` attendait la vraie chaîne du catalogue — la classe de bug est bien détectée, pas
    seulement supposée.
  - Les 11 fichiers de test existants qui épinglaient l'ancien comportement fautif (`getByText`/
    `getByRole({name:...})` attendant littéralement `'calls.controls.mute'` etc., cohérent avec le mock
    identité) ont été mis à jour pour attendre la clé SANS préfixe — même contrat que `t: k => k`,
    juste la bonne clé côté production. Un site raté au premier passage `sed` (littéral dans un
    `RegExp`, `VideoCallInterface.test.tsx:314`, non capturé par un remplacement de chaînes entre
    guillemets) corrigé après un sweep dédié aux regex.
  - Sweep complet `--testPathPatterns="[Cc]all"` (web) : **51 suites / 428 tests verts** (+1 suite/+2
    tests nets vs. la Vague 115). Gateway non touché ce cycle (bug 100% front-end), suite non
    ré-exécutée.
  - `npx tsc --noEmit` (apps/web) : **1757 erreurs, baseline documentée identique** (Vague 115 même
    chiffre), zéro nouvelle erreur sur les 16 fichiers de production ni sur les fichiers de test
    touchés (toutes les erreurs pré-existantes tombent sur des fichiers non liés :
    `VideoLightbox.tsx`, `use-communities-query.ts`, `CallManager.tsx`/`VideoCallInterface.tsx` sur
    des lignes `unknown`/socket-typing distinctes des lignes modifiées ici).
  - `eslint`/`next lint` : indisponible dans ce sandbox (même erreur de config circulaire
    pré-existante sur le plugin `react`, notée depuis plusieurs vagues).
  - Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install
    --ignore-scripts` (le script postinstall natif de `grpc-tools` échoue en réseau restreint, comme
    documenté ; sans impact sur web/jest), puis `packages/shared && npx prisma generate --generator
    client`.
- **Découverte annexe traitée en amont, pas implémentée séparément** : le premier candidat de l'audit
  (deux overlays de qualité de connexion superposés au même coin de l'écran,
  `VideoCallInterface.tsx:652-668`) et le mot anglais isolé dans `ConnectionQualityBadgeCompact`
  restent RÉELS et non corrigés ce cycle — la découverte du bug de préfixe namespace, bien plus large
  et plus sévère (racine commune à la totalité de l'UI d'appel plutôt qu'à un seul composant), a pris
  la priorité. Reportés au backlog ci-dessous.

### Reste ouvert

Reconduit (moins rien ce cycle, plus 2 items) : dead code / god-object `CallManager.swift` (~5880
lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only
(Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
`supportsHolding = false` (Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111, nécessite un vrai
sélecteur multi-périphériques, pas un quick fix) ; guard `!isAnonymous` sur le poll `active-call` du
bandeau (Vague 112, faible sévérité — 401 gaspillés, aucun impact fonctionnel) ; `CallInfoOverlay`'s
`participantCount` affichant brièvement 0 côté caller (Vague 112, cosmétique, non traité) ;
**`CallStatusIndicator` et `CallQualityOverlay` (`ConnectionQualityBadge`) se superposent tous les
deux en `absolute top-4 right-4` dans `VideoCallInterface.tsx` dès que la connexion se dégrade ou que
l'utilisateur ouvre les stats** (Vague 116, `CallStatusIndicator` dérive sa propre qualité d'un
`getQualityFromState` local au lieu des vraies `qualityStats`, et sa prop `callDuration` est morte —
déstructurée `_callDuration`, jamais utilisée — signe qu'il s'agit d'un prédécesseur de
`CallInfoOverlay` jamais retiré) ; **`ConnectionQualityBadgeCompact` (`ConnectionQualityBadge.tsx:130`)
code en dur le mot anglais `"connection"` et n'appelle pas `useI18n`, seul point de l'UI d'appel
encore non localisé après ce cycle** (Vague 116, nécessite 4 nouvelles clés de catalogue par locale,
pas un simple retrait de préfixe comme le reste de ce cycle).

## Vague 117 — `CallStatusIndicator` retiré : cluster de qualité dupliqué/superposé à `CallQualityOverlay` (web) (2026-08-12)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session,
même journée que la Vague 116. Base explicite sur le développement précédent : `git fetch origin main`,
branche locale réalignée sur `origin/main` (`61a483e9`, contient la Vague 116 — PR mergée). Aucune PR
ouverte sur la branche désignée de cette session (`list_pull_requests` vide). Contrainte de sandbox
inchangée : pas de toolchain Swift/Kotlin (`xcodebuild`/`swift`/`gradle` absents) — périmètre restreint
à web+gateway, vérifiable localement. Repris directement l'item le plus concret du backlog « Reste
ouvert » de la Vague 116 plutôt que de relancer un audit générique.

- **Root cause confirmée par lecture directe** : `VideoCallInterface.tsx` monte à la fois
  `<CallStatusIndicator connectionState callDuration participantName={remoteParticipant?.username ||
  'Unknown'} />` et `<CallQualityOverlay stats={qualityStats} .../>` — les DEUX en
  `absolute top-4 right-4` (`CallStatusIndicator.tsx:35`, `CallQualityOverlay.tsx:44`), sans le moindre
  décalage vertical entre les deux. Deux pavés `bg-black/60 backdrop-blur-sm rounded-lg` se superposent
  donc à l'écran pile au même endroit dès que `CallQualityOverlay` a quelque chose à montrer (qualité
  dégradée, `showStats`, pill de survie, alertes distantes) — pas un cas limite, la position par défaut
  des deux composants dans le DOM.
  Les deux informations que `CallStatusIndicator` affichait étaient elles-mêmes dupliquées ailleurs et
  MOINS fiables que leur double :
  - Qualité : `CallStatusIndicator.getQualityFromState()` dérive une qualité approximative du seul
    `RTCPeerConnectionState` brut (`'connected' → 'excellent'`, toujours, indépendamment de la vraie
    perte de paquets/latence), alors que `CallQualityOverlay`/`ConnectionQualityBadge` lit les vraies
    `qualityStats` mesurées.
  - Nom du participant : `VideoStream.tsx:134` affiche déjà `participantName` en label sur la tuile
    vidéo elle-même — `CallStatusIndicator` le réaffichait une seconde fois en haut à droite, avec en
    plus un fallback `'Unknown'` codé en dur (jamais passé par `t()`, seule chaîne non traduite du
    composant).
  - `callDuration` (prop reçue) était mort : déstructuré `callDuration: _callDuration = 0`, jamais lu
    dans le corps du composant — signe que `CallStatusIndicator` est un prédécesseur de `CallInfoOverlay`
    (qui affiche la vraie durée, top-left) jamais retiré à l'introduction de ce dernier.
  Aucun autre call site : `grep -rn CallStatusIndicator apps/web` ne remontait que l'export du barrel,
  le composant lui-même et son import unique dans `VideoCallInterface.tsx` — sûr à supprimer entièrement
  plutôt qu'à repositionner.
- **Fix** : suppression pure du composant (fichier + import + usage JSX + export du barrel
  `components/video-calls/index.ts`), suivant le précédent déjà établi dans ce même barrel pour
  `useWebRTC` (Vague 33) et `useVideoFilters` (Vague 68) — documenté en tête du fichier de test du
  barrel plutôt que dans `index.ts` lui-même (sinon le doc-comment matche sa propre regex de garde).
  `connectionState` reste utilisé ailleurs dans `VideoCallInterface.tsx` (watchdog de connexion, label
  `status.connecting` de la tuile vidéo vide) — aucune variable orpheline. 9 clés `status.{starting,
  reconnecting,failed,disconnected,connected,quality.{excellent,good,poor,offline}}` des 4 fichiers de
  locale (`locales/{en,fr,es,pt}/calls.json`) n'avaient plus aucun appelant après la suppression
  (vérifié par grep exhaustif de chaque clé avant retrait) — retirées ; `status.connecting` conservé
  (toujours utilisé par `VideoCallInterface.tsx:751`). `README.md` du dossier mis à jour (retrait de la
  section + de la ligne d'arborescence, note « intentionally no CallStatusIndicator » suivant le même
  style que les notes existantes pour `useWebRTC`/`useCallSignaling`).
- **Tests** (TDD, RED confirmé avant fix — pas de `git stash` nécessaire, écrits puis exécutés avant
  toute modification de production) :
  - 2 nouveaux cas dans `index.test.ts` (garde du barrel, même patron que les gardes `useWebRTC`/
    `useVideoFilters` déjà en place) : le barrel n'exporte plus `CallStatusIndicator`, le fichier n'est
    plus livré. RED confirmé : les deux échouaient contre le code d'avant fix (`Received: true` /
    export toujours présent).
  - 1 nouveau cas dans `VideoCallInterface.test.tsx` : `screen.queryByText('Unknown')` absent après
    rendu — le fallback codé en dur de `CallStatusIndicator`, jamais utilisé ailleurs dans l'arbre, sert
    de sentinelle directe (pas besoin de compter les clusters DOM). RED confirmé :
    `found <div class="text-white text-xs">Unknown</div>` avant le retrait du composant.
  - Sweep complet `--testPathPatterns="[Cc]all"` (web) : **51 suites / 431 tests verts** (+3 nets vs.
    Vague 116), 0 régression.
  - `npx tsc --noEmit` (apps/web) : **1757 erreurs, baseline identique** (Vague 115/116 même chiffre),
    zéro nouvelle erreur ; les erreurs pré-existantes sur `VideoCallInterface.tsx` (lignes 158-553,
    `unknown`/socket-typing) sont toutes loin du site édité (~650) et inchangées.
  - Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install
    --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client`.
  - `eslint`/`next lint` : indisponible dans ce sandbox (même erreur de config circulaire pré-existante
    sur le plugin `react`, notée depuis plusieurs vagues).
- **Portée volontairement non étendue** : les deux autres items « Reste ouvert » de la Vague 116
  (`ConnectionQualityBadgeCompact` code en dur `"connection"`, `CallInfoOverlay.participantCount`
  brièvement à 0) non traités ce cycle — un seul fix substantiel par cycle, cohérent avec le rythme
  observé sur les vagues récentes. iOS/Android non touchés (aucune toolchain dans ce sandbox) ; le
  god-object `CallManager.swift` (~5880 lignes) reste hors d'atteinte pour la même raison — tout
  refactor de ce fichier sans compilateur Swift disponible serait invérifiable avant merge, donc non
  entrepris.

### Reste ouvert

Reconduit (moins l'item `CallStatusIndicator`/`CallQualityOverlay` résolu ce cycle) : dead code /
god-object `CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ; toolchains
iOS/Android hors d'atteinte dans ce sandbox ; sélection réelle de périphérique de sortie audio
(`setSinkId`, Vague 111, nécessite un vrai sélecteur multi-périphériques, pas un quick fix) ; guard
`!isAnonymous` sur le poll `active-call` du bandeau (Vague 112, faible sévérité — 401 gaspillés, aucun
impact fonctionnel) ; `CallInfoOverlay`'s `participantCount` affichant brièvement 0 côté caller
(Vague 112, cosmétique, non traité) ; `ConnectionQualityBadgeCompact` (`ConnectionQualityBadge.tsx:130`)
code en dur le mot anglais `"connection"` et n'appelle pas `useI18n`, seul point de l'UI d'appel encore
non localisé (Vague 116, nécessite 4 nouvelles clés de catalogue par locale, pas un simple retrait de
préfixe).

## Vague 118 — `ConnectionQualityBadgeCompact` retiré : dead code non traduit plutôt que traduit (2026-08-13)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle session.
Base explicite sur le développement précédent : `git fetch origin main`, branche réalignée sur
`origin/main` (`95835097`, contient la Vague 117 + le lot `gwcontract-04`/`03` — PRs mergées). Aucune
PR ouverte sur la branche désignée de cette session (`list_pull_requests` vide, 2 PR ouvertes sans
rapport avec les appels). Ce cycle a aussi lu `tasks/2026-08-13-group-calls-gap-analysis.md` (analyse
d'écart infra appels de groupe, S1/W1-W5 déjà levés le même jour sur une autre branche) — hors scope
ici, item repris indépendamment sur le backlog « Reste ouvert » ci-dessus.

- **Root cause confirmée par lecture directe** : `ConnectionQualityBadgeCompact`
  (`ConnectionQualityBadge.tsx:107`) n'était exporté ni par le barrel `index.ts`, ni importé nulle
  part — `grep -rn "ConnectionQualityBadgeCompact" apps/web` ne remontait que sa propre définition.
  Le backlog (Vague 116) le décrivait comme « seul point de l'UI d'appel encore non localisé,
  nécessite 4 nouvelles clés de catalogue » — en résolvant d'abord la question « ce composant a-t-il
  seulement un appelant ? » (le réflexe de la Vague 117 : chercher TOUS les call sites avant de
  corriger), la vraie réponse est que non : le composant est mort, donc le localiser aurait traduit
  du code que personne ne rend, en ajoutant 16 clés (4 langues × 4 chaînes) mortes dès leur ajout.
- **Fix** : suppression pure de la fonction (le composant `ConnectionQualityBadge`, seul réellement
  monté par `CallQualityOverlay`, est inchangé — `getQualityLabel`/`getQualityIcon` restent utilisés
  par lui). Aucun export de barrel à retirer (jamais exporté). Aucune clé de locale à retirer (jamais
  ajoutée). Suit le même précédent que `useWebRTC` (Vague 33), `useVideoFilters` (Vague 68) et
  `CallStatusIndicator` (Vague 117) — documenté dans le même doc-comment de garde du barrel plutôt que
  dans `index.ts` lui-même.
- **Tests** (TDD, RED confirmé avant fix) : 2 nouveaux cas dans `index.test.ts` — le barrel ne
  mentionne pas `ConnectionQualityBadgeCompact` (déjà vrai, garde de non-régression future) et le
  fichier `ConnectionQualityBadge.tsx` lui-même ne l'exporte plus. RED confirmé par exécution avant
  le retrait : `Received: "...export function ConnectionQualityBadgeCompact..."` sur le second cas.
  Sweep complet `--testPathPatterns="[Cc]all"` (web) : **52 suites / 462 tests verts**, 0 régression.
  `npx tsc --noEmit` (apps/web) : **1764 erreurs, baseline identique confirmée par `git stash`**
  (compté avec ET sans le fix — même chiffre, donc 0 nouvelle erreur ; le delta apparent vs. le
  chiffre 1757 des Vagues 115/116/117 est un bruit d'environnement préexistant, sans rapport avec ce
  fichier — `grep ConnectionQualityBadge` sur la sortie tsc : 0 occurrence avant et après). Prérequis
  CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts` (bun
  1.3.11 disponible localement, pas 1.3.14 — sans impact observé sur les résultats), puis
  `packages/shared && npx prisma generate --generator client` + `bun run build`.
- **Portée volontairement non étendue** : les autres items « Reste ouvert » (god-object
  `CallManager.swift`, `CallInfoOverlay.participantCount`, guard `!isAnonymous`, `setSinkId`) non
  traités ce cycle — un seul fix substantiel, cohérent avec le rythme des vagues récentes.
  iOS/Android non touchés (aucune toolchain dans ce sandbox).

### Reste ouvert

Reconduit (moins `ConnectionQualityBadgeCompact` résolu ce cycle, retiré du dernier item de la liste
ci-dessus) : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue`
non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android
de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device
requis) ; toolchains iOS/Android hors d'atteinte dans ce sandbox ; sélection réelle de périphérique
de sortie audio (`setSinkId`, Vague 111, nécessite un vrai sélecteur multi-périphériques, pas un
quick fix) ; `CallInfoOverlay`'s `participantCount` affichant brièvement 0 côté caller (Vague 112,
cosmétique, non traité). Voir aussi `tasks/2026-08-13-group-calls-gap-analysis.md` pour le chantier
séparé « appels de groupe » (W6/W7 web, I1-I7 iOS, SFU) en cours sur une autre branche le même jour.

## Vague 119 — guard `!isAnonymous` sur le poll `GET /active-call` du bandeau (web) (2026-08-13)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle
session déclenchée par le prompt élargi (FaceTime-quality 12-phases). Base explicite sur le
développement précédent : `git fetch origin main`, branche locale réalignée sur `origin/main`
(`512b0e05b`, contient la Vague 118 — PR mergée). Aucune PR ouverte sur la branche désignée de cette
session. Contrainte de sandbox inchangée : ni `xcodebuild`/`swift` ni toolchain Android complet
disponibles pour un build/run réel (seul `gradle` binaire présent, sans SDK Android configuré) —
périmètre restreint à web+gateway, vérifiable localement. Repris directement le dernier item
concret du backlog « Reste ouvert » plutôt que de relancer un audit générique du dossier calls.

- **Root cause confirmée par lecture directe** : `useCallBanner` (`use-call-banner.ts`) monte un
  `useQuery` avec `refetchInterval: 15_000` et `enabled: !!conversationId` — aucune autre condition.
  Le hook est monté par `ConversationHeader`, donc actif sur CHAQUE conversation ouverte, y compris
  par un visiteur anonyme (lien de partage, `X-Session-Token`, pas de JWT). Or la route qu'il
  interroge (`GET /conversations/:id/active-call`, `routes/calls.ts:83-85`) construit son middleware
  avec `createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false })` — un
  visiteur anonyme reçoit systématiquement un 401, jamais un 200. Confirmé par le commentaire déjà
  présent sur `calls.service.ts:13` (« anonymous users refused ») : le service le savait, le hook
  appelant ne le respectait pas. Conséquence concrète au-delà du bruit de log : la route est
  rate-limited 10/min (`ROUTE_RATE_LIMITS.callOperations`) — un visiteur anonyme avec plusieurs
  onglets/conversations ouverts pouvait épuiser ce quota sans qu'aucun appel n'ait jamais pu
  aboutir, avant même d'atteindre un besoin légitime.
- **Fix** : le hook lit désormais l'utilisateur courant via `useUser()` (sélecteur Zustand pur,
  `@/stores/auth-store`, déjà utilisé ailleurs dans l'app — aucun effet de bord, contrairement au
  hook `useAuth()` plus lourd qui pilote aussi des redirections) et dérive l'anonymat avec
  `isUserAnonymous()` (`@/utils/auth`, déjà la source de vérité unique testée pour cette question —
  pas de logique d'anonymat réimplémentée localement). `enabled` passe à
  `!!conversationId && !isAnonymous`. Signature du hook inchangée (`useCallBanner(conversationId)`,
  toujours 1 paramètre) — pas de prop à faire remonter jusqu'à `ConversationHeader`/`ConversationHeaderProps`,
  suivant le principe Single Source of Truth plutôt que de threader l'info à travers l'arbre de
  composants. Query React Query désactivée = zéro requête émise, zéro tick de `refetchInterval` —
  pas seulement un guard sur le résultat.
- **Tests** (TDD, RED confirmé par `git stash` du seul fichier de production avant de committer) :
  2 nouveaux cas dans `use-call-banner.test.tsx` — un viewer anonyme ne déclenche jamais
  `getActiveCall` (banner reste fermé, `currentCall` reste `null`), et le polling reprend dès que le
  même hook re-render avec un utilisateur non-anonyme (transition anonyme → authentifié en cours de
  session, ex. connexion depuis un lien de partage). RED confirmé : les deux échouaient contre le
  code d'avant fix avec `Received number of calls: 1` sur `getActiveCall`. Les 20 cas existants du
  fichier passent sans modification (le store réel démarre à `user: null`, `isUserAnonymous(null)`
  retourne `false` — comportement par défaut inchangé, zéro mock à toucher).
  Sweep complet `--testPathPatterns="[Cc]all"` (web) : **52 suites / 464 tests verts** (+2 nets vs.
  Vague 118), 0 régression. `npx tsc --noEmit` (apps/web) : 0 occurrence de `use-call-banner` dans
  la sortie, avant et après le fix — aucune nouvelle erreur imputable à ce changement (le total
  brut de la commande a dérivé depuis les Vagues 115-118, confirmé être du bruit d'environnement
  préexistant sans rapport avec ce fichier, cf. note similaire Vague 118). Prérequis CLAUDE.md
  rejoués (sandbox sans `node_modules` au démarrage) : `bun install --ignore-scripts` (bun 1.3.11
  disponible localement, pas 1.3.14), puis `packages/shared && npx prisma generate --generator
  client` + `bun run build`.
- **Portée volontairement non étendue** : dead code / god-object `CallManager.swift` (~5880 lignes),
  `CallInfoOverlay.participantCount` à 0 transitoire, `setSinkId`, `CXSetHeldCallAction`, les 6
  trouvailles Android de la Vague 70 — non traités ce cycle, toolchains iOS/Android toujours hors
  d'atteinte dans ce sandbox pour vérifier un changement Swift/Kotlin avant merge.

### Reste ouvert

Reconduit (moins l'item `!isAnonymous` résolu ce cycle) : dead code / god-object `CallManager.swift`
(~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall`
UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs.
`supportsHolding = false` (Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans
ce sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`, Vague 111, nécessite un
vrai sélecteur multi-périphériques, pas un quick fix) ; `CallInfoOverlay`'s `participantCount`
affichant brièvement 0 côté caller (Vague 112, cosmétique, non traité). Voir aussi
`tasks/2026-08-13-group-calls-gap-analysis.md` pour le chantier séparé « appels de groupe » (W6/W7
web, I1-I7 iOS, SFU) en cours sur une autre branche le même jour.

## Vague 120 — `VideoFilterCapturerDelegate` dupliquait le gate `isEnabled` déjà corrigé dans `process()` (iOS) (2026-08-14)

- **Root cause** : la Vague 107 (#2859) avait corrigé le no-op silencieux des filtres avancés
  (background blur / skin smoothing) activés sans preset de colorimétrie, en élargissant le guard
  de `VideoFilterPipeline.process()` à `cfg.isEnabled || cfg.hasAdvancedFilters`, et avait aligné
  les deux indicateurs UI (`CallView.hasActiveEffects`, `CallEffectsOverlay`) sur la même
  condition. Un QUATRIÈME site restait sur l'ancien gate : `VideoFilterCapturerDelegate.capturer(
  _:didCapture:)` — le callback WebRTC qui décide s'il appelle `pipeline.process()` DU TOUT —
  continuait à ne l'invoquer que `if pipeline.config.isEnabled`. Résultat : le correctif de
  `process()` n'était jamais atteint depuis la capture réelle. Un utilisateur activant le flou
  d'arrière-plan ou le lissage de peau sans jamais choisir de preset voyait le chip "Filtres"
  s'allumer (indicateur corrigé) alors que la frame envoyée au pair restait NON filtrée — la même
  panne que #2859 croyait avoir fermée, plus une régression UI (l'indicateur ment désormais dans
  ce cas précis).
- **Fix** : suppression du gate dupliqué `if pipeline.config.isEnabled` au call site. `process()`
  est désormais la SEULE source de vérité pour « cette frame doit-elle traverser le pipeline » —
  toujours appelé, son propre guard interne fait l'early-return bon marché quand aucun filtre
  n'est actif. Élimine la classe de bug (deux conditions identiques à faire évoluer ensemble) au
  lieu de patcher le symptôme.
- **Tests** : `VideoFilterCapturerDelegateTests` (nouveau, `VideoFilterPipelineTests.swift`,
  `#if canImport(WebRTC)`) — construit un vrai `RTCVideoCapturer`/`RTCVideoFrame`/
  `RTCCVPixelBuffer` et un spy `RTCVideoCapturerDelegate`, invoque `capturer(_:didCapture:)`
  directement. 3 cas : blur seul → `process()` atteint (`lastFrameProcessingTime` non-nil) ;
  smoothing seul → idem ; aucun filtre → `process()` toujours atteint mais early-return
  (`lastFrameProcessingTime` nil), frame originale toujours forwardée au target dans les 3 cas.
  Miroir exact du triptyque déjà existant dans `VideoFilterPipelineTests` pour `process()`
  lui-même (Vague 107), au niveau du call site manqué.
  Build/tests non exécutables dans ce sandbox Linux (pas d'Xcode/WebRTC) — vérifié par lecture de
  source directe (signatures `RTCVideoCapturer(delegate:)` / `RTCVideoFrame(buffer:rotation:
  timeStampNs:)` / `RTCCVPixelBuffer(pixelBuffer:)` déjà utilisées ailleurs dans le fichier de
  production) ; vérification réelle déférée au job CI macOS « iOS Tests », PR suivie jusqu'au vert
  avant merge — même pratique que Vague 107/#2965.
- **Portée volontairement non étendue** : les items déjà listés en « Reste ouvert » ci-dessus
  (god-object `CallManager.swift`, `setSinkId`, etc.) — trouvaille isolée d'un audit ciblé sur le
  call site WebRTC de `VideoFilterPipeline`, pas un balayage complet du fichier.

### Reste ouvert (mis à jour)

Reconduit à l'identique (aucun item de cette liste résolu ce cycle) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ; busy-path
`reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ; piste
`CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ; toolchains
iOS/Android hors d'atteinte dans ce sandbox ; sélection réelle de périphérique de sortie audio
(`setSinkId`, Vague 111) ; `CallInfoOverlay`'s `participantCount` affichant brièvement 0 côté
caller (Vague 112, cosmétique). Voir aussi `tasks/2026-08-13-group-calls-gap-analysis.md` pour le
chantier « appels de groupe ».

## Vague 120 — `CallInfoOverlay.participantCount` sous-comptait de 1 (auto-exclusion permanente) (2026-08-13)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle
session déclenchée par le prompt élargi (FaceTime-quality 12-phases). Base explicite sur le
développement précédent : `git fetch origin main`, branche désignée réalignée sur `origin/main`
(`a1b284d0`, contient la Vague 119 — PR mergée). Aucune PR ouverte sur la branche désignée de
cette session. Repris directement le dernier item concret du backlog « Reste ouvert » —
`CallInfoOverlay`'s `participantCount` (Vague 112) — plutôt que de relancer un audit générique.

- **Root cause creusée au-delà de la note d'origine — pas « brièvement 0 », mais tout l'écran
  d'appel systématiquement sous-compté d'une unité.** `currentCall.participants` NE contient
  JAMAIS l'utilisateur local, pour les DEUX rôles, par construction serveur : le broadcast
  `call:participant-joined` (`CallEventsHandler.ts`) saute explicitement le socket qui vient de
  rejoindre (`if (remoteSocket.id === socket.id) continue`), et l'ack `call:initiate` côté appelant
  amorce `participants: []` par conception (`use-video-call.ts`, commentaire « populated as callees
  join »). Comme `VideoCallInterface` ne monte QUE pendant que `isInCall` est vrai
  (`CallManager.tsx:1226`), l'utilisateur local fait TOUJOURS partie de l'appel pendant toute la
  durée de vie du composant — jamais un cas où il faudrait l'exclure. Conséquence concrète, pas
  seulement cosmétique : un appelant regardant son propre écran pendant que le combiné du callee
  sonne encore voyait « 0 participants » (pas juste un flash — `setCurrentCall` amorce `isInCall:
  true` dès l'ack, donc l'overlay est monté et affiché tout le temps de la sonnerie) ; un appel 1:1
  connecté affichait en permanence « 1 participant » pour DEUX personnes réellement en ligne.
- **Fix** : `VideoCallInterface.tsx` ajoute `+ 1` au compte dérivé de
  `participants.filter(p => !p.leftAt).length` — l'utilisateur local complète toujours le total,
  jamais de double-comptage possible puisque le serveur garantit son absence de `participants` par
  construction (prouvé ci-dessus, pas supposé). `CallInfoOverlay.tsx` gagne
  `data-testid="call-participant-count"` / `data-count={participantCount}` sur la ligne du
  compteur — même précédent que `data-testid="call-duration"` — pour que les tests container
  puissent asserter la valeur numérique indépendamment de l'interpolation i18n (le mock `t()` de
  `VideoCallInterface.test.tsx` renvoie la clé brute, sans substituer `{count}`).
- **Tests** (TDD, RED confirmé avant fix) : 2 nouveaux cas dans `VideoCallInterface.test.tsx` —
  compte l'utilisateur local dès la sonnerie (`participants: []` → `data-count="1"`, pas `"0"`) et
  aux côtés de chaque participant réellement actif (`participants` avec un pair présent + un pair
  parti filtré par `!p.leftAt` → `data-count="2"`, pas `"1"`). RED confirmé par exécution ciblée
  avant le fix : `Received: data-count="0"` puis `data-count="1"` sur les deux nouvelles
  assertions respectivement. Sweep complet `--testPathPatterns="[Cc]all"` (web) : **52 suites /
  466 tests verts** (+2 nets vs. Vague 119), 0 régression. `npx tsc --noEmit` : **1229 erreurs,
  baseline identique confirmée par `git stash`** (compté avec ET sans le fix — même chiffre) ;
  aucune des 11 erreurs préexistantes de `VideoCallInterface.tsx` (lignes 201-596,
  `unknown`/socket-typing, inchangées depuis les Vagues 115-119) ne touche les lignes éditées.
  Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install
  --ignore-scripts` (bun 1.3.11 disponible localement, pas 1.3.14), puis `packages/shared && npx
  prisma generate --generator client` + `bun run build`.
- **PR** : https://github.com/isopen-io/meeshy/pull/2975 — `claude/upbeat-dirac-qzfej3`
  (branche désignée de cette session, réalignée sur `origin/main` avant tout `Write`/`Edit`). CI
  complète verte, mergée (`5d789c89`). `main` re-synchronisé après merge (`git fetch` + reset sur
  `origin/main`, le `main` local ayant dérivé de manière non-résolvable — 340 commits locaux
  jamais poussés vs. 194 côté origin, artefact d'environnement sans rapport avec le travail de
  cette session ; aucune perte, tout le travail réel de cette session vivait déjà sur la branche
  désignée poussée sur `origin`).
- **Portée volontairement non étendue** : dead code / god-object `CallManager.swift`, `setSinkId`,
  `CXSetHeldCallAction`, les 6 trouvailles Android de la Vague 70 — non traités ce cycle, toolchains
  iOS/Android toujours hors d'atteinte dans ce sandbox pour vérifier un changement Swift/Kotlin
  avant merge. Une PR concurrente d'une autre session de la même routine (#2978,
  `claude/upbeat-dirac-x24ovb`, fix iOS `VideoFilterPipeline`) a mergé pendant ce cycle — aucun
  chevauchement de fichiers, non affecté par le resync `main`.

### Reste ouvert

Reconduit (moins l'item `CallInfoOverlay.participantCount` résolu ce cycle) : dead code /
god-object `CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ;
busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android de la Vague 70 ;
piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device requis) ; toolchains
iOS/Android hors d'atteinte dans ce sandbox ; sélection réelle de périphérique de sortie audio
(`setSinkId`, Vague 111). Voir aussi `tasks/2026-08-13-group-calls-gap-analysis.md` pour le
chantier « appels de groupe ».

## Vague 121 — `comment:updated` : le web était le SEUL client sans auditeur, une édition faite depuis iOS n'atteignait jamais un onglet ouvert (2026-08-14)

Point d'entrée : routine automatique d'amélioration continue (temps réel messagerie), base explicite
sur le développement précédent — `git fetch origin main`, branche `claude/keen-hamilton-6g9wel`
réalignée sur `origin/main` (`505425bc`, contient la Vague 120 — PR mergée), aucune PR ouverte sur le
dépôt au démarrage. Contrainte de sandbox inchangée (ni Xcode ni SDK Android) : périmètre
web+gateway+shared, vérifiable localement.

Méthode : au lieu de relire un dossier déjà labouré par 120 vagues, recensement MÉCANIQUE des 125
`SERVER_EVENTS` du contrat partagé, croisé par plateforme (émetteur gateway × auditeur web ×
auditeur iOS). Sept écarts sortent ; six sont des fonctionnalités absentes du web (réactions de
pièce jointe, localisation live — aucune surface web, donc un manque de produit, pas un bug de
synchro) ou un doublon d'alias déjà couvert (`message:read-status-updated` émis en parallèle de
`read-status:updated`, que le web écoute). Le septième est un vrai trou.

- **Root cause** : `comment:updated` est diffusé par la gateway
  (`SocialEventsHandler.broadcastCommentUpdated`, mêmes rooms et même filtrage de visibilité que
  `comment:added`, appelé par `PATCH /posts/:postId/comments/:commentId`) et appliqué par iOS
  (`SocialSocketManager` → `PostDetailViewModel`, `FeedCommentsSheet`, `StoryViewerView`). Le web
  n'avait **aucun** `socket.on` pour cet événement — alors qu'il en a un pour TOUTES les mutations
  voisines de commentaire : `added`, `deleted`, `liked`, `media-updated`, `translation-updated`,
  `reaction-added/removed`. Le web ne pouvant pas éditer un commentaire (aucun appel `PATCH`
  côté `posts.service.ts`), le trou est purement en RÉCEPTION, donc invisible en test web-à-web :
  il ne se manifeste qu'en cross-platform, le seul scénario que ce dépôt ne peut pas jouer en CI.
  Conséquence : une édition faite depuis un iPhone laissait un onglet web ouvert sur le même post
  afficher le texte d'AVANT jusqu'à un refetch complet.
- **Aggravation par les traductions** : `PostCommentService.updateComment` purge `translations` ET
  `originalLanguage` dans la MÊME écriture que le contenu (ils décrivaient l'ancien texte) et
  relance le pipeline. Le lecteur web gardait donc non seulement le texte d'avant, mais une carte de
  traductions périmée qui, une fois le nouveau `comment:translation-updated` reçu, se mélangeait au
  texte d'avant — un affichage traduit qui ment, ce que la règle #1 du Prisme interdit.
- **Fix** : `handleCommentUpdated` dans `use-post-socket-cache-sync.ts` (le seul endroit où les
  caches de commentaires sont écrits côté web), branché sur `COMMENT_UPDATED` avec son `off`
  symétrique. Il recopie le commentaire ENTIER (`{...c, ...data.comment}`) — jamais le seul
  `content` : c'est ce qui fait tomber `translations: {}` / `originalLanguage: null` en même temps
  que le texte. Le spread préserve à l'inverse ce que le payload ne porte PAS (`currentUserReactions`,
  `reactionSummary` : la diffusion est une charge unique pour toute la room, elle ne peut pas être
  propre au lecteur) — clés ABSENTES, donc valeur en cache conservée. Réutilise
  `patchCommentInPostCaches`, qui balaie déjà `queryKeys.posts.comments(postId)` en préfixe : la
  liste de premier niveau ET les sous-caches de réponses, car le payload ne dit pas où vit la ligne
  et une réponse s'édite comme une racine. Aucun compteur de post touché — éditer ne crée ni ne
  retire rien.
- **Non fait volontairement** : pas de callback `onCommentUpdated` ajouté à `use-social-socket.ts`.
  C'est un pur fan-out de callbacks optionnels ; aucun consommateur n'en a besoin aujourd'hui, et un
  callback jamais branché serait exactement le code mort décrivant un contrat que la Leçon 241
  apprend à ne pas semer.
- **Tests** (TDD, RED confirmé avant écriture de la production — 3 échecs sur 5) : nouveau bloc
  `describe('comment:updated')` dans `use-post-socket-cache-sync.test.tsx`, 5 cas — remplacement du
  texte au premier niveau sans toucher les voisins, péremption des traductions de l'ancien texte,
  patch d'une RÉPONSE dans le sous-cache de son parent, préservation de l'état de réaction propre au
  lecteur, et non-résurrection d'un commentaire absent du cache. Les deux assertions de comptage
  d'auditeurs passent de 28 à 29. Suite du fichier : **104/104 verts**. Sweep
  `--testPathPatterns="comment|post-socket|social-socket"` : **9 suites / 189 tests verts**, zéro
  régression. `npx tsc --noEmit` (apps/web) : 1764 lignes de sortie AVANT et APRÈS le fix
  (comparaison par `git stash` du seul fichier de production), zéro occurrence du fichier modifié —
  bruit d'environnement préexistant, aucune erreur imputable. Prérequis CLAUDE.md rejoués :
  `bun install --ignore-scripts`, puis `packages/shared && npx prisma generate --generator client` +
  `bun run build`.

### Reste ouvert

Reconduit : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue`
non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles Android
de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false` (Vague 84, on-device
requis) ; toolchains iOS/Android hors d'atteinte dans ce sandbox ; sélection réelle de périphérique
de sortie audio (`setSinkId`, Vague 111) ; `CallInfoOverlay.participantCount` à 0 transitoire côté
caller (Vague 112, cosmétique).

**Nouveau (recensement de cette vague)** — deux fonctionnalités présentes iOS + gateway et ABSENTES
du web, à trancher en produit avant tout code : les réactions sur pièce jointe
(`attachment:reaction-added/removed`, `AttachmentReactionHandler` gateway) et la localisation en
direct (`location:live-started/updated/stopped`, `LocationHandler` gateway). Ce ne sont pas des bugs
de synchronisation — le web n'a aucune surface pour les émettre ni les afficher — mais des écarts de
parité de plateforme qu'un chantier dédié devra couvrir.

## Vague 122 — supprimer une réponse laissait « 3 réponses » affiché au-dessus de deux lignes (web + gateway + shared) (2026-08-14)

Suite directe de la Vague 121, même fichier et même famille : en écrivant `handleCommentUpdated`
dans `use-post-socket-cache-sync.ts`, la relecture des handlers voisins a montré que
`handleCommentAdded` incrémente le `replyCount` du parent (« bumps the parent replyCount so the
"N replies" affordance updates live ») **sans aucun pendant** côté suppression.

- **Root cause** : `PostCommentService.deleteComment` décrémente bien le `replyCount` du parent
  DIRECT en base (« Only the direct parent's `replyCount` moves »), mais l'annonce
  `comment:deleted` ne portait que `postId`, `commentId`, `deletedCommentIds` et `commentCount`.
  Aucun client ne pouvait donc refléter ce décrément. Côté web, `handleCommentDeleted` filtrait les
  ids retirés de tous les caches de commentaires du post sans jamais toucher le compteur du parent :
  l'affordance « N réponses » restait figée sur sa valeur d'avant jusqu'à un refetch complet.
- **Pourquoi le déduire du cache ne marche pas** — et c'est le cœur de cette vague : la cible
  supprimée n'est en cache QUE si le fil du parent était déplié, alors que l'affordance
  « N réponses » ne s'affiche QUE fil REPLIÉ (`CommentThread` : `if (!isExpanded && replyCount > 0)`).
  Un client qui lirait `parentId` sur la ligne qu'il s'apprête à retirer échouerait donc exactement
  dans le cas où le compteur périmé est à l'écran. C'est aussi la limite du miroir iOS existant
  (`PostDetailViewModel`, qui balaie `repliesMap` — donc les seuls fils dépliés). Le parent doit
  venir du PAYLOAD.
- **Fix** : `CommentDeletedEventData.parentId?: string | null` (shared) ; `deleteComment` rend
  `parentId: comment.parentId ?? null` — même motif que `deletedCommentIds`, remonté pour la même
  raison (« la seule chose que le client ne peut pas redériver ») ; la route DELETE le fait suivre.
  Côté web, `handleCommentDeleted` décrémente le parent annoncé via `patchCommentInPostCaches`
  (borné à 0), qui balaie déjà liste de premier niveau ET sous-caches de réponses — donc un parent
  qui est lui-même une réponse est couvert.
- **L'omission est la garde d'idempotence** : la clé est OMISE — jamais mise à `null` — quand le
  service ne la rend pas, c'est-à-dire sur le rejeu idempotent du DELETE (`onDuplicate` ne rend
  qu'un `{ id }`), où le décrément a déjà eu lieu en base. `null` garde son sens propre (« la cible
  était une racine, rien à décrémenter »). Un client qui ne décrémente rien sur clé absente est donc
  idempotent SANS état local, et une gateway antérieure se comporte exactement comme avant.
  Alternative écartée : garder l'idempotence en ne décrémentant que si la cible était présente dans
  le cache — ce guard tue précisément le cas fil-replié, le seul qui se voit.
- **Tests** (TDD, RED vérifié en retirant la seule production, tests en place) : web 5 cas neufs —
  décrément sur parent annoncé, décrément même fil jamais déplié, rien sur `parentId: null`, rien
  sur clé absente, plancher à 0 → **2 rouges** avant fix, **109/109** après. Gateway 4 cas neufs
  (service rend le parent direct / rend `null` pour une racine ; route annonce `parentId` / l'OMET
  au rejeu) → **3 rouges** avant fix, **123/123** après sur
  `PostCommentService.test.ts` + `routes/posts/comments.test.ts`. `packages/shared` : 54 fichiers /
  1542 tests verts. `tsc --noEmit` gateway : propre. `tsc --noEmit` web : 1764 lignes avant comme
  après (bruit préexistant), 0 occurrence du fichier modifié.
- **Non fait** : le miroir iOS (`PostDetailViewModel` pourrait maintenant décrémenter sur
  `data.parentId` au lieu de balayer `repliesMap`, ce qui le rendrait juste fil replié aussi) —
  changement Swift non vérifiable dans ce sandbox sans Xcode. Le champ est additif : iOS le
  consommera sans rien casser.

## Vague 123 — `CallNotification`/`CallWaitingBanner` étaient mono-appelant en appel de groupe (web + gateway + shared) (2026-08-14)

Point d'entrée : routine automatique d'amélioration continue AUDIO/VIDÉO CALLING
(prompt élargi FaceTime-quality 12-phases). Base explicite sur le développement
précédent : `git fetch origin main`, branche désignée `claude/upbeat-dirac-v186b5`
déjà alignée sur `origin/main` (`75201df4`, contient la Vague 122 — comments,
mergée). Aucune PR ouverte sur le dépôt au démarrage (vérifié `list_pull_requests`).
Repris `tasks/2026-08-13-group-calls-gap-analysis.md` (chantier « appels de groupe »,
actif sur cette même journée) plutôt que de relancer un audit générique — le point
W6 « `CallNotification` mono-appelant » y était explicitement listé comme reste ouvert.
Sandbox inchangée (ni Xcode ni SDK Android) : périmètre web+gateway+shared.

- **Root cause** : `CallInitiatedEvent` (`packages/shared/types/video-call.ts`) ne
  portait ni le type ni le titre de la conversation appelante — seulement
  `conversationId`. Un callee recevant un appel de GROUPE voyait exactement la même
  bannière qu'un appel 1:1 (avatar + nom du seul initiateur), sans aucun moyen de
  savoir qu'il s'agissait d'un appel de groupe ni lequel. Investigation avant
  d'écrire du code (suivant la leçon « énumérer sur le code les valeurs qu'il devra
  porter ») : `CallService.initiateCall`/`getCallSession` sélectionnaient DÉJÀ
  `conversation.{id,identifier,type}` via `callSessionInclude` (nécessaire à la
  validation `direct`/`group` de `initiateCall`) — il ne manquait que `title`. Même
  precedent déjà en place côté REST : `CallHistoryItem.conversationType`/
  `conversationTitle` (`services/gateway/src/services/callHistory.ts`) porte
  exactement la même paire de champs pour le journal d'appels ; ce vague applique
  le même contrat au wire event temps réel.
- **Fix** :
  1. `CallSessionWithParticipants` + `callSessionInclude` (`CallService.ts`) :
     `title: true` ajouté au `select` de `conversation` (déjà inclus) — zéro
     requête Prisma supplémentaire, la ligne était déjà chargée pour chaque
     `initiateCall`/`getCallSession`.
  2. `CallInitiatedEvent` (shared) gagne `conversationType?: string` et
     `conversationTitle?: string | null` — **optionnels**, pas requis : un
     rolling deploy peut mettre une gateway plus ancienne devant un client plus
     récent (ou l'inverse), et les clients DOIVENT retomber sur la présentation
     mono-appelant actuelle sans jamais planter quand le champ est absent.
  3. `CallEventsHandler.ts` : les DEUX sites qui construisent un
     `CallInitiatedEvent` (le `call:initiate` principal ET le replay
     `call:check-active` au reconnect mi-sonnerie) peuplent les deux champs
     depuis `callSession.conversation?.type ?? 'direct'` /
     `callSession.conversation?.title ?? null` — un callee qui se reconnecte
     pendant que ça sonne encore voit la même présentation groupe/direct qu'un
     callee resté en ligne depuis le début.
  4. Web : `CallNotification.tsx` (bannière plein écran, premier appel entrant)
     ET `CallWaitingBanner.tsx` (bannière compacte busy-path, second appel
     pendant un appel actif) affichent désormais une ligne
     `data-testid="call-notification-group-context"` /
     `"call-waiting-group-context"` — « Appel de groupe · {titre} » (ou sans
     titre si le groupe n'en a pas) — SEULEMENT quand `conversationType ===
     'group'`, jamais pour un direct ni quand le champ est absent (ancienne
     gateway). i18n `incoming.groupCall` ajoutée aux 4 locales (en/fr/es/pt).
  5. **Non fait volontairement** : la grille/roster/`onRemove`→kick REST/timeout
     (reste de W6) et l'i18n roster (W7) — chantier UI de groupe distinct et
     plus large, hors scope de ce fix ciblé. Voir aussi la reclassification
     du point « timeout global 45s » (pas un bug — déjà correctement désarmé
     sur la première vraie réponse SDP depuis les Vagues 113/114) dans
     `tasks/2026-08-13-group-calls-gap-analysis.md`, mise à jour au passage
     pour ne pas faire ré-auditer un faux positif au prochain cycle.
- **Tests** (TDD, RED confirmé avant chaque fix) :
  - Gateway : nouveau fichier `CallEventsHandler-initiate-conversation-context.test.ts`
    — 4 cas (groupe titré, groupe sans titre, direct, `conversation` absent du
    call session résolu → repli `direct`/`null` sans throw) sur le fan-out membre
    de `call:initiate`. RED confirmé (4/4 échouaient contre le payload d'avant
    fix, `conversationType`/`conversationTitle` absents). Sweep
    `--testPathPatterns="[Cc]all"` (gateway) : **50 suites / 1169 tests verts**
    (+4 nets), 0 régression. Suite complète `src/__tests__/unit/services` +
    `src/__tests__/unit/socketio` : 181+44 suites, 5681+531 tests verts.
    `tsc --noEmit` gateway : 0 erreur.
  - Web : 4 cas neufs dans `CallNotification.test.tsx` (titre affiché, sans
    titre affiché quand même la ligne, jamais pour direct, jamais quand le
    champ est absent) + 2 cas neufs dans `CallWaitingBanner.test.tsx` (titre
    affiché, jamais pour direct). RED confirmé avant chaque fix (2 puis 1
    échec ciblé). Sweep `--testPathPatterns="[Cc]all"` (web) : **52 suites /
    472 tests verts** (+6 nets), 0 régression — `calls-i18n-regression.test.tsx`
    inclus et vert (les 4 locales restent synchronisées). `npx tsc --noEmit`
    (apps/web) : 1764 lignes de sortie AVANT et APRÈS (bruit préexistant
    documenté depuis les Vagues 115-122), 0 occurrence de `CallNotification`/
    `CallWaitingBanner`/`video-call.ts` dans la sortie.
  - `packages/shared` : `bunx vitest run` — 54 fichiers / 1542 tests verts.
  - Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) :
    `bun install --ignore-scripts` (bun 1.3.11 disponible localement, pas
    1.3.14), puis `packages/shared && npx prisma generate --generator client`
    + `bun run build`.
- **Portée volontairement non étendue** : dead code / god-object
  `CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non
  implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les
  6 trouvailles Android de la Vague 70 ; `CXSetHeldCallAction` (Vague 84,
  on-device requis) ; `setSinkId` (Vague 111) ; grille/roster/`onRemove`/
  timeout/i18n roster du chantier groupe (W6 reste, W7) ; mesh iOS mono-PC
  (I1-I7) et SFU (Phase 4) du même chantier — toolchains iOS/Android toujours
  hors d'atteinte dans ce sandbox pour vérifier un changement Swift/Kotlin
  avant merge.

### Reste ouvert (mis à jour)

Reconduit (moins « `CallNotification` mono-appelant » traité ce cycle, et
« timeout global 45s » reclassé non-bug) : dead code / god-object
`CallManager.swift` (~5880 lignes) ; ADR `actor CallEventQueue` non implémenté ;
busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ; les 6 trouvailles
Android de la Vague 70 ; `CXSetHeldCallAction` vs. `supportsHolding = false`
(Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans ce
sandbox ; sélection réelle de périphérique de sortie audio (`setSinkId`,
Vague 111). Voir `tasks/2026-08-13-group-calls-gap-analysis.md` pour le reste
du chantier « appels de groupe » : grille adaptative web, roster, `onRemove`
branché sur le kick REST, i18n roster (W6/W7), mesh iOS mono-PC (I1-I7), SFU
(Phase 4, optionnel — déclencheur : besoin réel >4-5 participants).

## Vague 124 — `stopPreauthorizedStream` effaçait le handoff global même quand un AUTRE flux d'appel venait de l'écraser (web) (2026-08-14)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle
session. Base explicite sur le développement précédent — branche dédiée réalignée sur
`origin/main` (`72421185`, contient la Vague 122 — PR mergée), aucune PR ouverte de cette routine
au démarrage, aucun commit d'avance/retard. Ce sandbox n'a ni Xcode ni SDK Android (`swift`/
`xcodebuild` absents) : périmètre web+gateway, comme la quasi-totalité des vagues récentes.
Recensement par audit ciblé (agent en lecture seule) plutôt que relecture linéaire d'un dossier
déjà labouré 122 fois : trois candidats remontés, classés par confiance/valeur/surface de fix.
Les deux runners-up sont documentés en fin de section plutôt que traités ce cycle (l'un est une
décision produit — plafond de mesh P2P — trop large pour un fix chirurgical isolé ; l'autre est
un nettoyage de code mort à faible enjeu, laissé pour un cycle dédié « suppression » comme les
Vagues 117/118).

- **Root cause** : `window.__preauthorizedMediaStream` est un handoff global à UN SEUL slot, écrit
  par deux flux d'appel indépendants et non coordonnés — l'appel SORTANT
  (`use-video-call.ts#startCall`) et l'ACCEPTATION d'un appel ENTRANT
  (`CallManager.tsx#handleAcceptCall`). Chacun a déjà son propre garde de ré-entrance
  (`startCallInFlightRef`, `acceptingCallIdRef`), documenté en commentaire comme protégeant contre
  un double-clic sur LE MÊME flux — mais ni l'un ni l'autre ne sait que l'autre existe. Rien
  n'empêche un utilisateur d'avoir un `call:initiate` sortant en vol (ack jusqu'à 10s,
  `CALL_INITIATE_ACK_TIMEOUT_MS`) pendant qu'un appel entrant SANS RAPPORT arrive et est accepté
  dans le même onglet — séquence tout à fait ordinaire, rien ne marque l'appelant « occupé » tant
  que son propre ack n'a pas résolu. `stopPreauthorizedStream` (`call-media-constraints.ts`),
  appelée sur CHAQUE chemin d'échec des deux flux, effaçait le global sans jamais vérifier qu'il
  pointait encore vers le stream qu'elle vient d'arrêter.
- **Scénario de défaillance** : (1) appel sortant vers la conversation A → `getUserMedia()` réussit
  → `streamA` publié dans le global → `call:initiate` en vol. (2) Pendant l'attente, un appel
  entrant B arrive, l'utilisateur clique Accepter → `getUserMedia()` réussit → `streamB` ÉCRASE le
  même global → `call:join` en vol, pas encore résolu. (3) L'ack de A revient rejeté/expiré (occupé,
  bloqué, rate-limité, ou simplement un paquet perdu — n'importe lequel de ces cas peut arriver
  avant le round-trip de B sur un réseau réel) → `stopPreauthorizedStream(streamA)` arrête bien les
  pistes de A, mais efface AUSSI le global qui contient à cet instant `streamB`, toujours vivant et
  sur le point d'être consommé. (4) L'ack de B réussit ensuite, `VideoCallInterface` monte pour B,
  lit le global → `undefined` → retombe sur `initializeLocalStream()`, qui rappelle `getUserMedia()`
  une seconde fois pour un appel dont la permission a déjà été accordée secondes plus tôt (re-prompt
  surprise, échec possible sur des navigateurs stricts) — pendant que les pistes originales de
  `streamB` ne sont plus référencées par personne et ne sont jamais `.stop()`ées : capture
  caméra/micro vivante et orpheline pour le reste de la session (fuite de ressource + régression de
  vie privée, le voyant caméra reste allumé).
- **Fix** : même idiome « snapshot-et-compare avant de muter un état partagé » déjà utilisé ailleurs
  dans cette base (`VideoCallInterface.tsx`, garde `connectionAtLeave` avant son propre nettoyage
  différé). `stopPreauthorizedStream` n'efface le global que s'il pointe ENCORE vers le stream
  qu'elle vient d'arrêter (`=== stream`) — sinon elle arrête ses propres pistes et laisse le global
  intact, quel que soit son contenu actuel. Un seul appelant, deux comportements : le cas normal
  (rien n'a écrasé le handoff) est inchangé bit à bit ; le cas de course laisse désormais le flux
  gagnant consommer son propre stream sans re-prompt ni fuite.
- **Tests** (TDD, RED confirmé en exécutant le nouveau cas AVANT le fix — `1 failed, 4 passed`) :
  nouveau cas dans `call-media-constraints.test.ts` — streamA publié puis écrasé par streamB,
  `stopPreauthorizedStream(streamA)` arrête UNIQUEMENT les pistes de A, ne touche jamais aux pistes
  de B, et le global reste `=== streamB` après l'appel. Sweep `--testPathPatterns="call"` :
  **53 suites / 472 tests verts**, 0 régression. `npx tsc --noEmit` : diff ligne-à-ligne AVANT/APRÈS
  (`git stash`) — mêmes **1764 erreurs préexistantes**, seul le bruit d'ordre d'union non
  déterministe entre deux runs (3 lignes, aucune ne touchant le fichier modifié) ; 0 nouvelle
  erreur. `eslint` : non exécutable dans ce sandbox (même `TypeError: Converting circular
  structure to JSON` pré-existant sur le plugin `react`, reproductible hors de ce diff) —
  limitation d'environnement documentée depuis la Vague 111, pas un signal sur ce changement.
  Prérequis CLAUDE.md rejoués : `bun install --ignore-scripts` (bun 1.3.11 disponible localement,
  pas 1.3.14), puis `packages/shared && npx prisma generate --generator client` + `bun run build`.

### Reste ouvert

Reconduit tel quel : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR
`actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ;
les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding = false`
(Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans ce sandbox ; sélection
réelle de périphérique de sortie audio (`setSinkId`, confirmé toujours absent — `rg setSinkId
apps/web` → 0 résultat — candidat plus ambitieux nécessitant un sélecteur d'UI, hors scope d'un
fix chirurgical).

**Nouveau (audit de cette vague, non traités)** :
- **`MAX_CALL_PARTICIPANTS = 9999` (gateway `CallService.ts`) sans plafond effectif sur le mesh
  P2P.** Le verrou 1:1 a été levé le 2026-08-13 (`b06d54681`) mais l'architecture reste un mesh
  full-P2P pur (aucun SFU dans le dépôt, `CallSession.mode` figé `'p2p'`) ; le plan produit dédié
  (`tasks/2026-08-13-group-calls-gap-analysis.md`) chiffre lui-même le plafond praticable à
  ~4-5 participants et prescrit `CallMetadata.maxParticipants` (déjà typé dans
  `packages/shared/types/video-call.ts`) comme mécanisme — jamais lu par `CallService.ts`, qui ne
  gate que sur la constante quasi-illimitée. Au-delà de ~5-6 participants actifs (taille de groupe
  courante), chaque client ouvre une `RTCPeerConnection` par pair et encode/envoie sa propre vidéo à
  chacun (pas de simulcast/SVC câblé côté client non plus) : dégradation silencieuse, gel vidéo,
  drain CPU/batterie ou crash d'onglet, sans AUCUN avertissement (9999 ne se déclenche jamais).
  Non traité ce cycle : décision produit (quel plafond, quel comportement de dégradation) qui
  dépasse un fix chirurgical isolé — mais l'écart entre le diagnostic déjà fait par l'équipe et le
  code qui ne le lit pas mérite un chantier dédié plutôt qu'un nouveau report.
- **Code mort dérivé dans `WebRTCService`** (`webrtc-service.ts` — `startQualityMonitor`/
  `stopQualityMonitor`/`computeQualityLevel`/`onConnectionQualityChange`) : jamais appelé en
  production (le pipeline de qualité réel est `use-call-quality.ts`, entièrement séparé), et les
  deux implémentations ont DÉRIVÉ (seuils RTT différents : `good < 200`/`< 400` côté mort vs.
  `< 300`/`< 450` côté vivant, recalibré mobile). Aucun symptôme aujourd'hui (code inatteignable),
  mais même famille que les Vagues 117/118 (`CallStatusIndicator`, `ConnectionQualityBadgeCompact`)
  — un futur correctif de qualité risque d'éditer la mauvaise implémentation. Candidat direct pour
  un cycle « suppression » dédié.

## Vague 125 — `WebRTCService.startQualityMonitor`/`stopQualityMonitor`/`computeQualityLevel` : code mort dérivé, jamais appelé en production (web) (2026-08-15)

Point d'entrée : routine automatique d'amélioration continue (audio/vidéo calling), nouvelle
session. Base explicite sur le développement précédent : `git fetch origin main`, branche dédiée
déjà alignée bit à bit sur `origin/main` (`33c12b401`, contient la Vague 124 — PR mergée), aucune
PR ouverte de cette routine au démarrage. Ce sandbox n'a ni Xcode ni SDK Android (`swift`/
`xcodebuild` absents) : périmètre web, comme la quasi-totalité des vagues récentes. Repris
directement le candidat « cycle suppression dédié » laissé en fin de Vague 124 plutôt que de
relancer un audit générique — même famille que les Vagues 117/118.

- **Root cause confirmée par lecture directe** : `webrtc-service.ts` porte un second pipeline de
  mesure de qualité (`startQualityMonitor()`/`stopQualityMonitor()`/`computeQualityLevel()`,
  interval 3s sur `peerConnection.getStats()`, callback `config.onConnectionQualityChange`) —
  entièrement distinct du pipeline RÉELLEMENT utilisé en production, `use-call-quality.ts` (son
  propre `getStats()` direct sur la `RTCPeerConnection`, sa propre fonction de classification).
  Vérifié exhaustif (`Grep` sur tout `apps/web`, pas de troncature `| head`, leçon de la Vague
  post-2026-06-05 appliquée) : **zéro appelant en production** — le seul site de construction
  `new WebRTCService({...})` avec callbacks (`use-webrtc-p2p.ts#getWebRTCService`) ne passe jamais
  `onConnectionQualityChange` et n'appelle jamais `.startQualityMonitor()` ; l'autre site
  (`initializeLocalStream`) construit `new WebRTCService()` sans config du tout. Les seuls
  appelants restants étaient les tests du fichier lui-même. Les deux implémentations avaient déjà
  DÉRIVÉ l'une de l'autre — seuils RTT différents (`good < 200`/`< 400` côté mort vs. `< 300`/
  `< 450` côté vivant, recalibré mobile/international, cf. commentaire `use-call-quality.ts`) —
  exactement le risque déjà signalé en fin de Vague 124 : un futur correctif de qualité aurait pu
  éditer la mauvaise implémentation sans effet visible.
- **Fix** : suppression pure — `startQualityMonitor()`, `stopQualityMonitor()`,
  `computeQualityLevel()`, le champ `qualityMonitorInterval`, la constante
  `QUALITY_MONITOR_INTERVAL_MS`, `onConnectionQualityChange` du type `WebRTCServiceConfig`, l'import
  `ConnectionQualityLevel` (devenu inutile), et l'appel `this.stopQualityMonitor()` dans `close()`.
  Aucune ligne de logique métier vivante touchée ; `use-call-quality.ts` intouché.
- **Tests** : suppression symétrique des 3 describe blocks dédiés dans
  `webrtc-service.coverage.test.ts` (`startQualityMonitor`, `stopQualityMonitor`,
  `startQualityMonitor — null-coalescing branches`, 22 tests au total) + le test `stops quality
  monitor during close` (assertait un comportement qui n'existe plus) + `onConnectionQualityChange`
  retiré du helper `setup()`. Pas de TDD RED/GREEN ici — suppression de code mort, pas de nouveau
  comportement à verrouiller (même patron que les Vagues 117/118).
- **Vérification** : `webrtc-service.coverage.test.ts` (152/152, -22 net) vert ; sweep
  `webrtc-service|call-infrastructure|use-webrtc` (4 suites / 240 tests) vert ; sweep complet
  `--testPathPatterns="[Cc]all"` (53 suites / 478 tests) vert, 0 régression. Couverture du fichier
  modifié : 97.47% stmts / 94.06% branches / 93.33% funcs — aucune ligne non couverte introduite par
  la suppression. `npx tsc --noEmit` : diff `git stash`/`stash pop` — **1229 erreurs préexistantes
  identiques avant et après**, 0 nouvelle. `eslint`/`next lint` : non exécutable dans ce sandbox
  (`Couldn't find any 'pages' or 'app' directory` — limitation d'environnement distincte de celle
  documentée aux vagues précédentes mais de même nature, non bloquante, indépendante de ce diff).
  Prérequis CLAUDE.md rejoués (sandbox sans `node_modules` au démarrage) : `bun install
  --ignore-scripts` (bun 1.3.11 disponible localement, pas 1.3.14), puis `packages/shared && npx
  prisma generate --generator client && bun run build` sans erreur.
- **Reste ouvert** (reconduit) : dead code / god-object `CallManager.swift` (~5880 lignes) ; ADR
  `actor CallEventQueue` non implémenté ; busy-path `reportNewIncomingCall` UI-only (Vague 63/64) ;
  les 6 trouvailles Android de la Vague 70 ; piste `CXSetHeldCallAction` vs. `supportsHolding =
  false` (Vague 84, on-device requis) ; toolchains iOS/Android hors d'atteinte dans ce sandbox ;
  sélection réelle de périphérique de sortie audio (`setSinkId`) ; `MAX_CALL_PARTICIPANTS = 9999`
  sans plafond effectif sur le mesh P2P (Vague 124, décision produit hors scope d'un fix
  chirurgical).
