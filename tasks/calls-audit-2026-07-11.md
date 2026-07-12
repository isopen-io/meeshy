# Audit bout-en-bout système d'appels — 2026-07-11

> **Statut 2026-07-11 nuit — #1, #2, #3, #4, #6, #11 + handler FCM Android
> CORRIGÉS sur main** :
> #1 `d690eecd9` (web écoute `call:already-answered`, dismiss scopé au callId),
> #2+#3 `d74f18fca`+`2a436deb5` (politique pure `call-push-mirroring` :
> pushes stop-ring apns+fcm/ios+android, mirror answered-elsewhere aussi
> dans la branche TARGET_NOT_FOUND).
> Handler FCM Android `cf10a2112` : route StopRing (call_cancel /
> call_answered_elsewhere) → cancel de la notification full-screen +
> enregistrement de l'id dans le SeenCallRing (un cancel arrivé avant le
> ring push retardataire garde le cadavre silencieux).
> #4+#6 `a7280bcf9` : PRESENCE_APP_STATE au contrat, 3 derniers literals
> socket.on migrés CLIENT_EVENTS.*, @deprecated sur les 5 events morts,
> test de symétrie source-scan (CallEventsHandler-event-contract.test.ts).
> #11 `2c4fed90c` : push VoIP localisé à la langue résolue du callee
> (call.incoming.title/body, 8 langues, fallback fr).
> #10 `3061b1f89` : cache TTL 2 s de la session dans le hot-path call:signal —
> answer lit toujours frais (isFirstAnswer), re-lecture avant tout rejet si
> participant absent du cache (join tout frais).
> #7+#8 : cascades documentées aux sites gateway — les budgets 45/60/120 s
> sont une cascade VOLONTAIRE (client < serveur < GC, ordre à préserver) et
> le refresh TURN est quasi-inerte par construction (TTL clampé ≥ cap d'appel
> 2 h) — filet à garder, pas à « réparer ».
> #5 (partiel) `ae6da4356` : Android émet presence:app-state (edge-only +
> replay par socket) — fin de la double sonnerie app-ouverte ; le gateway
> peut enfin router socket-vs-push. Restent de #5 : listeners
> participant-left/quality-alert/screen-capture-alert/transcription-segment/
> translated-segment + emits call:backgrounded/foregrounded (grâce heartbeat
> in-call) ; s'abonner à call:force-leave est INUTILE tant que le serveur ne
> l'émet pas (vérifié : jamais émis).
> #5 (liveness) `ee1760615` : Android émet enfin call:heartbeat (ticker 10 s,
> fenêtre Connected/Reconnecting) + call:backgrounded/foregrounded pendant un
> appel actif (grâce 5 min effective) — fin des appels zombies jusqu'au GC 2 h.
> Restent de #5 : listeners participant-left/quality-alert/
> screen-capture-alert/segments (groupe/UX, non bloquants 1:1).
> Harnais e2e 2-sockets `f7b0388a2` (reco #3) : 3 vraies sockets, scénario
> « deux devices, un répond » — initiate→double ring→already-answered vers
> le device passif seul→relais answer ciblé sans fuite. Dans
> src/socketio/__tests__/ (integration/ est EXCLU du run jest — piège).
> #5 (listeners, solde) : Android écoute enfin les 4 side-channels —
> `call:participant-left` / `call:quality-alert` / `call:screen-capture-alert`
> / `call:translated-segment` (décodes purs CallSignalMapper + 4 SharedFlows
> CallSignalManager ; `call:force-leave` délibérément ABSENT, jamais émis
> serveur). App : CallViewModel → `isPeerQualityDegraded` (auto-reset 15 s,
> parité iOS remoteQualityResetSeconds), `isPeerScreenCapturing` (bannière
> privacy, meurt avec l'appel), `captionText` (sous-titre live,
> translatedText ?? text) — surfaces CallScreen + strings 4 locales.
> Dette mineure restante côté Android : l'EMIT `call:screen-capture-detected`
> (détection de capture locale → alerte du pair) et `call:analytics`.
> #9 : les creds TURN frais arrivés PENDANT `.reconnecting` ré-arment
> immédiatement le restart ICE en vol (politique pure
> `CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh` + branchement
> du sink callIceServersRefreshed via le chemin coalesce, 0 budget brûlé) —
> fin de la fenêtre morte « setConfiguration sans re-gather » jusqu'à
> l'escalation du watchdog. Hors `.reconnecting` le refresh reste inerte par
> construction (#8).
> **L'audit est CLOS.** Dette restante : device-test 2 appareils réels
> jamais fait.
> Replay de sonnerie Android : `call:check-active` émis à CHAQUE connexion
> socket (même collect que la re-déclaration presence) — un callee Android
> qui (re)connecte mid-ring voit enfin l'appel au lieu de le laisser sonner
> vers missed. Parité iOS MessageSocketManager / web checkForActiveCall ;
> dédup par callId déjà en place (start() inerte en appel, offre du callId
> actif ignorée).
> Décroché à froid Android : initiate/join attendent la connexion socket
> (borné 30 s — parité iOS force-connect+wait, `connectionState.first`)
> avant d'émettre — un emit sur un `_socket` encore null (fenêtre
> cold-start entre la notification full-screen et la restauration d'auth)
> était JETÉ en silence : l'ACK ne venait jamais et l'appel décroché
> mourait en Failure après le budget. Immédiat quand déjà connecté ;
> échec rapide explicite (« socket not connected ») si la fenêtre expire.
> Watchdog Connecting Android : une fenêtre CONTINUE de 45 s couvre
> Offering∪Connecting (socket-wait 30 + ACK 5 + marge ICE) — le dernier
> trou non borné après le décroché : le ring-timeout serveur ne s'applique
> plus une fois répondu et les heartbeats ne démarrent qu'en Connected,
> donc un appel répondu dont l'ICE ne s'établissait jamais restait sur
> « Connexion… » à vie (2 côtés, jusqu'au GC 2 h). Expiry = même devoir
> terminal que hangUp (ConnectionFailed + emitEnd + teardown). Parité
> d'intention iOS connectingFailSeconds.
> Watchdog Connecting web : même trou, même borne (45 s dans
> VideoCallInterface) — un échec ICE ne produisait qu'un toast pendant
> que webrtc-service retentait en boucle sans escalade ; l'appel jamais
> connecté se termine désormais (handleHangUp via ref, fenêtre unique
> par callId, seedée de l'état courant — un remontage sur appel connecté
> ne ré-ouvre jamais de fenêtre de kill). i18n connectTimeout 4 locales.
> Les 3 plateformes bornent désormais chaque phase d'appel.
> Résilience réseau Android : le coordinateur WebRTC réagit enfin aux stalls
> ICE mid-call (avant : handoff WiFi→LTE = média figé pour toujours, appel
> « actif » côté serveur car les heartbeats socket survivent au média mort).
> DISCONNECTED = stall (FSM Reconnecting + call:reconnecting, souvent
> auto-guéri) ; FAILED = restart ICE (WebRtcEngine.restartIce, atome SDK) +
> renégociation par l'APPELANT INITIAL seul (anti-glare, negotiationId+1) ;
> retour CONNECTED = call:reconnected + MediaConnected. Les reconnexions
> alimentent l'analytics (foldAnalytics comptait déjà les entrées en
> Reconnecting). Pré-connexion jamais un stall (= phase Connecting FSM).
> Watchdog budget : CallReconnectBudget (10 s/tentative, parité iOS
> reconnectAttemptBudgetSeconds) armé par état Reconnecting DISTINCT —
> expiry = ReconnectFailed (FSM : tentative+1, nudge retryIceRestart —
> couvre le DISCONNECTED éternel jamais FAILED — puis, budget épuisé à 3,
> Ended(connectionLost) + emitEnd + teardown coordinator, même devoir que
> hangUp : sans ça le pair restait en appel zombie). Fenêtre totale bornée
> ~30 s au lieu de « Reconnexion… » à vie.
> Signaux de reconnexion web : le web AVAIT le restart SOTA (grace timer +
> restartIce dans webrtc-service) mais n'émettait JAMAIS
> call:reconnecting/reconnected — le serveur ignorait le restart (statut
> `active` pendant le stall, analytics aveugle).
> use-webrtc-p2p émet désormais aux vrais edges mid-call (jamais en
> pré-connexion), attempt incrémenté par cycle, reset au cleanup. Les 3
> plateformes tiennent le serveur informé de leurs reconnexions.
> Sémantique serveur VÉRIFIÉE (2026-07-12) : `reconnecting` n'est pas une
> « suspension du cleanup » — CallCleanupService le traite comme `active`
> (GC 2 h ET heartbeatTimeout 120 s inclus). La protection réelle vient des
> heartbeats qui continuent pendant un restart sur les 3 plateformes
> (fenêtres client 30-45 s ≪ 120 s) ; un client mort en plein restart est
> rattrapé par le heartbeatTimeout. Round-trip complet : reconnecting →
> status reconnecting (CallEventsHandler:3264, autorisation participant
> actif seul), reconnected → status active (:3315, garde durée). Le statut
> sert l'observabilité/analytics — la borne de vie, elle, est toujours là.
> **CI main VERTE sur le tip `05eb54eb3`** (run 29172721298, conclusion
> success — 11 jobs verts incl. Test gateway/web/shared) : tout l'arc
> résilience (stalls ICE + watchdog + clamp Android, signaux web, harnais
> étendu, message d'appel vivant de l'autre session) est validé en CI.
> Vérifs locales croisées : 1188/1188 gateway socketio (bun), tous les
> modules Android, 118/118 web domaine appels.
> **2e vague également VERTE (CI + Docker success sur `4975d9791`)** :
> décroché à froid + budget 30 s, watchdogs Connecting Android (45 s) et
> web (45 s), sémantique reconnecting précisée, harnais autorisations
> P1-21. Prod re-vérifiée saine après déploiement (health up, front 200).
> **BUG STRUCTUREL FCM Android trouvé et corrigé** : tous les pushes
> partaient avec un bloc `notification` — or FCM le rend LUI-MÊME quand
> l'app est backgroundée/tuée et onMessageReceived ne s'exécute JAMAIS :
> le full-screen ring, StopRing (call_cancel/answered_elsewhere) et
> SeenCallRing étaient morts précisément dans le seul scénario visé (le
> foreground passe par la socket). Fix : pushes d'appel Android =
> DATA-ONLY (sendViaFCM : android && (silent || data.type=call), aucun
> bloc notification), title/body localisés serveur injectés DANS data ;
> Android rend sa notification avec data.title/body (Prisme — langue
> résolue serveur) et fallback ressources 4 locales (le « Appel entrant »
> codé en dur en français saute). iOS/web FCM inchangés.
> Compagnons anti-ring-fantôme : TTL FCM 60 s (android.ttl) ET expiration
> APNs 60 s (notification.expiry) sur les pushes d'appel — sans eux, un
> téléphone qui resurgit du hors-réseau recevait le ring d'un appel missed
> depuis longtemps (FCM conserve ~4 semaines par défaut ; PushKit force le
> report CallKit → le téléphone sonne pour rien). Alignés sur la fenêtre
> de sonnerie serveur (60 s). Scoping : silent n'a qu'UN producteur
> (call-push-mirroring) — les pushes messages/badges inchangés.
> Canal de sonnerie v2 (heads-up écran allumé sonnait un simple ding) :
> ringtone appareil USAGE_NOTIFICATION_RINGTONE + vibration ; canaux
> immuables → id meeshy_calls_v2 + delete du legacy. Chaîne ring vérifiée
> maillon par maillon jusqu'à l'écran : extras full-screen → LaunchRouter
> (pur) → CallRoute.incoming, chemins push et socket convergents.
> **3e vague VERTE (CI success sur le tip post-arc pushes)** : data-only,
> TTL/expiration, canal sonnerie — certifiés.
> Refuser depuis la notification (CallStyle) : avant, « Refuser »
> n'existait pas — le correspondant sonnait 60 s dans le vide. CallStyle
> forIncomingCall (Répondre = full-screen intent existant, Refuser =
> DeclineCallReceiver) ; le refus coupe la sonnerie, mémorise l'id dans le
> ring (une redélivrance ne re-sonne pas) et prévient le correspondant :
> call:end immédiat si socket vivante, sinon DeclinedCallStore drainé au
> prochain connect (collect MeeshyApplication, emitEnd idempotent).
> Dégrade en notification à actions sur API < 31.
> Répondre = décroché DIRECT (autoAnswer bout-en-bout : intent Answer
> distinct → LaunchExtras/LaunchRouter → arg answer de CallRoute →
> CallScreen accept gated permissions, gardé sur INCOMING — une
> ré-entrée ne re-join jamais ; le tap simple et l'offre socket ne
> décrochent jamais seuls).
> Refus = 'rejected' sur le fil : AUCUNE plateforme n'envoyait la raison
> — tout refus explicite devenait « manqué » dans le journal de
> l'appelant (le serveur préserve pourtant rejected pré-décroché).
> Android : emitEnd(callId, reason?) + decline/rejectWaiting/auto-dismiss/
> DeclineCallReceiver/drain passent rejected ; hangUp reste sans raison.
> Web : handleRejectCall passe de call:leave (résolu missed) à call:end
> {reason:'rejected'} — end permis à tout participant actif (P2P, C4),
> broadcast immédiat à l'appelant. iOS ALIGNÉ : emitCallReject passe de
> call:leave à call:end {reason:'rejected'} (même bug que le web), le
> refus du call-waiting (rejectPendingCall) aussi — les 3 plateformes
> envoient la raison.
> status=rejected serveur : endCall pré-décroché + reason rejected écrit
> enfin CallStatus.rejected (l'enum existait, RIEN ne l'écrivait) — fin de
> la notification « appel manqué » envoyée au callee qui venait de REFUSER
> (handleMissedCall gaté sur status missed) et le filtre « manqués » du
> journal exclut les refus comme son commentaire le promettait.
> Post-fix iOS Tests ROUGE (2/3685) : les source-guards RejectPendingCallTests
> exigeaient la sous-chaîne emitCallEnd(callId: pending.callId) — remplacée
> par emitCallReject. Guards mis à jour vers le nouveau contrat + nouveau
> verrou test_sdkEmitCallReject_emitsCallEndWithRejectedReason (le SDK doit
> émettre call:end AVEC reason rejected, sinon le guard app passerait à vide).
> CI/SDK Tests verts sur f67c39ac0 ; iOS Tests VERT sur 2cbf13bc9
> (run 29177219556, conclusion=success, 3685 tests) — arc reject CLOS
> et certifié sur les 3 plateformes.

> Parité web (post-audit) `280c1ed96` : le web écoute désormais aussi
> `call:quality-alert` (pill « connexion de X instable », auto-clear 15 s)
> et `call:screen-capture-alert` (pill privacy) — hook `useRemoteCallAlerts`
> gated au callId + cluster CallQualityOverlay, i18n 4 locales. Les 3
> plateformes affichent les mêmes alertes distantes.
> Indicateurs mute/caméra du pair Android : `call:media-toggled` n'est plus
> jeté — décodage pur `mediaToggle` + flux `mediaToggles`, VM
> peerAudioEnabled/peerVideoEnabled gatés au callId (mediaType inconnu =
> inerte), presenter isPeerMuted / isPeerCameraOff (caméra = appels vidéo
> seulement), indicateurs CallScreen + 4 locales. Parité
> isRemoteAudioEnabled/isRemoteVideoEnabled iOS et VideoStream web.
> Émission Android (post-audit) : `call:screen-capture-detected` relayé —
> seam `ScreenRecordingDetector` (Android 15 `addScreenRecordingCallback`,
> permission normale DETECT_SCREEN_RECORDING, silencieux < API 35), collecte
> dans la fenêtre média du VM, edge-only (le « not capturing » initial reste
> muet, un stop n'est émis qu'après un start rapporté). Un Android 15 qui
> screen-record alerte désormais son pair comme iOS.
> Émission Android `call:analytics` : accumulateur pur `CallAnalytics`
> (fields() = SSOT du payload, negotiationTimeMs omis faute d'ancre,
> zéros honnêtes pour les dimensions non trackées), foldé sur les edges FSM
> (connected idempotent / reconnexions / terminal) + samples qualité, émis
> UNE fois à l'entrée en Ended (settle ne ré-émet jamais, sans callId minté
> = inerte). Seam `CallClock` pour setupTimeMs déterministe en test. Les 2
> plateformes mobiles alimentent désormais les dashboards qualité.

Audit lecture seule (agent), croisé avec git log récent. Les fixes déjà livrés
(TURN TTL NaN `bf3d1c1fb`, eviction call-room #1863, watchdog `.offering`,
missed-call anchor) sont vérifiés présents — non re-signalés.

## Cadrage — dettes suspectées en fait DÉJÀ couvertes
- **Refresh TURN mid-call** : iOS `CallManager.scheduleTURNCredentialRefresh`
  (CallManager.swift:4788-4837) + `pc.setConfiguration`
  (P2PWebRTCClient.swift:184) ; web `use-webrtc-p2p.ts:798`.
- **Multi-device ring-stop iOS** : socket `call:already-answered`
  (CallEventsHandler.ts:1885 → CallManager.swift:3915) + push miroir
  `call_answered_elsewhere` (CallEventsHandler.ts:2512-2529 →
  AppDelegate.swift:161 → `endRingingAnsweredElsewhere`:1281).

Le vrai problème : **non-parité web/android** de ces mécanismes.

## Top 10 des manques (par gravité)

1. **[HAUT] Web ne s'abonne pas à `call:already-answered`** —
   `CallManager.tsx:643-648` n'écoute que INITIATED/JOINED/LEFT/ENDED/
   MEDIA_TOGGLED/ERROR. Un autre device répond → l'appel passe `active`
   (jamais `ended`) → la carte d'appel entrant du tab web sonne
   indéfiniment. Sonnerie fantôme web.
2. **[HAUT] Pushes d'annulation hardcodés `platforms:['ios']`**
   (`sendCallCancellationPushes` CallEventsHandler.ts:334 ;
   `call_answered_elsewhere` :2522). Android backgrounded (socket mort)
   ne reçoit jamais le stop-ring.
3. **[MOYEN] `call_answered_elsewhere` sauté si le socket de l'appelant est
   absent à l'instant de l'answer** — le handler `return` tôt
   (TARGET_NOT_FOUND, :2447-2465) avant le bloc `isFirstAnswer` du push.
   Ring fantôme sur les autres devices du callee.
4. **[MOYEN] Events déclarés jamais émis** (`video-call.ts:867,879-884`) :
   `call:mode-changed`, `call:transcription`, `call:translation`,
   `call:transcription-capability`, `call:transcription-role`. Contrat mort ;
   `mode:'sfu'` renvoyé sans média SFU derrière.
5. **[MOYEN] Parité Android** : `CallSignalManager.kt:295-312` n'écoute pas
   `participant-left`, `quality-alert`, `screen-capture-alert`,
   `force-leave`, `transcription-segment`, `translated-segment` ; n'émet
   jamais `call:backgrounded`/`foregrounded` (routage sonnerie socket vs
   push impossible), ni `screen-capture-detected`/`analytics`.
6. **[MOYEN] `call:force-leave` et `call:check-active` en string literals**
   (CallEventsHandler.ts:2110, :1283) — hors type-map partagé, dérive
   silencieuse possible.
7. **[MOYEN-BAS] Budgets de sonnerie incohérents** : iOS 45 s
   (WebRTCTypes.swift:1052), serveur missed 60 s (CallService.ts:184),
   GC 120 s (CallCleanupService.ts:39). Pas de source de vérité unique.
8. **[BAS] Refresh TURN quasi-inerte par construction** : TTL clampé
   ≥ MAX_ACTIVE_MS 2 h (TURNCredentialService.ts:117,150) et appels capés
   2 h → les creds survivent toujours à l'appel. À documenter.
9. **[BAS] `updateIceServers` sans re-gathering** —
   P2PWebRTCClient.swift:174-190 fait `setConfiguration` sans
   `restartIce()` ; nouveaux creds effectifs seulement à la prochaine
   allocation.
10. **[BAS] Lecture DB par signal dans le hot-path** — chaque
    `call:signal` (y compris CHAQUE ICE candidate) fait un
    `getCallSession` findUnique+include lourd (CallEventsHandler.ts:2384).
11. **[Bonus BAS] Push VoIP hardcodé français** —
    `${callerName} vous appelle`, 'Appel vidéo'/'Appel audio'
    (CallEventsHandler.ts:1607-1608), pas de résolution de langue du callee.

## Asymétries d'événements
- Émis serveur, non écoutés partout : `call:already-answered` (web ✗),
  `call:quality-alert` (android ✗, web ✗), `call:screen-capture-alert`
  (android ✗), `call:missed` (web ✗).
- Jamais émis : les 5 constantes mortes du point 4.
- Screen-share : aucun handler gateway (`call:toggle-screen-share`
  n'existe qu'en fixtures web).
- Hors type-map : `call:force-leave`, `call:check-active`,
  `presence:app-state`.
- Les events `call:rejected`/`call:accepted`/`call:incoming`… ne vivent QUE
  dans `apps/web/__tests__/fixtures/calls.ts` (fixtures, pas prod) — ne pas
  re-chasser.

## 3 recommandations prioritaires
1. **Dismiss multi-device unifié** : web écoute `call:already-answered` ;
   retirer `platforms:['ios']` des 2 pushes (router FCM aussi) ; déplacer le
   push miroir AVANT le return TARGET_NOT_FOUND.
2. **Geler le contrat** `video-call.ts` : deprecate les 5 events morts,
   migrer force-leave/check-active en `CALL_EVENTS.*`, test CI de symétrie
   émetteur/écouteur cross-platform.
3. **Harnais e2e multi-client** (la vraie « device-test jamais faite ») :
   2 sockets Socket.IO + mock WebRTC pilotant offer/answer/ICE et le
   scénario « 2 devices, un répond » — couvre les findings 1, 2, 3, 7.

Fichiers-clés : `services/gateway/src/socketio/CallEventsHandler.ts` (3730 l),
`CallService.ts:184`, `TURNCredentialService.ts:115-150`,
`CallManager.swift:1281,3915,4788`, `P2PWebRTCClient.swift:174-190`,
`apps/web/components/video-call/CallManager.tsx:643-648`,
`CallSignalManager.kt:295-312`, `packages/shared/types/video-call.ts:836-885`.

> Captions live 3 plateformes (2026-07-12, post-arc transcription) : le
> gateway traduit chaque segment final par participant et relaie
> call:translated-segment ; iOS l'affichait (CallTranscriptionService),
> Android aussi (audit #5 — CallViewModel.onTranslatedSegment →
> state.captionText → CallScreen), mais le web n'avait AUCUN listener :
> un participant web face à un speaker iOS ne voyait jamais les
> sous-titres. Comblé b507ebe19 : useCallCaptions (sémantique miroir iOS
> appendSegment — partial remplace partial du même speaker, final efface
> le partial, rétention 4 lignes, linger 6 s ré-armé) +
> CallCaptionsOverlay (bandeau bas-centre, partials atténués, préfixe
> speaker résolu) + i18n 4 locales. 19 suites appels web 103/103.
> L'ÉMISSION reste iOS-only (SFSpeechRecognizer on-device) — émission
> web (Web Speech API) / Android (SpeechRecognizer) = features dédiées,
> hors périmètre parité consommation.

> Harnais e2e +1 scénario captions (2026-07-12) : transcription-segment →
> translated-segment épinglé sur vraies sockets — partial relayé sans
> traduction, final fallback sans ZMQ (translatedText absent,
> targetLanguage=sourceLanguage — le chemin dégradé que les 3 clients
> affichent), speaker exclu (socket.to), device hors room exclu,
> non-participant rejeté NOT_A_PARTICIPANT sans fuite. Revue au passage :
> segment.speakerId transite TEL QUEL (pas de réécriture serveur comme
> screen-capture-detected) — accepté : l'auteur est déjà un participant
> actif autorisé à injecter du texte ; l'usurpation intra-appel n'élargit
> pas la surface (il pourrait aussi bien parler). 7/7 harnais.

> Arc reject, chemin manquant (2026-07-12) : le refus depuis l'ÉCRAN
> VERROUILLÉ (CXEndCallAction sur entrant pré-décroché = bouton Refuser
> CallKit, seul chemin de refus en background) aboutissait dans endCall()
> sans raison → missed → fausse notification « appel manqué » au refuseur,
> encore vivante sur le chemin le plus fréquent. Fix d371f3505 : endCall()
> détecte .ringing(isOutgoing: false) → emitCallReject +
> endCallInternal(.rejected) ; 4 source-guards EndCallLockScreenDeclineTests ;
> guard bye-before-teardown migré fenêtre 3000 chars → borne MARK (il
> épinglait aussi endCallInternal(reason: .local) texte exact). Vérifié par
> réplication Python avant push ; verdict iOS Tests attendu sur ce tip.

> Refus socket-down iOS (2026-07-12, 95c6cebc4) : emitCallReject dans une
> socket morte était JETÉ (push VoIP à froid + refus avant handshake →
> appelant sonne 60 s, résolution missed). Le refus est désormais différé
> dans pendingEndReconciliationCallId + pendingEndReconciliationReason et
> rejoué AVEC reason=rejected par l'observer connectionState (un replay en
> end plat ressusciterait le mislabel). rejectPendingCall passe par le
> helper. Parité Android DeclinedCallStore. 3 source-guards
> RejectDeferredReconciliationTests. L'arc reject couvre désormais TOUS
> les chemins × TOUS les états de transport sur les 3 plateformes.

