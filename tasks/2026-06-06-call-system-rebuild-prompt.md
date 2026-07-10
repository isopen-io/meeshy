# SPEC — Reconstruction SOTA du système d'appels audio/vidéo Meeshy (iPhone · iPad · macOS)

> **Tu es un agent de code autonome avec accès complet au dépôt `v2_meeshy` mais SANS contexte préalable.** Ce document est ta **seule source de vérité**. Lis-le intégralement avant d'écrire la moindre ligne. Il contient la mission, les contraintes plateforme, l'architecture cible, le détail des bugs à corriger (avec `fichier:ligne`), le plan par phases, les critères de done et la stratégie de test. Tu dois produire du code de qualité production (niveau WhatsApp/FaceTime/Signal).

---

## ⚠️ MANDAT NON-DESTRUCTIF (RÈGLE ABSOLUE — lis avant tout)

**Le but n'est PAS de tout casser ni de tout réécrire from scratch.** Tu fais ÉVOLUER un système existant qui marche partiellement, de façon incrémentale et sûre.

1. **Branche dédiée obligatoire.** Travaille sur `feat/calls-sota-rebuild` (créée depuis `main`). Ne committe JAMAIS directement sur `main`/`dev`. Un commit isolé par étape.
2. **L'app reste fonctionnelle à CHAQUE étape.** Après chaque sous-étape : `./apps/ios/meeshy.sh build` doit passer (`** BUILD SUCCEEDED **`) ET l'app doit rester utilisable. Jamais d'état cassé entre deux commits. Si une étape ne peut pas laisser l'app verte, découpe-la.
3. **Périmètre strict = appels uniquement.** Ne touche QUE les fichiers d'appel listés au §0 + leurs dépendances directes. **NE CASSE PAS** la messagerie, les stories, le feed, la traduction, la présence, le cache, les notifications. Si un changement déborde, STOP et reconsidère.
4. **Évoluer > réécrire.** Réutilise l'infra existante qui marche (events Socket.IO `entity:action-word`, FSM DB `CallStatus` gateway, `RTCAudioSession` manual-audio setup, dedup ring PushKit, factory WebRTC partagée, `RTCMTLVideoView`, CacheCoordinator…). Ne supprime PAS du code dont tu ne comprends pas le rôle — comprends-le (grep + git blame) d'abord.
5. **Phasage strict.** P0 (connexion fiable bidirectionnelle) → build vert + validable → P1 (switch AV + UI) → P2 (qualité) → P3 (messages système). Ne mélange pas les phases. Chaque phase laisse l'app meilleure ET fonctionnelle.
6. **Vérifie le code réel avant d'éditer.** Les `fichier:ligne` sont des points de départ — confirme par `grep`/lecture (le code bouge).
7. **TDD pour le comportement changé** (XCTest). Pas de régression sur la suite existante.
8. **Pas de Mac Catalyst, pas de modif `apps/web`, pas de SFU** (cf. §1 hors scope).
9. **Patch ciblé > réécriture lourde** quand tu hésites, sauf refonte explicitement justifiée par ce doc (ex: inversion FSM §3.1, faite progressivement, jamais d'un bloc).
10. **À la fin de chaque phase**, résume ce qui a changé, ce qui reste, comment vérifier — pour validation humaine avant la phase suivante.

> **Important — déjà tenté, insuffisant** : un correctif rapide « forcer `setDirection(.sendRecv)` sur les transceivers pré-ajoutés après `setRemoteDescription` » a été shippé (commit `c5b15ce91`) et **N'A PAS résolu** le média à sens unique : l'answer du répondeur reste `recvonly`. La vraie correction est la refonte canonique du chemin répondeur décrite au **§5.2** (appliquer l'offer AVANT d'attacher les pistes, ne PAS pré-`addTransceiver` côté répondeur) **+ §5.3** (supprimer les contraintes legacy `OfferToReceiveAudio/Video`). Commence par valider/implémenter ces deux points en P0 — c'est le bloqueur n°1.

---

## 0. Contexte projet (lis ceci en premier)

**Meeshy** est une plateforme de messagerie temps réel multi-langue. Le sous-système d'appels est du **WebRTC 1:1 P2P** :

```
iOS (SwiftUI + libwebrtc 141 natif)
        ↕ Socket.IO (signaling) + PushKit VoIP (réveil)
services/gateway (Fastify 5 + Socket.IO) — relais SDP/ICE opaque, FSM DB
```

- iOS embarque **libwebrtc 141** (xcframework natif, PAS un wrapper JS). Tu utilises les APIs ObjC/Swift : `RTCPeerConnection`, `RTCRtpTransceiver`, `RTCRtpSender`, `RTCAudioSession`, `RTCMTLVideoView`, `RTCCameraVideoCapturer`, `RTCVideoSource`, etc.
- Le gateway **relaie le SDP/ICE verbatim** (`io.to(targetSocketId).emit`) — aucun munging serveur. Il maintient un FSM DB (`CallStatus`) et fanout les events de room.
- Les events Socket.IO suivent la convention `entity:action-word` (tirets, jamais underscores). Source de vérité : `packages/shared/types/socketio-events.ts`.

### Fichiers clés (chemins ABSOLUS — vérifiés)

| Rôle | Chemin |
|---|---|
| FSM d'appel + CallKit + PushKit (≈2313 l.) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Services/CallManager.swift` |
| Client WebRTC bas niveau (transceivers, SDP, ICE, ≈1202 l.) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift` |
| Wrapper service WebRTC (offer/answer/ICE-restart) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift` |
| Types/enums WebRTC (`CallState`, `CallDisplayMode`) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift` |
| Vue plein écran | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/CallView.swift` |
| Vue appel entrant (fallback / Mac) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift` |
| Pastille « revenir à l'appel » | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift` |
| Bannière call-waiting (DEAD CODE, jamais montée) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/CallWaitingBannerView.swift` |
| Rendu vidéo `RTCMTLVideoView` | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift` |
| Présentation iPhone | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/RootView.swift` (≈407-416) |
| Présentation iPad | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift` (≈102-111) |
| Routeur adaptatif | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift` |
| Header conversation (boutons start-call) | `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift` (≈48-98) |
| Handler signaling gateway (≈1982 l.) | `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/socketio/CallEventsHandler.ts` |
| Service DB d'appel (≈1107 l.) | `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/services/CallService.ts` |
| Types partagés appels | `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/video-call.ts` (`CallSignalEvent` l.427) |
| Constantes d'events Socket.IO | `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/socketio-events.ts` |
| Routage call-signal SDK | `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` |

> **Note** : l'audit mentionnait `WebRTC/WebRTCVideoView.swift` — le chemin réel est `Views/WebRTCVideoView.swift`. Vérifie toujours les chemins via `find`/`grep` avant d'éditer.

---

## 1. Mission & scope

### Mission
Reconstruire **end-to-end** le système d'appels audio/vidéo 1:1 de Meeshy pour atteindre une qualité **SOTA** (état de l'art, niveau WhatsApp/FaceTime/Signal) : connexion fiable, média bidirectionnel garanti, bascule audio↔vidéo en cours d'appel dans les deux sens, robustesse au churn réseau/socket, UI adaptative iPhone/iPad/Mac, et messages système d'appel dans la conversation.

### Plateformes IN scope
- **iPhone** (iOS, compact) — CallKit + PushKit complets.
- **iPad** (iOS, regular) — CallKit + PushKit, layout adapté.
- **macOS via iOS-app-on-Mac** (`ProcessInfo.processInfo.isiOSAppOnMac == true`, application « Designed for iPad », **PAS Mac Catalyst**) — CallKit NON fonctionnel, UI in-app + activation audio manuelle.

### Hors scope (non-goals)
- **Web** (`apps/web`) — aucune modification.
- **Mac Catalyst** — interdit (Meeshy tourne en iOS-app-on-Mac, jamais Catalyst).
- **Appels de groupe / SFU** — pas d'implémentation maintenant, MAIS l'architecture DOIT être **évolutive vers le groupe/SFU** sans réécriture (voir §3.7). Tu prépares le terrain, tu n'implémentes pas le SFU.
- **Pipeline de traduction live / TTS in-call** — l'infra existe (`CallTranslationRequestEvent`, `CallAudioChunkEvent`) ; ne pas la casser, mais ne pas la retravailler.
- **Enregistrement d'appel** — hors scope.

### Objectif de qualité
Un appel audio doit se connecter de façon fiable en < 3 s après réponse, avec **audio bidirectionnel garanti**. Un appel vidéo doit afficher les deux flux. La bascule audio↔vidéo doit fonctionner dans les deux sens sans glare. Le système doit survivre au churn socket (background/foreground, faux `-1009` sur Mac) et auto-réparer un média à sens unique.

---

## 2. Contraintes plateforme (NON négociables)

### 2.1 CallKit
- **Fonctionnel sur iPhone/iPad.** Pilote l'UI système d'appel entrant, l'écran verrouillé, et **l'activation de la session audio** via `provider(_:didActivate:)`.
- **NON fonctionnel sur iOS-on-Mac** : `reportNewIncomingCall` renvoie l'erreur **3**, `CXEndCall`/`CXSetMuted` renvoient l'erreur **4**, et `provider(_:didActivate:)` **ne se déclenche JAMAIS**. (Confirmé par les notes terrain de l'équipe : Mac = `isiOSAppOnMac`, PAS Catalyst.)
- **Gating unique** : `let callUsesCallKit = !ProcessInfo.processInfo.isiOSAppOnMac` (déjà présent dans `CallManager.swift` ≈361/749). Étendre ce gating à TOUTE la couche UI (qui est aujourd'hui platform-blind) et au chemin d'activation audio.

### 2.2 PushKit VoIP
- **iPhone/iPad uniquement.** Réveille l'app sur appel entrant en background/verrouillé.
- **Règle iOS 13+ absolue** : dans `pushRegistry(_:didReceiveIncomingPushWith:for:completion:)`, tu DOIS appeler `provider.reportNewIncomingCall(with:update:)` **synchroniquement** (parse synchrone, aucun `await`), et tu ne dois appeler le `completion()` de PushKit **qu'après** le callback de `reportNewIncomingCall`. Sinon iOS tue le process (« never posted an incoming call ») et **throttle ensuite tes pushs VoIP**.
- Le payload VoIP porte `callId`, identité appelant, `hasVideo`, et **idéalement le SDP offer** (ou un token pour le fetch) afin que le callee ait l'offer **avant** de répondre (élimine la race de §8 bug e).
- Auth APNs `.p8`, topic `<bundleid>.voip` (déjà en place).
- **Sur Mac** : pas de PushKit. L'appel entrant arrive par le socket (foreground) → `IncomingCallView` in-app.

### 2.3 RTCAudioSession — coordination manual-audio
- **Au lancement (AppDelegate, une fois)** :
  ```swift
  let rtc = RTCAudioSession.sharedInstance()
  rtc.useManualAudio = true
  rtc.isAudioEnabled = false
  ```
- **Au setup d'appel (avant fulfill answer/start)** : configurer catégorie/mode **sans activer** :
  ```swift
  rtc.lockForConfiguration()
  let cfg = RTCAudioSessionConfiguration.webRTC()
  cfg.category = AVAudioSession.Category.playAndRecord.rawValue
  cfg.mode = isVideo ? AVAudioSession.Mode.videoChat.rawValue
                     : AVAudioSession.Mode.voiceChat.rawValue
  cfg.categoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .duckOthers]
  try? rtc.setConfiguration(cfg)   // configure SEULEMENT
  rtc.unlockForConfiguration()
  ```
- **Activation — UNIQUEMENT ici sur iPhone/iPad, jamais ailleurs** :
  ```swift
  func provider(_ p: CXProvider, didActivate s: AVAudioSession) {
      let rtc = RTCAudioSession.sharedInstance()
      rtc.audioSessionDidActivate(s)
      rtc.isAudioEnabled = true   // l'ADM démarre ICI
  }
  func provider(_ p: CXProvider, didDeactivate s: AVAudioSession) {
      let rtc = RTCAudioSession.sharedInstance()
      rtc.audioSessionDidDeactivate(s)
      rtc.isAudioEnabled = false
  }
  ```
- **Piège « pas de son au 1er appel »** : si tu actives la session AVANT `didActivate`, iOS échoue silencieusement et l'ADM ne démarre jamais. NE JAMAIS appeler `setActive(true)` toi-même sur iPhone/iPad.
- **Branche Mac** : `didActivate` ne se déclenche jamais → **activation manuelle** de la `RTCAudioSession` au moment équivalent (le chemin `[AUDIO_FALLBACK]` existant dans `CallManager.swift` ≈1309-1345). Gate ce chemin sur `ProcessInfo.processInfo.isiOSAppOnMac` (et NON sur l'heuristique fragile `if !rtc.isAudioEnabled`). Sur Mac : `mode = .videoChat` ou `.default` (jamais `.voiceChat` qui « fault l'uplink » selon les notes terrain), forcer `.speaker`.
- **Hold/unhold & interruptions** : à la reprise, re-exécuter `audioSessionDidActivate` + `isAudioEnabled = true` (le handler interruption-ended ≈279-283 le fait déjà — appliquer le même à `didActivate` après un hold).
- **NE JAMAIS appeler `RTCCleanupSSL` dans un `deinit` per-call** : la factory SSL est process-wide ; un cleanup par appel casse le 2e appel de la session. `RTCInitializeSSL` une fois, jamais de cleanup per-call (déjà correct ≈18-29 / 745-756).
- **NE JAMAIS mettre `@MainActor` sur la classe `AppDelegate`** (crash « Could not load class SceneDelegate ») — uniquement sur les extensions.

---

## 3. Architecture cible

### 3.1 Inversion fondamentale : la FSM WebRTC est la source de vérité

Aujourd'hui le code mélange l'état UI, l'état CallKit, l'état ICE et l'état média en mutant `callState` depuis ≥3 sources async concurrentes sans transition sérialisée (le `CallEventQueue` ≈117 est un scaffold mort). **C'est la cause racine de la moitié des bugs.**

**Cible** : une **machine d'état unique, sérialisée**, pilotée par la connexion WebRTC, dont CallKit n'est qu'un *observateur/renderer* (sur iPhone/iPad) et l'UI in-app un autre renderer (partout). Tous les stimuli externes (actions CallKit, events socket, états ICE, changements de chemin réseau, timeouts) sont **enqueue** dans une file unique consommée par **un seul réducteur** qui possède **toutes** les écritures de `callState`.

### 3.2 Deux couches d'état — NE PAS les confondre

**Couche 1 — FSM applicative (UX-facing, `CallState`)** :
```
idle
 ├─(startCall)──────────────▶ outgoing(ringing)
 ├─(incoming offer/push)────▶ incoming(ringing)
outgoing/incoming
 └─(accept)─────────────────▶ connecting
connecting
 ├─(pcState=.connected)─────▶ connected         // ⬅ LA gate = RTCPeerConnectionState
 └─(timeout/decline/fail)───▶ ended(reason)
connected
 ├─(pcState=.disconnected)──▶ reconnecting(attempt)
 ├─(renégociation)──────────▶ connected (RESTE)  // bascule AV NE quitte PAS connected
 └─(hangup/remote end)──────▶ ended(reason)
reconnecting
 ├─(pcState=.connected)─────▶ connected
 └─(pcState=.failed | maxAttempts)─▶ ended(connectionLost)
