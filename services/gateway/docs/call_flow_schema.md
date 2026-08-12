# 📞 SCHÉMA COMPLET DU FLUX D'APPEL P2P

## 🎯 FLUX NORMAL D'APPEL VIDÉO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: INITIATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

CHROME (Initiateur)                 GATEWAY                      SAFARI (Receveur)
      │                                 │                               │
      │ [1] Clic sur bouton appel       │                               │
      │     ConversationLayout          │                               │
      │     handleStartCall()           │                               │
      │                                 │                               │
      ├─ [2] LOG: handleStartCall      │                               │
      │     {conversationId, type}      │                               │
      │                                 │                               │
      ├─ [3] Vérif socket connecté     │                               │
      │     getSocket().connected       │                               │
      │                                 │                               │
      ├─ [4] emit('call:initiate') ───→ │                               │
      │     {conversationId,type}       │                               │
      │                                 │                               │
      │                                 ├─ [5] Reçoit call:initiate    │
      │                                 │     CallEventsHandler.ts:76   │
      │                                 │     LOG: "Socket call:initiate"│
      │                                 │                               │
      │                                 ├─ [6] Vérifie auth            │
      │                                 │     getUserId(socket.id)      │
      │                                 │                               │
      │                                 ├─ [7] Rate limit check        │
      │                                 │                               │
      │                                 ├─ [8] Input validation        │
      │                                 │                               │
      │                                 ├─ [9] CallService.initiateCall│
      │                                 │     LOG: "Initiating call"    │
      │                                 │                               │
      │                                 ├─ [10] Vérifie si appel actif │
      │                                 │      ❌ SI OUI: ERREUR        │
      │                                 │      ✅ SI NON: CONTINUE      │
      │                                 │                               │
      │                                 ├─ [11] Crée CallSession DB    │
      │                                 │      status: 'initiated'      │
      │                                 │                               │
      │                                 ├─ [12] Ajoute initiator       │
      │                                 │      CallParticipant DB       │
      │                                 │                               │
      │                                 ├─ [13] Prépare event          │
      │                                 │      CallInitiatedEvent       │
      │                                 │                               │
      │ ←─ [14] emit('call:initiated')─┤                               │
      │     Confirmation to initiator   │                               │
      │     LOG: "Call initiated"       │                               │
      │                                 │                               │
      │                                 ├─ [15] broadcast to room ─────→│
      │                                 │     conversation_XXX          │
      │                                 │     emit('call:initiated')    │
      │                                 │     LOG: "Broadcasted"        │
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [16] Reçoit│
      │                                 │                    │ call:     │
      │                                 │                    │ initiated │
      │                                 │                    │ CallMgr   │
      │                                 │                    └──────────┤
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [17] Show │
      │                                 │                    │ CallNotif │
      │                                 │                    │ + Ringtone│
      │                                 │                    └──────────┤

┌─────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 2: ACCEPTATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

SAFARI (Receveur)                   GATEWAY                      CHROME (Initiateur)
      │                                 │                               │
      ├─ [18] Clic "Accept"            │                               │
      │     CallNotification            │                               │
      │                                 │                               │
      ├─ [19] emit('call:join') ──────→ │                               │
      │     {callId, settings}          │                               │
      │                                 │                               │
      │                                 ├─ [20] Reçoit call:join       │
      │                                 │     CallEventsHandler.ts:190  │
      │                                 │     LOG: "Socket call:join"   │
      │                                 │                               │
      │                                 ├─ [21] CallService.joinCall   │
      │                                 │     LOG: "Joining call"       │
      │                                 │                               │
      │                                 ├─ [22] Vérifie call existe    │
      │                                 │     + status = initiated      │
      │                                 │                               │
      │                                 ├─ [23] Vérifie P2P limite     │
      │                                 │     max 2 participants        │
      │                                 │                               │
      │                                 ├─ [24] Ajoute participant DB  │
      │                                 │     CallParticipant           │
      │                                 │                               │
      │                                 ├─ [25] Update status→active   │
      │                                 │     CallSession               │
      │                                 │                               │
      │                                 ├─ [26] Join room call:XXX     │
      │                                 │     socket.join()             │
      │                                 │                               │
      │ ←─ [27] emit('call:join') ─────┤                               │
      │     {participant, iceServers}   │                               │
      │                                 │                               │
      │                                 ├─ [28] broadcast ─────────────→│
      │                                 │     to call:XXX room          │
      │                                 │     call:participant-joined   │
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [29] Reçoit│
      │                                 │                    │ participant│
      │                                 │                    │ -joined   │
      │                                 │                    └──────────┤
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [30] Create│
      │                                 │                    │ WebRTC    │
      │                                 │                    │ Offer     │
      │                                 │                    └──────────┤

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 3: SIGNALISATION WEBRTC                          │
└─────────────────────────────────────────────────────────────────────────────┘