> Harnais e2e +1 scénario reject (2026-07-12) : refus pré-décroché sur le
> fil — call:end {reason:'rejected'} ack'é, raison reçue TELLE QUELLE par
> CallService.endCall (stub enregistreur, endReason la fait suivre comme
> le vrai service) et broadcast call:ended {reason:'rejected'} consommé
> par l'appelant. 8/8 harnais. Le contrat des 4 arcs (ring multi-device,
> side-channels, reject, captions) est intégralement épinglé sur vraies
> sockets.

> **CERTIFICATION 2026-07-12 : tout vert.** iOS Tests success sur 95c6cebc4
> (run 29178082197 — refus lock-screen d371f3505 + refus socket-down différé
> 95c6cebc4, 7 source-guards neufs). CI success + Docker success sur
> 8c6c75748 (harnais e2e 8 scénarios dont reject wire + captions web
> b507ebe19). L'arc reject est complet : 3 plateformes × tous les chemins
> de refus × tous les états de transport, contrat serveur épinglé en e2e.
> Reste UNIQUEMENT le device-test physique 2 appareils.

> DÉPLOIEMENT PROD 2026-07-12 ~03:42Z : pull isopen/meeshy-gateway:latest +
> isopen/meeshy-web:latest, recréation chirurgicale (--no-deps gateway
> frontend). Gateway healthy (0 motif crash-loop), meeshy.me/www 200,
> ws/translation/db up. Le 404 Traefik ~60 s post-recréation = fenêtre
> healthcheck→routage documentée (vérifié : app 200 en direct, routeur
> unique, WRN réseau inoffensif). L'arc reject serveur (status=rejected)
> et les captions web sont EN PRODUCTION.