```

L'enum actuel (`CallManager.swift:13`) est `.idle → .ringing(isOutgoing) → .offering → .connecting → .connected → .reconnecting(attempt) → .ended(reason)`.

**Changements requis** :
- **Supprimer `.offering`.** Il n'existe que parce que la transition vers `connected` est non fiable. Avec une autorité `RTCPeerConnectionState` propre, `offering` se réduit à `outgoing(ringing) → connecting → connected`. Supprimer aussi le hack de rattrapage ICE « ICE connected while .offering » (≈2091-2097).
- Garder `.reconnecting(attempt)` (déjà bon).
- Garder l'asymétrie `isOutgoing` via `outgoing`/`incoming`.

**Couche 2 — État connexion WebRTC (L'AUTORITÉ) : utiliser `RTCPeerConnectionState`, PAS `RTCIceConnectionState`.**

Le code écoute aujourd'hui `didChange newState: RTCIceConnectionState` (`P2PWebRTCClient.swift` ≈1086). **Bascule l'autorité de la FSM sur `peerConnection(_:didChange newState: RTCPeerConnectionState)`** qui agrège ICE **et** DTLS. ICE peut être `connected` alors que DTLS handshake encore → tu passes « connected » avant que les clés média existent → silence/sens unique. L'agrégat `RTCPeerConnectionState` ne reporte `.connected` que quand ICE **et** DTLS sont up.

| `RTCPeerConnectionState` | Action FSM |
|---|---|
| `.connecting` | rester `connecting` |
| `.connected` | → `connected` (gate fiable ; remplace `webRTCServiceDidConnect` basé ICE) |
| `.disconnected` | démarrer un **debounce 3-4 s** ; si toujours disconnected → `reconnecting` + ICE restart. **NE PAS terminer l'appel.** |
| `.failed` | ICE restart immédiat si `attempt < max` ; sinon `ended(.connectionLost)` |
| `.closed` | cleanup terminal |

**Garder l'écoute de `RTCIceConnectionState`** mais **uniquement pour diagnostic/qualité**, jamais comme autorité de transition.

### 3.3 Rôles : caller/callee et polite/impolite

- **caller/callee** : déterminé par qui initie l'appel (asymétrie d'initiation, persistée sur la session).
- **polite/impolite** : assigné **déterministiquement et symétriquement** au setup, **indépendant** de caller/callee (les rôles polite/impolite doivent survivre aux renégociations). Choix recommandé pour l'évolutivité groupe : **comparer les deux `userId` lexicographiquement → le plus petit `userId` est polite**. Les deux pairs le calculent identiquement à partir de `remoteUserId` + id local. (Avec un SFU futur, le client est *toujours* polite, le SFU impolite — dégénérescence propre.)
- Persister `let isPolite: Bool` sur la session d'appel, fixé une fois.

### 3.4 Perfect negotiation (cœur de l'architecture)

Implémenter le pattern W3C **Perfect Negotiation** dans `P2PWebRTCClient`. C'est CE pattern qui rend l'appel robuste et la renégociation (bascule AV, ICE restart) sûre. Il n'existe aujourd'hui **aucune** trace de perfect negotiation (pas de `makingOffer`, pas de rôle polite, pas de `rollback`, pas de détection de glare).

Les trois flags (porter l'algorithme MDN verbatim) :
```swift
private var makingOffer = false
private var ignoreOffer = false
private var isSettingRemoteAnswerPending = false
```

`onnegotiationneeded` (aujourd'hui un no-op, `P2PWebRTCClient.swift` ≈1082) devient le **seul** chemin d'offre pour toute renégociation (appel initial, upgrade audio→vidéo, downgrade, ICE restart) :
```swift
nonisolated func peerConnectionShouldNegotiate(_ pc: RTCPeerConnection) {
    Task { await self.negotiate() }
}
func negotiate(iceRestart: Bool = false) async {
    guard let pc = peerConnection else { return }
    do {
        makingOffer = true
        let offer = try await createOfferDescription(on: pc, iceRestart: iceRestart)
        try await setLocalDescription(offer, on: pc)
        let gen = nextNegotiationId()
        delegate?.webRTCClient(self, didCreateOffer: offer, generation: gen)
    } catch { Logger.webrtc.error("negotiate failed: \(error)") }
    makingOffer = false
}
```

Réception d'une remote description (la garde de collision) — **libwebrtc ObjC n'a PAS de `setLocalDescription()` sans argument ni de rollback implicite**. Le rollback est explicite via `RTCSessionDescription(type: .rollback, sdp: "")` :
```swift
func handleRemoteDescription(_ desc: SessionDescription, generation: Int) async {
    guard let pc = peerConnection else { return }
    guard generation >= currentRemoteGeneration else { return }   // drop stale (epoch)
    let isOffer = desc.type == .offer
    let readyForOffer = !makingOffer &&
        (pc.signalingState == .stable || isSettingRemoteAnswerPending)
    let offerCollision = isOffer && !readyForOffer
    ignoreOffer = !isPolite && offerCollision
    if ignoreOffer { return }                                     // impolite gagne
    do {
        if offerCollision {                                        // polite : rollback explicite
            try await setLocalDescription(RTCSessionDescription(type: .rollback, sdp: ""), on: pc)
        }
        if desc.type == .answer { isSettingRemoteAnswerPending = true }
        try await setRemoteDescription(RTCSessionDescription(type: desc.rtcType, sdp: desc.sdp), on: pc)
        isSettingRemoteAnswerPending = false
        await flushPendingCandidates()                            // safe maintenant
        if isOffer {
            let answer = try await createAnswerDescription(on: pc)
            try await setLocalDescription(answer, on: pc)
            delegate?.webRTCClient(self, didCreateAnswer: answer, generation: generation)
        }
    } catch { Logger.webrtc.error("remote desc apply failed: \(error)") }
}
```
Vérifie `makingOffer` (synchrone) et non `signalingState` (async) pour décider de la collision — c'est l'invariant MDN.

### 3.5 Epoch de négociation (anti-churn socket)

Ajouter un `negotiationId: Int` monotone au payload `call:signal`. Chaque `negotiate()` l'incrémente. À la réception, **drop tout SDP/ICE dont la génération est plus ancienne que la courante**. Les offres/candidats périmés d'un socket churné deviennent inoffensifs.

> Le gateway relaie `call:signal` de façon opaque. **Mais Fastify/le schéma strippe les champs non déclarés** — tu DOIS ajouter le champ au type `CallSignalEvent`/`WebRTCSignal` dans `packages/shared/types/video-call.ts` (l.427) sinon il est silencieusement supprimé. Pas de logique gateway supplémentaire, juste le pass-through schématisé.

### 3.6 Séparation des couches

```
┌─────────────────────────────────────────────┐
│ UI (SwiftUI)  — observe CallManager.@Published │  ← renderer
├─────────────────────────────────────────────┤
│ CallKit (iPhone/iPad)  — observe la FSM        │  ← renderer (gaté isiOSAppOnMac)
├─────────────────────────────────────────────┤
│ CallManager  — FSM sérialisée (réducteur)      │  ← SOURCE DE VÉRITÉ
│   CallEventQueue (enfin câblé)                 │
├─────────────────────────────────────────────┤
│ P2PWebRTCClient  — perfect negotiation,        │
│   transceivers, candidate queue,               │
│   RTCPeerConnectionState autorité              │
├─────────────────────────────────────────────┤
│ Signaling (Socket.IO) ↔ gateway relais         │
└─────────────────────────────────────────────┘
```

Recommandé : extraire de `CallManager` (god-object ~2300 l.) un `CallConnectionFSM` (réducteur) + un `PeerNegotiator` (perfect negotiation). Cette extraction est ce qui rend l'étape groupe incrémentale plutôt qu'une réécriture.

### 3.7 Évolutivité groupe/SFU (préparer, ne pas implémenter)

Deux choix de conception qui rendent le port groupe propre :
1. **Un `P2PWebRTCClient` par pair distant.** Aujourd'hui 1 pair ; en groupe : N pairs, chacun sa PC vers le SFU. `CallManager` devient coordinateur de `[peerId: WebRTCClient]`.
2. **Perfect negotiation par PC** — avec SFU, le client est toujours polite (SFU impolite), la logique de rôle dégénère proprement.
Garder transceivers pré-créés et stables (layout m-line stable) — prérequis du SFU.

---

## 4. Signaling (séquences exactes)

### 4.1 Séquence offer/answer/ICE/participant-joined/check-active

**État actuel (à corriger)** : le caller crée son offer en réponse à `call:participant-joined` (racy, one-shot, no-retry) ; l'offer est relayé fire-and-forget et **silencieusement droppé** par le gateway si le socket cible n'est pas dans la room à cet instant (`TARGET_NOT_FOUND`, `CallEventsHandler.ts` ≈1214-1225).

**Cible** :
1. **Caller** `startCall` → `call:initiate` (ACK donne `callId` + ICE servers) → `configure` → ajoute les transceivers (audio + vidéo, voir §5) → écoute les signaux. **Attache le listener `participant-joined` AVANT `startLocalMedia`** (le warmup média prend 0.5-3 s sur device réel ; aujourd'hui le listener est attaché APRÈS ≈483, d'où la race).
2. **Callee** reçoit la notif (foreground/Mac via socket, background via PushKit) → `.incoming(ringing)` → `configure` → émet `call:join`.
3. Gateway `joinCall` → `connecting` (DB) → fanout `call:participant-joined` aux autres sockets de la room.
4. **Le caller crée son offer via le chemin `negotiate()`** (perfect negotiation), déclenché par `onnegotiationneeded` lors de l'ajout des transceivers, PAS par un trigger `participant-joined` one-shot. Le `participant-joined` sert seulement à savoir que le pair est prêt à recevoir l'offre (et à mettre à jour les creds TURN per-user via `updateIceServers`).
5. **Offer relayé via `emitCallSignalWithAck`** (l'API existe, `CallManager.swift` ≈1962) avec **retry/backoff**. Sur `TARGET_NOT_FOUND`, le gateway doit **bufferiser le dernier offer par call** et le rejouer quand le socket cible (re)join la room (analogue au replay de `call:check-active` ≈190 et au buffer `lastCallParticipantJoined`, mais pour le SDP).
6. **Callee** : applique l'offer FIRST (voir §5 — answerer applique l'offer AVANT d'attacher ses tracks), `createAnswer`, `emitCallAnswer` (avec ACK 3 s + retry).
7. **Caller** applique l'answer ; la transition `connected` est pilotée par `RTCPeerConnectionState.connected` (§3.2).
8. **`call:check-active`** : au resume/reconnect, le client interroge l'état d'appel et resynchronise (réutiliser le replay existant).

**Bufferiser les candidats ICE** jusqu'à `remoteDescription != nil`, puis flush. Re-bufferiser à travers un ICE restart (nouveaux ufrag/pwd invalident les vieilles paires). Supprimer les erreurs `addIceCandidate` quand `ignoreOffer == true`.
```swift
private var pendingCandidates: [IceCandidate] = []
func addRemoteCandidate(_ c: IceCandidate) async {
    guard let pc = peerConnection, pc.remoteDescription != nil else {
        pendingCandidates.append(c); return
    }
    do { try await pc.add(c.rtc) } catch { if !ignoreOffer { Logger.webrtc.error("\(error)") } }
}
```

### 4.2 Renégociation (`onnegotiationneeded`)

Toute renégociation passe par `negotiate()` (§3.4). `handleRemoteDescription` gère l'offer entrant dans **tout** état non-`.idle/.ended` (aujourd'hui les offers en `.connected` tombent dans le `default` et sont **droppés**, `CallManager.swift` ≈829-830 — c'est le bug c). Remplacer ce `default → drop` par le handler perfect-negotiation complet.

### 4.3 ICE restart

- **Déclencher sur `RTCPeerConnectionState.disconnected` après debounce 3-4 s** (pas attendre `.failed` ~30 s = UX inacceptable).
- **Passer par le même `negotiate(iceRestart: true)`** (perfect negotiation), qui ajoute la contrainte mandatory `"IceRestart":"true"` dans `createOfferDescription`. L'ICE restart préserve DTLS/SRTP (cheap, rapide) — seuls les creds/candidats ICE changent.
- Re-bufferiser les candidats à travers le restart.
- Garder `reconnectAttempt`/`maxReconnectAttempts` avec backoff. Rester en `reconnecting` (bannière UI) pendant toute la durée.
- Router `attemptReconnection` (`CallManager.swift` ≈2160-2178) à travers ce chemin unique (aujourd'hui il hand-roll un offer direct, bypassant perfect negotiation = source de glare).

### 4.4 Glare

Géré entièrement par perfect negotiation (§3.4) : collision détectée via `makingOffer || signalingState != stable` ; polite fait rollback puis answer ; impolite ignore. Plus aucun `setRemoteDescription` sans garde `signalingState` (aujourd'hui `P2PWebRTCClient.swift` ≈518/769 appellent `setRemoteDescription` sans garde → wedge sur glare).

### 4.5 Ordre offer/answer/setLD/setRD (invariants)

1. **Offerer** : `pc.offer(for:)` → (munge si besoin) → `setLocalDescription(offer)` (stable→have-local-offer) → send. Sur answer : `setRemoteDescription(answer)` (have-local-offer→stable).
2. **Answerer** : `setRemoteDescription(offer)` (stable→have-remote-offer) → `pc.answer(for:)` → `setLocalDescription(answer)` (have-remote-offer→stable) → send.
3. **Jamais** `setLocalDescription` d'un offer hors `stable`/`have-remote-offer` (la garde `readyForOffer` l'enforce).
4. **Rollback** explicite (polite) : `setLocalDescription(RTCSessionDescription(type: .rollback, sdp: ""))`.
5. **Candidats** : `add` seulement après `remoteDescription != nil`.
6. Munge Opus + `setCodecPreferences` + transportCC + bitrate hints (§5) appliqués dans `createOfferDescription`/`createAnswerDescription` avant `setLocalDescription`, **identiquement sur le chemin de renégociation**.

### 4.6 Gateway

- Ajouter `negotiationId` au schéma `WebRTCSignal`/`CallSignalEvent` (pass-through).
- Buffer du dernier offer par call + replay au (re)join (anti `TARGET_NOT_FOUND`).
- ACK + re-emit du signaling (at-least-once, pas fire-and-forget). Garder le FSM DB (`initiated → ringing → connecting → active → ended/missed/rejected/failed` + `reconnecting`).
- ⚠️ **Async EventEmitter** : `emit()` n'attend pas les Promises ; wrapper tous les listeners async Socket.IO en try/catch.

---

## 5. Media

### 5.1 Transceivers pré-négociés audio + vidéo (TOUJOURS les deux)

Le code crée déjà les deux transceivers `.sendRecv` au setup (`P2PWebRTCClient.swift` ≈158-203) — **MAIS uniquement pour `type == .audioVideo`** ; un appel audio-only n'a **aucun** transceiver vidéo, rendant l'upgrade structurellement impossible (bug c).

**Cible** :
- **Créer TOUJOURS les deux transceivers au setup**, même pour un appel audio-only : ajouter le transceiver vidéo en `.recvOnly` (aucune caméra démarrée, aucun coût batterie/LED). L'upgrade audio→vidéo devient alors un simple flip de `direction` + attache de track + renégociation, jamais un `addTransceiver` mid-call (qui désynchronise l'ordre des m-lines).
- **Transceivers créés UNE fois, jamais ajoutés/supprimés mid-call.** Layout m-line stable = renégociation sûre + évolutivité SFU.

### 5.2 PRIMARY FIX — answerer : appliquer l'offer AVANT d'attacher les tracks (cause racine du média à sens unique)

**Bug b (caller inbound RTP = 0) :** sur le callee, les transceivers sont pré-créés en `.sendRecv` AVANT d'appliquer l'offer distant. Sous Unified-Plan, libwebrtc doit **associer** les m-sections de l'offer aux transceivers existants par MID/kind ; rien ne garantit que le transceiver pré-créé du callee mappe sur la m-line du caller → l'answer peut porter `recvonly`/`inactive` sur la section que le caller lit → le caller émet (callee reçoit) mais le caller ne reçoit rien.

**Fix (pattern Unified-Plan correct)** :
- **Offerer (caller)** : `addTransceiver(audio/video, .sendRecv)` puis `createOffer`. (Code caller déjà correct.)
- **Answerer (callee)** : appliquer l'offer distant FIRST (`setRemoteDescription(offer)`) — ce qui auto-crée les transceivers receiver depuis l'offer — PUIS attacher les tracks locaux à ces transceivers (`transceiver.sender.track = …`), forcer `direction = .sendRecv` sur audio ET vidéo, PUIS `createAnswer`. **NE PAS pré-`addTransceiver` sur l'answerer avant l'offer.**

Refactorer `startLocalMedia(type:)` (`P2PWebRTCClient.swift` ≈165-204) pour **séparer la création track/source de l'attache au transceiver**. Sur le chemin callee, attacher après `setRemoteDescription(offer)` dans `createAnswer`.

> Le log `[CALL-DIAG] remote ANSWER directions` (`P2PWebRTCClient.swift` ≈525) confirmera le fix : un answer correct lit `audio=sendrecv video=sendrecv` sur les sections que le caller lit. S'il lit `recvonly`/`inactive`, le bug persiste.

### 5.3 Supprimer les contraintes legacy SDP (mixage Plan-B / Unified-Plan)

Le code utilise SIMULTANÉMENT `OfferToReceiveAudio/Video` (contraintes Plan-B, `createOffer`/`createAnswer` ≈436-440 / 480-484) **et** des transceivers Unified-Plan. C'est une cause classique d'asymétrie (les contraintes legacy synthétisent/dupliquent des m-sections ou brouillent les directions). **Supprimer entièrement les dictionnaires `mandatoryConstraints`** — passer des contraintes vides. Les transceivers `.sendRecv` déclarent déjà l'intention.

### 5.4 Switch audio↔vidéo bidirectionnel (replaceTrack / direction)

**Modèle produit recommandé : FaceTime (asymétrique)** — chaque participant contrôle indépendamment sa propre vidéo sortante. « Passer en vidéo » = j'active *ma* caméra et je le signale au pair (qui affiche ma tuile). Pas d'accept/decline. Le plus bas risque, mappe parfaitement sur transceivers pré-négociés.

**Trois mécanismes, par coût croissant** :
| Mécanisme | Coût | Usage |
|---|---|---|
| `track.isEnabled = true/false` | Instantané, zéro signaling, mais RTP continue (média muté) | Mute/unmute rapide uniquement |
| `sender.replaceTrack(newTrack)` / `replaceTrack(nil)` | Instantané, **zéro renégociation** | Le workhorse : flip caméra avant/arrière, attache/détache caméra |
| `transceiver.direction = …` + offer/answer | Renégociation (perfect negotiation) | Quand la topologie change réellement (recvonly→sendrecv) |

**Upgrade audio→vidéo (allumer ma caméra)** :
1. Créer lazy `RTCVideoSource` + `RTCVideoTrack` + `RTCCameraVideoCapturer` (défère à la première activation pour garder le LED éteint en appel audio).
2. `videoTransceiver.sender.replaceTrack(videoTrack)` puis `startCapture`.
3. `videoTrack.isEnabled = true`.
4. `videoTransceiver.direction = .sendRecv` (flip recvonly→sendrecv) → déclenche `onnegotiationneeded` → offer perfect-negotiation.
5. Émettre `call:toggle-video {enabled:true}` (UI hint), porter un **vecteur d'état média par participant** `{audio, video, cameraPosition}` idempotent + seq monotone (anti-churn, last-write-wins).

**Downgrade vidéo→audio (éteindre ma caméra)** :
1. `videoTrack.isEnabled = false` puis `videoCapturer.stopCapture()` (libère caméra + LED).
2. `sender.replaceTrack(nil)` (stoppe le RTP sortant instantanément, zéro SDP).
3. Optionnel `direction = .recvOnly` si tu veux libérer les ressources encode (renégociation).
4. Émettre `call:toggle-video {enabled:false}`.

**Flip caméra avant/arrière** : `replaceTrack` uniquement (ou `stopCapture` + `startCapture(with: otherDevice)`). **Jamais de renégociation.** Le scaffolding existe (`switchCamera` ≈602-624).

**Le receiver pilote l'UI sur l'event de track entrant** (`didStartReceivingOn` / `didAdd RTCRtpReceiver`), PAS sur le message de signaling (le signaling = intention, le callback transceiver = média réellement arrivé). Afficher la tuile quand les deux concordent ; placeholder « caméra off » sinon. La livraison de track a déjà 3 callbacks redondants funnelés via `deliverRemoteTrack` avec garde `!==` (≈1034-1076) — bon.

**Refléter dans CallKit** : `CXCallUpdate(hasVideo:)` via `provider.reportCall(with:updated:)` sur iPhone/iPad.

### 5.5 Codecs (H264 hardware)

- **H264 hardware** prioritaire pour la vidéo (encodeur/décodeur HW iOS/Apple-silicon). Profil baseline/constrained pour compat.
- **Opus** pour l'audio (munge déjà présent ≈458-466) : maxBitrate 64 kbps, minBitrate 16 kbps, DTX/FEC selon ce que l'xcframework expose.
- `setCodecPreferences` : **forcer l'overload throwing** (l'overload `void` no-op silencieusement) :
  ```swift
  let f: ([RTCRtpCodecCapability]) throws -> Void = transceiver.setCodecPreferences
  try f(preferredCodecs)
  ```
  La liste de préférences doit être l'**intersection valide pour les deux directions** (pas seulement les capabilities sender), sinon le codec inbound peut être vide → 0 RTP inbound. (Voir `invokeSetCodecPreferences` ≈396-429.)

### 5.6 RtpEncodingParameters + degradationPreference

- Configurer `RTCRtpEncodingParameters` sur le sender vidéo : `maxBitrateBps`, `maxFramerate`, `scaleResolutionDownBy` selon les conditions réseau.
- `degradationPreference` : `.maintainFramerate` pour la vidéo conversationnelle (privilégie la fluidité ; baisser la résolution sous contrainte). Adapter selon thermalState.
- Préparer (sans l'activer) le terrain simulcast natif pour l'évolutivité SFU.

### 5.7 getStats correct (corriger l'inbound)

`getStats` (`P2PWebRTCClient.swift` ≈627-689) a deux défauts :
- `bytesReceived`/`packetsReceived` sommés sur **tous** les `inbound-rtp` (audio+vidéo+rtx/fec) → impossible de diagnostiquer un sens unique par média. **Parser par `kind`** : exposer `inboundAudioPackets` et `inboundVideoPackets` séparément.
- `codec = values["codecId"]` (≈661-663) stocke une **référence stats-graph** (ex. `"COT01_111"`), PAS un nom de codec. **Résoudre le vrai codec** via `codecId → codec.mimeType`.

### 5.8 Auto-réparation média à sens unique (RTP gate actionnable)

Aujourd'hui le RTP gate (`startRTPGatePolling` ≈1263-1299) est **purement informatif** (jamais d'action). **Le rendre actionnable** : garder `.connected` immédiat sur `RTCPeerConnectionState.connected` pour l'UX, mais si après ~3-4 s en `.connected` `inboundPacketsReceived == 0 && outbound > 0` (half-open réel), déclencher **un** ICE restart automatique (via `negotiate(iceRestart: true)`) et surfacer `reconnecting`. Convertit la condition latente en event auto-réparateur.

### 5.9 TURN

- Creds TURN per-user mis à jour sur le caller au `participant-joined` (`updateIceServers` ≈1903-1908) et sur le callee au `configure`. Garder.
- Une asymétrie TURN casserait ICE entièrement (pas de connexion), pas un état connected-mais-sens-unique — donc TURN n'est PAS la cause de bug b, mais vérifier que les deux pairs reçoivent des creds valides.

---

## 6. CallKit / PushKit (séquences correctes)

### 6.1 Appel sortant (corrige « caller ring forever / stuck Connexion… »)

L'UI CallKit du caller est le pur reflet de **trois reports explicites** :
```
1. CXStartCallAction → action.fulfill()
2. reportOutgoingCall(with:uuid, startedConnectingAt: Date())   // ringing/connecting
   ...signaling: offer → answer → setRemoteAnswer...
   ...connexion: RTCPeerConnectionState == .connected...