CHROME (Offerer)                    GATEWAY                      SAFARI (Answerer)
      │                                 │                               │
      ├─ [31] createOffer()            │                               │
      │     use-webrtc-p2p.ts           │                               │
      │     LOG: "Creating offer"       │                               │
      │                                 │                               │
      ├─ [32] emit('call:signal') ────→ │                               │
      │     {type:'offer',              │                               │
      │      signal:SDP,                │                               │
      │      from:chromeUserId,         │                               │
      │      to:safariUserId}           │                               │
      │                                 │                               │
      │                                 ├─ [33] Reçoit call:signal     │
      │                                 │     CallEventsHandler.ts:466  │
      │                                 │     LOG: "Signal received"    │
      │                                 │                               │
      │                                 ├─ [34] Valide signal          │
      │                                 │     CVE-001 validation        │
      │                                 │                               │
      │                                 ├─ [35] Forward to target ────→│
      │                                 │     emit to specific socket   │
      │                                 │     call:signal               │
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [36] Reçoit│
      │                                 │                    │ offer SDP │
      │                                 │                    │ handleOffer│
      │                                 │                    └──────────┤
      │                                 │                               │
      │                                 │                    ┌──────────┤
      │                                 │                    │ [37] Create│
      │                                 │                    │ Answer    │
      │                                 │                    │ SDP       │
      │                                 │                    └──────────┤
      │                                 │                               │
      │                                 │ ←─ [38] call:signal ──────────┤
      │                                 │     {type:'answer',           │
      │                                 │      signal:SDP}              │
      │                                 │                               │
      │ ←─ [39] Forward answer ────────┤                               │
      │     call:signal                 │                               │
      │                                 │                               │
      ├─ [40] setRemoteDescription     │                               │
      │     handleAnswer()              │                               │
      │                                 │                               │
      ├─ [41] Échange ICE candidates ←────────────────────────────────→│
      │     Multiple call:signal        │                               │
      │     {type:'ice-candidate'}      │                               │
      │                                 │                               │
      ├─────────────────────────────────────────────────────────────────→│
      │              [42] WebRTC P2P Connection Established             │
      │                    Audio/Video Stream Direct                     │
      ←─────────────────────────────────────────────────────────────────┤

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: FIN D'APPEL                                 │
└─────────────────────────────────────────────────────────────────────────────┘

CHROME (Quitte)                     GATEWAY                      SAFARI
      │                                 │                               │
      ├─ [43] Clic "Hang up"           │                               │
      │     CallInterface               │                               │
      │                                 │                               │
      ├─ [44] emit('call:leave') ─────→ │                               │
      │     {callId}                    │                               │
      │     LOG: "Hanging up"           │                               │
      │                                 │                               │
      │                                 ├─ [45] Reçoit call:leave      │
      │                                 │     CallEventsHandler.ts:317  │
      │                                 │     LOG: "Participant leaving"│
      │                                 │                               │
      │                                 ├─ [46] CallService.leaveCall  │
      │                                 │                               │
      │                                 ├─ [47] Update participant DB  │
      │                                 │     leftAt = now              │
      │                                 │                               │
      │                                 ├─ [48] Close PeerConnection   │
      │                                 │                               │
      │                                 ├─ [49] Broadcast ─────────────→│
      │                                 │     call:participant-left     │
      │                                 │                               │
      │                                 ├─ [50] Check participants     │
      │                                 │     Reste 1 seul?             │
      │                                 │     ✅ OUI: End call          │
      │                                 │                               │
      │                                 ├─ [51] Update CallSession     │
      │                                 │     status='ended'            │
      │                                 │     endedAt=now               │
      │                                 │     duration calculated       │
      │                                 │                               │
      │ ←─────────── [52] ──────────────┼─────────────────────────────→│
      │     broadcast to conversation_XXX                               │
      │     call:ended                  │                               │
      │                                 │                               │
      ├─ [53] CallManager.reset()      │                    ┌──────────┤
      │                                 │                    │ [54] Reset│
      │                                 │                    │ UI state  │
      │                                 │                    └──────────┤
