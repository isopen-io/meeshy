# 🎥 ARCHITECTURE P2P WebRTC - FLUX VIDÉO/AUDIO

## ✅ VOUS AVEZ RAISON !

Les flux vidéo et audio **NE PASSENT PAS** par le serveur. C'est du **vrai P2P (Peer-to-Peer)**.

---

## 📊 ARCHITECTURE ACTUELLE

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: SIGNALISATION (via Gateway)             │
└─────────────────────────────────────────────────────────────────────┘

CHROME (Initiateur)                 GATEWAY                 SAFARI (Receveur)
      │                                 │                          │
      ├─ emit('call:initiate') ────────→                          │
      │                                 ├─ broadcast ─────────────→│
      │                                 │  call:initiated          │
      │                                 │                          │
      │                                 │         ← emit('call:join')
      │                                 ←─────────────────────────┤
      │                                 │                          │
      ├─ emit('call:signal') ──────────→                          │
      │  {type:'offer', SDP}            ├─ forward ───────────────→│
      │                                 │  call:signal             │
      │                                 │                          │
      │                                 │  ← emit('call:signal') ──┤
      │                                 │    {type:'answer', SDP}  │
      ← forward ──────────────────────┤                          │
      │  call:signal                    │                          │
      │                                 │                          │
      ├─ emit('call:signal') ──────────→                          │
      │  {type:'ice-candidate'}         ├─ forward ───────────────→│
      │                                 │                          │
      │                                 │  ← emit('call:signal') ──┤
      ← forward ──────────────────────┤    {type:'ice-candidate'}│
      │                                 │                          │

┌─────────────────────────────────────────────────────────────────────┐
│            PHASE 2: CONNEXION P2P DIRECTE (SANS Gateway)            │
└─────────────────────────────────────────────────────────────────────┘

      CHROME                                                    SAFARI
        │                                                          │
        │  🔵 RTCPeerConnection créée                             │
        │  🔵 Ajoute local stream (vidéo + audio)                 │
        │                                                          │
        │  📡 STUN Server: stun.l.google.com:19302                │
        │     (pour découvrir IP publique + port NAT)             │
        │                                                          │
        ├──────────── 🎥 FLUX VIDÉO/AUDIO DIRECT ────────────────→│
        ←──────────── 🎥 FLUX VIDÉO/AUDIO DIRECT ────────────────┤
        │                                                          │
        │  ✅ Connexion P2P établie (pas de serveur intermédiaire)│
        │  ✅ Audio/Vidéo stream direct entre navigateurs         │
        │  ✅ Faible latence (~50-200ms)                          │
        │                                                          │
```

---

## 🔍 DÉTAILS TECHNIQUES

### 1. **Signalisation (via Gateway Socket.IO)**

Le **Gateway** sert **UNIQUEMENT** pour :
- ✅ Échanger les métadonnées de connexion (SDP Offer/Answer)
- ✅ Échanger les ICE candidates (IP + ports NAT)
- ✅ Coordonner qui appelle qui
- ✅ Gérer les événements d'appel (join, leave, ended)
- ✅ Stocker les statistiques en base de données

**Ce qui transite par le Gateway** :
```javascript
// Exemples de données qui passent par Socket.IO
{
  type: 'offer',
  signal: {
    type: 'offer',
    sdp: 'v=0\r\no=- 123... (SDP offer)'  // Métadonnées WebRTC
  }
}

{
  type: 'ice-candidate',
  signal: {
    candidate: 'candidate:1 1 UDP 2130706431 192.168.1.10 50000'  // IP + port
  }
}
```

### 2. **Flux Média P2P (DIRECT client-à-client)**

Une fois la connexion établie, **100% du flux vidéo/audio** passe **DIRECTEMENT** entre les deux navigateurs via `RTCPeerConnection`.

**Code frontend qui établit la connexion P2P** :

```typescript
// frontend/services/webrtc-service.ts:64-66
this.peerConnection = new RTCPeerConnection({
  iceServers: this.config.iceServers,  // STUN: stun.l.google.com:19302
});

// Ligne 204: Ajoute le stream local à la peer connection
stream.getTracks().forEach((track) => {
  service.addTrack(track, stream);  // Envoi direct au peer
});

