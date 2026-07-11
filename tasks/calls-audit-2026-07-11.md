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
> Restent : #5 (parité Android socket), #9 (restartIce iOS), harnais e2e
> 2-sockets.

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