```

## 🔍 POINTS DE LOG CRITIQUES

### Frontend (Chrome/Safari)

1. **ConversationLayout.tsx** - handleStartCall
   - LOG: Début appel, conversationId, socket status
   
2. **CallManager.tsx** - handleIncomingCall  
   - LOG: Réception call:initiated, isInitiator check

3. **CallManager.tsx** - handleAcceptCall
   - LOG: Acceptation appel, callId, settings

4. **use-webrtc-p2p.ts** - createOffer
   - LOG: Création offer, target userId

5. **use-webrtc-p2p.ts** - handleOffer
   - LOG: Réception offer, from userId

6. **use-webrtc-p2p.ts** - handleAnswer
   - LOG: Réception answer, from userId

### Backend (Gateway)

1. **CallEventsHandler.ts:76** - call:initiate handler
   - LOG: Réception initiate, socketId, userId, conversationId

2. **CallService.ts** - initiateCall  
   - LOG: Début initiation, conversationId, initiatorId
   - LOG: Vérification appel actif
   - LOG: Création CallSession

3. **CallEventsHandler.ts:154** - broadcast call:initiated
   - LOG: Broadcast to room, room name, participant count

4. **CallEventsHandler.ts:190** - call:join handler
   - LOG: Réception join, callId, userId

5. **CallService.ts** - joinCall
   - LOG: Ajout participant, callId, userId
   - LOG: Update status to active

6. **CallEventsHandler.ts:466** - call:signal handler
   - LOG: Signal reçu, type, from, to

7. **CallEventsHandler.ts:317** - call:leave handler
   - LOG: Participant leaving, callId, participantId

8. **CallService.ts** - leaveCall
   - LOG: Mise à jour leftAt
   - LOG: Check if last participant
   - LOG: End call if needed

## ❌ ERREURS POSSIBLES

### 1. Call Already Active
```
ERROR: ❌ Call already active
CAUSE: Un appel zombie existe dans la DB
SOLUTION: CallCleanupService le nettoie automatiquement (GC périodique + self-heal
          de Conversation.activeCallId, voir reclaimFromTerminalHolder). Le script
          ad hoc cleanup-zombie-call.js a été retiré (ciblait un seul incident
          historique, écrivait en Prisma direct en bypassant ces invariants).
```

### 2. Socket Not Connected
```
ERROR: Cannot start call: socket not connected
CAUSE: Socket.IO déconnecté
SOLUTION: Vérifier connexion, reconnect()
```

### 3. User Not in Room
```
ERROR: call:initiated pas reçu
CAUSE: User pas dans conversation_XXX room
SOLUTION: Vérifier CONVERSATION_JOIN émis
```

### 4. WebRTC Signal Failed
```
ERROR: Failed to create offer/answer
CAUSE: Peer connection pas ready
SOLUTION: Vérifier ensureLocalStream()
```

## 🎯 CHECKLIST DEBUG

- [ ] Frontend emit CONVERSATION_JOIN
- [ ] Backend log "rejoint conversation_XXX"
- [ ] Frontend emit call:initiate
- [ ] Backend log "Socket: call:initiate"
- [ ] Backend log "Call initiated and broadcasted"
- [ ] Safari log "Incoming call"
- [ ] Safari show CallNotification
- [ ] Safari emit call:join
- [ ] Backend log "Participant joined"
- [ ] Chrome log "Participant joined"
- [ ] Chrome create WebRTC offer
- [ ] Safari receive offer, create answer
- [ ] ICE candidates exchanged
- [ ] WebRTC connection established
