# Appels de groupe — Analyse d'écart de l'infrastructure (2026-08-13)

> Question : l'infrastructure pour les appels de groupe est-elle là ?
> Modèle cible : un appel est traité comme une conversation de groupe — on peut
> rejoindre, y être ajouté, quitter puis revenir à tout moment.

## Verdict

**L'infrastructure 1:1 est mature et, aux ~80 %, déjà prête pour le groupe côté
serveur — mais trois verrous précis la brident au 1:1, et le client iOS est
architecturalement mono-pair.** Aucun SFU n'existe (le mode `sfu` est déclaré
dans les enums/types sans aucun média derrière — aucune dépendance
mediasoup/LiveKit dans le repo). Les specs (`2026-03-29-webrtc-p2p-calling-design.md`
§« Phase 2 group calls », `2026-05-10-calls-sota-redesign-design.md` §1.bis.2)
scopaient explicitement le groupe en « Phase 2 » jamais réalisée.

Le modèle produit demandé (« appel = conversation de groupe, join/leave/re-join
libre ») est EXACTEMENT le modèle que le serveur implémente déjà en germe :
- `initiateCall` accepte les conversations `group` (`CallService.ts:930`) ;
- la sonnerie est diffusée à TOUS les membres + VoIP push aux non-foreground
  (`CallEventsHandler.ts:2069-2168`) ;
- un départ en groupe ne termine PAS l'appel — il vit jusqu'au dernier
  participant (`CallService.ts:1609-1625`) ;
- le re-join après un `leftAt` crée une nouvelle ligne `CallParticipant`
  (`joinCall` ne matche que `!leftAt`, `CallService.ts:1324-1338`) — revenir
  fonctionne déjà en base ;
