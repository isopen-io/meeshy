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

## Mise à jour 2026-08-13 — verrous 1:1 levés (cette branche)

- **S1 levé** : le cap `joinCall` passe de 2 à `MAX_CALL_PARTICIPANTS = 9999`
  (exporté par `CallService.ts`). Les conversations directes restent
  naturellement bornées à leurs 2 membres par le contrôle d'appartenance.
- **W1/W2/W3 levés** : initiation, bouton d'appel du header et « Rejoindre »
  de la bulle live acceptent désormais `direct` ET `group` (les types
  `public`/`global` restent refusés, en miroir du serveur) ; clé i18n
  `toasts.directOnly` remplacée par `toasts.unsupportedConversationType`.
- Le reste de l'analyse (mesh iOS mono-PC, états scalaires web W4/W5, UI de
  groupe, SFU) demeure inchangé et à traiter.

## Mise à jour 2026-08-13 (2) — W4 corrigé (agrégation par pair)

**W4 levé** : `connectionState`/`iceConnectionState` (`use-webrtc-p2p.ts`)
étaient des `useState` scalaires écrits en dernier-arrivé-gagne par le
callback `onConnectionStateChange`/`onIceConnectionStateChange` de CHAQUE
pair. Avec le cap 1:1 encore en vigueur c'était latent (documenté « bug
latent, même en 1:1 » dans l'analyse d'origine) ; le cap levé (S1 ci-dessus)
le rend réel : dans un appel de groupe à 3+ pairs, UN pair qui échoue sa
négociation (retardataire qui rejoint, réseau dégradé) écrasait l'état de
TOUT l'appel — `toast.error('Connection failed')`, `setError`, et
`onError?.()` se déclenchaient pour l'appel entier alors que les autres
pairs restaient connectés.

Fix : deux `Map<participantId, State>` (`connectionStatesRef`,
`iceConnectionStatesRef`) réduites par un agrégateur à priorité fixe
(`connected` > `connecting` > `new` > `disconnected` > `closed` > `failed`,
et l'équivalent ICE avec `completed`/`checking`) — un pair `failed` ne fait
jamais gagner `'failed'` tant qu'au moins un autre pair est dans un meilleur
état ; `'failed'` ne peut gagner que lorsque TOUS les pairs connus ont
échoué. Les effets de bord globaux (toast, `setError`, `onError`) sont
maintenant gatés sur la TRANSITION de l'agrégat (comparé à la dernière
valeur émise), pas sur l'événement par-pair — un `'Connected!'` par appel,
pas par participant qui rejoint. `removeParticipant` retire l'entrée du pair
parti et ré-agrège (un pair `failed` qui quitte ne laisse plus l'appel bloqué
`failed`). Signature de l'API du hook inchangée (toujours un scalaire
`RTCPeerConnectionState`/`RTCIceConnectionState`) — aucun changement côté
`VideoCallInterface.tsx` / `use-call-analytics-reporter.ts`.

Tests : 7 nouveaux cas dans `use-webrtc-p2p.test.tsx` (« Multi-peer
connection state aggregation (W4) ») — reste connecté avec un pair en échec,
ne bascule `failed` qu'une fois TOUS les pairs échoués (idempotent sur un
second échec), récupère après reconnexion d'un pair, un seul toast succès
pour l'appel, ré-agrégation correcte après le départ d'un pair, même
garanties côté ICE. Suite complète `apps/web` (566 suites / 12153 tests)
verte après le fix.

**W5 (`useActivePeerConnection` ne suit que le 1er pair — qualité/dégradation
adaptative pilotée par un seul pair en groupe) reste À TRAITER** : contrairement
à W4, le corriger correctement demande d'étendre `useCallQuality` (aujourd'hui
`peerConnection: RTCPeerConnection | null` unique) pour agréger les stats de
TOUS les pairs — pas un simple changement de sélecteur. C'est un chantier de
la Phase 2 web (UI de groupe), pas un fix ponctuel ; laissé pour cette phase.

## Mise à jour 2026-08-13 (3) — W5 corrigé (agrégation multi-pair de la qualité)

**W5 levé.** `useActivePeerConnection` (qui ne sélectionnait que la première
`RTCPeerConnection` du store, sous l'invariant 1:1 périmé depuis la levée de
S1) est **supprimé** et remplacé par `usePeerConnections`, qui expose la `Map`
entière — réactive, stable tant que le SET de pairs ne change pas réellement
(voir plus bas). `useCallQuality` échantillonne désormais **chaque** pair à
chaque tick au lieu d'un seul :