> Bug rejoin visio (2026-07-12) : callSessionSchema ne whitelist ait PAS
> metadata → le type audio/video était strippé du payload REST active-call
> (privacy fix 2026-05-12 trop large) ; mode transporte l'architecture
> (p2p|sfu), jamais 'video' — iOS ActiveCallSession.isVideo lisait
> mode=="video" → une VISIO rejointe après crash reprenait en AUDIO
> (pill Rejoindre b69509366). Fix racine : metadata whitelisted {type}
> dans le schema + enum mode corrigée (p2p|sfu) + test de SÉRIALISATION
> fast-json-stringify (les tests de routes mockent sendSuccess — le
> schema n'y est jamais exercé, d'où l'invisibilité) ; iOS decode
> metadata.type (fallback mode), tests SDK ré-encodés sur la vraie forme
> wire. Web non affecté (lit callType du message call-live). Reste :
> parité Android rejoin (aucune découverte active-call côté Android).

> Parité Android rejoin — tranche 1 (2026-07-12) : découverte active-call
> posée. ActiveCallSession/Metadata/Participant (core/model, décode pur de
> callSessionSchema, 5 tests XML-vérifiés — isVideo lit metadata.type dès
> le départ, jamais le bug iOS mode=='video') + ActiveCallApi Retrofit
> (GET conversations/:id/active-call + GET calls/active crash-recovery)
> + provider Hilt. Reste tranche 2 : affordance (bulle call-live ou pill
> header) + flux join depuis la découverte.

> Rejoin Android — garde local (2026-07-12, ee8e74745) : la pill
> « Rejoindre » se masquait sur state.activeCall != null sans savoir si
> CE device est déjà en appel (minimisé). RejoinPillPolicy.shouldOffer
> (pure, 4 tests) n'offre que si appel vivant serveur ET aucun localement ;
> MeeshyApp passe CallPillPresenter.isMinimizable(callState.status) — un
> seul appel à la fois, un booléen suffit. ChatScreen ne reçoit qu'un
> Boolean (pas de dép feature:calls). feature:chat 467/467. Parité iOS
> guard de réconciliation. La feature rejoin Android est COMPLÈTE.

> Analytics — côté LECTURE (2026-07-12, b3a336252) : call:analytics était
> persisté (CallParticipant.analytics) mais JAMAIS lu — télémétrie
> write-only invisible aux dashboards. Comblé end-to-end : agrégateur pur
> callAnalyticsAggregate (coerce défensif + summarize, 13 tests) +
> GET /api/v1/admin/analytics/calls?days=7 (admin-gated, cache 10min,
> fenêtre 1-90j, ROW_CAP 5000+flag sampled, pas de filtre Json-null DB =
> footgun Prisma évité, null droppés en JS). 908/908 routes admin +
> privacy per-participant intacte. Le pipeline analytics est maintenant
> complet : client émet → serveur valide+persiste → admin agrège+lit.

> Analytics READ endpoint DÉPLOYÉ (2026-07-12) : gateway prod re-déployée
> depuis a399fdb0e (qui ne l'avait pas) vers b3a336252. Preuve end-to-end :
> GET /api/v1/admin/analytics/calls est passé de 404 (route absente) à 401
> (route présente, auth requise) ; révision conteneur = b3a336252, healthy,
> 0 crash-loop. Le seul changement gateway depuis la révision précédente
> était cet endpoint (le reste = frontend/docs). Pipeline analytics
> intégralement live en prod.

> Ring-timeout web #1879 DÉPLOYÉ (2026-07-12) : frontend prod re-déployé de
> a399fdb0e (CALL_TIMEOUT_MS=30s, bug de raccroché prématuré sur callee lent
> 30-45s) vers 05daf2068 (45s, parité iOS outgoingRingTimeoutSeconds).
> Révision conteneur = 05daf2068 healthy, meeshy.me/www 200 après la fenêtre
> Traefik. Le seul changement frontend depuis la révision précédente était
> ce fix. Prod entièrement à jour côté serveur+web : gateway b3a336252
> (analytics), frontend 05daf2068 (ring 45s). Restent les builds app iOS/
> Android (app stores).

> Bug agrégateur analytics trouvé sur données PROD (2026-07-12, f87c7a71b) :
> requête DB prod = 723 CallParticipant, 87 avec télémétrie (66 sur 7j) —
> le pipeline collecte bien. Mais l'exemple révèle setupTimeMs=-1 (sentinelle
> « jamais connecté », Android CallAnalytics:76). avgSetupTimeMs moyennait
> les -1 → moyenne faussée. Fix : moyenne sur les connectés seuls (>= 0,
> null si aucun, comme negotiationTimeMs) + connectSuccessRate (fraction
> connectée = usage utile de la sentinelle). 16 tests agrégateur, 50/50
> route. Re-deploy gateway nécessaire (b3a336252 live a l'agrégateur buggé).

> Fix sentinelle setup time DÉPLOYÉ (2026-07-12) : gateway prod b3a336252 →
> f87c7a71b (seul changement gateway = le fix). Révision conteneur = f87c7a71b
> healthy, endpoint toujours 401, 0 crash-loop. avgSetupTimeMs correct
> (sentinelle -1 exclue) + connectSuccessRate live sur les 87 rows réels.
> Boucle complète : bug trouvé sur données prod → fix TDD → CI verte →
> déployé → vérifié live.

> Émission call:analytics WEB comblée (2026-07-12, a619bfbcd) : découvert
> sur données prod — 100% des analytics étaient iOS. Android/iOS émettent,
> le web JAMAIS → dashboard fiabilité aveugle aux appels web. Livré :
> lib/call-analytics accumulateur pur (setupTimeMs premier-connect/−1
> sentinelle, reconnexions, échantillons qualité → avg/max + distribution ;
> 9 tests) + use-call-analytics-reporter (émet 1× au teardown, ref-gardé ;
> 6 tests) + câblage VideoCallInterface. platform='web', honest defaults.
> 107/107 suites appels web. Les 3 plateformes émettent désormais la
> télémétrie de fiabilité (parité complète émission↔lecture).

> Émission web + fix endReason DÉPLOYÉS (2026-07-12) : gateway f87c7a71b→
> ed8a56c02 (failed(msg) agrégés), frontend 05daf2068→a619bfbcd (web émet
> call:analytics). Deltas propres (1 commit chacun), les deux healthy,
> meeshy.me 200. À partir de maintenant les appels web reportent leur
> télémétrie → dashboard fiabilité plus 100% iOS. Boucle analytics complète
> et LIVE : 3 plateformes émettent → serveur persiste → admin agrège (avec
> failed unifié + sentinelle setup exclue).

> Fix avgRtt déflaté (2026-07-12, fe13f1293) : vérif agrégat sur prod =
> avgRtt 113.9ms sur 87 rows dont 42 connectés seulement — les 45 jamais
> connectés (averageRtt=0, aucun échantillon) déflataient la moyenne ~2×.
> avgRtt/avgPacketLoss moyennés sur connectés (setupTimeMs>=0) seulement,
> null si aucun. Vérifié aussi : packetLoss en % des 2 côtés (web/iOS),
> qualityDistribution somme ~1 sur les 87, negotiationTimeMs présent 77
> (42 réels >=0, filtré correct). 56/56. Re-deploy gateway à suivre.