- « y être ajouté » = être membre de la conversation : la bulle live « Appel en
  cours » (`postLiveCallMessage`, spec `2026-07-11-live-call-message-design.md`)
  et l'`OngoingCallBanner` web (polling REST 15 s `GET
  /conversations/:id/active-call`) donnent déjà l'affordance de rejoindre ;
- le signaling est déjà ciblé par pair : `WebRTCSignal.from/to` +
  `resolveTargetSockets` (`CallEventsHandler.ts:3051`) — mesh-ready ;
- REST complet : `POST /calls`, `POST /calls/:id/participants` (join),
  `DELETE /calls/:id/participants/:pid` (leave + kick modérateur), actif par
  conversation, actif par user (crash recovery), historique.

## Ce qui manque EXACTEMENT

### Serveur (gateway) — 1 verrou, 2 ajustements

| # | Quoi | Où |
|---|------|-----|
| S1 | **Cap dur à 2 participants actifs** : `activeParticipants.length >= 2 → MAX_PARTICIPANTS_REACHED` | `services/gateway/src/services/CallService.ts:1340-1350` |
| S2 | `mode: CallMode.p2p` codé en dur à l'initiate (« Phase 1A: P2P only ») ; `determineCallMode()` (shared) n'est appelé nulle part | `CallService.ts:1143` ; `packages/shared/types/video-call.ts:1003` |
| S3 | Sémantique « missed » de groupe : le timeout de sonnerie 60 s est correctement scopé `initiated/ringing` (un appel devenu `active` n'est pas tué) mais la notification missed est globale à l'appel, pas par membre n'ayant pas répondu (`getUnrespondedParticipants` existe déjà, `CallService.ts:2285`) | `CallEventsHandler.ts` (`buildRingingTimeoutHandler`) |

Rien d'autre : machine d'état versionnée, claim atomique `activeCallId`,
heartbeats, GC, boot-rehydration, TURN dynamique par user, buffered offers,
éviction C8 (1 socket par user par room d'appel) sont topologie-agnostiques.

### Web — 3 gates produit, 2 bugs d'état scalaire, l'UI

Le moteur est déjà multi-pairs (`Map<participantId, WebRTCService>` une
RTCPeerConnection par pair, clones de piste par pair, boucle d'offres sur tous
les participants actifs, buffer `pendingParticipantsByCallId`).

| # | Quoi | Où |
|---|------|-----|
| W1 | Gate initiation `conversation.type !== 'direct' → toast directOnly` | `apps/web/hooks/conversations/use-video-call.ts:86-89` |
| W2 | Bouton d'appel rendu seulement si `type === 'direct'` | `apps/web/components/conversations/header/HeaderToolbar.tsx:89` |
| W3 | Bouton « Rejoindre » de la bulle live : `canJoin = … && conversationType === 'direct'` | `apps/web/components/common/bubble-message/CallSystemMessage.tsx:63` |
| W4 | **Bug latent** : `connectionState`/`iceConnectionState` sont des `useState` scalaires écrasés par le dernier pair — un pair qui échoue affiche tout l'appel en `failed` | `apps/web/hooks/use-webrtc-p2p.ts:55-56,240-245,259` |
| W5 | **Bug latent** : `useActivePeerConnection` ne retourne que la 1re PC — qualité/dégradation adaptative pilotées sur les stats d'un seul pair, appliquées à tous | `apps/web/hooks/use-active-peer-connection.ts:26-32` |
| W6 | UI 1:1 : pas de grille (1 plein écran + vignettes flottantes `x = 20+index*160`), pair principal = premier de la Map, pas de roster/active-speaker, `onRemove` purement local (pas branché sur le DELETE kick REST), timeout global 45 s (`CallManager.tsx:41`), `CallNotification` mono-appelant, slot `currentCall` unique | `apps/web/components/video-calls/VideoCallInterface.tsx:636-788`, `CallManager.tsx` |
| W7 | i18n : aucune chaîne de groupe (invitation, roster, « X a rejoint ») ; `toasts.directOnly` documente la limitation | `apps/web/locales/*/calls.json` |

### iOS — refonte topologique du client (le plus gros chantier)

Le protocole réseau est prêt (le SDK décode `CallSignalPayload.from/to`,
`MessageSocketManager.swift:885-886` ; publishers `callParticipantJoined/Left`
portent le `userId`) — c'est la couche média/app qui est mono-pair :

| # | Quoi | Où |
|---|------|-----|
| I1 | `P2PWebRTCClient` détient UNE `RTCPeerConnection` (pas de registre par pair) ; `remoteVideoTrack_` unique | `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift:40,68` |
| I2 | `WebRTCServiceDelegate` sans `participantId` (`didReceiveRemoteVideoTrack`, `didChangeConnectionState`, `didCollectStats` non qualifiés) | `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift:7-24` |
| I3 | `CallManager.startCall(conversationId:userId:…)` prend UN `userId` ; `listenForParticipantJoined` s'annule au premier join (une seule offre émise) | `CallManager.swift:1051,4616-4674` |
| I4 | Aucune map d'état par participant publiée par `CallManager` (les events `media-toggled`/`participant-left` sont reçus mais pas indexés) | `CallManager.swift` |
| I5 | `CallView` rend exactement 2 flux (local + remote), pas de grille/roster | `apps/ios/Meeshy/Features/Main/Views/CallView.swift:1155-1157` |
| I6 | SDK : `ActiveCallSession.remoteParticipant(currentUserId:)` → « nil pour les appels de groupe » ; `CallHistoryPeer` nil en groupe (journal sans liste/compteur) ; pas de type `CallParticipantState` | `packages/MeeshySDK/Sources/MeeshySDK/Models/CallModels.swift:20,241-245` |
| I7 | CallKit/VoIP : `CXCallUpdate` mono-appelant ; payload VoIP `callId`+appelant unique (pas de titre de groupe/compteur) ; il faut `CXHandle(.generic, conversationId)` + nom agrégé | `CallManager.swift:727-764`, `VoIPPushManager.swift:240-320` |

### Transverse

- **Aucun SFU** : `mediasoup`/`livekit` absents de tous les `package.json` ;
  `sfuDevice/sfuTransport: unknown` placeholders (`call-store.ts:148-150`) ;
  `MODE_CHANGED` documenté « jamais émis » (`video-call.ts:873-877`).
- **Mesh full-P2P plafonne à ~4-5 participants** (N-1 encodages vidéo par
  client, pas de simulcast/SVC ; `enableSimulcast()` iOS conservé pour la
  Phase 2 mais jamais appelé).
- E2EE : les appels sont DTLS-SRTP par paire (E2E de fait en mesh) ; un SFU
  casserait cela sans Insertable Streams (hook `FrameEncrypting` prévu iOS).
- coturn est déployé (dev/staging/prod) — la bande passante TURN en mesh croît
  en O(N²) sur les pires réseaux : à surveiller, pas bloquant à 4.

## Comment mettre cela en place

### Décision structurante (à prendre en premier)

**Palier 1 — mesh 3-4 participants (recommandé, aucune nouvelle infra)** :
lever S1/S2, les 3 gates web, refondre le client iOS en multi-PC. C'est le
chemin le plus court vers « appel = conversation de groupe » et il est
entièrement couvert par l'infrastructure actuelle (signaling ciblé, TURN,
heartbeats, live message). **Palier 2 — SFU (mediasoup ou LiveKit) seulement si
le besoin >4-5 se confirme** : les types/enums sont déjà prêts pour la bascule
(`mode: 'sfu'`, `MODE_CHANGED`, placeholders client), mais c'est un nouveau
service média + un client par plateforme (plusieurs semaines).

### Phase 0 — décisions produit (½ journée)
- Cap mesh : 4 actifs (persisté dans `CallSession.metadata.maxParticipants`,
  défaut serveur ; le champ existe déjà dans `CallMetadata`).
- Modèle « appel ouvert » : tout membre ACTIF de la conversation groupe peut
  join/leave/re-join tant que l'appel vit. « Ajouter quelqu'un à l'appel » =
  l'ajouter à la conversation (flux existant) → il voit bulle live + banner.
- Pas de re-ring au re-join ; toast « X a rejoint / a quitté ».

### Phase 1 — serveur (TDD, ~2-3 jours)
1. `joinCall` : cap dynamique — `direct` → 2 ; `group` →
   `metadata.maxParticipants ?? 4` (garder l'enum `CallMode` intact, rester
   `p2p` en mesh ; ne pas réactiver `sfu` tant qu'aucun média SFU n'existe).
   Tests : 3e join accepté en groupe, refusé en direct, `MAX_PARTICIPANTS_REACHED`
   au cap, re-join après leave.
2. Missed par membre : au passage `active`, notifier missed via
   `getUnrespondedParticipants` à l'expiration du ring (sans toucher l'appel).
3. Test e2e 3 sockets (`calls-three-socket-e2e.test.ts`) : initiate → join ×2 →
   signaux ciblés croisés (3 paires) → leave d'un (l'appel continue,
   `PARTICIPANT_LEFT` reçu par les 2 autres) → re-join → last-leave (ended,
   durée, summary).
4. Bulle live : autoriser l'action « Rejoindre » en groupe (lever la restriction
   « groupes = état affiché sans action » de la spec live-call-message).

### Phase 2 — web (~3-5 jours)
1. Lever W1/W2/W3 (3 lignes de garde) ; garder `canUseVideoCalls`.
2. Corriger W4/W5 (bugs latents même en 1:1) : états par pair
   (`Map<participantId, ConnectionState>`), agrégation explicite pour l'UI
   (« reconnexion de X » ≠ « appel échoué ») ; quality-report par pair.
3. UI : grille adaptative (1→2→4), roster avec états mute/vidéo, toasts
   join/leave, `CallNotification` groupe (titre du groupe + initiateur +
   compteur), brancher `onRemove` sur `DELETE /calls/:id/participants/:pid`
   (kick modérateur déjà supporté côté REST) ou le retirer, timeout 45 s
   inhibé dès qu'≥1 pair est connecté.
4. i18n groupe dans `calls.json` (fr/en/es/pt).

### Phase 3 — iOS (~2-3 semaines, le chantier principal)
1. **Multi-PC** : conserver `P2PWebRTCClient` mono-PC tel quel et introduire un
   registre app-side `[peerId: P2PWebRTCClient]` (protocole
   `CallPeerRegistryProviding` d'abord — TDD iOS) ; qualifier
   `WebRTCServiceDelegate` par `participantId`.
2. `CallManager` : `startCall(conversationId:isVideo:)` (plus de `userId`
   unique) ; `listenForParticipantJoined` persistant → une offre par arrivant
   (le champ `to` du signal est déjà décodé/émis par le SDK) ; publier
   `@Published var participants: [CallParticipantState]`.
3. SDK : `ActiveCallSession.remoteParticipants(currentUserId:)`,
   `CallParticipantState` (mute/vidéo/connexion), journal groupe (titre +
   compteur quand `peer == nil`).
4. UI : `CallView` grille `LazyVGrid` 2×2, tuiles audio-only, indicateurs par
   participant ; `CallParticipantVisual` paramétré.
5. CallKit/VoIP : `CXHandle(.generic, conversationId)`,
   `localizedCallerName` = titre du groupe (« Meeshy Design — Appel de
   groupe »), payload VoIP enrichi (`conversationTitle`, `participantCount`) ;
   `call:already-answered` inchangé (multi-device d'un même user).
6. `./apps/ios/meeshy.sh test` vert avant tout commit (CI macOS fait foi).

### Phase 4 — SFU (optionnel, plus tard)
Déclencheur : besoin réel >4-5 participants. mediasoup côté Node (service
`services/sfu` ou intégré gateway), réactivation de `mode: 'sfu'` +
`MODE_CHANGED` (aujourd'hui @deprecated « jamais émis »), bascule p2p→sfu à
N>4, `mediasoup-client` web (placeholders du store déjà en place), transport
SFU iOS (le design SOTA prévoit `WebRTCEngine.transport: any MediaTransport`).
E2EE à traiter via Insertable Streams / `FrameEncrypting`.

## Récapitulatif

| Capacité demandée | État |
|---|---|
| Appel lié à une conversation de groupe | ✅ serveur OK (`initiateCall` accepte `group`) ; ❌ bloqué par les gates UI web/iOS |
| Rejoindre un appel en cours | ✅ mécanique complète (bulle live, banner, REST, buffered offers, cold-rehydration) ; ❌ bouton désactivé en groupe ; ❌ cap 2 |
| Y être ajouté | ✅ = être membre de la conversation (flux existant) + fan-out ring à tous les membres ; rien à construire de plus |
| Quitter sans terminer l'appel | ✅ serveur (`leaveCall` groupe continue) ; ❌ clients traitent tout départ comme fin d'appel |
| Revenir à tout moment | ✅ serveur (nouvelle ligne `CallParticipant`) ; ❌ aucun client ne propose le re-join après départ volontaire |
| 3+ flux média simultanés | ❌ cap serveur 2 ; ✅ moteur web déjà N-pairs ; ❌ iOS mono-PC ; ❌ pas de SFU |