- RTT / perte de paquets / gigue retiennent le **PIRE** des pairs — un pair
  qui décroche doit faire bouger l'aiguille de la pastille de qualité, de
  l'échelle de dégradation adaptative (`useAdaptiveDegradation`) et du
  rapport `call:quality-report` (persisté sur le résumé d'appel), jamais être
  masqué par des pairs en bonne santé échantillonnés à côté de lui.
- Débit et compteurs d'octets cumulés (`bytesSent`/`bytesReceived`) se
  **SOMMENT** entre pairs — bande passante totale réellement utilisée par
  l'appel, pas celle d'un seul participant.
- La ligne de base delta (nécessaire pour dériver un débit/taux de perte à
  partir des compteurs cumulatifs WebRTC) est tenue **par pair** dans une
  `Map<participantId, …>` plutôt que dans une seule ref scalaire, pour qu'un
  pair qui rejoint en cours d'appel n'écrase jamais la ligne de base d'un pair
  déjà présent, et qu'un pair qui part laisse simplement une entrée orpheline
  sans conséquence (purgée au tick suivant).
- Forme externe inchangée (`ConnectionQualityStats` reste un scalaire) :
  zéro changement requis côté `CallQualityOverlay`, `useAdaptiveDegradation`
  ou `useCallAnalyticsReporter`.

**Bug trouvé pendant le TDD, pas seulement dans le code de prod** : la
première version de `useCallQuality` faisait dépendre `updateStats` et l'effet
de monitoring de l'identité RÉFÉRENTIELLE de la `Map` `peerConnections`
passée en paramètre. `usePeerConnections` (l'appelant de prod) garantit déjà
une référence stable (le store n'émet une nouvelle `Map` que sur un ajout/
retrait RÉEL de pair — jamais de mutation en place). Mais un appelant qui
construit une `Map` neuve à CHAQUE rendu (exactement ce que faisaient mes
propres tests, via un helper `onePeer()` invoqué à l'intérieur du callback de
rendu) déclenchait une boucle infinie : rendu → nouvelle `Map` → effet
reconstruit → `updateStats()` → `setQualityStats` → rendu → nouvelle `Map` →
…, épinglant un cœur CPU à 100 % indéfiniment (repéré via `ps` : le process
`jest` tournait à 109 % CPU pendant 5+ minutes sur un fichier qui s'exécute
normalement en < 1 s). Plutôt que de me contenter de corriger mes tests, le
hook est rendu robuste PAR CONSTRUCTION : un memo interne
(`useStablePeerConnections`) compare la `Map` reçue par VALEUR (mêmes ids →
mêmes instances `RTCPeerConnection`) et ne change de référence exposée que si
le set a réellement changé — indépendamment de la discipline de l'appelant.

Tests : 54 cas dans `use-call-quality.test.ts` (dont 8 nouveaux « group calls
(multiple peer connections, W5) » — pire RTT/perte/gigue retenu, débit et
octets sommés, ligne de base par pair préservée à l'arrivée d'un nouveau pair,
purge propre au départ d'un pair) + 5 cas dans le nouveau
`use-peer-connections.test.ts` (remplace `use-active-peer-connection.test.ts`,
supprimé). Suite complète `apps/web/__tests__/hooks/` +
`__tests__/components/video-calls/` (119 suites / 2317 tests, 2 skip
pré-existants) verte après le fix.

**Reste à traiter (Phase 2 web UI de groupe, inchangé)** : W6 (grille
adaptative, roster, `onRemove` non branché sur le kick REST, timeout global
45 s, `CallNotification` mono-appelant) et W7 (i18n groupe absente de
`calls.json`). Le mesh iOS mono-PC (I1-I7) et le SFU (Phase 4, optionnel)
restent également hors scope de cette branche.

## Mise à jour 2026-08-14 — deux items de W6 clarifiés/traités (routine calling)

- **« Timeout global 45 s » RECLASSÉ : pas un bug.** Relecture de
  `CallManager.tsx` (web) : `startCallTimeout`/`clearCallTimeout` sont gatés
  sur `currentCall.status === 'initiated'`, et le statut passe à `'active'`
  dès la PREMIÈRE réponse SDP réelle (`useWebRTCP2P.handleAnswer`, Vague
  113/114 — *pas* le room-join précoce d'iOS). Une fois qu'UN membre décroche
  vraiment un appel de groupe, l'effet `if (status === 'active')
  clearCallTimeout()` désarme le timeout pour tout l'appel ; un retardataire
  qui ne répond jamais ne raccroche que SON PROPRE `incomingCall` local (même
  logique que n'importe quel appel manqué), sans jamais toucher l'appel actif
  des autres. Le point W6 d'origine datait d'avant ces deux vagues — corrigé
  ici pour ne pas ré-auditer un faux positif au prochain cycle.

- **`CallNotification` mono-appelant → TRAITÉ, par deux chemins qui se sont
  croisés.** Le même item a été traité deux fois le même jour, de deux façons
  complémentaires, et la fusion les réunit plutôt que d'en jeter une :
  - *Combien* — `isGroupCall` déduit de `CallInitiatedEvent.participants`
    (≥3 appelés = groupe), déjà peuplé pour CHAQUE appel côté gateway
    (`CallEventsHandler.ts`, `call:initiate` et le replay `call:check-active`).
    Il porte le badge « {count} personnes » et bascule le sous-titre sur
    « Appel de groupe ».
  - *Quel* — `CallInitiatedEvent` gagne `conversationType?`/`conversationTitle?`
    (optionnels, compat rolling deploy), peuplés gratuitement depuis
    `callSessionInclude.conversation`. Ils portent le TITRE de la conversation
    sous le nom de l'appelant, et rendent le signal de groupe AUTORITAIRE :
    une conversation de groupe reste un groupe même quand un seul appelé
    sonne, cas que le compte de participants ne peut pas voir.
  - `isGroupCall = conversationType === 'group' || participants.length > 2` :
    le champ quand la gateway l'envoie, le compte en repli pour les payloads
    antérieurs. La ligne de contexte ne répète PAS « Appel de groupe » (le
    sous-titre le dit déjà) — elle porte le titre, et ne retombe sur le
    libellé que pour un groupe sans titre.
  - `CallWaitingBanner` (2ᵉ appel entrant pendant qu'on est occupé) porte la
    même ligne de contexte.

**Reste du W6** (grille adaptative multi-participants, roster avec états
mute/vidéo, `onRemove` branché sur `DELETE /calls/:id/participants/:pid`) et
**W7** (i18n groupe pour le reste de l'UI d'appel — roster, toasts
join/leave) : toujours à traiter, chantier plus large que ces correctifs
ponctuels. Le mesh iOS mono-PC (I1-I7) et le SFU restent hors scope.

Tests : `CallNotification.groupCall.test.tsx` (5 cas) +
`CallNotification.test.tsx` (4 cas de contexte de groupe) +
`CallNotification.ringtoneUnmountRace.test.tsx` (régression) +
`CallWaitingBanner.test.tsx` (2 cas) +
`CallEventsHandler-initiate-conversation-context.test.ts` (4 cas, gateway).

## Mise à jour 2026-08-15 — bug racine sous W6 corrigé : REST leave/kick ne diffusait jamais PARTICIPANT_LEFT

En creusant W6 (« `onRemove` purement local, pas branché sur le kick REST »),
la vraie cause était en amont, côté gateway : `DELETE
/calls/:callId/participants/:participantId` (self-leave ET kick modérateur —
l'endpoint existe et son autorisation admin/moderator était déjà correcte)
appelait `leaveCall()` puis renvoyait, **sans jamais diffuser
`CALL_EVENTS.PARTICIPANT_LEFT`**. Seul le handler socket `call:leave`
l'émettait. Câbler un bouton « exclure » côté web sur cet endpoint sans ce
correctif aurait produit une exclusion qui ne notifie NI l'exclu NI les
autres pairs — ils restent dans la grille vidéo/roster de chacun, avec une
`RTCPeerConnection` toujours ouverte, jusqu'au GC (~120s).

Root cause confirmé en lisant `CallManager.handleParticipantLeft` (retire du
store via `event.participantId`) et `VideoCallInterface`'s propre listener
(tear-down WebRTC via `event.userId`, no-op silencieux si absent) : les DEUX
dépendent entièrement de cet event, qui n'était jamais émis sur le chemin
REST.

**Fix** — même pattern « parité socket » déjà établi pour `call:ended`
(`broadcastCallEndedIfTerminal` / `callEndedBroadcaster`, commentaires
« Bug (parité socket) » déjà présents dans `CallService.ts`) : nouveau
`CallService.participantLeftBroadcaster` + `broadcastParticipantLeft()`
(inconditionnel, PAS gardé sur le statut terminal — contrairement à
`broadcastCallEndedIfTerminal`, car PARTICIPANT_LEFT pilote un teardown par
pair qui doit arriver que l'appel continue ou se termine), wrapper
`CallEventsHandler.broadcastParticipantLeftForRest(io, event)`, câblage dans
`server.ts` à côté de `setCallEndedBroadcaster`. La route résout la ligne
`CallParticipant` du partant/exclu depuis le snapshot pré-leave
(`callService.getCallSession`) pour distinguer son `id` propre (ce sur quoi
le store client indexe) de `leaveParticipantId` (le `Participant.id`
conversation attendu par `leaveCall()`) — les deux avaient déjà été confondus
une fois par le passé sur ce même fichier (cf. commentaire kick
modérateur/mauvais côté qui « meurt » silencieusement).

Ceci ne construit PAS le bouton kick UI web (toujours à faire, W6) — c'est le
prérequis serveur qui le rend correct une fois construit. `onRemove` reste
local à ce stade.

Tests : `CallService.test.ts` (6 cas, `broadcastParticipantLeft`) +
`calls-routes.test.ts` (5 cas, diffusion REST — row id vs `leaveParticipantId`,
kick modérateur avec le bon userId cible, appel de groupe non-terminal,
no-op défensif si aucune ligne pré-leave ne matche, ligne déjà partie
ignorée) + `CallEventsHandler-participant-left-rest.test.ts` (2 cas,
nouveau). Suite gateway complète : 720 suites / 17626 tests verts.

## Récapitulatif

| Capacité demandée | État |
|---|---|
| Appel lié à une conversation de groupe | ✅ serveur OK (`initiateCall` accepte `group`) ; ❌ bloqué par les gates UI web/iOS |
| Rejoindre un appel en cours | ✅ mécanique complète (bulle live, banner, REST, buffered offers, cold-rehydration) ; ❌ bouton désactivé en groupe ; ❌ cap 2 |
| Y être ajouté | ✅ = être membre de la conversation (flux existant) + fan-out ring à tous les membres ; rien à construire de plus |
| Quitter sans terminer l'appel | ✅ serveur (`leaveCall` groupe continue **et, depuis 2026-08-16, `endCall` aussi**) ; ❌ clients traitent tout départ comme fin d'appel |
| Revenir à tout moment | ✅ serveur (nouvelle ligne `CallParticipant`) ; ❌ aucun client ne propose le re-join après départ volontaire |
| 3+ flux média simultanés | ❌ cap serveur 2 ; ✅ moteur web N-pairs (corrigé Vague 126 — était une étoile, pas un maillage : les non-initiateurs ne s'offraient jamais entre eux) ; ❌ iOS/Android mono-PC (probablement même bug, non vérifié — toolchains hors d'atteinte) ; ❌ pas de SFU |

## Mise à jour 2026-08-16 — bug racine serveur corrigé : `endCall()` tuait l'appel de groupe pour tout le monde

En creusant le reste de la stack d'appel (routine calling), un bug DISTINCT de
tous les items W/I ci-dessus, côté serveur : `CallService.endCall()`
force-terminait la session ENTIÈRE pour tous les participants, sans jamais
regarder `conversation.type` ni le nombre de participants actifs restants —
contrairement à `leaveCall()`, qui distingue déjà correctement `isDirectCall`/
`isLastParticipant` depuis le fix CALL-FIX 2026-06-06. Le commentaire de
`endCall()` lui-même le documentait comme dette : `// SFU (Phase 2): TODO
restrict to initiator/moderator once group calls exist` — sauf que les appels
de groupe existent déjà (mesh), ce TODO n'a simplement jamais été traité.

Concrètement atteignable : le SEUL chemin de raccroché iOS (bouton rouge
CallKit, raccroché in-app) appelle `emitCallEndReliably` → `call:end` —
jamais `call:leave`, alors que `MessageSocketManager.emitCallLeave` existe et
est câblé de bout en bout (testé par un garde dédié
`CallEmitSourceGuardTests`) mais n'est invoqué nulle part côté app. Donc tout
participant d'un appel de groupe qui raccroche tuait silencieusement l'appel
pour tous les autres — socket `call:end` (fast-path + chemin autoritatif) ET
REST `DELETE /calls/:callId`.

**Fix** — `endCall()` délègue désormais à `leaveCall()` (même distinction
`isDirectCall`/participants actifs restants) quand c'est un appel de GROUPE
avec d'autres participants actifs ; ne force la fin QUE pour un appel direct
ou quand le partant est le dernier actif. Handler socket `call:end` : le
fast-path optimiste émet `PARTICIPANT_LEFT` (pas `ENDED`) dans ce cas, et la
branche post-`endCall()` reproduit le traitement non-terminal de
`call:leave` (sortie de SA SEULE room, pas de `call:ended`/résumé/notif
manqué). Route REST `DELETE /calls/:callId` : diffuse `PARTICIPANT_LEFT` via
le même `broadcastParticipantLeft` câblé pour la route sœur leave/kick
(fix 2026-08-15), en miroir.

Ne construit PAS le multi-PC iOS (I1-I7, toujours le plus gros chantier) —
c'est un bug serveur pur qui aurait aussi cassé un futur client iOS
multi-pair naïvement câblé sur `call:end` pour son bouton raccrocher.

Tests : `CallService.test.ts` (3 cas — groupe continue, dernier actif ferme
toujours, direct inchangé), `CallEventsHandler.test.ts` (2 cas — fast-path
`PARTICIPANT_LEFT`, ack + nettoyage partiel), `calls-routes.test.ts` (2 cas —
broadcast REST, no-op défensif). Tous vérifiés ROUGE sans le fix serveur,
VERT avec. Suites `CallService`/`CallEventsHandler`/`calls-routes` complètes
vertes, `tsc --noEmit` propre.

## Mise à jour 2026-08-17 — S3 corrigé : la première réponse tuait la notification manquée du reste du groupe

**S3 levé.** `ringingTimeouts` (`CallService.ts`) est une `Map<callId, Timer>`
— un timer PAR APPEL, pas par paire. `buildRingingTimeoutHandler`
(`CallEventsHandler.ts`) est bien scopé `initiated`/`ringing` pour ne pas
tuer un appel devenu `active` (rappel du verdict d'origine), mais le
handler `call:signal` de type `answer` appelait
`this.callService.clearRingingTimeout(data.callId)` **sans condition**, dès
la PREMIÈRE négociation SDP réussie entre N'IMPORTE QUELLE paire. Dans un
appel mesh à 3+ invités, dès qu'UN callee décrochait, le timer de TOUT
l'appel était annulé — le seul mécanisme qui aurait fini par notifier les
AUTRES invités n'ayant jamais répondu (`createMissedCallNotifications` via
`getUnrespondedParticipants`, déjà câblé côté `handleMissedCall`) ne se
déclenchait plus jamais pour cet appel. Concrètement : appel de groupe à
Alice/Bob/Charlie, Bob décroche en 3s, Charlie ne décroche jamais (offline,
app tuée, pas de wake VoIP) → Charlie ne reçoit AUCUNE notification d'appel
manqué, alors que l'appel continue normalement pour Alice/Bob.

**Fix** — deux changements complémentaires, aucun ne touche à l'état de
l'appel actif :
1. `call:signal` (answer) ne clear le timer QUE pour une conversation
   `direct` (rien à attendre de plus une fois le seul callee décroché) ;
   pour `group`, le timer reste armé jusqu'à son échéance d'origine.
2. `buildRingingTimeoutHandler` : sa branche `updateMany.count === 0`
   (« déjà transitionné ») ne fait plus un `return` silencieux — chaque
   site qui appelle `clearRingingTimeout` correspond à une écriture
   TERMINALE réelle (leaveCall dernier participant/endCall/markCallAsMissed/
   les sweeps GC), donc atteindre cette branche avec un timer qui a
   réellement sonné signifie que l'appel est non-terminal
   (active/connecting/reconnecting) — le cas visé. Elle appelle maintenant
   `createMissedCallNotifications(callId)` en best-effort : aucune écriture
   de statut, aucun broadcast `ENDED`/`MISSED`, aucune libération de claim —
   l'appel en cours pour qui a répondu est totalement inchangé. No-op
   silencieux (`getUnrespondedParticipants` vide) une fois que tout le monde
   a rejoint.

Ne construit PAS de UI (badge « appel manqué » pour un membre resté hors
d'un appel de groupe actif) — c'est un bug serveur pur qui rend la
notification existante (push + `Notification` persistée, déjà utilisées par
tous les autres chemins missed) enfin atteignable pour ce cas précis.

Tests : nouveau `CallEventsHandler-group-ring-timeout-missed.test.ts` (5 cas
— timer non cleared en groupe / cleared en direct, notifie les non-répondants
sans toucher l'état, no-op si tout le monde a rejoint, pas de double
notification quand la branche gagnante existante tourne). Suites
`CallEventsHandler`/`CallService` complètes (43 suites / 898 tests) vertes,
`tsc --noEmit` propre.

## Mise à jour 2026-08-17 — première moitié de W6 traitée : bouton « exclure » web branché sur le kick REST

**W6 (partiel) levé** : le prérequis serveur (2026-08-15, diffusion
`PARTICIPANT_LEFT` sur `DELETE /calls/:callId/participants/:participantId`)
n'avait toujours aucun appelant côté web — `onRemove` restait un nettoyage
purement local déclenché par le timeout de déconnexion, jamais par une
action de modération. Ajouté :

- `callsService.removeParticipant(callId, userId)` — wrapper REST manquant
  (`calls.service.ts` n'exposait que `getActiveCall`), miroir de
  `participantsService.removeParticipant` pour la conversation.
- Rôle de modération résolu via `useConversationQuery` + `isParticipantModerator`
  (même idiome que `useParticipantManagement`) — **jamais** lu depuis
  `CallParticipant.role`, qui est le rôle de session d'appel
  (`initiator`/`participant`), sans rapport avec le rôle de conversation.
  Gate double : `conversation.type === 'group'` (jamais en direct — y
  retirer l'autre partie équivaut à raccrocher, chemin déjà couvert) ET
  modérateur/admin de la conversation.
- UI : bouton « retirer » (icône `UserMinus`, confirmation `AlertDialog` —
  même pattern que `DeliveryQueueItemCard`) ajouté dans `VideoStream` (donc
  disponible aussi bien sur la tuile plein écran que sur les vignettes
  `DraggableParticipantOverlay`, un seul site de rendu) — visible seulement
  quand `onKickParticipant` est fourni, jamais pour la tuile locale.
- Aucune mutation locale du store au succès : la diffusion serveur
  `SERVER_EVENTS.CALL_PARTICIPANT_LEFT` (déjà écoutée) reconcilie l'état pour
  tout le monde, y compris l'auteur du kick — exactement le pattern déjà en
  place pour un départ volontaire.
- i18n groupe (W7, partiel) : `stream.removeParticipant*` + `toasts.participantRemoved`/
  `removeParticipantFailed` ajoutés aux 4 locales (en/fr/es/pt), clés
  identiques vérifiées par script.

**Limite connue, non traitée ici** : la cible passée à `removeParticipant`
est la clé de `remoteStreams` (`participant.userId || participant.participantId`,
côté offre WebRTC) — pour un participant anonyme sans `userId`, la route
REST (`where: { userId: participantId }`) ne peut pas le résoudre. Aucune UI
existante (y compris `conversation-participants-drawer.tsx`) ne permet
aujourd'hui de retirer un participant anonyme non plus — pas une régression
introduite ici, juste un périmètre encore non couvert.

**Reste du W6** : grille adaptative multi-participants, roster dédié,
`CallNotification`/timeout déjà traités (2026-08-14). **Reste du W7** : i18n
groupe pour le roster/toasts join-leave restants. Mesh iOS mono-PC (I1-I7)
et SFU toujours hors périmètre (nécessitent le toolchain Xcode, absent de
cet environnement).

Tests : `calls.service.test.ts` (nouveau, 6 cas — `getActiveCall` +
`removeParticipant`, jusque-là non testé du tout), `VideoStream.test.tsx`
(+6 cas), `DraggableParticipantOverlay.test.tsx` (+2 cas, transmission de
prop), `VideoCallInterface.test.tsx` (+8 cas — gate modérateur/type de
conversation, appel REST avec le bon id, pas de mutation locale au succès,
toast d'échec). Suite complète `apps/web` : 644 suites / 12 953 tests verts.
`tsc --noEmit` et `eslint` sans régression (mêmes 11 erreurs tsc et 5
findings eslint pré-existants, aucun nouveau, vérifié par diff avant/après
via `git stash`).