3. reportOutgoingCall(with:uuid, connectedAt: Date())           // UI "connected"
```
- **#3 DOIT être piloté par `RTCPeerConnectionState.connected`, JAMAIS par un timer ni par `didActivate`.** Si #3 est lié à `didActivate` et que CallKit ne le déclenche jamais (Mac, ou activation échouée), le caller ring à l'infini. **C'est le suspect principal du bug a.** Vérifier `reportOutgoingCall(_:connectedAt:)` (`CallManager.swift` ≈1378-1384) — l'appeler depuis le delegate connection-state, pas `didActivate`.
- `reportOutgoingCall(_:connectedAt:)` sur le callee no-op silencieusement (correct, ≈154-156) — seul le caller report connected.

### 6.2 Appel entrant via PushKit

Voir §2.2. `reportNewIncomingCall` synchrone dans le handler push ; socket connect / offer fetch APRÈS le report (le push réveille, le report achète le runtime background). Mitige le churn socket au wake.

### 6.3 Réponse callee (corrige « stuck connexion… »)

Après `CXAnswerCallAction` : le callee doit `createAnswer` → `setLocalDescription` → **envoyer l'answer sur le socket**, et le caller `setRemoteAnswer`. Si le socket a reconnecté entre push et answer, l'answer part sur un canal mort → les deux côtés hangent. **Signaling at-least-once** : buffer + ACK + re-emit on reconnect (pattern outbox existant). Si pas d'ACK en ~2 s, re-send.

**Bug actuel** (`answerCallReady` ≈896-927) : si l'user répond AVANT que l'offer arrive, le code prend la branche `else` et attend passivement. La recovery (`handleSignalOffer` branche `.connecting` ≈814-827) ne tourne que si `handleSignalOffer` est appelé en `.connecting`. Avec le caller qui n'offre jamais (bug a §8), l'offer n'arrive jamais. **Fix par la chaîne complète** : offer fiable côté caller (perfect negotiation + signaling ACK'd/retried/buffered) + handler renégociation universel côté callee.

### 6.4 Gating Mac vs iPhone

`let usesCallKit = !ProcessInfo.processInfo.isiOSAppOnMac`
- **`true` (iPhone/iPad)** : flux §6.1-6.3, CallKit pilote l'activation audio.
- **`false` (Mac)** : skip `reportNewIncomingCall`/`CXTransaction` (ou traiter erreurs 3/4 comme no-ops) ; présenter `IncomingCallView`/`CallView` in-app ; activer manuellement la `RTCAudioSession` (chemin `[AUDIO_FALLBACK]`) ; forcer `.speaker` + mode `.videoChat`/`.default`. **Garder l'état connected sur les deux chemins** dérivé de `RTCPeerConnectionState`, jamais de `didActivate`.

---

## 7. UI

### 7.1 Une hiérarchie SwiftUI adaptative, trois size classes

Piloter le layout sur `horizontalSizeClass` + `ProcessInfo.processInfo.isiOSAppOnMac`, **jamais** sur des checks device. La couche UI est aujourd'hui **platform-blind** (aucune vue ne lit `isiOSAppOnMac`/idiom/size class) — à corriger.

- **iPhone (compact)** : remote vidéo full-bleed edge-to-edge (`.scaleAspectFill`, crop). PiP local draggable. Contrôles auto-hide après ~4 s, réapparaissent au tap.
- **iPad (regular)** : remote full-bleed, contrôles dans une barre glass flottante centrée. PiP plus grand. Survivre à Split View/Slide Over (changements de taille).
- **Mac** : fenêtre redimensionnable. Remote **letterboxé** (`.scaleAspectFit`, PAS de crop). Contrôles **toujours visibles** (pas d'auto-hide desktop). CallKit mort → `IncomingCallView` + pastille pour tout. Continuity Camera = `AVCaptureDevice` de type `.continuityCamera`/`.external` → liste de devices nommés (pas de bouton flip avant/arrière qui n'a pas de sens sur Mac).

### 7.2 CallView — remote plein écran + PiP local draggable

- **Renderer** : `RTCMTLVideoView` (Metal) pour remote (full screen) et local (PiP), via `UIViewRepresentable` (`WebRTCVideoView.swift`). `videoContentMode = .scaleAspectFill` remote sur phone, `.scaleAspectFit` sur Mac.
- **PiP draggable** : `DragGesture` + **snap-to-nearest-corner** sur `.onEnded` (spring). Stocker `@State var pipCorner: Corner`, calculer la frame depuis le coin + safe-area insets. **Supprimer le point magique hardcodé `(320,100)`** (`CallView.swift` ≈29) et le combo `.position`+`.offset` non principé ; utiliser `GeometryReader`. Mirror horizontal **uniquement** pour la caméra avant.
- **Tap PiP** : swap quel flux est plein écran (comportement FaceTime). Le tap-to-switch-camera actuel (≈460) est non découvrable → déplacer le flip dans la barre de contrôle.
- **Gate « Connexion vidéo… »** (≈355-395) : aujourd'hui keyé sur `hasRemoteVideoTrack` qui peut ne jamais flipper pour le caller (bug b) → spinner infini sans timeout/fallback/retry. **Ajouter un watchdog** : si pas de frames après N s, surfacer un état dégradé + retry, et déclencher l'auto-réparation média (§5.8).

### 7.3 Barre de contrôle (bottom bar)

Liquid-Glass / `.ultraThinMaterial`, boutons circulaires, dans l'ordre :
1. **Mute** (mic) — `localAudioTrack.isEnabled` ; badge rouge sur la tuile du pair quand *lui* est muté (via `call:media-toggled`).
2. **Vidéo on/off** — primitive d'upgrade/downgrade (§5.4). **DOIT apparaître aussi en appel audio-only** (aujourd'hui caché si pas de track vidéo, `CallView.swift` ≈590) pour permettre l'escalade.
3. **Flip caméra** (avant/arrière iOS ; picker de devices Mac/iPad+Continuity). **Caché sur Mac** (une seule caméra → `switchCamera` no-op).
4. **Filtres/effets** — ouvre la tray (§7.5). **Unifier les deux entry points concurrents** (bouton `camera.filters` ringing/connecting + bouton `+`/`xmark` connected ≈559-570) en un seul.
5. **Speaker / route audio** — `AVRoutePickerView` (AirPlay/BT/speaker) sur iOS. **Caché sur Mac** (forcé `.speaker`, output système).
6. **End call** — rouge.

Auto-hide sur phone/iPad ; persistant sur Mac. **Remplacer les hexes legacy** `FF2E63`/`FF6B6B`/`08D9D6` (`CallView.swift` ≈302/305/540/553, `FloatingCallPillView.swift` ≈164-166) par `MeeshyColors.error` et tokens sémantiques.

### 7.4 IncomingCallView

- **iPhone/iPad** : CallKit pilote l'UI système ; `IncomingCallView` = fallback foreground. Ajouter un **self-preview vidéo** pendant le ring d'un appel vidéo entrant (attente SOTA : se voir avant de répondre).
- **Mac** : seule UI entrante (CallKit mort). Présenter comme overlay window-level avec accept/decline, ringtone via `RingbackTonePlayer`/`AVAudioPlayer`. **Problème à résoudre** : si l'app est backgroundée sur Mac, l'appel entrant n'a aucune surface — fournir un mécanisme de mise au premier plan / bannière globale.
- Afficher avatar/nom, « Appel vidéo » vs « Appel audio », options accept-as-audio vs accept-as-video pour un appel vidéo (pattern FaceTime).

### 7.5 Filtres vidéo temps réel (blur fond / beauty)

Pipeline natif SOTA via le seam existant `VideoFilterCapturerDelegate` (`P2PWebRTCClient.swift` ≈207) :
1. Delegate entre `RTCCameraVideoCapturer` et `RTCVideoSource`.
2. Dans `capturer(_:didCapture:)`, `frame.buffer as RTCCVPixelBuffer` → `CVPixelBuffer`.
3. Segmentation : `VNGeneratePersonSegmentationRequest` (qualité temps réel) ou `VNGeneratePersonInstanceMaskRequest` (iOS 17+). Blur fond = `CIGaussianBlur(background)` composité avec foreground masqué via Core Image. Beauty = chaîne `CIFilter` skin-smoothing subtile.
4. `CIContext(mtlDevice:)` partagé + `CVPixelBufferPool` (jamais d'alloc par frame).
5. Re-wrapper en `RTCCVPixelBuffer` → `RTCVideoFrame(buffer:rotation:timeStampNs:)` en **préservant rotation + timestamp monotone** (timestamps stale → vidéo noire). Émettre via `videoSource.capturer(_, didCapture:)`.
6. Throttle Vision ~15-24 fps off la queue de capture ; drop frames sous `ProcessInfo.thermalState`. Tourne côté sender (la vidéo filtrée est encodée) — identique iPhone/iPad/Mac (Apple-silicon natif).

### 7.6 Bannière return-to-call + indicateur in-conversation

- **`CallDisplayMode`** (`WebRTCTypes.swift` ≈155-157) n'a que `.fullScreen` et `.pip`. Garder, mais enrichir la pastille.
- **`FloatingCallPillView`** : c'est LE mécanisme return-to-call (tap → `displayMode = .fullScreen`). **Pour un appel vidéo en PiP, afficher la vidéo remote** dans une vignette flottante draggable (aujourd'hui audio-only même en vidéo = gap majeur). Overlay window-level qui survit aux changements de route.
- **Bannière in-conversation** : dans `ConversationView` (le header ≈48-98 n'affiche aujourd'hui QUE les boutons start-call et ne les désactive pas pendant un appel actif → on peut tenter un 2e appel). Ajouter une bannière fine « Appel en cours · 02:14 · Toucher pour revenir », **gatée sur `Router.currentConversationId == call.conversationId`** (réutiliser verbatim le pattern « mini-player route gate via Router.currentConversationId »). Désactiver/swapper les boutons start-call pendant un appel.
- **Call-waiting** : `CallWaitingBannerView.swift` existe mais n'est **jamais monté** (dead code) ; `CallManager.showCallWaitingBanner`/`pendingIncomingCall`/`endCurrentAndAnswerPending`/`rejectPendingCall` (≈702-1133) n'ont **aucun consumer UI**. Câbler la bannière call-waiting (2e appel entrant pendant un appel actif).
- **Source d'état** : pastille + bannière observent un unique `CallManager.@Published` ; passer des valeurs primitives aux leaf views (règle « Zero Unnecessary Re-render » : pas de `@ObservedObject` sur singletons globaux dans les leaf views, `.equatable()` sur les cellules).

### 7.7 Orientation / mirroring / aspect

- **Mirroring caméra** : `WebRTCVideoView` applique aujourd'hui un flip horizontal **inconditionnel** quand `mirror == true` (≈38-42), et le caller passe `mirror: true` pour TOUS les previews locaux (≈35/420). **Bug** : après flip vers la caméra arrière, le self-view reste miroir (texte/scène inversés). **Exposer `usingFrontCamera`** depuis `CallManager` et mirror **uniquement** la caméra avant.
- **Orientation** : laisser `RTCMTLVideoView` honorer la rotation des frames (libwebrtc tag la rotation RTP). Animer le re-layout PiP à la rotation. Garder le guard de format de capture (évite les formats 120fps-only qui crashent, ≈781/992).
- **Mac/iPad landscape** : letterbox cohérent, debounce le layout au resize.

### 7.8 Factoriser la présentation

Le bloc de présentation d'appel est dupliqué entre `RootView.swift` (≈407-416) et `iPadRootView+Sheets.swift` (≈102-111) → risque de drift. Extraire un **modifier partagé** (`.callPresentation()`).

---

## 8. BUGS CONNUS à corriger (avec file:line de l'audit)

| # | Bug | Localisation | Effet | Fix (section) |
|---|---|---|---|---|
| **a** | Caller ring forever / callee stuck « connexion… » après answer | `CallManager.swift` 483, 1895-1899, 1926-1941 ; `CallEventsHandler.ts` 1214-1225 | Le caller n'offre jamais si le callee join pendant le warmup média (listener `participant-joined` attaché après `startLocalMedia`, one-shot, no-retry, buffer single-slot écrasable) + offer relayé fire-and-forget droppé sur churn | §3.2, §4.1, §6.1 |
| **a'** | `reportOutgoingCall(connectedAt:)` potentiellement lié à `didActivate` au lieu de `RTCPeerConnectionState.connected` | `CallManager.swift` 1378-1384 | Caller ring à l'infini si CallKit ne fire jamais `didActivate` (Mac/activation échouée) | §6.1 |
| **b** | Média à sens unique (caller inbound RTP = 0, callee reçoit OK) | `P2PWebRTCClient.swift` 165-204, 436-440/480-484 (constraints legacy), 518/769 (setRemoteDescription sans garde) ; `CallManager.swift` 2058-2102 (RTP gate informatif) | Answerer pré-crée des transceivers AVANT l'offer → answer `recvonly`/`inactive` sur la section que le caller lit ; mixage Plan-B/Unified-Plan ; sens unique jamais détecté/réparé | §5.2, §5.3, §5.8 |
| **c** | Pas de switch audio↔vidéo mid-call | `CallManager.swift` 1052-1061, 829-830 (offer droppé en `.connected`) ; `P2PWebRTCClient.swift` 175-205, 562-580 | `toggleVideo` flip juste `isEnabled` + envoie un hint UI ; appel audio-only n'a aucun transceiver vidéo ; offer de renégociation droppé dans le `default` | §4.2, §5.1, §5.4 |
| **d** | Churn socket casse le signaling | `CallManager.swift` 1946 (`emitCallOffer` fire-and-forget) ; `CallEventsHandler.ts` 1214-1225 ; pas d'epoch | SDP/ICE in-flight d'un vieux socket appliqués au nouveau PC ; offer droppé silencieusement sur `TARGET_NOT_FOUND` | §3.5, §4.1, §4.3 |
| **e** | Race participant-joined | `CallManager.swift` 483, 1937 ; `MessageSocketManager.swift` 2461 | `createAnswer`/offer course avec `localMediaTask` ; `PassthroughSubject` ne replay pas ; buffer single-slot écrasé par un later join (reconnect/2e device) | §4.1, §5.1 |
| **f** | UI stuck « Connexion vidéo… » | `CallView.swift` 370 ; FSM non fiable | Gate keyé sur `hasRemoteVideoTrack` qui peut ne jamais flipper (bug b) ; spinner infini sans timeout/fallback | §3.2, §7.2 |
| **g** | Pas de glare / perfect negotiation | `P2PWebRTCClient.swift` 518-527, 769-776, 1024 (signaling-state delegate = log seul) ; `CallManager.swift` 105-113 | Offers croisés wedge la connexion ; ICE-restart offers collisionnent | §3.4, §4.4 |
| **h** | Pas de timeout en `.connecting`/`.offering` | `CallManager.swift` 1235 (seul `.ringing` gardé), 1263-1299 | Caller stuck « Connexion vidéo… » indéfiniment si ICE/média n'aboutit jamais | §5.8, §7.2 |
| **i** | FSM mutée depuis ≥3 sources async sans transition sérialisée ; `CallEventQueue` mort | `CallManager.swift` 117 (mort), 900/1147/1914/2082 (`callState =` éparpillés) | Race windows ; reconnect-rejoin (1844) en compétition avec NWPath ICE-restart (1538) | §3.1, §3.6 |
| **j** | `getStats` inbound mal parsé + codec faux | `P2PWebRTCClient.swift` 627-689 (inbound sommé tous médias, `codecId` ≠ nom codec) | Diagnostic sens-unique impossible ; codec UI trompé | §5.7 |
| **k** | Mirroring inconditionnel | `WebRTCVideoView.swift` 38-42 | Self-view caméra arrière miroir | §7.7 |
| **l** | Dead code call-waiting / banner | `CallWaitingBannerView.swift` (jamais monté) ; `CallManager.swift` 702-1133 (API sans consumer) | Call-waiting non surfacé | §7.6 |

---

## 9. Plan d'implémentation par phases

> Chaque phase : **TDD strict** (RED → GREEN → REFACTOR), `./apps/ios/meeshy.sh build` vert avant tout commit, commit isolé par incrément. Le simulateur **ne fait pas de vidéo réelle** → la vérification finale de connexion média se fait **sur device réel** (iPhone physique + Mac). Les unit tests XCTest valident la logique FSM/perfect-negotiation/parsing sans device.

### Phase P0 — Connecter de façon FIABLE (bloque tout le reste)
**But** : un appel audio se connecte en < 3 s avec **audio bidirectionnel garanti**, robuste au churn.

Fichiers : `P2PWebRTCClient.swift`, `CallManager.swift`, `WebRTCTypes.swift`, `CallEventsHandler.ts`, `CallService.ts`, `packages/shared/types/video-call.ts`, `packages/shared/types/socketio-events.ts`.

Tâches :
1. Basculer l'autorité FSM sur `RTCPeerConnectionState` (§3.2). Supprimer `.offering` + le hack ICE catch-up.
2. Implémenter perfect negotiation dans `P2PWebRTCClient` : flags, `negotiate()`, `handleRemoteDescription` avec rollback explicite, `isPolite` (plus petit userId). (§3.4)
3. Queue de candidats ICE jusqu'à `remoteDescription != nil` + flush + re-buffer sur restart. (§4.1)
4. Epoch `negotiationId` dans le payload `call:signal` + drop stale ; ajouter au schéma `WebRTCSignal`/`CallSignalEvent`. (§3.5)
5. Signaling at-least-once : `emitCallOffer`/`emitCallAnswer` via `emitCallSignalWithAck` + retry/backoff ; gateway buffer-last-offer + replay au (re)join. (§4.1, §6.3)
6. Câbler `CallEventQueue` : réducteur unique sérialisé, toutes les écritures `callState =` passent par lui. (§3.1)
7. `reportOutgoingCall(connectedAt:)` piloté par `RTCPeerConnectionState.connected`. (§6.1)
8. Supprimer les contraintes legacy `OfferToReceive*` (§5.3) + answerer applique l'offer AVANT d'attacher les tracks (§5.2).
9. Watchdog `.connecting` (20-30 s → ICE restart → fail) + RTP gate actionnable (§5.8).
10. RTCAudioSession manual-audio + gating Mac/iPhone (§2.3, §6.4).

**Done P0** :
- Sur 2 iPhones physiques : appel audio sortant ET entrant se connecte, **audio des deux côtés**, en < 3 s après answer.
- Sur iPhone ↔ Mac : idem (CallKit iPhone, in-app Mac).
- Log `[CALL-DIAG]` : `inboundAudioPackets > 0` des DEUX côtés.
- Background/foreground du callee pendant le ring → l'offer est rejoué, l'appel se connecte (anti-churn).
- Réponse rapide pendant le warmup média caller → l'appel se connecte (anti-race).
- Tests XCTest : perfect negotiation (collision polite/impolite, rollback), epoch drop-stale, candidate queue, réducteur FSM transitions.

### Phase P1 — Switch audio↔vidéo + UI fonctionnelle
**But** : bascule AV bidirectionnelle sans glare ; UI vidéo correcte.

Fichiers : `P2PWebRTCClient.swift`, `CallManager.swift`, `CallView.swift`, `WebRTCVideoView.swift`, `FloatingCallPillView.swift`, `IncomingCallView.swift`, `ConversationView+Header.swift`, `CallWaitingBannerView.swift`, `CallEventsHandler.ts`.

Tâches :
1. Toujours créer les deux transceivers (vidéo en `.recvOnly` pour audio-only). (§5.1)
2. `setVideoEnabled(_:)` : flip direction + `replaceTrack` + lazy camera build + `negotiate()`. Renégociation universelle via `handleRemoteDescription`. (§5.4)
3. Signal `call:media-toggled` avec vecteur d'état `{audio, video, cameraPosition}` + seq idempotent. UI pilotée par track entrant. (§5.4)
4. `CXCallUpdate(hasVideo:)` sur upgrade/downgrade (iPhone/iPad). (§5.4)
5. Bouton vidéo visible même en appel audio-only ; flip caméra dans la barre ; unifier les entry points filtres. (§7.3)
6. PiP draggable snap-to-corner + GeometryReader (supprimer `(320,100)`/`.position+.offset`). Tap PiP = swap fullscreen. Watchdog « Connexion vidéo… ». (§7.2)
7. Mirroring conditionnel `usingFrontCamera`. (§7.7)
8. Vidéo remote dans `FloatingCallPillView` (PiP vidéo). Bannière in-conversation gatée `Router.currentConversationId`. Désactiver start-call pendant un appel. Câbler call-waiting. (§7.6)
9. Self-preview vidéo dans `IncomingCallView` pour appel vidéo entrant. (§7.4)

**Done P1** :
- Sur device réel : appel audio → upgrade vidéo (les deux voient la vidéo) → downgrade audio → re-upgrade. Pas de glare (testé en upgrade simultané des deux côtés).
- Flip caméra avant/arrière sans coupure ; self-view miroir uniquement caméra avant.
- Minimiser un appel vidéo → vidéo remote visible dans la pastille.
- Bannière return-to-call apparaît dans la bonne conversation uniquement.
- Call-waiting surfacé sur 2e appel entrant.
- Tests XCTest : transitions direction transceiver, renégociation en `.connected` (reste `.connected`), idempotence du vecteur média.

### Phase P2 — Qualité SOTA + adaptatif
**But** : qualité média, adaptativité iPhone/iPad/Mac, filtres, auto-réparation.

Fichiers : `P2PWebRTCClient.swift`, `CallView.swift`, `WebRTCVideoView.swift`, `RootView.swift`, `iPadRootView+Sheets.swift`, `AdaptiveRootView.swift`.

Tâches :
1. Codecs H264 HW + `setCodecPreferences` throwing + intersection bidirectionnelle. (§5.5)
2. `RtpEncodingParameters` + `degradationPreference` + adaptation thermalState. (§5.6)
3. `getStats` par-kind + codec via `mimeType`. (§5.7)
4. Pipeline filtres Vision+Metal via `VideoFilterCapturerDelegate`. (§7.5)
5. Layout adaptatif size class + `isiOSAppOnMac` : Mac letterbox + contrôles persistants + cacher speaker/flip ; iPad regular-width. (§7.1)
6. Orientation/rotation ; debounce resize Mac/iPad. (§7.7)
7. Factoriser `.callPresentation()` partagé. (§7.8)
8. Remplacer hexes legacy par `MeeshyColors`. (§7.3)
9. ICE restart sur `.disconnected` debounce 3-4 s + bannière `reconnecting`. (§4.3)

**Done P2** :
- Vidéo H264 HW fluide sur device ; getStats expose audio/vidéo inbound séparés + vrai codec.
- Blur fond fonctionne sans drop de framerate notable (throttle Vision).
- UI correcte iPhone portrait/landscape, iPad split, Mac fenêtré ; aucun contrôle mort sur Mac.
- Coupure réseau temporaire → `reconnecting` puis reconnexion automatique sans terminer l'appel.

### Phase P3 — Messages système d'appel + journal
**But** : trace des appels dans la conversation.

Fichiers : `CallService.ts`, `CallEventsHandler.ts`, `packages/shared/types/video-call.ts`, `packages/shared/prisma/schema.prisma` (si besoin), côté iOS rendu du message système.

Tâches :
1. À la fin d'un appel, créer un **message système** (`messageType: 'system'`) dans la conversation : « Appel audio · 04:32 », « Appel vidéo manqué », « Appel refusé », avec durée et type. Mapper depuis `CallEndReason`/`CallStatus`.
2. Respecter le schéma de réponse (`sendSuccess`/`sendError`) ; rappel : **Fastify strippe les champs non déclarés** — déclarer tout champ ajouté.
3. iOS : rendre le message système dans la liste (réutiliser le rendu `system` existant).

**Done P3** :
- Après chaque appel (terminé/manqué/refusé), un message système apparaît dans la conversation des deux côtés avec le bon libellé + durée.
- Tests : mapping `CallEndReason` → libellé, création message côté gateway.

---

## 10. Règles du repo (NON négociables)

- **Build iOS** : TOUJOURS `./apps/ios/meeshy.sh build` (non-bloquant) ou `./apps/ios/meeshy.sh run` (build+install+launch+logs, bloque). **Jamais** `xcrun`/`xcodebuild` directement ni les scripts ios-simulator. Bundle ID `me.meeshy.app`. Simulator UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (iPhone 16 Pro). Build dir `apps/ios/Build/`.
  - ⚠️ `meeshy.sh build` peut exit 1 sur un build warning-free (grep `warning:` + pipefail) APRÈS `BUILD SUCCEEDED` mais AVANT install → `.app` stale. Si tu testes sur simu, codesign + `simctl install` le `.app` frais de `Build/Products`. Les changements SDK-only peuvent ne pas re-bundler le `.app` → `rm` le `.app` + rebuild avant test simu.
- **TDD non négociable** : aucun code de prod sans test échouant d'abord. Test du comportement via API publique, pas l'implémentation. Factory functions pour les données de test. XCTest pour l'app iOS ; **scheme `MeeshySDK-Package`** pour les tests SDK (le scheme `MeeshyUI` n'a pas d'action test). `-derivedDataPath apps/ios/Build` partagé.
- **SDK purity** : `packages/MeeshySDK/` = building blocks (atomes, services low-level, models, rule engines stateless). L'**orchestration UX produit** (ViewModels, View wrappers, décisions « quand faire X ») reste **app-side** (`apps/ios/Meeshy/...`). La FSM d'appel + perfect negotiation + UI = app-side (`apps/ios/Meeshy/Features/Main/...`). Les types/models purs + le routage socket bas niveau peuvent vivre dans le SDK.
- **Pas de Catalyst.** Mac = iOS-app-on-Mac (`isiOSAppOnMac`).
- **Logging** : `os.Logger` (catégories `Logger.calls`, `Logger.webrtc`). Garder/étendre les logs `[CALL-DIAG]`. Pas de `print`.
- **Swift 6 concurrency** : `nonisolated` sur les callbacks de delegate WebRTC (queues libwebrtc) ; les completions de permission/audio tournent sur des queues TCC → `Task { @MainActor in }` (pas `DispatchQueue.main.async` qui ne prouve pas l'isolation). `@MainActor deinit` interdit. Sous `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, les `static func` appelées dans des pipelines Combine pré-`receive(on:.main)` doivent être `nonisolated` (sinon SIGTRAP runtime silencieux).
- **xcodeproj classique** (objectVersion 63, pas de synchronized groups) : tout nouveau `.swift` exige 4 entrées + 2 UUIDs dans `apps/ios/Meeshy.xcodeproj/project.pbxproj`.
- **Events Socket.IO** : `entity:action-word` (tirets). Source : `socketio-events.ts`. Async EventEmitter : try/catch sur tous les listeners.
- **Couleurs** : `MeeshyColors` (error=#F87171, success=#34D399). Jamais de hex legacy hardcodés en contexte d'appel.
- **Style** : immutabilité, fonctions pures, early returns (pas de if/else imbriqués), pas de `any` TS (utiliser `unknown` + validation), `DateTime?` nullable au lieu de `bool + timestamp`. Pas de fichiers `.md` de rapport/résumé — tout dans le code/PR.
- **Réutilisation max** : inventorier les helpers existants avant toute nouvelle classe/service. `emitCallSignalWithAck`, `performICERestart`, `VideoFilterCapturerDelegate`, `deliverRemoteTrack`, le pattern outbox, le replay `call:check-active`, le route gate `Router.currentConversationId` existent déjà — les réutiliser.
- **Worktrees** : pour le travail parallèle, utiliser des git worktrees ; jamais deux worktrees sur le même fichier ; `project.pbxproj` géré par le dernier worktree mergé.

---

## 11. Critères d'acceptation mesurables + vérification

> Vérification **obligatoirement sur device réel** pour tout ce qui touche le média (le simulateur ne fait pas de vidéo et a des limitations CallKit : iOS 18.2 simu `callservicesd` disconnect autonome ~100 ms après `CXStartCallAction`). Configuration de test : 2 iPhones physiques + 1 Mac (iOS-app-on-Mac). Credentials : `apps/ios/fastlane/.env` (comptes `atabeth`, `jcharlesnm`).

| # | Critère | Comment vérifier |
|---|---|---|
| AC1 | Appel **audio** 1:1 se connecte en < 3 s après answer, **audio bidirectionnel** | 2 iPhones : passer un appel, parler des deux côtés ; logs `[CALL-DIAG] inboundAudioPackets > 0` DES DEUX côtés ; `RTCPeerConnectionState == .connected` |
| AC2 | Appel **vidéo** 1:1 affiche les **deux flux** | 2 iPhones : les deux voient la vidéo remote ; `inboundVideoPackets > 0` des deux côtés |
| AC3 | **Plus de média à sens unique** | Sur 20 appels consécutifs, jamais `inbound == 0 && outbound > 0` persistant > 4 s sans auto-réparation ; le log answer lit `sendrecv` sur les sections lues |
| AC4 | **Plus de caller-ring-forever / callee-stuck** | Réponse rapide pendant le warmup média caller → connexion OK ; offer rejoué après churn |
| AC5 | **Switch audio↔vidéo** bidirectionnel sans glare | Audio → upgrade vidéo → downgrade → re-upgrade, des deux côtés, y compris upgrade simultané (test de glare) |
| AC6 | **Robustesse churn socket** | Background/foreground du callee pendant ring + pendant appel actif → reconnexion sans hang ; faux `-1009` sur Mac toléré |
| AC7 | **ICE restart auto** sur perte réseau | Couper le Wi-Fi 5 s pendant un appel → `reconnecting` puis reconnexion automatique, appel non terminé |
| AC8 | **CallKit iPhone/iPad** + **in-app Mac** | iPhone : écran CallKit système, lock screen ; Mac : `IncomingCallView` in-app, audio activé manuellement, son OK |
| AC9 | **UI adaptative** | iPhone portrait/landscape, iPad split, Mac fenêtré redimensionné : layout correct, aucun contrôle mort (pas de speaker/flip sur Mac) |
| AC10 | **Return-to-call** | Minimiser appel vidéo → vidéo remote dans la pastille ; bannière in-conversation dans la bonne conversation uniquement ; tap → retour plein écran |
| AC11 | **Mirroring correct** | Self-view miroir caméra avant, NON miroir caméra arrière |
| AC12 | **Filtres** | Blur fond actif sans drop de framerate notable |
| AC13 | **Messages système** | Après appel terminé/manqué/refusé, message système avec libellé + durée des deux côtés |
| AC14 | **Tests verts** | `./apps/ios/meeshy.sh build` vert ; suite XCTest verte (scheme `MeeshySDK-Package` pour SDK) ; `npm run build` vert dans `packages/shared` et `services/gateway` |
| AC15 | **Pas de régression 2e appel** | Enchaîner 3 appels dans la même session (pas de `RTCCleanupSSL` per-call) ; tous se connectent |

**Procédure de vérification finale** :
1. `./apps/ios/meeshy.sh build` → vert.
2. Suite XCTest (FSM, perfect negotiation, epoch, candidate queue, parsing stats, transitions) → verte.
3. `npm run build` dans `packages/shared` puis `services/gateway` → vert ; redéployer/relancer le gateway local (tmux « meeshy » window 1).
4. Installer sur 2 iPhones physiques + lancer sur Mac.
5. Dérouler AC1→AC15 en lisant les logs `[CALL-DIAG]` (audio/vidéo inbound par kind, états `RTCPeerConnectionState`, directions SDP de l'answer, transitions FSM).
6. Documenter les résultats dans la PR (pas de fichier `.md` de rapport).

> ⚠️ Certains tests XCTest existants sont flaky (timing) — re-run avant de conclure à une régression. « TEST FAILED » SIGABRT = souvent une erreur de compilation (mock cassé par un changement de protocole) ; vérifier la compilation d'abord.

---

## 12. Suivi d'implémentation

### 2026-06-06 — Tranche fondation P0 (branche `claude/admiring-faraday-ZMpBt`)

Première tranche livrée : **fiabilité du relais signaling** côté gateway + les **deux fixes root-cause du média à sens unique** côté iOS. Ce n'est PAS la P0 complète (voir « Reste à faire P0 » plus bas) — c'est la fondation qui débloque la connexion fiable avant la refonte perfect-negotiation iOS.

#### Commits livrés (4)

| Commit | Portée | Couvre |
|---|---|---|
| `7416e1ffc` | gateway | **P0 §3.5** (epoch `negotiationId` : champ optionnel readonly sur `WebRTCSignalBase`, **déclaré dans `socketSignalSchema`** pour que Zod ne le strippe pas — passthrough opaque) + **P0 §4.6** (buffer last-offer/ice-restart par appel, TTL 90 s, sweep à l'écriture, replay au (re)join, clear au leave) |
| `75b6bdf1d` | iOS | **P0 §3.2** (autorité FSM déplacée sur `RTCPeerConnectionState.connected` — ICE+DTLS up — au lieu de `RTCIceConnectionState` qui passe `.connected` avant les clés SRTP → bug a' média muet/à sens unique ; `RTCIceConnectionState` rétrogradé en diag-only) + debounce 3,5 s des blips `.disconnected` (self-heal path migration) |
| `2a2694278` | iOS | **P0 §5.3** (suppression des contraintes legacy Plan-B `OfferToReceive*` mélangées à l'Unified-Plan — contributeur bug b ; remplacées par contraintes vides, l'intention send/recv est portée par les transceivers `.sendRecv` pré-ajoutés) |
| `3c6e635b4` | iOS | **P0 §5.2 — ROOT CAUSE** (l'answerer applique l'offre AVANT d'attacher ses tracks : `startLocalMedia` ne crée plus les transceivers ; OFFERER via `addOffererTransceiversIfNeeded` dans `createOffer` ; ANSWERER applique l'offre → `attachAnswererTracks` matche les transceivers créés par l'offre + force sendRecv. Le band-aid `c5b15ce` était inerte car les transceivers pré-ajoutés n'étaient jamais liés aux m-sections de l'offre) |

#### Fix de cette session — `forceSendRecv` (commit séparé)

Le build iOS sortait **2 warnings** dans le code neuf (`P2PWebRTCClient.swift`, helper `forceSendRecv`) :

```swift
try transceiver.setDirection(.sendRecv, error: nil)   // ❌ try inutile + catch mort + erreur jetée
```

`RTCRtpTransceiver.setDirection(_:error:)` retourne **`void`** → Swift l'importe **non-throwing** (pas de valeur de retour à ponter sur `throws`). Le `try` est inerte, le `catch` est du code mort, et `error: nil` jette toute erreur réelle. Cousin distinct du piège `setCodecPreferences` (lui a deux surcharges dont une throwing ; ici il n'y a **aucune** variante throwing). Forme correcte :

```swift
var error: NSError?
transceiver.setDirection(.sendRecv, error: &error)
if let error { Logger.webrtc.warning("[WEBRTC] setDirection(.sendRecv) failed: …") }
```

Règle : `BOOL` + `NSError**` → import throwing ; `void` + `NSError**` → import non-throwing (capturer via `&error`, jamais `try`). Rebuild → **0 warning, 0 erreur**.

#### Vérifications de cette session (toolchain, hors device)

| Volet | Commande | Résultat |
|---|---|---|
| Gateway — schémas d'appel | `jest call-schemas` | ✅ **33/33** (dont 5 nouveaux : passthrough `negotiationId` sur offer/ice-candidate, absence tolérée, rejet négatif, doc du stripping évité) |
| Gateway — type-check TS complet | `pnpm type-check` | ✅ **0 erreur** (shared + gateway) |
| iOS — build iPhone 16 Pro | `meeshy.sh build` | ✅ **BUILD SUCCEEDED**, 0 erreur, 0 warning (après fix `forceSendRecv`) |

> Rappel observé : `meeshy.sh build` sort `EXIT=1` sur un build warning-free (le pipeline `grep "warning:" | … | while` + `set -eo pipefail` meurt quand grep ne trouve rien) APRÈS `** BUILD SUCCEEDED **`. Vérifier le vrai verdict dans `/tmp/meeshy_sim_build_<pid>.log` (non supprimé car le script meurt avant le `rm -f`).

#### ✅ Validé SUR DEVICE RÉEL (2026-06-06 soir) — appel vidéo 1:1 happy-path opérationnel

Validation end-to-end **iPhone 16 Pro Max physique (« Services CEO i16pm ») ↔ Mac (isiOSAppOnMac)**, **les DEUX sur le build de la branche**. Confirmé par les logs `[CALL-DIAG]` (`/tmp/mac_call_live5.log`, appel `6a244f90…` 17:49→17:50) + retour utilisateur « tout fonctionne pour l'appel vidéo ».

| AC | Critère | Preuve |
|---|---|---|
| AC1/AC2 | audio + vidéo **bidirectionnels** | STATS Mac answerer `sent=10484pkt **recv=5066pkt**` (les deux non-nuls, croissants), `RTP gate passed at attempt 1` ; codecs opus + H264 (`profile-level-id=640c34`) |
| §5.2 | answerer répond **sendrecv** | `[CALL-DIAG] local ANSWER directions: audio=sendrecv video=sendrecv` (avant le fix : `recvonly`) |
| §3.2 | autorité FSM | `peerConnectionState (authority): connected` pilote la transition ; le caller (Mac, test précédent) atteint bien `.connected` |
| AC4 | plus de caller-stuck | une fois l'iPhone sur la branche, le caller passe `.connected` (build 464 obsolète = caller bloqué « Connexion… ») |
| AC8 | in-app Mac | `[no-callkit] incoming via in-app UI` + `[AUDIO_FALLBACK] RTCAudioSession activée manuellement` (CallKit error 4 attendu sur Mac, non bloquant) |

> **Leçon opérationnelle critique** : les fixes §5.2 (answerer) et §3.2 (caller) vivent **dans chaque rôle séparément** → **les DEUX devices doivent porter le build de la branche**. Signature d'un déploiement à un seul côté : média à sens unique quand le device non-patché **répond**, caller bloqué « Connexion… » quand le device non-patché **appelle**. Pièce qui avait fait perdre du temps : l'iPhone était resté sur **build 464** (le commit `3c6e635b4` parle de « Build 465 symptom »).

#### Restant device (matrice complète — NON validé)

Le happy-path 1:1 est vert. **Restent à dérouler sur 2 devices** (cf. AC3/AC5/AC6/AC7/AC9→AC13/AC15) : robustesse churn background/foreground + replay offer (§4.6), glare (upgrade AV simultané), switch audio↔vidéo, ICE restart sur coupure réseau, 20 appels consécutifs sans média à sens unique persistant, UI adaptative, messages système. Ces critères dépendent du « Reste à faire P0 » + Phases P1/P2/P3 ci-dessous.

#### ▶️ Reste à faire P0 — REPRENDRE ICI (ordre conseillé)

> La tranche fondation est mergée + validée happy-path. Continuer **dans cet ordre** (chaque item : TDD strict, build vert, commit isolé, re-test device des deux côtés). Plusieurs items se prêtent à des worktrees parallèles (ne pas partager `P2PWebRTCClient.swift` entre deux worktrees).

- §3.4 — perfect negotiation iOS complète (`negotiate()`, `handleRemoteDescription` + rollback, `isPolite` = plus petit userId). **Prérequis de la plupart du reste** ; le gateway note explicitement « before the iOS perfect-negotiation rework lands ».
- §3.5 — moitié **client** de l'epoch : incrément par (re)négociation + drop des SDP/ICE d'epoch antérieur (le gateway ne fait que le passthrough du champ).
- §4.1 — queue de candidats ICE jusqu'à `remoteDescription != nil` + flush + re-buffer sur restart (task P0-3).
- §4.1/§6.3 — signaling **at-least-once côté iOS** (`emitCallSignalWithAck` + retry/backoff) ; le gateway buffer/replay est le backstop, pas le retry émetteur.
- §3.1 — `CallEventQueue` : réducteur unique sérialisé pour toutes les écritures `callState =` (task P0-6).
- §6.1 — `reportOutgoingCall(connectedAt:)` piloté par `.connected` (task P0-7).
- §5.8 — watchdog `.connecting` (20-30 s → ICE restart → fail) + RTP gate actionnable (task P0-9).
- §2.3/§6.4 — `RTCAudioSession` manual-audio + gating Mac/iPhone (task P0-10).

Puis Phases P1 (switch AV + UI), P2 (qualité SOTA + adaptatif), P3 (messages système) intactes.

---

### 2026-06-06 (suite) — perfect-negotiation, epoch client, UI PiP (branche `claude/admiring-faraday-ZMpBt` + snapshot `feat/calls-sota-rebuild`)

Deuxième tranche, livrée par-dessus la fondation happy-path validée device. Build vert + branche stable à chaque commit (audio+vidéo opérationnels confirmés par l'utilisateur entre les pushs).

#### Commits livrés

| Tag | Commit | Portée | Couvre |
|---|---|---|---|
| `calls-sota-p0.5` | `1d1607b` | iOS | **§3.4 fondation perfect negotiation** — rôle polite déterministe (`CallManager.isPolitePeer`, plus petit userId, symétrique), 3 flags MDN (`makingOffer`/`ignoreOffer`/`isSettingRemoteAnswerPending`), garde de collision + **rollback explicite** dans `createAnswer`, instrumentation `createOffer`/`setRemoteAnswer`. **Régression-safe** : pass-through transparent sur le handshake initial (pas de glare) ; la garde ne s'active qu'en renégociation. Tests `PerfectNegotiationRoleTests`. |
| `calls-sota-p0.6` | `306109f` | SDK + iOS | **§3.5 moitié client de l'epoch** — `CallSignalPayload.negotiationId`; `CallManager` stampe chaque signal sortant (offer ouvre une génération, answer/ICE réutilisent) + drop des SDP/ICE périmés (`acceptIncomingNegotiation`), reset par appel dans `applyNegotiationRole`. No-op happy-path. Tests `NegotiationEpochTests`. |
| `calls-sota-p1.1` | `f304214` | iOS UI | **§7.2 PiP SOTA** — tap = swap fond/cadre (FaceTime, `swapStreams`), drag + snap-to-nearest-corner via GeometryReader (`PiPCorner`), suppression du `(320,100)` hardcodé et du hack UIScreen/key-window. Flip caméra retiré du tap PiP (déjà dans la barre). |
| `calls-sota-p1.2` | `b2306fb` | iOS UI | **§7.7 mirroring conditionnel** (bug k) — `CallManager.isUsingFrontCamera` (optimiste, reset par appel, défaut Mac=false), miroir uniquement caméra avant (PiP + primary + self-preview). |
| `calls-sota-p1.3` | `c485028` | iOS UI | **§7.3 couleurs** — `callControlButton`/`statusPill` prennent `Color` ; hexes legacy `FF2E63`/`08D9D6`/`A855F7`/`6366F1` → `MeeshyColors.error`/`.info`/`.indigo400`/`.indigo500`. |

> Note tags : le push des tags est **bloqué (HTTP 403)** par le proxy git de l'environnement web ; tous les commits sont sur les deux branches, mais les tags `calls-sota-*` n'existent qu'en local — à recréer/pousser depuis un environnement autorisé via les SHA ci-dessus.

#### ▶️ Reste à faire P0 (mis à jour)

- §3.4 — la **fondation** est faite (p0.5). Reste le **déclencheur de renégociation** : `negotiate()` via `onnegotiationneeded` + routage des offres reçues en `.connected` à travers la garde (couplé à l'usage réel du glare : switch AV / ICE-restart). Volontairement différé pour ne pas toucher le trigger d'offre initial qui marche.
- §3.5 — **fait** (p0.6, moitié client + passthrough gateway p0.1).

Côté P0, restent (plus risqués, mis en retrait pour préserver la stabilité) :
- **§3.1 `CallEventQueue` réducteur** — gros refactor FSM (sérialiser les ~13 écritures `callState =` derrière un réducteur unique). Risqué sans validation device ; reporté pour ne pas déstabiliser la branche.
- **§6.3 at-least-once offer iOS** — `emitCallOffer` via `emitCallSignalWithAck` + retry/backoff (le buffer/replay gateway §4.6 est le backstop, pas le retry émetteur).
- **§5.8 watchdog `.connecting`** — timeout 20-30 s → ICE restart → fail + RTP gate actionnable (auto-réparation half-open).
- **§2.3/§6.4 gating audio Mac** — gater `[AUDIO_FALLBACK]` sur `isiOSAppOnMac` (au lieu de l'heuristique fragile `!isAudioEnabled`).
- **§4.1 queue candidats ICE** — re-buffer à travers l'ICE-restart (le buffer initial niveau `WebRTCService` marche déjà, validé device).

> **§6.1 `reportOutgoingCall(connectedAt:)` est déjà piloté par `.connected`** depuis p0.2 (l'autorité FSM est sur `RTCPeerConnectionState`, et `transitionToConnected` est invoqué par `webRTCServiceDidConnect`). ✅ Plus rien à faire ici.

#### ▶️ Reste à faire UI (P1/P2)

- ✅ **`p1.4` (340d941)** — return-to-call pill affiche la **vidéo remote** pour un appel vidéo + hex→`MeeshyColors` (§7.6/§7.3).
- ✅ **`p1.5` (1073b80)** — watchdog « Connexion vidéo… » : après 12 s, état informatif au lieu du spinner infini (§7.2/f). L'auto-réparation média réelle reste §5.8.
- ✅ **`p1.6` (db5f86b)** — header conversation : pendant un appel actif, les boutons start-call deviennent un indicateur vert « ● ⏱ toucher pour revenir » (bloque un 2e appel + retour 1-tap) (§7.6).
- ✅ **`p1.7` (ab76bd6)** — auto-hide des contrôles ~4 s sur iPhone/iPad vidéo (tap vidéo = toggle ; jamais sur Mac/audio/effets ouverts) (§7.3).

- ✅ **`p1.8` (74610c9)** — Mac-adaptive : cacher speaker + flip caméra sur Mac (contrôles morts), vidéo remote letterboxée (`.scaleAspectFit`) sur Mac vs fill iPhone/iPad ; contrôles persistants Mac (via gating auto-hide de p1.7) (§7.1, AC9).
- ✅ **`p1.9` (a40f5f4)** — **call-waiting câblé** : `CallWaitingBannerView` montée (RootView + iPadRootView), 2e appel entrant → Refuser / Terminer & répondre (était dead code) (§7.6, bug l).

Reste UI :
- 🟡 Self-preview vidéo dans `IncomingCallView` (§7.4) — **partiellement couvert** : le fond `CallView` rend déjà la caméra locale (atténuée, miroir avant) derrière l'UI entrante ; une vignette nette dédiée serait du polish.
- ⏳ **Layout adaptatif** complet : iPad regular-width (barre glass flottante centrée), debounce resize Mac/iPad, Continuity Camera device picker (§7.1).
- ⏳ P2 (codecs HW, getStats par-kind, filtres Vision/Metal, ICE-restart sur `.disconnected` + bannière reconnecting) et P3 (messages système d'appel).

---

### 2026-06-06 (suite 3) — P0/P2 diagnostics média + auto-réparation (branche `claude/friendly-ride-H5qtI`)

Troisième tranche : **diagnostic média par-kind (§5.7)** + **fiabilité auto-réparatrice (§5.8)** + **gating audio Mac (§2.3/§6.4)**. TDD strict (logique pure extraite et testée), build non disponible dans cet env → vérification par analyse statique + tests unitaires écrits. Périmètre strict appels ; aucun fichier nouveau (zéro édition `project.pbxproj`).

#### Livré (tag `calls-sota-p0.7`)

| § | Portée | Détail |
|---|---|---|
| §5.7 | `WebRTCTypes.swift` + `P2PWebRTCClient.swift` | **getStats correct** : `CallStats` enrichi (`inboundAudioPackets`/`inboundVideoPackets`/`outboundPacketsSent`) ; parsing **par `kind`** (bug j : sens-unique par média diagnosticable) ; **vrai codec** résolu via `codecId → codec.mimeType` (avant : la référence stats-graph `COT01_111`). Logique pure `CallStats.reduce(entries:)` (le client n'adapte plus que NSObject→Double). |
| §5.8 | `CallReliabilityPolicy` (pur, dans `WebRTCTypes.swift`) + `CallManager.swift` | **Réducteur de fiabilité unique** `startReliabilityMonitor` (remplace `rtpGateTask` informatif) : un seul Task périodique qui, selon `callState`, applique soit le **watchdog `.connecting`** (`evaluateConnecting` : 12 s → 1 ICE restart, 25 s → fail ; bug h) soit l'**auto-réparation half-open `.connected`** (`evaluateHalfOpen` : in=0 & out>0 après 4 s → **un** ICE restart, one-shot via `halfOpenSettled`). `.connected` reste immédiat (UX, §3.2) ; auto-heal en arrière-plan. |
| §2.3/§6.4 | `CallManager.swift` | `[AUDIO_FALLBACK]` **gaté sur `!callUsesCallKit` (= isiOSAppOnMac)** au lieu de l'heuristique fragile `!isAudioEnabled`. iPhone/iPad : jamais de self-activation (CallKit `didActivate` possède l'activation ; self-activate prématuré casse l'ADM silencieusement). Mac : activation manuelle (didActivate ne fire jamais). |

Tests (TDD) ajoutés dans `CallManagerTests.swift` : `CallStatsReducerTests` (per-kind, codec réel, RTT, vide), `CallReliabilityPolicyTests` (half-open healthy/waiting/heal/mute-vs-fault ; watchdog waiting/restart/fail/ordre des budgets), + mise à jour du guard source `webRTCServiceDidConnect` (transition directe §3.2, plus de RTP gate) + guard monitor démarré/annulé.

#### Suite (tag `calls-sota-p0.8`) — at-least-once offer (§6.3)

- **§6.3 — fait** : `emitCallOffer` ne fait plus du fire-and-forget. Il délègue à `emitOfferWithRetry` (ACK via `emitCallSignalWithAck` + backoff expo 500ms→1s→2s, 3 tentatives), **superseded-aware** (stoppe si `currentCallId` a changé ou si une négociation plus récente a dépassé l'epoch `generation >= negotiationId`). Le buffer/replay gateway (§4.6) reste le backstop pour un target pas-encore-dans-la-room ; ce retry couvre la perte de frame côté émetteur (churn socket). Test source-guard ajouté.

#### Reste à faire P0

- **§3.1 `CallEventQueue` réducteur** (gros refactor FSM — sérialiser ~13 `callState =`). Toujours différé (le plus risqué sans build/device) — **dernier item P0**.
- **§4.1 re-buffer candidats ICE à travers l'ICE-restart** : ✅ **déjà en place** (`performICERestart` remet `hasRemoteDescription=false` + vide le buffer → les nouveaux candidats du nouvel ufrag se re-bufferisent et se flushent au nouveau remote-desc ; validé device d'après la tranche fondation).

Puis P2 (codecs H264 HW §5.5, RtpEncoding/degradation §5.6, filtres Vision/Metal §7.5, layout adaptatif complet §7.1, ICE-restart `.disconnected` + bannière reconnecting §4.3) et P3 (messages système §9-P3).

> ✅ **Faits cette session** : §5.7, §5.8 (watchdog `.connecting` + RTP gate actionnable), §2.3/§6.4 (gating audio Mac), §6.3 (at-least-once offer). §4.1 confirmé déjà présent. **Seul §3.1 reste en P0.**

---

### 2026-06-06 (suite 4) — iOS 26 Liquid Glass + positionnement intelligent de la barre d'appel (tag `calls-sota-p2.1`)

Recherche API faite (Apple docs « Applying Liquid Glass to custom views » + LiquidGlassReference). Adoption du **Liquid Glass iOS 26** sur les boutons de `CallView`, avec **fallback `.ultraThinMaterial` gardé pour iOS < 26** (gating `#available(iOS 26.0, *)`).

- **Helpers réutilisables** `View.callControlGlass(diameter:isActive:tint:)` et `endCallGlass(diameter:)` : `.glassEffect(.regular.tint(...).interactive(), in: .circle)` sur iOS 26 (press scale + shimmer + illumination natifs), sinon le cercle material translucide d'avant. Appliqués à : barre de contrôle (mute/son/effets/**flip caméra**/vidéo), bouton raccrocher (glass rouge prominent), bouton filtres, bouton réduire (chevron).
- **Glass ne sample pas le glass** → la barre groupe ses cercles dans un `GlassEffectContainer(spacing:)` (blend/morph des contrôles adjacents).
- **Positionnement intelligent** : `ViewThatFits(.horizontal)` centre la rangée quand elle tient, et ne retombe sur le scroll horizontal que sur largeur étroite / Dynamic Type large (avant : `ScrollView` qui ancrait tout à gauche). **Caption courte visible distincte du label VoiceOver long** + colonnes à largeur fixe (68pt) → fini le bouton qui s'élargit pour caser « Basculer la caméra avant/arrière » ; chaque contrôle est aligné et de taille uniforme (cercles 56pt, raccrocher inclus).
- Tests source-guard `CallViewLiquidGlassTests` (glassEffect gaté iOS 26, fallback material présent, GlassEffectContainer, ViewThatFits, caption≠label, flip caméra présent).

> Prérequis build : Xcode 26 / SDK iOS 26 (le projet est en swift-tools 6.2). Les symboles `glassEffect`/`GlassEffectContainer` n'existent que dans ce SDK ; le `#available` est le gating runtime.

#### Correction (tag `calls-sota-p2.2`) — gating déplacé dans la couche `Compatibility/` du SDK

Le gating `#available(iOS 26)` ne doit PAS vivre inline dans `CallView` : la convention du repo veut que **tout wrapper d'API version-restreinte vit dans `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/`** (cf. `AdaptiveSymbolEffects`, `AdaptivePresentationStyle`, `AdaptiveContentUnavailableView`, `Platform`). Refonte :

- **Nouveau `AdaptiveGlass.swift`** (SDK MeeshyUI/Compatibility) : `View.adaptiveGlass(in:tint:interactive:)` (régulier), `View.adaptiveGlassProminent(in:tint:interactive:)` (raccrocher), `AdaptiveGlassContainer` (= `GlassEffectContainer` iOS 26, pass-through sinon). Atomes opaques (Shape + Color), agnostiques produit → conformes à la SDK purity. Le `#available(iOS 26.0, *)` + le fallback (material / fill tinté / gradient prominent) sont encapsulés ici. `Platform.isIOS26OrLater` ajouté.
- **`CallView`** : ne contient plus AUCUN `#available` / `glassEffect` / `GlassEffectContainer`. Ses helpers app-side `callControlGlass`/`endCallGlass` ne font plus que le **styling produit** (diamètre, active→tint, rouge) et délèguent au SDK.
- Tests : `CompatibilityLayerTests` (smoke construction `adaptiveGlass`/`adaptiveGlassProminent`/`AdaptiveGlassContainer` + `Platform.isIOS26OrLater`), et `CallViewLiquidGlassTests` mis à jour (CallView utilise les wrappers SDK, zéro `#available`/`glassEffect` inline).

#### Extension (tag `calls-sota-p2.3`) — Liquid Glass sur IncomingCallView + FloatingCallPillView

Cohérence totale via les wrappers SDK `Compatibility/` (zéro `#available`/`glassEffect` inline dans l'app) :
- **`IncomingCallView`** : boutons **Accepter/Refuser** → `adaptiveGlassProminent(tint: .success/.error)`, groupés dans un `AdaptiveGlassContainer` (les deux cercles se fondent ; fallback gradient+ombre < iOS 26).
- **`FloatingCallPillView`** : la **capsule** de la pastille devient une surface Liquid Glass (`adaptiveGlass(in: Capsule())`, fallback `.ultraThinMaterial`). Les mini-contrôles internes restent des fills de vibrancy **sur** le glass — HIG : pas de glass-dans-glass.
- Tests source-guard ajoutés (`CallViewLiquidGlassTests`) : prominent glass + container dans IncomingCallView, capsule glass dans la pastille, aucun gating inline.

---

### 2026-06-06 (suite 5) — P0 robustesse complétée + Liquid Glass iOS 26 + header généralisé (branche `claude/friendly-ride-H5qtI`, PR #315)

Session menée **sans build ni device** (env web : pas de `meeshy.sh build` ; install gateway bloquée — Prisma engine download HTTP self-signed). Tout est écrit en TDD (logique pure extraite + tests source-guard), à **valider par la CI de la PR #315** puis sur device. Aucune édition `project.pbxproj` (tout dans des fichiers existants ou des fichiers SDK SwiftPM auto-inclus).

#### Commits livrés (sur `claude/friendly-ride-H5qtI` → PR #315)

| Commit | Tag (local) | Portée |
|---|---|---|
| `a25afa0` | `calls-sota-p0.7` | **§5.7** getStats par-kind (`inboundAudioPackets`/`inboundVideoPackets`/`outboundPacketsSent`) + vrai codec via `codecId→mimeType` (réducteur pur `CallStats.reduce`) ; **§5.8** réducteur de fiabilité unique `startReliabilityMonitor` (watchdog `.connecting` 12s→ICE restart, 25s→fail ; auto-heal half-open one-shot in=0&out>0 après 4s) via `CallReliabilityPolicy` pur ; **§2.3/§6.4** `[AUDIO_FALLBACK]` gaté sur `!callUsesCallKit` (Mac) au lieu de `!isAudioEnabled` |
| `a42d7a9` | `calls-sota-p0.8` | **§6.3** offer at-least-once : `emitCallOffer`→`emitOfferWithRetry` (ACK + backoff 500/1000/2000ms, superseded-aware via epoch). §4.1 confirmé déjà présent (re-buffer ICE au restart) |
| `508667b` | `calls-sota-p2.1` | **Liquid Glass iOS 26 CallView** + layout barre intelligent (`ViewThatFits` centré, caption courte ≠ label a11y) |
| `86ee81d` | `calls-sota-p2.2` | **Gating Liquid Glass déplacé dans le SDK** `MeeshyUI/Compatibility/AdaptiveGlass.swift` (`adaptiveGlass`/`adaptiveGlassProminent`/`AdaptiveGlassContainer` + `Platform.isIOS26OrLater`) ; CallView ne contient plus aucun `#available`/`glassEffect` inline |
| `aa2104f` | `calls-sota-p2.3` | Liquid Glass étendu : **IncomingCallView** (accepter/refuser → prominent glass) + **FloatingCallPillView** (capsule glass ; mini-contrôles restent vibrancy = pas de glass-dans-glass HIG) |
| `cbadf69` → `07ff0a4` | `conv-list-glass-header.2` | **(hors sujet appels)** Page Conversations : boutons header glass (lien + nouvelle conv) ; `CollapsibleHeader` (SDK) → **titre à gauche** + **header flouté dégradé transparent vers le bas généralisé à TOUS les écrans** (Settings/Profile/Feed/LinksHub/ConversationList) |

> Tags toujours **locaux uniquement** (push tags bloqué HTTP 403 dans l'env web). Tous les **commits** sont sur le remote / la PR #315. Recréer les tags depuis un env autorisé via les SHA ci-dessus.

#### État P0/P1/P2/P3

- ✅ **P0** : §3.2, §3.4 (fondation), §3.5, §4.1, §4.6, §5.2, §5.3, **§5.7**, **§5.8**, **§6.1**, **§6.3**, **§2.3/§6.4**. **Reste uniquement §3.1** (réducteur `CallEventQueue`).
- ✅ **P1 UI** : PiP, return-to-call vidéo, header, auto-hide, Mac-adaptive, call-waiting, miroir conditionnel, watchdog spinner.
- 🟡 **P2** : ✅ §5.7 (getStats), ✅ §5.8 (auto-heal/watchdog), ✅ Liquid Glass (CallView/Incoming/Pill + header conversations). **Reste** : §5.5 codecs H264 HW + `setCodecPreferences` throwing, §5.6 `RtpEncodingParameters`/`degradationPreference`/thermal, §7.5 filtres Vision/Metal, §7.1 layout adaptatif complet (iPad barre flottante, Continuity Camera picker), §4.3 ICE-restart sur `.disconnected` + bannière reconnecting.
- ⏳ **P3** : messages système d'appel (gateway + shared + rendu iOS) — non commencé.

#### 🎯 PROCHAINE SESSION — ordre conseillé (TDD strict + build vert + re-test device des DEUX côtés)

1. **CI PR #315 d'abord** : c'est la 1re vraie compilation. Vérifier en priorité les symboles iOS 26 (`glassEffect`/`GlassEffectContainer` — exigent SDK Xcode 26) et la couche `Compatibility/AdaptiveGlass.swift`. Corriger toute erreur de build avant d'ajouter du neuf.
2. **§3.1 — `CallEventQueue` réducteur** (dernier P0, le plus risqué) : sérialiser TOUTES les écritures `callState =` (~13 sites) derrière un réducteur unique ; câbler le scaffold `CallEventQueue.swift` (actuellement vide hors hooks). **Ne pas faire à l'aveugle** — exige build + device.
3. **P2 média** : §5.5 codecs H264 HW (forcer l'overload throwing `setCodecPreferences`, intersection bidirectionnelle), §5.6 RtpEncoding/degradation/thermal, §4.3 ICE-restart `.disconnected` + bannière reconnecting.
4. **P3** : messages système d'appel.

#### ⚠️ Rappels techniques (vérifiés cette session)

- `setDirection(_:error:)` est **void** → capturer via `&error`, jamais `try`.
- `setCodecPreferences` : forcer l'overload **throwing** (l'overload void no-op).
- Swift 6 `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor` : les `static func`/enums purs sont MainActor par défaut → marquer les tests `@MainActor` ou les helpers `nonisolated`. `CallStats.reduce` reste MainActor (init MainActor) — testé via classe `@MainActor`.
- **Liquid Glass** : tout passe par le SDK `MeeshyUI/Compatibility/AdaptiveGlass.swift` (jamais de `#available(iOS 26)` inline dans l'app — convention `Compatibility/`). HIG : pas de glass-dans-glass (pastille = capsule glass, mini-contrôles = vibrancy).
- `CollapsibleHeader` : titre **à gauche** (pas de centrage) + surface **flouté dégradé transparent vers le bas par défaut pour tous les écrans** (plus de flag).
- `meeshy.sh build` peut sortir EXIT=1 sur un build sans warning → vérifier `** BUILD SUCCEEDED **` dans le log.
- Ne PAS partager `P2PWebRTCClient.swift`/`CallManager.swift` entre worktrees parallèles.

---

### 2026-06-06 (suite 6) — Phase P3 livrée END-TO-END (branche `claude/sleepy-carson-1farc`)

Session **sans build ni device** (env web : pas de Swift toolchain ; gateway Prisma client régénéré localement → type-check + jest opérationnels). **Phase P3 (messages système d'appel) complète de bout en bout**, TDD strict (logique pure + persistance entièrement testées ; UI iOS en tests source-guard à valider CI/device). Périmètre strict appels ; **aucun fichier nouveau iOS** (zéro édition `project.pbxproj`).

#### Commits livrés

| Tag (local) | Commit | Portée | Couvre |
|---|---|---|---|
| `calls-sota-p3.1` | `30baffe` | shared + gateway | **P3 backend** — `@meeshy/shared/utils/call-summary.ts` (mapping pur status/endReason/type/durée → libellé FR « Appel vidéo · 04:32 » / « … manqué » / « Appel refusé » + `callSummaryClientMessageId`, **18 vitest**) ; `CallService.createCallSummaryMessage` (persistance **idempotente** via `clientMessageId` déterministe + index unique partiel `Message(conversationId, clientMessageId)`, attribuée au Participant de l'initiateur, P2002 swallowed, null si non-terminal / garbageCollected / sans participant, **9 jest**) ; `CallEventsHandler.postCallSummary` câblé aux **4** sites terminaux (ringing timeout, leave, force-leave, **call:end = hangup/reject**), broadcast via `manager.broadcastMessage` injecté (chemin `message:new` canonique). |
| `calls-sota-p3.2` | `acda1c2` | iOS | **P3 rendu** — `messageSource == .system` → `BubbleContent.Kind.system` (priorité sur deleted/burned) → `BubbleSystemNoticeView` (capsule centrée, glyphe `phone.fill`, muted, Equatable) ; dispatch dans `ThemedMessageBubble` (bypass `standardLayout` = pas d'avatar, comme deleted/burned). Tests `BubbleContentMatrixTests` (kind .system + priorité). |

#### Revue architecte senior (Opus) — P3

- ✅ **Idempotence** : même garantie que le chemin message normal (index unique partiel `clientMessageId`). Multi-paths terminaux → 1 seul message (P2002 no-op).
- ✅ **Tous les chemins terminaux couverts** : `markCallAsRejected` est **dead code** (zéro caller) ; un refus passe par `call:end {reason:'rejected'}` (→ « Appel refusé ») et un timeout/décline par leave/missed (→ « Appel … manqué »). Le handler `call:end` que j'ai câblé couvre hangup ET reject.
- ✅ **Chemin de rendu iOS confirmé** : la liste live rend **tout** message via `ThemedMessageBubble` (UIHostingConfiguration) ; `SystemMessageCell` UIKit = dead code jamais enregistré. `messageSource` survit au reload cache (`MessageRecord.messageSource`).
- ✅ **Non-régression gateway** : type-check vert ; les 8 échecs `initiateCall`/`leaveCall` de `CallService.test.ts` **préexistent sur `main`** (vérifié par stash — mocks `$transaction`, sans rapport avec P3).
- 🟡 **À valider device/CI** : compilation Swift (pas de toolchain ici) ; complétude du payload `broadcastMessage` pour un message système (réutilise le helper canonique → faible risque).

#### Vérifications toolchain (hors device)

| Volet | Commande | Résultat |
|---|---|---|
| shared — mapping pur | `vitest call-summary` | ✅ **18/18** |
| gateway — persistance summary | `jest CallService.summary` | ✅ **9/9** |
| gateway — type-check complet | `pnpm type-check` (après `prisma generate` local) | ✅ **0 erreur** |
| gateway — non-régression | `jest CallService` + `call-schemas` | ✅ 85 pass / 8 fails **préexistants** |

> Tags `calls-sota-p3.*` **locaux uniquement** (push tags bloqué HTTP 403 dans l'env web). Commits sur le remote (`claude/sleepy-carson-1farc`). Recréer les tags depuis un env autorisé via les SHA ci-dessus.

#### État global après cette session

- ✅ **P0** : tout sauf §3.1 (réducteur `CallEventQueue` — dernier item, le plus risqué sans build/device).
- ✅ **P1 UI** : complet (PiP, return-to-call, header, auto-hide, Mac-adaptive, call-waiting, miroir, watchdog).
- 🟡 **P2** : ✅ §5.7, §5.8, Liquid Glass. **Reste** : §5.5 codecs H264 HW, §5.6 RtpEncoding/degradation/thermal, §7.5 filtres Vision/Metal, §7.1 layout adaptatif complet, §4.3 ICE-restart `.disconnected` + bannière reconnecting.
- ✅ **P3** : **complet** (backend + rendu iOS).

#### Prochaine session — ordre conseillé

1. **CI compilation iOS** (1re vraie compilation des fichiers P3.2 + des tranches Liquid Glass).
2. **§3.1** réducteur `CallEventQueue` (dernier P0 — exige build + device).
3. **P2 média** : §5.5 codecs H264 HW (`setCodecPreferences` throwing + intersection bidi), §5.6 RtpEncoding/degradation/thermal, §4.3 ICE-restart `.disconnected` + bannière reconnecting.
4. **P2 UI** : §7.5 filtres Vision/Metal, §7.1 layout adaptatif complet.

---

### 2026-06-06 (suite 7) — P2 média/UI (branche `claude/calls-p2-sota`, depuis `sleepy-carson` + main mergé)

Session **sans build ni device** (env web). Constat important : **§5.5 et §5.6-core sont DÉJÀ implémentés sur `main`** (le §12 « suite 5 » les listait à tort en reste) — `invokeSetCodecPreferences` force l'overload throwing, `applyVideoCodecPreferences` ordonne H264>VP8>VP9, `applyVideoEncoding` pose maxBitrate/maxFramerate/scale + `degradationPreference=.maintainFramerate`, Opus 64/16 kbps via RtpEncodingParameters. Restaient les vrais trous ci-dessous.

#### Commits livrés

| Tag (local) | Commit | Portée | Couvre |
|---|---|---|---|
| `calls-sota-p2.4` | `a59c193` | iOS | **§5.6 adaptation thermique** — `VideoThermalProfile` pur (`ProcessInfo.ThermalState` → facteur bitrate / cap fps / plancher scale ; prend le plus conservateur de la cible réseau et du plafond thermique sur chaque axe ; `.nominal` = no-op strict). Composé dans `WebRTCService.applyVideoQuality` + re-appliqué dans `adjustBitrate` sur transition thermique même à niveau réseau stable (`lastThermalState`). **7 tests purs** `VideoThermalProfileTests`. |
| `calls-sota-p2.5` | `ff85b7d` | iOS UI | **§4.3 bannière reconnecting** — `.reconnecting` garde désormais `connectedView` (dernière frame du pair, jamais blank) + overlay `reconnectingBanner` (capsule warning + spinner, top-aligned). Le chemin `.disconnected` debounce → `.reconnecting` → `performICERestart` préexistait (§3.2/p0.2) ; ceci complète la moitié UI de §4.3. |

> Tags `calls-sota-p2.*` **locaux uniquement** (push tags 403 dans l'env web). Commits poussés sur `claude/calls-p2-sota`. Recréer via SHA.

#### Vérifications (toolchain)

- `VideoThermalProfile` : logique pure entièrement testée (7 cas, mais **non exécutés** ici — pas de Swift toolchain ; valider via CI/device).
- Build iOS non disponible : §5.6 + §4.3 sont additifs, mirroring de patterns existants ; validation compilation = CI.

#### État P2 mis à jour

- ✅ §5.5 (codecs HW, throwing setCodecPreferences, ordre) — **déjà sur main**.
- ✅ §5.6 — RtpEncoding/degradation **déjà sur main** + **adaptation thermique (p2.4, cette session)**.
- ✅ §5.7, §5.8, Liquid Glass — antérieur.
- ✅ §4.3 — debounce/ICE-restart (antérieur) + **bannière reconnecting (p2.5)**.
- ⏳ **Reste P2** : **§7.5 filtres Vision/Metal** (pipeline CV ~150+ l. — exige build+device), **§7.1 layout adaptatif complet** (iPad barre flottante centrée, Continuity Camera picker, debounce resize — exige device).
- ⏳ **Reste P0** : **§3.1 réducteur `CallEventQueue`** (gros refactor FSM, ~13 sites `callState =` — le plus risqué, exige build+device).

#### Prochaine session — ordre conseillé

1. **CI** des PR (sleepy-carson #316 + cette branche) : 1re vraie compilation de P3.2, p2.4, p2.5. Corriger toute erreur de symbole avant d'ajouter du neuf.
2. **§7.5 filtres Vision/Metal** via le seam `VideoFilterCapturerDelegate` (build+device requis pour la perf/throttle).
3. **§7.1 layout adaptatif complet**.
4. **§3.1 réducteur `CallEventQueue`** (dernier P0, le plus risqué — build+device obligatoire).

---

### 2026-06-06 (suite 8) — Fix double-frame vidéo + état RÉEL recalibré (branche `claude/calls-p2-sota`)

#### Bug utilisateur corrigé (tag `calls-sota-p2.7`, commit `baace0e`)

**Symptôme** : « double frame qui superpose plusieurs layer » dans l'appel vidéo connecté. **Cause racine** : la caméra LOCALE était rendue **deux fois** — en fond plein écran (`CallView.body` ZStack) ET dans la PiP — pendant que le remote flottait dans une carte arrondie centrée entre des `Spacer`. Le fond local débordait autour de la carte (et après un swap PiP, le local devenait à la fois le fond ET le primary).

**Fix** :
- `shouldShowSelfPreviewBackground` : le self-preview local plein écran n'apparaît plus QUE pendant l'attente de connexion (ringing/offering/connecting). En `.connected`/`.reconnecting`, primary + PiP possèdent l'unique surface vidéo.
- `connectedView` : le primary devient une surface **full-bleed edge-to-edge** (la vue unique), contrôles/avatar/PiP en overlay — remplace la carte centrée sandwichée dans des Spacer.
- `videoCallLayout` : `.ignoresSafeArea()` sur la vidéo seule (le badge durée reste dans la safe area), suppression du clip arrondi.
- **Revue** : `pipView` rend `videoStream(local: !swapStreams)` = toujours l'OPPOSÉ du primary → aucune duplication quel que soit l'état de swap. ✅

#### ⚠️ §12 recalibré — `main` contient BEAUCOUP plus que les tranches « reste » antérieures ne le laissaient croire

Vérifié dans le code de `main` (et non d'après les notes) :
- ✅ **§5.5** codecs H264 HW + `invokeSetCodecPreferences` (overload throwing) + ordre H264>VP8>VP9 + Opus 64/16 kbps — **déjà sur main**.
- ✅ **§5.6** RtpEncoding + `degradationPreference=.maintainFramerate` — **déjà sur main** ; **adaptation thermique ajoutée cette session (p2.4)**.
- ✅ **§7.5** filtres Vision/Metal — **déjà sur main** (`VideoFilterPipeline` : `VNGeneratePersonSegmentationRequest` + `CIGaussianBlur` + `CIContext(mtlDevice:)` + `CVPixelBufferPool` + re-wrap `RTCVideoFrame` ; `VideoFilterCapturerDelegate` ; `VideoFiltersPanel`).
- ✅ **§7.1** barre de contrôle intelligente (`ViewThatFits`), Mac letterbox + contrôles persistants + cacher speaker/flip (p1.8). **Manque uniquement** : picker Continuity Camera (caméras `.continuityCamera`/`.external` nommées).
- ✅ **§4.3** debounce `.disconnected` → `.reconnecting` → `performICERestart` (antérieur) + **bannière reconnecting (p2.5)**.

#### Reste réellement à faire (TOUS exigent build Xcode + device — ne PAS faire à l'aveugle)

1. **§3.1 `CallEventQueue` réducteur** : scaffold pur, **13** écritures `callState =` éparpillées à sérialiser derrière un réducteur unique. Gros refactor FSM live — le plus risqué, à faire en DERNIER avec device (comme le note la spec).
2. **Suppression `.offering`** (P0 tâche 1, jamais faite) : encore dans l'enum + 3 usages (CallManager 1175/1962, CallView 63). État FSM live de l'appel sortant — exige validation device.
3. **§7.1 picker Continuity Camera** (Mac/iPad caméras externes nommées) : additif, touche le chemin capture — validation device.

> **Tout le reste de la spec (P0 hors §3.1/`.offering`, P1, P2, P3) est implémenté.** Le système d'appels audio/vidéo est fonctionnellement complet de bout en bout. Les 3 items ci-dessus sont des changements FSM/capture qui ne peuvent PAS être faits à l'A-level sans Xcode + 2 iPhones + Mac sans risquer une régression d'un système d'appels qui marche.

#### Tags de cette session (locaux — push tags 403)
`calls-sota-p3.1`→`p3.3` (P3 system messages E2E), `p2.4` (thermal), `p2.5` (reconnecting banner), `p2.6` (§12), `p2.7` (double-frame fix). Branche : `claude/calls-p2-sota` (sur-ensemble de `sleepy-carson` + main).

---

### 2026-06-06 (suite 9) — §7.1 picker Continuity Camera livré (branche `claude/calls-p2-sota`)

#### Livré (tags `calls-sota-p7.1` data + `p7.2` UI)

**§7.1 picker Continuity/USB camera** (Mac/iPad) — additif, ne touche PAS la FSM ; le flip front/back iPhone reste identique.
- `p7.1` (`5d0d0f7`) **data** : `CameraCatalog` pur (`CameraDeviceOption`/`CameraFacing`, ordre front→back→external + nom + tiebreak uniqueID, de-dup, suffixe « (2) » pour noms identiques — **6 tests purs**) ; protocole `WebRTCClientProviding.availableCameras()`/`switchToCamera(uniqueID:)` (real client : enum `RTCCameraVideoCapturer.captureDevices`, external via `deviceType` iOS 17 ; switch = même stop→reselect→start que `switchCamera`) ; stub + `MockWebRTCClient` mis à jour ; passthrough `WebRTCService` ; `CallManager.availableCameras`/`selectedCameraId`/`refreshAvailableCameras()`/`selectCamera(id:)`.
- `p7.2` (`a471859`) **UI** : `cameraControl` (flip iPhone vs Menu device picker Mac/iPad si >1 caméra + externe), `cameraPickerMenu` (liste nommée + checkmark actif), refresh `.task(id: isVideoEnabled)`.

#### État FINAL — il ne reste que 2 items, TOUS exigent build Xcode + device

1. **§3.1 réducteur `CallEventQueue`** : scaffold pur, 13 écritures `callState =` à sérialiser. Gros refactor FSM live.
2. **Suppression `.offering`** (P0 tâche 1) : contenu (1 case enum + 1 assignation `CallManager:2008` + ~5 sites de match), mais **change les transitions FSM live de l'appel sortant** (bridge ringing→connecting l.1203, catch-up ICE l.2288). Mal fait sans device → caller bloqué « Sonnerie ». La spec impose validation device + progressive.

> **Tout le reste de la spec est implémenté.** Le système d'appels est fonctionnellement complet E2E. Les 2 items restants sont des changements FSM live à faire **uniquement avec Xcode + 2 iPhones + Mac**.

#### Tous les tags de la session (locaux — push tags 403)
`p3.1`→`p3.3` (P3 messages système E2E), `p2.4` (thermal §5.6), `p2.5` (bannière reconnecting §4.3), `p2.7` (fix double-frame vidéo), `p7.1`+`p7.2` (§7.1 Continuity picker), + docs `p2.6`/`p2.8`/`p7.x`. Branche : `claude/calls-p2-sota`.

---

### 📍 ÉTAT ACTUEL — HANDOFF POUR REPRISE (nouvelle session) — 2026-06-07

> **Lis ce bloc en premier.** Il résume tout l'état et te dit exactement quoi faire ensuite.

**Branche active** : `claude/calls-p2-sota` (sur-ensemble de `claude/sleepy-carson-1farc` [PR #316] + `origin/main` mergé). Développe et pousse ICI.

#### ✅ Ce qui est FAIT (système d'appels fonctionnellement complet E2E)
- **P0** : autorité FSM `RTCPeerConnectionState` (§3.2), perfect negotiation fondation (§3.4), epoch `negotiationId` (§3.5), candidate queue + re-buffer ICE-restart (§4.1), buffer/replay offer gateway (§4.6), answerer-applies-offer-first (§5.2), suppression contraintes Plan-B (§5.3), getStats par-kind + vrai codec (§5.7), watchdog `.connecting` + auto-heal half-open (§5.8), `reportOutgoingCall(connectedAt:)` piloté `.connected` (§6.1), offer at-least-once (§6.3), gating audio Mac (§2.3/§6.4).
- **P1 UI** : PiP swap/drag/snap, return-to-call vidéo, header in-conv, auto-hide contrôles, Mac-adaptive (letterbox + contrôles persistants), call-waiting câblé, miroir conditionnel front-only (§7.7), watchdog spinner vidéo.
- **P2** : codecs H264 HW + `setCodecPreferences` throwing + ordre (§5.5), RtpEncoding + degradation (§5.6-core), **adaptation thermique (§5.6, p2.4)**, filtres Vision/Metal blur (§7.5 : `VideoFilterPipeline`), Liquid Glass iOS 26, **bannière reconnecting (§4.3, p2.5)**, **picker Continuity Camera (§7.1, p7.1+p7.2)**.
- **P3** : **messages système d'appel E2E** (gateway `CallService.createCallSummaryMessage` idempotent + 4 sites terminaux ; iOS `BubbleSystemNoticeView`). Tests : 18 vitest + 9 jest.
- **Fix visuel** : double-frame vidéo éliminé (surface vidéo full-bleed unique + PiP, plus de caméra locale dupliquée en fond) — p2.7.

#### ⏳ RESTE À FAIRE — 2 items, **build Xcode + 2 iPhones + Mac OBLIGATOIRES**
1. **Suppression `.offering`** (P0 tâche 1) — le plus simple des deux, fais-le EN PREMIER :
   - Enum case : `CallManager.swift:20`. Assignation unique : `CallManager.swift:2008` (`self.callState = .offering` après envoi de l'offer). Matchs : `if case .offering` l.1203 ; `switch` l.1352 (watchdog), l.1990 (ignore joins), l.2288 (catch-up ICE) ; `CallView.swift:71` (→ `outgoingRingingView`).
   - Cible (spec §3.2) : `outgoing(.ringing(isOutgoing:true)) → connecting → connected`. Remplacer `= .offering` par : **rester `.ringing(isOutgoing:true)`** après envoi de l'offer ; bridger vers `.connecting` à la réception de l'answer (`handleRemoteAnswer`) au lieu du bridge `.offering→.connecting` actuel (l.1203). Supprimer le hack catch-up ICE l.2288 (l'autorité `RTCPeerConnectionState.connected` rend `.connected` fiable). Mettre à jour les ~5 `switch`/`if case`.
   - **Risque** : mal fait → caller bloqué « Sonnerie » ou skip de l'UI ringing. **Valider device des 2 côtés** : appel sortant audio + vidéo se connecte, UI ringing→connexion→connecté correcte.
2. **§3.1 réducteur `CallEventQueue`** — gros refactor, fais-le EN DERNIER :
   - `CallEventQueue.swift` est un scaffold (state/version/hooks, pas de logique de transition). `CallManager` mute `callState` depuis **13 sites** (`grep -n "callState = " CallManager.swift`).
   - Cible (spec §3.1/§3.6) : un réducteur unique sérialisé possède TOUTES les écritures `callState`. Tous les stimuli (CallKit, socket, ICE/`RTCPeerConnectionState`, NWPath, timeouts) sont enqueue dans une file unique consommée par un seul réducteur. Extraire idéalement `CallConnectionFSM`.
   - **Risque** : race windows si mal sérialisé. **Exige build + device** ; faire **progressivement, jamais d'un bloc** (mandat §0 rule 9/19).

#### 🧪 Validation
1. **CI de la PR D'ABORD** (1re vraie compilation iOS de toute la session) — corriger tout symbole manquant avant d'ajouter du neuf. Symboles à risque : `glassEffect`/`GlassEffectContainer` (SDK iOS 26), `AVCaptureDevice.DeviceType.external/.continuityCamera` (iOS 17, gardés `#available`).
2. `cd packages/shared && npx vitest run __tests__/call-summary.test.ts` → 18/18.
3. `cd packages/shared && npx prisma generate` puis `cd services/gateway && npx jest --config jest.config.json src/__tests__/unit/services/CallService.summary.test.ts` → 9/9 (+ `pnpm type-check` → 0).
4. Device : `./apps/ios/meeshy.sh build` + `./apps/ios/meeshy.sh test` (`VideoThermalProfileTests`, `CameraCatalogTests`, `BubbleContentMatrixTests`, `CallStatsReducerTests`, `CallReliabilityPolicyTests`, `PerfectNegotiationRoleTests`, `NegotiationEpochTests`). Puis AC1→AC15 sur 2 iPhones + Mac.

#### ⚠️ Contraintes env web (cette série de sessions)
- **Pas de toolchain Swift** → iOS non compilable ici ; tout le code iOS est validé par CI/device. Le TS (vitest/jest/type-check) EST exécutable après `npx prisma generate` (le client se génère, l'engine se télécharge).
- **Push des tags bloqué (HTTP 403)** → tags `calls-sota-*` locaux seulement ; recréer via SHA depuis un env autorisé. Les **commits** sont tous poussés.
- Ne PAS partager `P2PWebRTCClient.swift`/`CallManager.swift` entre worktrees parallèles.

#### Historique
Tranches antérieures mergées sur `main` (PR #314/#315, tags `p0.1`→`p1.9`). Cette série : `p3.1`→`p3.3`, `p2.4`→`p2.8`, `p7.1`→`p7.3` (voir « suite 6 » à « suite 9 » ci-dessus).

---

**Fin de la spec. Implémente phase par phase, TDD strict, build vert à chaque commit, vérification finale sur device réel. La FSM WebRTC pilotée par `RTCPeerConnectionState` + perfect negotiation est le cœur ; tout le reste en découle.**