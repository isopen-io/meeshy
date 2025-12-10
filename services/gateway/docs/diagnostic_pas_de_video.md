# 🔍 DIAGNOSTIC : Pas de vidéo ni audio

## 🎯 CHECKPOINTS À VÉRIFIER DANS LES LOGS

Pour identifier où le flux P2P échoue, vérifiez ces logs dans l'ordre :

### ✅ PHASE 1 : Initialisation du stream local

**Chrome (Initiateur)** :
```
[useWebRTCP2P] Initializing local stream - {callId: "XXX"}
[useWebRTCP2P] Local stream initialized - {callId: "XXX"}
```

**Safari (Receveur)** :
```
[useWebRTCP2P] Initializing local stream - {callId: "XXX"}
[useWebRTCP2P] Local stream initialized - {callId: "XXX"}
```

❌ **Si ce log manque** : Le problème est l'accès caméra/micro
- Solution : Vérifier les permissions navigateur
- Safari : Préférences → Sites Web → Caméra/Microphone

---

### ✅ PHASE 2 : Création de l'offre WebRTC

**Chrome (Initiateur)** :
```
[CallInterface] Creating offer for new participant - {participantId: "SAFARI_USER_ID"}
[useWebRTCP2P] Creating offer - {targetUserId: "SAFARI_USER_ID", callId: "XXX"}
[WebRTCService] Creating peer connection - {participantId: "SAFARI_USER_ID"}
[useWebRTCP2P] Offer created and sent - {targetUserId: "SAFARI_USER_ID", callId: "XXX"}
```

❌ **Si ce log manque** : Le problème est la détection du participant
- Vérifier que `currentCall.participants` contient Safari
- Vérifier que `currentCall.initiatorId === user.id` dans Chrome

---

### ✅ PHASE 3 : Réception de l'offre

**Safari (Receveur)** :
```
[useWebRTCP2P] Received signal - {type: "offer", from: "CHROME_USER_ID", callId: "XXX"}
[useWebRTCP2P] Handling offer - {fromUserId: "CHROME_USER_ID", callId: "XXX"}
[WebRTCService] Creating peer connection - {participantId: "CHROME_USER_ID"}
[useWebRTCP2P] Answer created and sent - {fromUserId: "CHROME_USER_ID", callId: "XXX"}
```

❌ **Si "Received signal" manque** : Le backend ne forward pas les signaux
- ✅ J'ai corrigé ce bug : ligne 525 de CallEventsHandler.ts
- Vérifier que le backend émet bien `CALL_EVENTS.SIGNAL` (pas SIGNAL_RECEIVED)

❌ **Si "Handling offer" fail** : Problème de création de peer connection
- Vérifier les erreurs dans la console

---

### ✅ PHASE 4 : Réception de la réponse

**Chrome (Initiateur)** :
```
[useWebRTCP2P] Received signal - {type: "answer", from: "SAFARI_USER_ID", callId: "XXX"}
[useWebRTCP2P] Handling answer - {fromUserId: "SAFARI_USER_ID", callId: "XXX"}
[useWebRTCP2P] Answer handled successfully - {fromUserId: "SAFARI_USER_ID", callId: "XXX"}
```

❌ **Si ce log manque** : Même problème que Phase 3

---

### ✅ PHASE 5 : Échange ICE candidates

**Chrome ET Safari** :
```
[WebRTCService] ICE candidate generated - {participantId: "XXX", candidate: "candidate:..."}
[useWebRTCP2P] ICE candidate sent - {participantId: "XXX", callId: "XXX"}
[useWebRTCP2P] Received signal - {type: "ice-candidate", from: "XXX", callId: "XXX"}
[useWebRTCP2P] Handling ICE candidate - {fromUserId: "XXX", callId: "XXX"}
[useWebRTCP2P] ICE candidate added - {fromUserId: "XXX", callId: "XXX"}
```

❌ **Si aucun ICE candidate** : Problème de STUN server
- Vérifier que `stun.l.google.com:19302` est accessible
- Tester : `telnet stun.l.google.com 19302`

---

### ✅ PHASE 6 : Connexion établie

**Chrome ET Safari** :
```
[WebRTCService] ICE connection state changed - {participantId: "XXX", state: "checking"}
[WebRTCService] ICE connection state changed - {participantId: "XXX", state: "connected"}
[WebRTCService] Connection state changed - {participantId: "XXX", state: "connected"}
[useWebRTCP2P] Remote track received - {participantId: "XXX", trackKind: "video"}
[useWebRTCP2P] Remote track received - {participantId: "XXX", trackKind: "audio"}
```

❌ **Si state reste "checking" ou passe à "failed"** :
- NAT traversal a échoué
- Solution : TURN server (Phase 1B)

❌ **Si "Remote track received" manque** : Les tracks ne sont pas ajoutés au peer connection
- Vérifier que `service.addTrack(track, stream)` est appelé

---

### ✅ PHASE 7 : Stream ajouté au store

**Chrome ET Safari** :
```
[CallStore] Remote stream added to store - participantId: "XXX"
```