// Ligne 79-85: Réception du stream distant
this.peerConnection.ontrack = (event) => {
  // event.streams[0] contient le flux vidéo/audio du peer
  addRemoteStream(participantId, event.streams[0]);
};
```

### 3. **Serveurs STUN (pas de flux média)**

```typescript
// frontend/services/webrtc-service.ts:13-16
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
```

**Rôle des serveurs STUN** :
- ✅ Découvrir l'IP publique du client derrière un NAT
- ✅ Découvrir le port externe du NAT
- ✅ **NE RELAIE PAS** les flux vidéo/audio
- ✅ Utilisé **UNIQUEMENT** pendant la négociation ICE

---

## 📡 TOPOLOGIE RÉSEAU RÉELLE

```
                    INTERNET
                       │
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        │              │              │
    NAT Router     Gateway      NAT Router
        │          (Socket.IO)       │
        │         SIGNALING ONLY     │
        │              │              │
        │              │              │
    CHROME ←──────────────────────→ SAFARI
        (192.168.1.10)        (10.0.0.5)

        🎥 FLUX VIDÉO/AUDIO P2P DIRECT
        (pas de passage par Gateway)
```

---

## 🎯 CE QUI PASSE PAR LE GATEWAY

### ✅ Pendant l'établissement de connexion
1. `call:initiate` - Demande de démarrage d'appel
2. `call:join` - Acceptation de l'appel
3. `call:signal` avec `type: 'offer'` - Offre SDP (~2-5 KB)
4. `call:signal` avec `type: 'answer'` - Réponse SDP (~2-5 KB)
5. `call:signal` avec `type: 'ice-candidate'` - Plusieurs ICE candidates (~100-500 bytes chacun)

### ✅ Pendant l'appel actif
1. `call:toggle-audio` - État du micro (on/off)
2. `call:toggle-video` - État de la caméra (on/off)
3. `call:media-toggled` - Notification aux autres participants

### ✅ À la fin de l'appel
1. `call:leave` - Un participant quitte
2. `call:ended` - L'appel se termine
3. Mise à jour DB : duration, endedAt

---

## ❌ CE QUI NE PASSE PAS PAR LE GATEWAY

- ❌ **Flux vidéo** (passe directement entre Chrome et Safari)
- ❌ **Flux audio** (passe directement entre Chrome et Safari)
- ❌ **Paquets RTP** (Real-time Transport Protocol)
- ❌ **Statistiques de bande passante en temps réel**

---

## 🔐 SÉCURITÉ DES FLUX MÉDIA

Les flux vidéo/audio sont **automatiquement chiffrés** par WebRTC :

```
DTLS-SRTP (Datagram Transport Layer Security - Secure Real-time Transport Protocol)
- ✅ Chiffrement de bout en bout
- ✅ Authentification des peers
- ✅ Impossible d'intercepter les flux sans les clés
- ✅ Le Gateway ne peut PAS voir/enregistrer les flux
```

---

## 📊 BANDE PASSANTE

### Connexion P2P établie :

**Charge réseau Gateway** : ~1-5 KB/s par appel
- Événements de contrôle (toggle audio/video)
- Heartbeats (optionnel)

**Charge réseau Client** : ~200-500 KB/s par appel
- Vidéo 720p : ~300-400 KB/s
- Audio : ~20-50 KB/s
- **100% entre les deux clients** (pas via Gateway)

---

## 🚀 AVANTAGES DE L'ARCHITECTURE ACTUELLE

✅ **Faible latence** : 50-200ms (direct P2P)
✅ **Scalabilité** : Gateway ne gère que la signalisation
✅ **Coûts réduits** : Pas de relai de flux vidéo/audio
✅ **Sécurité** : Chiffrement DTLS-SRTP de bout en bout
✅ **Performance** : Pas de bottleneck sur le serveur

---

## ⚠️ LIMITATIONS ACTUELLES (Phase 1A)

❌ **Ne fonctionne pas derrière certains NAT restrictifs**
   - Solution : TURN server (Phase 1B)

❌ **Maximum 2 participants** (P2P pur)
   - Solution : SFU (Selective Forwarding Unit) pour groupe (Phase 1C)

❌ **Pas de secours si P2P échoue**
   - Solution : Fallback vers TURN relay (Phase 1B)

---

## 📝 CONCLUSION

**Votre compréhension est CORRECTE** :

1. ✅ Les flux vidéo/audio sont **P2P direct** (client-à-client)
2. ✅ Le Gateway ne gère **QUE** la signalisation (métadonnées)
3. ✅ Les statistiques d'appel sont sauvegardées en DB
4. ✅ L'appel **NE PASSE PAS** par le serveur

Le Gateway est un **pur serveur de signalisation**, pas un serveur de médias. C'est exactement comme ça que doit fonctionner un système P2P WebRTC bien conçu ! 🎯