❌ **Si ce log manque** : Le callback `onTrack` ne déclenche pas `addRemoteStream`
- Vérifier use-webrtc-p2p.ts ligne 87-89

---

### ✅ PHASE 8 : VideoGrid affiche le stream

**Vérifier dans React DevTools** :
- `CallInterface` → `remoteStreams` : doit contenir `Map(1) {"PARTICIPANT_ID" => MediaStream}`
- `VideoGrid` → props → `remoteStreams` : doit être un array `[["PARTICIPANT_ID", MediaStream]]`

❌ **Si remoteStreams est vide** : Le problème est dans Phase 7

❌ **Si remoteStreams existe mais vidéo noire** :
- Vérifier que `<video autoPlay playsInline>` est présent
- Vérifier que `srcObject` est bien assigné (VideoGrid.tsx ligne 43)

---

## 🐛 BUGS CORRIGÉS MAIS NÉCESSITANT REDÉMARRAGE

### Bug #2 : Signaux WebRTC jamais reçus
**Fichier** : `gateway/src/socketio/CallEventsHandler.ts:525`

**Avant** :
```typescript
socket.to(`call:${data.callId}`).emit(CALL_EVENTS.SIGNAL_RECEIVED, data);
```

**Après** :
```typescript
socket.to(`call:${data.callId}`).emit(CALL_EVENTS.SIGNAL, data);
```

⚠️ **IMPORTANT** : Le Gateway **DOIT** être redémarré pour que ce fix soit actif !

```bash
cd gateway
pnpm build
pnpm start  # ou pm2 restart gateway
```

---

## 🔍 PROBLÈME POTENTIEL : Mismatch de participantId

Le système utilise `participant.userId` pour WebRTC mais `participant.id` pour la liste :

**use-webrtc-p2p.ts:80** (clé du Map) :
```typescript
const participantId = participant.userId || participant.id;  // ???
```

**CallInterface.tsx:167** (lecture du Map) :
```typescript
remoteStreams={Array.from(remoteStreams.entries())}  // Map keys
participants={currentCall?.participants || []}        // participants.id
```

**Vérifier** :
- Lors de `call:participant-joined`, quel ID est utilisé ?
- Est-ce `participant.id` ou `participant.userId` ?
- Les clés du `remoteStreams` Map correspondent-elles aux `participant.id` ?

---

## 📋 CHECKLIST DE DIAGNOSTIC

1. [ ] Redémarrer le Gateway après le fix du bug #2
2. [ ] Nettoyer les appels zombies : `node cleanup-zombie-call.js`
3. [ ] Chrome : Ouvrir DevTools Console
4. [ ] Safari : Ouvrir Console Web (⌥⌘C)
5. [ ] Chrome : Démarrer l'appel
6. [ ] Vérifier logs Phase 1-2 dans Chrome
7. [ ] Safari : Accepter l'appel
8. [ ] Vérifier logs Phase 3-4 dans Safari
9. [ ] Vérifier logs Phase 5-6 dans les DEUX navigateurs
10. [ ] Vérifier logs Phase 7-8 dans les DEUX navigateurs
11. [ ] Si échec : Noter à quelle phase le flux s'arrête
12. [ ] Copier les logs exacts de la console

---

## 🚨 ACTIONS IMMÉDIATES

1. **REDÉMARRER LE GATEWAY** (critique !)
2. Tester un appel complet
3. Copier TOUS les logs de Chrome
4. Copier TOUS les logs de Safari
5. Me montrer les logs pour diagnostic précis

---

## 🎯 LOGS ATTENDUS SI TOUT FONCTIONNE

### Chrome (Initiateur)
```
[useWebRTCP2P] Initializing local stream
[useWebRTCP2P] Local stream initialized
[CallInterface] Creating offer for new participant - {participantId: "67890"}
[useWebRTCP2P] Creating offer - {targetUserId: "67890"}
[WebRTCService] Creating peer connection - {participantId: "67890"}
[WebRTCService] ICE candidate generated
[useWebRTCP2P] Offer created and sent
[useWebRTCP2P] Received signal - {type: "answer", from: "67890"}
[useWebRTCP2P] Handling answer
[WebRTCService] ICE connection state: checking
[WebRTCService] ICE connection state: connected
[WebRTCService] Connection state: connected
[useWebRTCP2P] Remote track received - {trackKind: "video"}
[useWebRTCP2P] Remote track received - {trackKind: "audio"}
```

### Safari (Receveur)
```
[useWebRTCP2P] Initializing local stream
[useWebRTCP2P] Local stream initialized
[useWebRTCP2P] Received signal - {type: "offer", from: "12345"}
[useWebRTCP2P] Handling offer
[WebRTCService] Creating peer connection - {participantId: "12345"}
[WebRTCService] ICE candidate generated
[useWebRTCP2P] Answer created and sent
[WebRTCService] ICE connection state: checking
[WebRTCService] ICE connection state: connected
[WebRTCService] Connection state: connected
[useWebRTCP2P] Remote track received - {trackKind: "video"}
[useWebRTCP2P] Remote track received - {trackKind: "audio"}
```
