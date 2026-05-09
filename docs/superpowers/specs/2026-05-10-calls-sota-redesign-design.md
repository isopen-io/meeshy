# Calls SOTA Redesign — Design v2

> **Statut** : Approved (sections 1-6) — 2026-05-10
> **Supersedes** : `docs/superpowers/specs/2026-03-29-webrtc-p2p-calling-design.md` (archived)
> **Scope** : iOS↔iOS + iOS↔Web + Anonymous users, 1:1 audio/video calls
> **Floor iOS** : 17.0 (déjà la baseline du projet)
> **WebRTC** : `WebRTC.xcframework 141.0` (libwebrtc Google)
> **Stack** : Swift 6 strict, Fastify 5, Prisma 6 + MongoDB

## But du document

Refonte complète, sans trade-offs, du sous-système d'appels audio/vidéo de Meeshy pour :

1. **Résoudre les bugs en production** : ICE qui se ferme sans audio, "Call ended by remote" systématique, races CallKit/AVAudioSession, simulator FigCaptureSourceRemote, SDP munging fragile.
2. **Asseoir une machine d'état autoritative** côté serveur + côté client avec optimistic locking.
3. **Adopter les frameworks iOS bas niveau SOTA** : libwebrtc + CallKit + PushKit + AVFoundation + CoreImage/Metal + Vision + Network.framework + ActivityKit.
4. **Anticiper les technologies à venir** via une architecture extensible : transcription temps réel (WhisperKit + Apple Intelligence), traduction temps réel (NLLB-200 via translator), effets audio/vidéo, E2EE Insertable Streams, SharePlay, Continuity Camera, Vision Pro, Spatial Audio, Live Activities, migration SFU.

---

## Table des matières

- [§1 — Diagnostic et architecture cible](#s1)
- [§1.bis — Extensibilité et technologies à venir](#s1bis)
- [§2 — Machines d'état (server + client + WebRTC)](#s2)
- [§3 — Pipeline audio (RTCAudioSession + voiceChat + Voice Isolation)](#s3)
- [§4 — Pipeline vidéo + filtres (Metal/CIContext + Vision)](#s4)
- [§5 — Protocole signaling (catalog, validation, version locking, Trickle ICE)](#s5)
- [§6 — Recovery, errors, anonymous, cross-platform](#s6)
- [§7 — Amendements (corrections post-review)](#s7)
- [§8 — Plan de migration phasé](#s8)
- [§9 — Checklist de tests E2E](#s9)
- [§10 — ADR (architectural decision records)](#s10)

---

<a id="s1"></a>
## §1 — Diagnostic et architecture cible

### 1.1 Diagnostic des bugs en production

À partir des logs runtime + audit de `P2PWebRTCClient.swift`, `CallManager.swift`, `WebRTCService.swift`, `CallEventsHandler.ts`, `CallService.ts`, `VoIPPushManager.swift` :

| # | Symptôme | Root cause probable | Référence code |
|---|---|---|---|
| **B1** | Aucun `Received SDP answer` ni `remote ICE candidate` ; chaque call termine avec `Call ended by remote` malgré 13+ ICE candidates envoyés | Hypothèses ouvertes à confirmer en runtime : (a) callee timeout sur l'UI CallKit, (b) `pendingRemoteOffer` perdu si state ≠ `.ringing`, (c) `call:initiated` n'atteint pas le callee s'il n'est pas dans `ROOMS.conversation(id)` au moment du call, (d) ICE answer race avec setLocalDescription côté callee | `CallManager.swift:357-385` `handleSignalOffer` |
| **B3** | `audioSession.setActive(true)` forcé AVANT `audioSessionDidActivate` → désynchronisation AVAudioSession ↔ RTCAudioSession ; routes contradictoires (Receiver/Speaker) dans les logs | Workaround simulator qui pollue le path production. Apple SOTA : `audioSessionDidActivate(session)` PUIS `isAudioEnabled = true`, **rien d'autre** dans `provider:didActivate:` | `CallManager.swift:1356-1366` |
| **B4** | `FigCaptureSourceRemote err=-17281 (kCMIOHardwareDeviceUnsupportedFormatError)` sur simulator | iOS Simulator XPC mediaserverd dégradé. `RTCCameraVideoCapturer.captureDevices()` retourne 2 devices fantômes mais `startCapture` fail | `P2PWebRTCClient.swift:177-200` |
| **B5** | SDP munging Opus DTX/RED désactivé en diagnostic, aucune voie alternative non-mungée | Fragile aux upgrades libwebrtc. SOTA : `RTCRtpTransceiver.setCodecPreferences` + `RTCRtpEncodingParameters.dtx = true` | `P2PWebRTCClient.swift:232-238` |

**Bug structurel principal : machine d'état éclatée**

L'état d'un call vit dans 4 endroits non synchrones :

- `CallManager.callState` (`@MainActor`, Swift) — UX layer
- `CallSession.status` (Prisma DB) — server truth
- `RTCPeerConnection.signalingState + iceConnectionState + connectionState` — media layer
- `CXProvider` CallKit (iOS) — system call layer

Aucune réconciliation explicite. Quand l'un dérive (timeout, erreur transitoire, network change), les 3 autres restent bloqués → ghost calls, audio muet, UI figée.

### 1.2 Architecture cible (vue 30 000 pieds)

```
┌──────────────────────── iOS (Swift 6, iOS 17+ floor) ─────────────────────────┐
│                                                                                │
│  ┌─────────────┐   ┌────────────────────────────────────┐  ┌────────────────┐ │
│  │ PushKit VoIP│──▶│  CallManager (@MainActor facade)    │─▶│ CXProvider     │ │
│  │ (BG wake)   │   │  ↓ delegates transitions to        │  │ (CallKit UI)   │ │
│  └─────────────┘   │  ┌──────────────────────────────┐  │  └────────────────┘ │
│  ┌─────────────┐   │  │ actor CallEventQueue         │  │  ┌────────────────┐ │
│  │ Socket.IO   │──▶│  │ ── single FSM, serial ──     │  │─▶│ WebRTCEngine   │ │
│  │ signaling   │   │  │ owns: state, version,        │  │  │ • RTCPeer      │ │
│  └─────────────┘   │  │  pendingRemoteOffer,         │  │  │ • RTCAudioSess │ │
│  ┌─────────────┐   │  │  pendingICECandidates,       │  │  │   manual mode  │ │
│  │ ActivityKit │◀──│  │  recovery counters           │  │  │ • setCodecPref │ │
│  │ (Live Act + │   │  └──────────────────────────────┘  │  │   API          │ │
│  │  Dynamic    │   └──────────────────┬─────────────────┘  └────────────────┘ │
│  │  Island)    │                      │                                       │
│  └─────────────┘            ┌─────────┼─────────┐                              │
│                              │         │         │                              │
│                  ┌───────────▼────┐ ┌─▼──────┐ ┌▼──────────────────┐           │
│                  │AudioEffectChain│ │VFiltersP│ │MediaPipelineHooks │           │
│                  │ singleton +    │ │Metal+CI │ │ extensibility bus │           │
│                  │ plugin proto   │ │+ Vision │ │ (see §1.bis)      │           │
│                  └────────────────┘ └─────────┘ └───────────────────┘           │
│                                                                                │
│  Audio I/O = libwebrtc ADM (VPIO Audio Unit) on AVAudioSession.Mode.voiceChat │
│  → benefits OS-level Voice Isolation / Wide Spectrum / Auto Mic Mode          │
│    (system-controlled via Control Center → Mic Mode, no app API)              │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                        │
                          wss://gate.meeshy.me (Socket.IO)
                                        │
┌──────────────── Gateway (Fastify 5 + Socket.IO 4.8 + Prisma 6) ───────────────┐
│                                                                                │
│  CallEventsHandler ──▶ CallService.transitionCall (FSM + version locking)     │
│                        ── Authoritative server FSM ──                          │
│                        states: initiated/ringing/connecting/active/            │
│                                reconnecting/ended/missed/rejected/             │
│                                canceled/failed                                 │
│                        timeouts (server-enforced):                             │
│                          ringing → missed              60s                     │
│                          connecting → failed           45s                     │
│                          heartbeat lost                30s                     │
│                          reconnecting → failed         60s                     │
│                                                                                │
│                        Optimistic locking via version field (Prisma migration) │
│                        Idempotent transitions (terminal states immuables)      │
│                                                                                │
│  Signal relay: targeted via connectionMap.userId resolution                    │
│  TURN credentials: per-user time-limited HMAC-SHA1 (TURNCredentialService)     │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌──────────────── Web (Next.js, Chrome/Safari) ─────────────────────────────────┐
│  Mêmes events, même FSM logique côté client, RTCPeerConnection (browser native)│
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Principes directeurs SOTA

1. **State machine unique côté client** (`CallEventQueue` actor Swift 6) qui pilote CallKit + WebRTCEngine + UI. Les autres couches sont des **observateurs** ou des **commandes** issues de la queue, jamais des sources d'état.
2. **State machine autoritative côté serveur** avec timeouts hard-coded et **optimistic locking** via champ `version Int @default(1)`. Les clients ne forcent jamais l'état serveur ; ils envoient des intentions.
3. **`@MainActor CallManager` façade** pour SwiftUI binding (pas un actor — incompatibilité `ObservableObject`). Il délègue toute logique d'état à un `actor CallEventQueue` privé, file série.
4. **Pas de SDP munging pour Opus DTX/RED/codec preferences**. Utilisation de `RTCRtpTransceiver.setCodecPreferences` + `RTCRtpEncodingParameters.dtx` (libwebrtc 141 ✓). Seul munging restant : `transport-cc` extension (pas d'API publique).
5. **Audio iOS = libwebrtc ADM (VPIO) + AVAudioSession.Mode.voiceChat**. Voice Isolation, Wide Spectrum, Auto Mic Mode sont OS-level via Control Center ; aucune API à appeler dans l'app pour les activer. **PAS d'AVAudioEngine en parallèle** (conflit avec ADM).
6. **CallKit owns AVAudioSession** strictement : pas de `setActive(true)` préalable. Sur simulator l'audio ne marche pas, on accepte ; on ne corrompt pas le path production avec un workaround.
7. **Vidéo = pipeline `RTCCameraVideoCapturer` + `CIContext(mtlDevice:)` + Vision** (déjà PERF-13/14/15 optimisé). Ajout : `#if targetEnvironment(simulator)` guard pour skip caméra en simu.
8. **Trickle ICE** : ICE candidates buffered côté callee tant que `setRemoteDescription` n'a pas été appelé ; idem côté caller pour ICE restart.
9. **Anonymous calls** : pas de PushKit (pas d'identité APNs persistante). Réception via socket actif uniquement. Initiation OK via session token. Disconnect socket → leaveCall immédiat (pas de grace period 30s).
10. **Pre-warming** : `RTCPeerConnectionFactory` singleton process-wide (déjà fait), `CallAudioEffectsService` singleton process-wide (nouveau), `RTCPeerConnection` warm créée à l'ouverture d'une `ConversationView` (TTL 60s).

### 1.4 Frameworks iOS bas-niveau retenus par version

| Couche | Framework | iOS 16.4 | iOS 17 (floor) | iOS 18 | iOS 26 |
|---|---|:---:|:---:|:---:|:---:|
| Signaling system call | **CallKit** (`CXProvider`, `CXAnswerCallAction`, `CXEndCallAction`) | ✓ | ✓ | ✓ | ✓ |
| Background wake | **PushKit** (`PKPushRegistry .voIP`) | ✓ | ✓ | ✓ | ✓ |
| Live UI lockscreen | **ActivityKit** (Live Activities + Dynamic Island, iOS 16.1+) | ✓ | ✓ | ✓ | ✓ |
| Media engine | **WebRTC.xcframework 141** (libwebrtc Google) | ✓ | ✓ | ✓ | ✓ |
| Audio session | `AVFAudio.AVAudioSession` + `WebRTC.RTCAudioSession` (manual mode) | ✓ | ✓ | ✓ | ✓ |
| Mic mode (Voice Isolation) | OS-level via Control Center, app opt-in via `.voiceChat` mode | ✓ | ✓ | ✓ Auto | ✓ Auto |
| Video capture | `AVFoundation.AVCaptureDevice` via `RTCCameraVideoCapturer` | ✓ | ✓ | ✓ | ✓ |
| Continuity Camera | `AVCaptureDevice.DiscoverySession(deviceTypes: [.external])` | — | ✓ | ✓ | ✓ |
| Video filters GPU | `CoreImage` + `Metal` (`CIContext(mtlDevice:)`) | ✓ | ✓ | ✓ | ✓ |
| Person segmentation | `Vision.VNGeneratePersonSegmentationRequest` | ✓ | ✓ | ✓ | ✓ |
| Face landmarks | `Vision.VNDetectFaceLandmarksRequest` | ✓ | ✓ | ✓ | ✓ |
| Network monitoring | `Network.NWPathMonitor` | ✓ | ✓ | ✓ | ✓ |
| Thermal | `ProcessInfo.thermalState` | ✓ | ✓ | ✓ | ✓ |
| Render | `WebRTC.RTCMTLVideoView` (Metal-backed) | ✓ | ✓ | ✓ | ✓ |
| Concurrency | Swift 6 `actor` + `@MainActor` UI façade | ✓ | ✓ | ✓ | ✓ |
| **Future** : E2EE frame-level | WebRTC Insertable Streams (libwebrtc 141 partial via `RTCFrameEncryptor`) | hook | hook | ✓ | ✓ |
| **Future** : Apple Intelligence | Foundation Models framework (live caption/summary on-device LLM) | — | — | ✓ (dev preview) | ✓ |
| **Future** : Spatial Audio | `PHASE` (Sound Source + Listener) for spatial group calls | ✓ | ✓ | ✓ | ✓ |
| **Future** : visionOS spatial | `GroupActivities` (SharePlay) + `RealityKit` for immersive calls | — | (visionOS 1) | (visionOS 2) | (visionOS 3) |
| **Future** : Push to Talk | `PushToTalk.PTChannelManager` (iOS 16+) | ✓ | ✓ | ✓ | ✓ |

`AVAudioEngine.setVoiceProcessingEnabled` **n'est pas utilisé** : libwebrtc ADM utilise déjà VPIO en interne. Une AVAudioEngine séparée créerait un second I/O unit en conflit.

---

<a id="s1bis"></a>
## §1.bis — Extensibilité et technologies à venir

Chaque couche a un **point d'extension explicite** pour brancher les techs futures sans toucher au coeur.

### 1.bis.1 Bus central `MediaPipelineHook`

```swift
public protocol MediaPipelineHook: Sendable {
    /// Called once per call setup, before peer connection is created.
    /// Hook can modify config: add codecs, data channels, frame encryptor, etc.
    func willConfigure(call: CallContext, config: inout CallMediaConfig) async throws

    /// Called for each local audio frame after AEC/NS/AGC (post-VPIO),
    /// before encoding to Opus. Hook sees clean voice samples.
    func processLocalAudio(_ buffer: CMSampleBuffer, context: CallContext) async

    /// Called for each remote audio frame after Opus decode + jitter buffer,
    /// before audio mixer / playback.
    func processRemoteAudio(_ buffer: CMSampleBuffer, from peer: PeerID, context: CallContext) async

    /// Called for each local video frame BEFORE filters apply.
    func processLocalVideoPreFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called for each local video frame AFTER filters, before encoding.
    func processLocalVideoPostFilter(_ pixelBuffer: CVPixelBuffer, context: CallContext) async

    /// Called when call enters/leaves states. Hooks react: start/stop services.
    func callDidTransition(_ state: CallState, in context: CallContext) async
}
```

`WebRTCEngine` maintient une liste ordonnée de hooks enregistrés via `CallManager.register(hook:)`. Aucun hook obligatoire ; chaque feature s'inscrit sans modifier le core.

### 1.bis.2 Mappage features futures → hooks

| Feature future | Hook utilisé | Service / framework |
|---|---|---|
| **Transcription temps-réel** (live captions) | `processLocalAudio`, `processRemoteAudio` | WhisperKit on-device + fallback `SFSpeechRecognizer` ; Apple Intelligence (iOS 18.1+) pour summarization |
| **Traduction temps-réel** (audio → ASR → MT → TTS) | `processLocalAudio` (ASR) → ZMQ vers `services/translator` (NLLB-200) → datachannel `translation` peer | `services/translator` existant ; nouveau `TranslationOverlayService` |
| **Sous-titres en overlay** | `processRemoteAudio` (ASR) + datachannel `transcription` (déjà spec H7 du doc 2026-03-29) | `CallView` overlay SwiftUI + `LiveCaptionRenderer` |
| **Effets audio** (reverb, EQ, voix changée) | `processLocalAudio` via chaîne `AudioEffectChain.shared` | `MeeshyAudioProcessingModule` + plugins `AudioEffect` |
| **Effets vidéo / AR masks** | `processLocalVideoPreFilter` | RealityKit (`RealityView` iOS 18+) + Vision face landmarks |
| **Background blur / replacement** | déjà dans `VideoFilterPipeline.applyBackgroundBlur` | `VNGeneratePersonSegmentationRequest` |
| **E2EE frame-level** | `willConfigure` installe `RTCFrameEncryptor` + `RTCFrameDecryptor` | libwebrtc Insertable Streams (141 partial) ; clés Signal Protocol |
| **Recording** post-call | `processLocalAudio/Video` + `processRemoteAudio/Video` → `AVAssetWriter` | AVFoundation, fichier chiffré local-only |
| **SharePlay** in-call | `callDidTransition(.connected)` → `GroupSession<MeeshyActivity>` | `GroupActivities` framework |
| **Continuity Camera** | `willConfigure` permet sélection caméra externe | `AVCaptureDevice.DiscoverySession([.external])` |
| **Vision Pro spatial calls** | `WebRTCEngine` injecte `PHASESoundSource` per peer | PHASE + RealityKit ; visionOS-specific build flag |
| **AirPlay 2 routing** | `RTCAudioSession` route change observer | `AVAudioSession.routeChangeNotification` |
| **Live Activity / Dynamic Island** | `callDidTransition(.connected/.ended)` | `ActivityKit` `MeeshyCallActivity` |
| **Apple Intelligence summary** | `callDidTransition(.ended)` agrège transcription → summary | Foundation Models framework iOS 18.1+ |
| **SFU migration** (groupes ≥3) | swap `WebRTCEngine.transport: any MediaTransport` | mediasoup ou LiveKit ; `WebRTCEngine` agnostic |
| **Push to Talk** dans groupes | `callDidTransition` + `PTChannelManager` | `PushToTalk` framework iOS 16+ |

### 1.bis.3 `CallMediaConfig` extensible

```swift
public struct CallMediaConfig: Sendable {
    public var audio: AudioConfig
    public var video: VideoConfig?
    public var dataChannels: [DataChannelConfig]    // hooks add here
    public var frameEncryptor: (any FrameEncrypting)?  // E2EE hook
    public var preferredCodecs: CodecPreferences
    public var transport: any MediaTransport           // P2P (default) | SFU (future)
    public var spatialAudio: SpatialAudioMode = .disabled  // .listenerCentric pour Vision Pro
}
```

Chaque hook reçoit `inout config` dans `willConfigure` et peut ajouter ses propres data channels, codecs, encryption layer. **Le core ignore les features.**

### 1.bis.4 Extension côté gateway

```typescript
interface CallExtensionPoint {
  // Side-channel data exchanged during the call (transcription, translation,
  // AI insights). Forwarded to peers without affecting WebRTC media path.
  forwardSideChannel(callId: string, channel: string, payload: unknown): Promise<void>;

  // Hook on call lifecycle for analytics/billing/AI services.
  onCallStateChanged(call: CallSession, from: CallStatus, to: CallStatus): Promise<void>;
}
```

Permet à `services/translator`, `services/insights` (futur), `services/recording` (futur) de se brancher sans modifier `CallEventsHandler`.

### 1.bis.5 Connexions natives à d'autres tech Meeshy

| Tech existante | Connexion via | Statut |
|---|---|---|
| Translator NLLB-200 (`services/translator`) | `MediaPipelineHook.processLocalAudio` → ZMQ → translator → datachannel `translation` | Hook spec |
| WhisperKit transcription (`apps/ios`) | `processLocalAudio` local + datachannel relay peer | Hook spec |
| Voice Profile / Voice Cloning | post-call ASR → voice profile training data | Hook spec |
| Signal Protocol E2EE | `FrameEncrypting` impl utilise les clés Signal pour Insertable Streams | Architectural seam |
| Conversation accent color (`packages/MeeshySDK/Theme`) | `CallView` adopte `conversation.accentColor` | Direct |
| `CacheCoordinator` (SDK) | `CallSession` cached pour recall history rapide | Direct |
| `MessageStore` (SDK) | post-call : transcription/summary deviennent un `Message.kind = .callSummary` | Hook spec |

---

<a id="s2"></a>
## §2 — Machines d'état (server + client + WebRTC)

### 2.1 Server FSM (gateway, autoritative)

Le gateway est la **source de vérité** de l'état d'un call. Aucune transition côté client ne peut "forcer" le serveur — le client envoie des intentions, le serveur arbitre et broadcast.

```
                           ┌──────────────┐
                           │   <START>    │
                           └──────┬───────┘
                                  │ call:initiate (auth + RL + validation)
                                  ▼
                          ┌───────────────┐
                          │  initiated    │  ── timeout 10s sans participant ──┐
                          │ (créé en DB)  │                                     │
                          └───────┬───────┘                                     │
                                  │ call:join du callee                         │
                                  ▼                                             │
                          ┌───────────────┐                                     │
                          │   ringing     │  ── timeout 60s ────────► missed   │
                          │ (callee in    │                                     │
                          │  the room)    │  ── caller call:leave ── canceled  │
                          └───────┬───────┘  ── callee call:reject ─ rejected  │
                                  │ premier call:signal answer                 │
                                  ▼                                             │
                          ┌───────────────┐                                     │
                          │  connecting   │  ── timeout 45s ──────► failed     │
                          │ (SDP exchanged│     (no ICE connected)              │
                          │  ICE checking)│                                     │
                          └───────┬───────┘                                     │
                                  │ heartbeat ICE-connected confirmé           │
                                  │  (≥1 RTP packet inbound)                   │
                                  ▼                                             │
                          ┌───────────────┐                                     │
                          │    active     │ ◄────────────────────┐              │
                          │ (call running)│                      │              │
                          └───────┬───────┘                      │ ICE restart  │
                                  │                              │ + RTP ok     │
                                  │ heartbeat lost 30s           │              │
                                  ▼                              │              │
                          ┌───────────────┐                      │              │
                          │ reconnecting  │ ─────────────────────┘              │
                          │ (ICE restart) │ ── timeout 60s ──────────► failed  │
                          └───────┬───────┘                                     │
                                  │ leave / end / network gone                  │
                                  ▼                                             ▼
                          ┌───────────────────────────────────────────────────────┐
                          │  TERMINAL STATES (immuable, persistées en DB)         │
                          │  ended | missed | rejected | canceled | failed       │
                          └───────────────────────────────────────────────────────┘
```

**Garanties** :

- `CallSession.status` mis à jour avec **optimistic locking** (`where: { id, version: known }, data: { ..., version: { increment: 1 } }`) → rejette toute mise à jour concurrente. Throw `P2025` → re-fetch + retry une fois.
- Toute transition broadcaste `call:state-changed { callId, status, version, reason? }` à `ROOMS.call(callId)` ET `ROOMS.conversation(conversationId)`.
- États terminaux **jamais** retransitionnent (idempotent).
- Timer côté serveur (Redis ZADD ou cluster-aware setTimeout) pour chaque timeout. Expiration → transition forcée + broadcast.

### 2.2 Client FSM iOS (`actor CallEventQueue`)

```
                            ┌──────────┐
                            │   idle   │ ◄─────────────────────────────────┐
                            └────┬─────┘                                    │
                                 │                                          │ instance
            user tap "Call"      │       VoIP push / call:initiated event  │ recreated
                                 ▼                                          │ post .ended
                  ┌──────────────┴──────────────┐                           │
                  │                             │                           │
            ┌─────▼──────────┐         ┌────────▼──────────┐                │
            │ outgoing.      │         │ incoming.         │                │
            │  initiating    │         │  ringing          │                │
            │ (await ack +   │         │ (CXProvider report│                │
            │  ICE servers)  │         │  + autoJoin room) │                │
            └─────┬──────────┘         └────┬──────┬───────┘                │
   ack ok        │                          │      │                        │
   + WebRTC      │                          │      │ CXAnswerCallAction    │
   configured    │                          │      ▼                        │
                 ▼                          │   ┌─────────────────────┐     │
        ┌────────────────┐                  │   │ incoming.accepting  │     │
        │ outgoing.      │                  │   │ (createAnswer +     │     │
        │  ringing       │                  │   │  emit + setLocal)   │     │
        │ (CallKit ring  │                  │   │  buffers offer if   │     │
        │  + media local │                  │   │  not yet received   │     │
        │  pre-warmed)   │                  │   └────────┬────────────┘     │
        └────────┬───────┘                  │            │                  │
"participant-    │                          │            │                  │
 joined" reçu    │                          │            │                  │
                 ▼                          │            │                  │
        ┌────────────────┐                  │            │                  │
        │ outgoing.      │ ─── (NEW state)  │            │                  │
        │  offering      │                  │            │                  │
        │ (createOffer + │                  │            │                  │
        │  setLocal +    │                  │            │                  │
        │  emit)         │                  │            │                  │
        └────────┬───────┘                  │            │                  │
        answer reçu                         │            │                  │
        + setRemote OK                      │            │                  │
                 │                          │            │                  │
                 └────────────┬─────────────┘            │                  │
                              ▼                          │                  │
                      ┌───────────────┐                  │                  │
                      │  connecting   │ ◄────────────────┘                  │
                      │ (ICE checking)│                                     │
                      └───────┬───────┘                                     │
                              │ iceState ∈ {connected, completed}           │
                              │   AND inboundRtp.packetsReceived ≥ 5        │
                              │   (CRITIQUE — gate against silent calls)    │
                              ▼                                             │
                      ┌───────────────┐                                     │
                      │   connected   │ ◄────┐                              │
                      │ (call active) │      │ ICE restart ok               │
                      │ • heartbeat   │      │ + RTP confirmed              │
                      │   every 10s   │      │                              │
                      └───────┬───────┘      │                              │
                              │              │                              │
              network lost OR │              │                              │
              ICE disconnected│              │                              │
              30s confirmed   │              │                              │
                              ▼              │                              │
                      ┌───────────────┐      │                              │
                      │ reconnecting  │──────┘                              │
                      │ (ICE restart) │                                     │
                      └───────┬───────┘                                     │
                              │ 60s without recovery                        │
                              ▼                                             │
                      ┌─────────────────────────────────────────┐           │
                      │ ended(reason)                           │           │
                      │ • localHangup, remoteHangup,            │           │
                      │   rejected, missed, failed(msg),        │           │
                      │   canceled, networkLost,                │           │
                      │   answeredElsewhere                     │ ──────────┘
                      └─────────────────────────────────────────┘
```

**Garanties** :

- `CallEventQueue` est un `actor` Swift 6 → toutes les transitions passent par sa file série. Plus de races socket / CallKit / WebRTC delegate / network monitor.
- Chaque transition vérifie l'état actuel ET la version reçue du serveur (rejette les out-of-order).
- L'état `ended` est terminal pour cette instance ; `ended → idle` se fait via une instance recréée (pas de force-reset bug).
- CallKit + WebRTCEngine sont **observateurs** : ils réagissent aux transitions via callbacks, ils n'écrivent jamais l'état directement.
- `CallManager` (`@MainActor`) est la façade SwiftUI : expose les `@Published` properties miroir, délègue toutes les commandes à `CallEventQueue`.

### 2.3 Couche WebRTC (mapping observable)

| `signalingState` libwebrtc | CallFSM | Trigger |
|---|---|---|
| `stable` (initial) | `outgoing.initiating` ou `incoming.accepting` start | — |
| `haveLocalOffer` | `outgoing.offering` | après `setLocalDescription(offer)` |
| `haveRemoteOffer` | `incoming.accepting` | après `setRemoteDescription(offer)` |
| `stable` (post-handshake) | `connecting` | après `setRemoteDescription(answer)` ou `setLocalDescription(answer)` |
| `closed` | `ended(*)` | `peerConnection.close()` |

| `iceConnectionState` | CallFSM action |
|---|---|
| `new` / `checking` | (rien, en attente) |
| `connected` / `completed` | check inbound RTP packets ; si ≥5 → `connected` |
| `disconnected` | grace 5s → si encore disconnected → `attemptRecovery(.iceDisconnected)` |
| `failed` | `ended(.connectionLost)` |
| `closed` | terminal (déjà ended) |

**Gate `connecting → connected`** (fix bug "ICE connected but no audio") :

```swift
private func checkConnectionTransition() async {
    guard let pc = peerConnection,
          pc.iceConnectionState == .connected || pc.iceConnectionState == .completed,
          let stats = await pc.statistics() else { return }

    let receivedPackets = stats.statistics.values
        .filter { $0.type == "inbound-rtp" }
        .compactMap { ($0.values["packetsReceived"] as? NSNumber)?.intValue }
        .reduce(0, +)

    // ≥5 packets ≈ 100ms of audio at 50pps Opus
    guard receivedPackets >= 5 else { return }

    await transition(to: .connected)
}
```

Polling 1s pendant 10s après ICE connected ; à 10s sans RTP → `transition(.ended(.failed("media path broken")))`. Voir [§7 amendement P6](#s7) pour upgrade `addStatsObserver`.

### 2.4 Réconciliation Server ↔ Client

```
        Client FSM                  Gateway FSM                Other peer FSM
            │                            │                            │
            │ user tap "Call"            │                            │
            ├─ call:initiate ───────────►│                            │
            │                            ├─ DB: status=initiated v=1  │
            │ ◄────── ack(callId, v1) ───┤                            │
            │ FSM: outgoing.initiating   │                            │
            │                            ├─ broadcast initiated v1 ─►│ FSM: incoming.ringing
            │                            │                            │
            │                            │ ◄─── call:join ────────────┤
            │                            ├─ DB: status=ringing v=2    │
            │ ◄── state-changed v2 ──────┤───── state-changed v2 ────►│
            │ FSM: outgoing.ringing      │                            │ (no change)
            │                            │                            │
            ├─ call:signal {offer} ─────►│ ── relay to peer ─────────►│
            │ FSM: outgoing.offering     │                            │ buffer if not accepted
            │                            │                            │ user tap accept
            │                            │ ◄─ call:signal {answer} ───┤ FSM: incoming.accepting
            │ ◄─── relay to caller ──────┤                            │
            │ setRemote(answer)          ├─ DB: status=connecting v=3 │
            │ FSM: connecting            │                            │ FSM: connecting
            │ ◄── state-changed v3 ──────┤───── state-changed v3 ────►│
            │                            │                            │
            │ iceConnected + RTP ≥5      │                            │ iceConnected + RTP ≥5
            ├─ call:state-confirm ──────►│                            │ idem
            │                            ├─ DB: status=active v=4     │
            │ ◄── state-changed v4 ──────┤───── state-changed v4 ────►│
            │ FSM: connected             │                            │ FSM: connected
```

**Règles** :

- Tout `call:state-changed` reçu avec une version **inférieure ou égale** à la version locale → ignoré.
- Si version supérieure de plus de 1 → `GET /calls/:id` pour resync.
- Sur reconnect socket pendant call actif → emit `call:state-confirm` immédiat.

### 2.5 Timeouts (server-enforced)

| Transition | Timeout | Effet |
|---|---|---|
| `initiated` → pas de `call:join` | 10s | force `missed`, broadcast |
| `ringing` → pas de `call:signal answer` | **60s** (parité FaceTime) | force `missed`, broadcast |
| `connecting` → pas de `state-confirm connected` | 45s | force `failed("ICE timeout")`, broadcast |
| `active` → heartbeat lost (3 missed beats) | **30s** | client transite `reconnecting`, server idem |
| `reconnecting` → toujours pas reconnecté | 60s | force `failed("connection lost")`, broadcast |
| `ended` → cleanup heartbeats / participants | immédiat | DB row reste, mémoire cleared |

**Heartbeat** : pendant `active`, client envoie `call:heartbeat { callId, version, mediaStats }` toutes les **10s**. Voir [§7 amendement P10](#s7) pour ACK timeout 5s.

### 2.6 Cleanup garanti

Server-side, transition vers terminal déclenche **dans cet ordre** :

1. `prisma.callSession.update({ id, status, endedAt, duration, endReason, version: known })`
2. `clearHeartbeats(callId)` (Redis ZREMRANGEBYSCORE)
3. Broadcast `call:ended` à `ROOMS.call(callId)` + `ROOMS.conversation(conversationId)`
4. Force `socket.leave(ROOMS.call(callId))` pour tous les sockets de la room
5. Free TURN credentials (si stockées Redis-side)

Client-side, `CallEventQueue.transition(to: .ended)` déclenche :

1. `webRTCEngine.close()` (peerConnection.close, capturer.stopCapture, audioEffects.reset)
2. `RTCAudioSession.isAudioEnabled = false` (CallKit deactivate suit)
3. `CXEndCallAction` via `CXCallController` (si pas déjà fait par CallKit)
4. UI publishes `callState = .ended(reason)` → bannière 1.5s → instance recréée pour `idle`
5. Cancel network monitor, thermal monitor, heartbeats, duration task
6. `Activity.endActivity(...)` pour le Live Activity

### 2.7 Migration Prisma (version field)

```prisma
model CallSession {
  id            String      @id @default(auto()) @map("_id") @db.ObjectId
  // ... existing fields ...
  version       Int         @default(1)        // NEW
  status        CallStatus  @default(initiated)
  // ...
}
```

Pattern transition côté `CallService` :

```typescript
async transitionCall(
  callId: string,
  newStatus: CallStatus,
  expectedVersion: number,
  endReason?: CallEndReason
): Promise<CallSessionWithParticipants> {
  const current = await this.prisma.callSession.findUnique({ where: { id: callId } });
  if (!current) throw new Error('CALL_NOT_FOUND');
  if (TERMINAL_STATUSES.includes(current.status)) {
    return this.getCallSession(callId);  // idempotent
  }

  try {
    await this.prisma.callSession.update({
      where: { id: callId, version: expectedVersion },  // optimistic lock
      data: {
        status: newStatus,
        version: { increment: 1 },
        ...(TERMINAL_STATUSES.includes(newStatus) ? {
          endedAt: new Date(),
          duration: Math.floor((Date.now() - current.startedAt.getTime()) / 1000),
          endReason,
        } : {}),
        ...(newStatus === 'active' && !current.answeredAt ? { answeredAt: new Date() } : {}),
      },
    });
    return await this.getCallSession(callId);
  } catch (err) {
    if ((err as any).code === 'P2025') {
      const fresh = await this.prisma.callSession.findUnique({ where: { id: callId } });
      throw new VersionConflictError(callId, expectedVersion, fresh?.version ?? -1);
    }
    throw err;
  }
}
```

Le caller catch `VersionConflictError` → re-fetch + retry une seule fois.

---

<a id="s3"></a>
## §3 — Pipeline audio

### 3.1 Lifecycle audio (CallKit owner)

```
                 CXStartCallAction        CXAnswerCallAction
                       │                          │
                       ▼                          ▼
                ┌──────────────────────────────────────┐
                │ CXProvider                           │
                │  • configures AVAudioSession         │
                │  • activates AVAudioSession          │
                │  • respects DND, PSTN, headphones    │
                └────────────────┬─────────────────────┘
                                 │ (callback)
                                 ▼
        ┌────────────────────────────────────────────┐
        │ provider(_, didActivate: AVAudioSession)   │
        │                                            │
        │ RTCAudioSession.shared.audioSessionDid     │
        │   Activate(audioSession)                   │
        │ RTCAudioSession.shared.isAudioEnabled = true│
        │                                            │
        │ ── libwebrtc ADM (VPIO) starts I/O ───────│
        └────────────────────────────────────────────┘

                                 │ (call ends)
                                 ▼
        ┌────────────────────────────────────────────┐
        │ provider(_, didDeactivate: AVAudioSession) │
        │                                            │
        │ RTCAudioSession.shared.isAudioEnabled = false│
        │ RTCAudioSession.shared.audioSessionDid     │
        │   Deactivate(audioSession)                 │
        └────────────────────────────────────────────┘
```

### 3.2 Code corrigé : `provider:didActivate:`

```swift
func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    let rtc = RTCAudioSession.sharedInstance()
    rtc.lockForConfiguration()
    rtc.audioSessionDidActivate(audioSession)
    rtc.isAudioEnabled = true
    rtc.unlockForConfiguration()

    Task { @MainActor [weak self] in
        self?.manager?.audioSessionActivated()
    }
}

func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    let rtc = RTCAudioSession.sharedInstance()
    rtc.lockForConfiguration()
    rtc.isAudioEnabled = false
    rtc.audioSessionDidDeactivate(audioSession)
    rtc.unlockForConfiguration()
}
```

**Pas de `audioSession.setActive(true)` préalable** (B3 fix). Le workaround simulator est retiré.

### 3.3 Configuration session

```swift
final class AudioSessionConfigurator {
    static func configureForCalls() throws {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }

        let configuration = RTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        configuration.mode = AVAudioSession.Mode.voiceChat.rawValue
        configuration.categoryOptions = [
            .allowBluetooth,           // BT HFP (mono SCO) for calls
            .allowBluetoothA2DP,       // BT A2DP outbound only
            .duckOthers                // duck Music/Podcast during call
        ]
        configuration.sampleRate = 48_000     // Opus native, matches WebRTC ADM
        configuration.inputNumberOfChannels = 1
        configuration.outputNumberOfChannels = 1
        // ioBufferDuration NOT set — libwebrtc chooses optimal (see §7 amendement E8)

        try rtc.setConfiguration(configuration, active: false)

        rtc.useManualAudio = true
        rtc.isAudioEnabled = false
    }
}
```

`.voiceChat` mode = clé pour bénéficier de Voice Isolation (iOS 16.4+) / Wide Spectrum / Auto Mic Mode (iOS 18+) **sans aucune API à appeler dans l'app**.

### 3.4 Voice Isolation (OS-level, transparent)

| iOS version | Modes Mic disponibles | Activation |
|---|---|---|
| 15 — 16.3 | Standard, Voice Isolation, Wide Spectrum (apps tierces) | Manuel via Control Center |
| 16.4 — 17.x | + Voice Isolation pour téléphone cellulaire | Manuel |
| 18+ | + **Automatic** (système choisit selon route audio) | Auto Mic Mode |
| 26+ | + Voice Isolation dans apps recording | (futur, hors scope calls) |

Aucun code app à écrire. Le mode `.voiceChat` (§3.3) suffit comme opt-in.

### 3.5 Route changes

```swift
final class AudioRouteMonitor {
    func start(handler: @escaping (RouteChange) -> Void) {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil
        ) { [weak self] note in
            self?.handle(note, handler: handler)
        }
    }

    private func handle(_ note: Notification, handler: (RouteChange) -> Void) {
        guard let reasonRaw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw) else { return }

        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map(\.portType)
        let route = AudioRoute.from(portTypes: outputs)

        switch reason {
        case .newDeviceAvailable:    handler(.newDeviceConnected(route))
        case .oldDeviceUnavailable:  handler(.deviceDisconnected(route))
        case .categoryChange, .override: handler(.routeOverridden(route))
        case .routeConfigurationChange: handler(.configurationChanged(route))
        default: break
        }
    }
}
```

### 3.6 Hold/Unhold workaround (libwebrtc bug connu)

Bug : `useManualAudio = true` + cycle CallKit hold/unhold → VPIO ADM ne redémarre pas → silence permanent.

```swift
func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    if action.isOnHold {
        webRTCEngine.localAudioTrack?.isEnabled = false
        webRTCEngine.localVideoTrack?.isEnabled = false
        action.fulfill()
    } else {
        Task { @MainActor in
            await webRTCEngine.restartAudioADM()
            webRTCEngine.localAudioTrack?.isEnabled = true
            webRTCEngine.localVideoTrack?.isEnabled = isVideoEnabled
            action.fulfill()
        }
    }
}

extension WebRTCEngine {
    func restartAudioADM() async {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        rtc.isAudioEnabled = false
        rtc.unlockForConfiguration()

        try? await Task.sleep(nanoseconds: 100_000_000)  // 100ms VPIO teardown

        rtc.lockForConfiguration()
        rtc.isAudioEnabled = true
        rtc.unlockForConfiguration()
    }
}
```

### 3.7 `AudioEffectChain` singleton (P5 fix)

```swift
public protocol AudioEffect: Sendable {
    var identifier: String { get }
    var isEnabled: Bool { get }
    func process(samples: UnsafeMutableBufferPointer<Int16>, sampleRate: Double, channels: Int)
}

public final class AudioEffectChain: Sendable {
    public static let shared = AudioEffectChain()
    private let lock = OSAllocatedUnfairLock(initialState: [any AudioEffect]())

    public func register(_ effect: any AudioEffect) {
        lock.withLock { $0.append(effect) }
    }

    public func remove(identifier: String) {
        lock.withLock { $0.removeAll { $0.identifier == identifier } }
    }

    public func process(_ samples: UnsafeMutableBufferPointer<Int16>, sampleRate: Double, channels: Int) {
        lock.withLock { effects in
            for effect in effects where effect.isEnabled {
                effect.process(samples: samples, sampleRate: sampleRate, channels: channels)
            }
        }
    }
}
```

### 3.8 Codec preferences API (B5 fix)

```swift
extension P2PWebRTCClient {
    func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        let capabilities = factory.rtpReceiverCapabilities(forKind: .audio)

        let preferred = capabilities.codecs.filter { codec in
            codec.name == "opus" || codec.name == "red"
        }.sorted { lhs, rhs in
            if lhs.name == "opus" && rhs.name == "red" { return true }
            return false
        }
        audioTransceiver.setCodecPreferences(preferred)

        // DTX via RTCRtpEncodingParameters (no SDP munging)
        let params = audioTransceiver.sender.parameters
        for encoding in params.encodings {
            encoding.dtx = true
            encoding.maxBitrateBps = 64_000
            encoding.minBitrateBps = 16_000
        }
        audioTransceiver.sender.parameters = params
    }

    func applyVideoCodecPreferences(videoTransceiver: RTCRtpTransceiver) {
        let capabilities = WebRTCSharedFactory.factory.rtpReceiverCapabilities(forKind: .video)
        let priorityOrder = ["H264", "VP8", "VP9"]
        let preferred = priorityOrder.flatMap { name in
            capabilities.codecs.filter { $0.name == name }
        }
        videoTransceiver.setCodecPreferences(preferred)
    }
}
```

Voir [§7 amendement E9 / E12](#s7) pour usage `addTransceiver` au lieu de `addTrack`.

### 3.9 Bitrate adaptation (qualité monitor)

| Tier | RTT | Loss | Audio bitrate | Video bitrate | Resolution | FPS |
|---|---|---|---|---|---|---|
| excellent | <150ms | <0.5% | 64 kbps | 1500 kbps | 720p | 30 |
| good | <300ms | <2% | 48 kbps | 800 kbps | 540p | 30 |
| fair | <500ms | <5% | 32 kbps | 400 kbps | 360p | 24 |
| poor | <800ms | <10% | 24 kbps | 200 kbps | 270p | 15 |
| critical | else | else | 16 kbps | active=false (audio-only) | — | — |

Polling `RTCStatisticsReport` 1s + médiane glissante 3 échantillons (filtre les spikes). Voir [§7 amendement P8](#s7) pour hysteresis 5s sur changement de tier.

### 3.10 Comfort Noise

Opus a CN intégré quand DTX activé (§3.8). Côté UI :

- Peer mute → datachannel `presence` envoie `{ audioMuted: true }` → CXSetMutedCallAction côté observateur affiche "Muted" overlay.
- Decoder PLC d'Opus génère le CN — pas de code custom.

### 3.11 Hooks futurs (intégration §1.bis)

```swift
extension WebRTCEngine {
    func dispatchLocalAudioToHooks(_ buffer: CMSampleBuffer) async {
        for hook in hooks {
            await hook.processLocalAudio(buffer, context: callContext)
        }
    }

    func dispatchRemoteAudioToHooks(_ buffer: CMSampleBuffer, from peer: PeerID) async {
        for hook in hooks {
            await hook.processRemoteAudio(buffer, from: peer, context: callContext)
        }
    }
}
```

| Hook | Rôle | Backend |
|---|---|---|
| `LiveTranscriptionHook` | ASR temps-réel | WhisperKit on-device, datachannel `transcription` peer |
| `LiveTranslationHook` | ASR → ZMQ → translator → datachannel | services/translator NLLB-200 |
| `MutedTalkerNotificationHook` | Détection voix sur track muted | AVAudioEngine `MutedTalkerDetection` (WWDC23) |
| `VoiceProfileBuilderHook` | Sample audio post-call → voice profile | services/translator/voice-profile |
| `SpatialAudioRendererHook` | Group calls : spatialise chaque peer | PHASE framework `PHASESoundSource` |
| `CallSummaryHook` | Post-call : transcription → summary | iOS 18+ Foundation Models on-device LLM |

### 3.12 Audio metrics

```swift
struct AudioMetrics: Codable, Sendable {
    let opusBitrateBps: Int
    let opusFramesSent: Int
    let inboundPacketsReceived: Int
    let inboundPacketsLost: Int
    let inboundJitterMs: Double
    let roundTripTimeMs: Double
    let micMode: AudioSession.MicMode?    // .standard | .voiceIsolation | .wide | .auto (iOS 18+)
    let audioRoute: AudioRoute            // .receiver | .speaker | .bluetooth | .airpods | .airplay
    let dtxActive: Bool
    let muteState: MuteState
}
```

Émis dans `call:heartbeat.mediaStats` toutes les 10s.

---

<a id="s4"></a>
## §4 — Pipeline vidéo + filtres

### 4.1 Architecture pipeline

```
AVCaptureDevice (front/back/external)
   │ CMSampleBuffer (NV12, 1280x720@30fps)
   ▼
RTCCameraVideoCapturer
   │ delegates to VideoFilterCapturerDelegate
   ▼
┌────────────────────────────────────────────────────────────────────┐
│ VideoFilterPipeline (nonisolated, single CIContext on Metal device)│
│  1. Low-light boost  (CIExposureAdjust + auto sample brightness)   │
│  2. Temperature/Tint (CITemperatureAndTint)                        │
│  3. ColorControls    (brightness, contrast, saturation)            │
│  4. Exposure         (CIExposureAdjust)                            │
│  5. Background blur  (VNPersonSegmentation + CIBlendWithMask)      │
│  6. Skin smoothing   (VNFaceRect + Gaussian + alpha blend)         │
│  Output → per-pipeline CVPixelBufferPool                           │
└─────────────────┬──────────────────────────────────────────────────┘
                  │
                  ▼
RTCVideoSource.adapter capturer → libwebrtc encoder (H.264 HW VideoToolbox / VP8 SW)
                  │
                  ▼
RTCRtpSender → DTLS-SRTP → network

(Local preview branch — same CVPixelBuffer):
                  │
                  ▼
RTCMTLVideoView (Metal-backed local preview)
```

### 4.2 Format selection

```swift
private func selectFormat(for device: AVCaptureDevice) -> AVCaptureDevice.Format? {
    let target: Float64 = 30
    let supports30fps: (AVCaptureDevice.Format) -> Bool = { format in
        format.videoSupportedFrameRateRanges.contains {
            $0.minFrameRate <= target && target <= $0.maxFrameRate
        }
    }

    let valid = RTCCameraVideoCapturer.supportedFormats(for: device)
        .filter { format in
            let dim = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            // Reject slow-motion (default front-facing 720p slow-mo is 720p@240)
            guard let firstRange = format.videoSupportedFrameRateRanges.first,
                  firstRange.minFrameRate <= 60 else { return false }
            return dim.width <= 1280 && dim.height <= 720 && supports30fps(format)
        }

    let preferred = valid.first { format in
        let dim = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        return dim.width == 1280 && dim.height == 720
    }
    return preferred ?? valid.last
}
```

**Cap 30fps** strict. 60fps double bitrate + power pour gain négligeable sur 720p.

### 4.3 Pipeline order (invariants)

- Color grading AVANT segmentation (mask cohérente avec colorimétrie)
- Segmentation AVANT skin smoothing (smoothing utilise face rect)
- Tout AVANT render (un seul `context.render(image, to:)` final)

### 4.4 Color grading

```swift
private func applyColorControls(to image: CIImage) -> CIImage {
    guard config.brightness != 0 || config.contrast != 1.0 || config.saturation != 1.0 else {
        return image
    }
    let filter = CIFilter.colorControls()
    filter.inputImage = image
    filter.brightness = config.brightness
    filter.contrast = config.contrast
    filter.saturation = config.saturation
    return filter.outputImage ?? image
}
```

**Presets** : `natural`, `warm`, `cool`, `vivid`, `muted`, `cinematic` (FaceTime cinematic mimick), `studio` (pro look pour business calls).

### 4.5 Background blur / replacement

```swift
private func applyBackgroundBlur(to image: CIImage, pixelBuffer: CVPixelBuffer) -> CIImage {
    guard let mask = personSegmentationMask(for: pixelBuffer) else { return image }
    let blurred = image.applyingFilter("CIGaussianBlur", parameters: [
        kCIInputRadiusKey: config.backgroundBlurRadius
    ]).cropped(to: image.extent)
    return foreground(image, blurred: blurred, mask: mask)
}

private func applyVirtualBackground(_ background: CIImage, to image: CIImage,
                                     pixelBuffer: CVPixelBuffer) -> CIImage {
    guard let mask = personSegmentationMask(for: pixelBuffer) else { return image }
    let scaledBackground = background.transformed(by: image.extent.fitTransform(to: background.extent))
    return foreground(image, blurred: scaledBackground, mask: mask)
}
```

`VNGeneratePersonSegmentationRequest.qualityLevel = .balanced` — meilleur trade-off vs `.accurate` (4× plus cher).

### 4.6 Skin smoothing

Voir [§7 amendement E10](#s7) pour la sémantique correcte de `CIBlendWithMask` (foreground = original, background = smoothed, mask = peau face).

### 4.7 Auto-degradation (thermal + frame budget)

```swift
private static var deviceFrameBudgetMs: Double {
    let device = MTLCreateSystemDefaultDevice()
    if device?.supportsFamily(.apple9) == true { return 16.0 }   // A17 Pro+ (60fps headroom)
    if device?.supportsFamily(.apple7) == true { return 22.0 }   // A14-A16
    return 28.0                                                   // A12-A13
}

func updateAutoDegradation(elapsedMs: Double) {
    let budget = Self.deviceFrameBudgetMs
    if elapsedMs > budget {
        consecutiveOverBudgetFrames += 1
        consecutiveUnderBudgetFrames = 0
        if consecutiveOverBudgetFrames >= 10 {
            isAutoDegraded = true  // disable blur first, then smoothing
        }
    } else if elapsedMs < (budget * 0.6) {
        consecutiveUnderBudgetFrames += 1
        consecutiveOverBudgetFrames = 0
        if consecutiveUnderBudgetFrames >= 30 {
            isAutoDegraded = false
        }
    }
}
```

`ThermalStateMonitor` → critical désactive tous filters (déjà en place).

### 4.8 Simulator guard (B4 / E7 fix)

```swift
func startLocalMedia(type: CallMediaType) async throws {
    // ... audio always allowed ...
    guard type == .audioVideo else { return }

    #if targetEnvironment(simulator)
    Logger.webrtc.warning("Simulator: video unsupported — audio-only")
    throw WebRTCError.simulatorVideoUnsupported
    #endif

    // ... real device video setup ...
}
```

`CallManager` catch `simulatorVideoUnsupported` et continue en audio + UI badge "Audio (Simulator)" en build Debug.

### 4.9 Continuity Camera (iOS 17+)

Voir [§7 amendement E11](#s7) pour la signature correcte (`.external` au lieu de `.continuityCamera`).

```swift
func availableCameras() -> [AVCaptureDevice] {
    let session = AVCaptureDevice.DiscoverySession(
        deviceTypes: [
            .builtInWideAngleCamera,
            .builtInUltraWideCamera,
            .external                  // iOS 17+ : inclut Continuity Camera
        ],
        mediaType: .video,
        position: .unspecified
    )
    return session.devices
}
```

### 4.10 Render layer

```swift
struct WebRTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.videoContentMode = .scaleAspectFill
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        if context.coordinator.attachedTrackId != track?.trackId {
            context.coordinator.attachedTrack?.remove(uiView)
            track?.add(uiView)
            context.coordinator.attachedTrack = track
            context.coordinator.attachedTrackId = track?.trackId
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.attachedTrack?.remove(uiView)
    }
}
```

Zero-copy : H.264 → VideoToolbox HW → Metal texture → render.

### 4.11 Resolution / FPS adaptation

```swift
extension WebRTCEngine {
    func adaptVideoBitrate(stats: MediaMetrics) {
        guard let videoSender = videoSender else { return }
        let params = videoSender.parameters
        for encoding in params.encodings {
            switch QualityTier.from(rtt: stats.roundTripTimeMs, loss: stats.packetsLossRatio) {
            case .excellent:
                encoding.maxBitrateBps = 1_500_000
                encoding.scaleResolutionDownBy = 1.0
                encoding.maxFramerate = 30
                encoding.active = true
            case .good:
                encoding.maxBitrateBps = 800_000
                encoding.scaleResolutionDownBy = 1.33
                encoding.maxFramerate = 30
                encoding.active = true
            case .fair:
                encoding.maxBitrateBps = 400_000
                encoding.scaleResolutionDownBy = 2.0
                encoding.maxFramerate = 24
                encoding.active = true
            case .poor:
                encoding.maxBitrateBps = 200_000
                encoding.scaleResolutionDownBy = 2.66
                encoding.maxFramerate = 15
                encoding.active = true
            case .critical:
                encoding.active = false  // pause sending
            }
        }
        videoSender.parameters = params
    }
}
```

Voir [§7 amendement P8](#s7) pour hysteresis 5s sur changement de scaleResolutionDownBy.

### 4.12 Picture-in-Picture

```swift
final class CallPiPController: NSObject, AVPictureInPictureControllerDelegate {
    private let displayLayer = AVSampleBufferDisplayLayer()
    private let pipController: AVPictureInPictureController

    init(remoteTrack: RTCVideoTrack) {
        let contentSource = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        pipController = AVPictureInPictureController(contentSource: contentSource)
        super.init()
        pipController.delegate = self
        remoteTrack.add(VideoTrackToSampleBufferAdapter(layer: displayLayer))
    }

    func startPiP() {
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        pipController.startPictureInPicture()
    }
}
```

`Info.plist` `UIBackgroundModes` : `audio`, `voip`, `picture-in-picture`.

### 4.13 Hooks futurs

| Hook | Rôle | Framework |
|---|---|---|
| `ARMaskHook` | Overlay AR (lunettes, masks) | RealityKit `RealityView` (iOS 18+) + Vision face landmarks |
| `VirtualBackgroundHook` | Background image utilisateur | `applyVirtualBackground` + Photos picker |
| `LiveCaptionRenderHook` | Stamp ASR sur frame local | Core Text + CIImage compositing |
| `GestureRecognitionHook` | Détection gestes (thumbs up → emoji) | `VNDetectHandPoseRequest` |
| `ScreenSharePresenterHook` | Capture écran partagé | ReplayKit `RPScreenRecorder` |
| `SpatialVisionProHook` | Stéréoscopie Vision Pro | RealityKit + visionOS Spatial Video |
| `CallSummaryThumbnailHook` | Snapshot mid-call → résumé | `context.render(_, to:)` → JPEG |

### 4.14 Video metrics

```swift
struct VideoMetrics: Codable, Sendable {
    let outputResolution: CGSize
    let encodedResolution: CGSize
    let outputFrameRate: Int
    let encodedFrameRate: Int
    let codec: VideoCodec
    let codecImpl: CodecImplementation    // hardware | software
    let outboundBitrateBps: Int
    let inboundBitrateBps: Int
    let inboundPacketsLost: Int
    let qualityLimit: QualityLimitReason  // .none | .cpu | .bandwidth | .other
    let filterPipelineMs: Double
    let isAutoDegraded: Bool
    let activeFilters: [FilterID]
    let cameraDevice: String              // "front" | "back" | "ultraWide" | "external"
}
```

---

<a id="s5"></a>
## §5 — Protocole signaling

### 5.1 Event catalog

#### Client → Server (avec ACK obligatoire)

| Event | Payload | ACK | Description |
|---|---|---|---|
| `call:initiate` | `{ conversationId, type: "audio"\|"video", settings? }` | `{ success, callId, version, iceServers }` | Crée la session DB |
| `call:join` | `{ callId, settings? }` | `{ success, callSession, iceServers }` | Le callee rejoint |
| `call:leave` | `{ callId }` | `{ success }` | Quitte le call |
| `call:reject` | `{ callId, reason: "declined" }` | `{ success }` | Refus explicite avant join |
| `call:signal` | `{ callId, signal: SDP\|ICE\|Custom }` | `{ success, version }` | Forward signaling |
| `call:heartbeat` | `{ callId, version, mediaStats }` | `{ success, serverTimestamp }` | Keepalive + analytics |
| `call:state-confirm` | `{ callId, version, clientState }` | `CallStateConfirmAck` | Réconciliation après reconnexion |
| `call:toggle-audio` | `{ callId, isAudioEnabled }` | `{ success }` | Mute/unmute |
| `call:toggle-video` | `{ callId, isVideoEnabled }` | `{ success }` | Caméra on/off |
| `call:transcription-segment` | `{ callId, language, text, isFinal, startMs, endMs }` | `{ success }` | Live ASR (datachannel ou socket) |
| `call:translation-request` | `{ callId, sourceText, sourceLang, targetLang }` | `{ success, jobId }` | Traduction live (futur) |

#### Server → Client (broadcasts)

| Event | Payload | Cible | Description |
|---|---|---|---|
| `call:initiated` | `{ callId, version, initiator, type, iceServers, ringingTimeoutMs }` | `ROOMS.user(targetUserId)` ou `ROOMS.conversation(id)` | Notif ringing au callee |
| `call:state-changed` | `{ callId, version, status, transitionReason?, endReason? }` | `ROOMS.call(callId)` + `ROOMS.conversation(id)` | Transition serveur autoritative |
| `call:participant-joined` | `{ callId, version, participant, iceServers }` | `ROOMS.call(callId)` | Trigger pour caller de créer offer |
| `call:participant-left` | `{ callId, version, participantId, reason }` | `ROOMS.call(callId)` | Peer parti |
| `call:signal` | `{ callId, signal, from, to }` | Targeted via socketId | SDP/ICE forward |
| `call:answered-elsewhere` | `{ callId, answeredOn: { socketId, deviceType } }` | Multi-device sockets du même user | Dismiss CallKit sur autres devices |
| `call:ended` | `{ callId, version, duration, endedBy?, reason }` | `ROOMS.call(callId)` + `ROOMS.conversation(id)` | Call terminé |
| `call:media-toggled` | `{ callId, participantId, mediaType, enabled }` | `ROOMS.call(callId)` | Peer mute/unmute |
| `call:transcription-segment` | idem client→server forwarded | `ROOMS.call(callId)` peer cible | ASR relay |
| `call:translation-result` | `{ callId, jobId, translatedText, targetLang }` | `ROOMS.call(callId)` | Traduction prête (futur) |
| `call:quality-warning` | `{ callId, peerId, level: "fair"\|"poor"\|"critical" }` | `ROOMS.call(callId)` peer | Qualité dégradée |
| `call:error` | `{ code, message, details? }` | Émetteur (socket.emit) | Erreur signaling |

### 5.2 `Signal` discriminated union (Zod)

```typescript
const sdpSignalSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(50).max(20_000),
  from: z.string().regex(/^[a-f0-9]{24}$/),
  to: z.string().regex(/^[a-f0-9]{24}$/),
});

const iceCandidateSignalSchema = z.object({
  type: z.literal('ice-candidate'),
  candidate: z.string().min(0).max(2_000),  // empty = end-of-candidates
  sdpMid: z.string().max(16).optional(),
  sdpMLineIndex: z.number().int().min(0).max(8).optional(),
  from: z.string(),
  to: z.string(),
});

const customSignalSchema = z.object({
  type: z.enum(['heartbeat', 'screen-capture-detected', 'backgrounded', 'foregrounded']),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  from: z.string(),
  to: z.string(),
});

export const socketSignalSchema = z.object({
  callId: z.string().regex(/^[a-f0-9]{24}$/),
  signal: z.discriminatedUnion('type', [sdpSignalSchema, iceCandidateSignalSchema, customSignalSchema]),
});
```

### 5.3 Room organization

```typescript
ROOMS.conversation(id)   // membres, reçoit `call:initiated` direct
ROOMS.call(id)           // sockets du call actif uniquement
ROOMS.user(id)           // multi-device sockets d'un user (push direct)
```

### 5.4 ACK contracts

Toutes les requêtes client → server ont un ACK avec timeout côté client :

| Event | Timeout client | Comportement sur timeout |
|---|---|---|
| `call:initiate` | 5s | retry 1× puis abort |
| `call:join` | 5s | abort |
| `call:signal` | 3s | log warn, no retry |
| `call:heartbeat` | **5s** (P10 fix) | 3 missed → assume socket cassé → reconnect |
| `call:state-confirm` | 5s | end call si fail |

### 5.5 Validation côté gateway

```typescript
socket.on(CALL_EVENTS.SIGNAL, async (data, ack) => {
  // 1. Auth
  const userId = getUserId(socket.id);
  if (!userId) return socket.emit(CALL_EVENTS.ERROR, { code: 'NOT_AUTHENTICATED', ... });

  // 2. Rate limit
  if (!await checkSocketRateLimit(socket, userId, SOCKET_RATE_LIMITS.CALL_SIGNAL, ...)) return;

  // 3. Schema validation
  const validation = validateSocketEvent(socketSignalSchema, data);
  if (!validation.success) return socket.emit(CALL_EVENTS.ERROR, { code: 'INVALID_SIGNAL', ... });

  // 4. Sender must be participant + signal.from must match userId
  const callSession = await this.callService.getCallSession(data.callId);
  const senderParticipant = findActiveParticipant(callSession, userId);
  if (!senderParticipant) return socket.emit(CALL_EVENTS.ERROR, { code: 'NOT_A_PARTICIPANT', ... });
  if (data.signal.from !== userId) return socket.emit(CALL_EVENTS.ERROR, { code: 'SIGNAL_SENDER_MISMATCH', ... });

  // 5. Target must exist
  const targetParticipant = findActiveParticipant(callSession, data.signal.to);
  if (!targetParticipant) return socket.emit(CALL_EVENTS.ERROR, { code: 'TARGET_NOT_FOUND', ... });

  // 6. Resolve target's socket(s) via connectionMap (NOT RemoteSocket.userId)
  const targetSocketIds = await this.resolveTargetSockets(io, data.callId, data.signal.to, getUserId);
  if (targetSocketIds.length === 0) return ack?.({ success: false, code: 'TARGET_OFFLINE' });

  // 7. Forward (multi-device fan-out)
  for (const targetSocketId of targetSocketIds) {
    io.to(targetSocketId).emit(CALL_EVENTS.SIGNAL, data);
  }

  // 8. State transition on first 'answer'
  if (data.signal.type === 'answer') {
    const updated = await this.callService.transitionCall(data.callId, 'connecting', callSession.version);
    io.to(ROOMS.call(data.callId)).emit(CALL_EVENTS.STATE_CHANGED, { ..., version: updated.version });
  }

  ack?.({ success: true, version: callSession.version });
});
```

### 5.6 Targeted signal forwarding (durci)

```typescript
private async resolveTargetSockets(
  io: Server,
  callId: string,
  targetUserId: string,
  getUserId: (socketId: string) => string | undefined
): Promise<string[]> {
  // CRITIQUE: Socket.IO RemoteSocket proxies don't expose custom server-side
  // properties like socket.userId. We MUST resolve via the in-memory
  // connectionMap (socketId → userId).
  const socketsInRoom = await io.in(ROOMS.call(callId)).fetchSockets();
  return socketsInRoom
    .map(s => ({ id: s.id, userId: getUserId(s.id) }))
    .filter(({ userId }) => userId === targetUserId)
    .map(({ id }) => id);
}
```

### 5.7 TURN ephemeral credentials

```typescript
generateCredentials(userId: string, ttlSeconds = 3600): IceServer[] {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const hmac = crypto.createHmac('sha1', this.config.sharedSecret)
                     .update(username)
                     .digest('base64');

  return [
    { urls: ['stun:turn.meeshy.me:3478'] },
    {
      urls: [
        'turn:turn.meeshy.me:3478?transport=udp',
        'turn:turn.meeshy.me:3478?transport=tcp',
        'turns:turn.meeshy.me:5349?transport=tcp',  // TLS fallback
      ],
      username,
      credential: hmac,
    },
  ];
}
```

TTL = 1h. Pour calls > 1h, client peut demander refresh via `call:refresh-ice` (optionnel).

### 5.8 Trickle ICE + buffering

```swift
private var pendingRemoteCandidates: [IceCandidate] = []
private var hasRemoteDescription = false

func setRemoteDescription(_ sdp: SessionDescription) async throws {
    try await peerConnection.setRemoteDescription(sdp)
    hasRemoteDescription = true
    let drained = pendingRemoteCandidates
    pendingRemoteCandidates.removeAll()
    for candidate in drained {
        try? await peerConnection.add(candidate.toRTC())
    }
}

func addRemoteIceCandidate(_ candidate: IceCandidate) async {
    if !hasRemoteDescription {
        pendingRemoteCandidates.append(candidate)
        return
    }
    do {
        try await peerConnection.add(candidate.toRTC())
    } catch {
        Logger.webrtc.error("Failed to add ICE candidate: \(error)")
    }
}

func performICERestart() async throws -> SessionDescription {
    hasRemoteDescription = false
    pendingRemoteCandidates.removeAll()
    let constraints = RTCMediaConstraints(mandatoryConstraints: ["IceRestart": "true"], optionalConstraints: nil)
    let offer = try await peerConnection.offer(for: constraints)
    try await peerConnection.setLocalDescription(offer)
    return offer.toSessionDescription()
}
```

End-of-candidates : libwebrtc émet candidate `""` quand gathering complete. Le gateway le forward, le peer destination passe ICE en `completed`.

### 5.9 Rate limiting

```typescript
export const SOCKET_RATE_LIMITS = {
  CALL_INITIATE:     { points: 5,   duration: 60 },
  CALL_JOIN:         { points: 20,  duration: 60 },
  CALL_LEAVE:        { points: 30,  duration: 60 },
  CALL_SIGNAL:       { points: 200, duration: 10 },
  CALL_HEARTBEAT:    { points: 30,  duration: 60 },
  CALL_TOGGLE_AUDIO: { points: 30,  duration: 60 },
  CALL_TOGGLE_VIDEO: { points: 30,  duration: 60 },
};
```

Backed by Redis cluster-aware via `services/gateway/src/utils/socket-rate-limiter.ts`.

### 5.10 Connection lifecycle (socket disconnect pendant call)

```typescript
socket.on('disconnect', async (reason) => {
  const userId = getUserId(socket.id);
  if (!userId) return;

  const activeCalls = await prisma.callSession.findMany({
    where: {
      status: { in: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'] },
      participants: { some: { participant: { userId }, leftAt: null } },
    },
  });

  const userInfo = getUserInfo(socket.id);

  for (const call of activeCalls) {
    // Anonymous: leave immediately (no grace)
    if (userInfo?.isAnonymous) {
      await this.callService.leaveCall({ callId: call.id, userId, ... });
      io.to(ROOMS.call(call.id)).emit(CALL_EVENTS.PARTICIPANT_LEFT, { ... });
      continue;
    }

    // Registered: check multi-device
    const otherSocketsForUser = await this.resolveTargetSockets(io, call.id, userId, getUserId);
    if (otherSocketsForUser.filter(id => id !== socket.id).length > 0) continue;

    // Grace 30s for reconnect
    setTimeout(async () => {
      const stillDisconnected = (await this.resolveTargetSockets(io, call.id, userId, getUserId)).length === 0;
      if (stillDisconnected) {
        await this.callService.leaveCall({ callId: call.id, userId, ... });
        io.to(ROOMS.call(call.id)).emit(CALL_EVENTS.PARTICIPANT_LEFT, { ... });
      }
    }, 30_000);
  }
});
```

### 5.11 State resync (`call:state-confirm`)

```swift
private func resyncCallState() async {
    guard let callId = currentCallId else { return }

    do {
        let ack = try await MessageSocketManager.shared.emitCallStateConfirm(
            callId: callId,
            version: localVersion,
            clientState: callState.toCanonical()
        )

        if ack.authoritativeStatus != callState.toCanonical() {
            await applyServerState(ack)
        } else if ack.version > localVersion {
            await fetchCallSessionAndApply(callId)
        }
    } catch {
        endCallInternal(reason: .failed("State resync failed"))
    }
}

// CallStateConfirmAck shape (S5 fix)
struct CallStateConfirmAck: Codable, Sendable {
    let success: Bool
    let callId: String
    let version: Int
    let authoritativeStatus: CallStatus
    let participants: [CallParticipantSnapshot]
    let mediaStates: [String: MediaState]      // per peerId
    let endReason: CallEndReason?
}

struct MediaState: Codable, Sendable {
    let isAudioEnabled: Bool
    let isVideoEnabled: Bool
}
```

Triggered : sur socket `connect` event si `callState ≠ .idle` ET `currentCallId != nil`.

### 5.12 Heartbeat protocol (P1 fix : 10s/30s/60s)

```swift
private func startHeartbeat() {
    heartbeatTask?.cancel()
    heartbeatTask = Task { @MainActor [weak self] in
        var consecutiveAckFailures = 0
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 10_000_000_000)  // 10s
            guard !Task.isCancelled,
                  let self,
                  let callId = self.currentCallId,
                  let stats = await self.webRTCService.getStats() else { continue }

            let metrics = MediaMetrics.from(stats: stats)
            do {
                let ack = try await MessageSocketManager.shared.emitCallHeartbeat(
                    callId: callId, version: self.localVersion, metrics: metrics, timeout: 5.0
                )
                consecutiveAckFailures = 0
                self.observedClockSkew = ack.serverTimestamp - Int(Date().timeIntervalSince1970 * 1000)
            } catch {
                consecutiveAckFailures += 1
                if consecutiveAckFailures >= 3 {
                    await self.transitionToReconnecting(reason: .heartbeatLost)
                    consecutiveAckFailures = 0
                }
            }
        }
    }
}
```

Côté serveur, heartbeats stockés Redis ZADD `heartbeats:call:{callId}`. Job 1s scanne ; absent > 30s → transition `active → reconnecting` + broadcast.

### 5.13 Side-channel datachannels

```swift
extension P2PWebRTCClient {
    func setupSideChannels() {  // CALLED BEFORE createOffer (E13 fix)
        presenceChannel = peerConnection?.dataChannel(forLabel: "presence", configuration: .init(
            isOrdered: false, maxRetransmits: 0
        ))
        transcriptionChannel = peerConnection?.dataChannel(forLabel: "transcription", configuration: .init(
            isOrdered: true, maxRetransmits: 3
        ))
        translationChannel = peerConnection?.dataChannel(forLabel: "translation", configuration: .init(
            isOrdered: true, maxPacketLifeTime: 5_000
        ))
        metricsChannel = peerConnection?.dataChannel(forLabel: "metrics", configuration: .init(
            isOrdered: false, maxRetransmits: 0
        ))
    }
}
```

| Channel | Reliability | Use case |
|---|---|---|
| `presence` | unordered, no retransmit | typing, screen-capture-detected |
| `transcription` | ordered, 3 retransmits | live ASR segments |
| `translation` | ordered, 5s TTL | live MT results |
| `metrics` | unordered, no retransmit | RTT, quality reports peer-to-peer |

Fallback socket si datachannel pas encore ouvert (early call setup).

### 5.14 Catalogue d'erreurs

```typescript
export enum CallErrorCode {
  // Auth
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Validation
  INVALID_SIGNAL = 'INVALID_SIGNAL',
  INVALID_INPUT = 'INVALID_INPUT',

  // Existence
  CALL_NOT_FOUND = 'CALL_NOT_FOUND',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',
  TARGET_OFFLINE = 'TARGET_OFFLINE',

  // Authorization
  NOT_A_PARTICIPANT = 'NOT_A_PARTICIPANT',
  SIGNAL_SENDER_MISMATCH = 'SIGNAL_SENDER_MISMATCH',

  // Business rules
  CALL_ALREADY_ACTIVE = 'CALL_ALREADY_ACTIVE',
  P2P_LIMIT_EXCEEDED = 'P2P_LIMIT_EXCEEDED',
  VIDEO_CALLS_NOT_SUPPORTED = 'VIDEO_CALLS_NOT_SUPPORTED',

  // State
  TERMINAL_STATE = 'TERMINAL_STATE',
  VERSION_CONFLICT = 'VERSION_CONFLICT',

  // Infrastructure
  RATE_LIMITED = 'RATE_LIMITED',
  TURN_GENERATION_FAILED = 'TURN_GENERATION_FAILED',
  INTERNAL = 'INTERNAL',

  // Client-side only
  ICE_TIMEOUT = 'ICE_TIMEOUT',
  MEDIA_PATH_BROKEN = 'MEDIA_PATH_BROKEN',
  ACK_TIMEOUT = 'ACK_TIMEOUT',
  SIMULATOR_VIDEO_UNSUPPORTED = 'SIMULATOR_VIDEO_UNSUPPORTED',
  ANSWERED_ELSEWHERE = 'ANSWERED_ELSEWHERE',
}
```

---

<a id="s6"></a>
## §6 — Recovery, errors, anonymous, cross-platform

### 6.1 Modèle de recovery en couches

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Network (NWPathMonitor)                                   │
│   detection: ~1-2s                                                  │
│   action: pause heartbeat, debounce 2s, ICE restart on stable path  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (only if stable)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 2 — Socket (Socket.IO)                                        │
│   detection: socket.on('disconnect') instant                        │
│   action: stop signaling, await reconnect, then call:state-confirm  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (only if connected)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 3 — WebRTC (RTCPeerConnection)                                │
│   detection: iceConnectionState change OR no RTP for 5s             │
│   action: ICE restart (createOffer with iceRestart constraint)      │
│   backoff: 3 attempts max, 5s/15s/30s (P9 fix)                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 ICE restart : déclencheurs et flow

```swift
func attemptRecovery(trigger: RecoveryTrigger) async {
    guard recoveryAttempts < QualityThresholds.maxRecoveryAttempts else {
        await transition(to: .ended(.connectionLost))
        return
    }

    // Layer 1: network stable for 2s
    guard networkPathStableSince.map({ Date().timeIntervalSince($0) >= 2.0 }) ?? false else {
        scheduleRecovery(in: 2.0, trigger: trigger)
        return
    }

    // Layer 2: socket connected
    guard MessageSocketManager.shared.isConnected else {
        await waitForSocketReconnect(timeout: 10.0)
        guard MessageSocketManager.shared.isConnected else {
            await transition(to: .ended(.connectionLost))
            return
        }
    }

    // Resync state
    await resyncCallState()

    // Layer 3: ICE restart with exponential backoff (P9 fix: 5s/15s/30s)
    recoveryAttempts += 1
    await transition(to: .reconnecting(attempt: recoveryAttempts, trigger: trigger))

    let backoff: TimeInterval
    switch recoveryAttempts {
    case 1: backoff = 5.0
    case 2: backoff = 15.0
    case 3: backoff = 30.0
    default: backoff = 60.0
    }
    try? await Task.sleep(for: .seconds(backoff))

    do {
        let offer = try await webRTCEngine.performICERestart()
        try await emitCallSignal(callId: currentCallId!, signal: .offer(offer))
        let answered = await waitForRemoteAnswer(timeout: 30.0)
        if !answered {
            await attemptRecovery(trigger: .answerTimeout)
        }
    } catch {
        await attemptRecovery(trigger: .iceRestartFailed(error))
    }
}

enum RecoveryTrigger: Sendable {
    case heartbeatLost
    case iceDisconnected
    case noRTPReceived(durationSec: TimeInterval)
    case networkPathChanged(from: NWPath.Status, to: NWPath.Status)
    case socketReconnected
    case answerTimeout
    case iceRestartFailed(any Error)
}
```

### 6.3 Network change handling

```swift
networkMonitor.pathUpdateHandler = { [weak self] path in
    Task { @MainActor [weak self] in
        guard let self else { return }
        let previous = self.lastNetworkPath
        self.lastNetworkPath = path

        if previous.status != .satisfied && path.status == .satisfied {
            self.networkPathStableSince = Date()
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard let self,
                      let stable = self.networkPathStableSince,
                      Date().timeIntervalSince(stable) >= 2.0,
                      self.callState.isActive else { return }
                await self.eventQueue.attemptRecovery(trigger: .networkPathChanged(...))
            }
        }

        if previous.status == .satisfied && path.status != .satisfied {
            self.networkPathStableSince = nil
        }

        // Interface change (wifi→cellular without going through unsatisfied)
        // E14 fix: detect via path.availableInterfaces delta + path.gateways change
        if path.usesInterfaceType(.cellular) != previous.usesInterfaceType(.cellular)
            || self.gatewaysChanged(from: previous, to: path) {
            await self.eventQueue.attemptRecovery(trigger: .networkPathChanged(...))
        }
    }
}
```

`path.isExpensive == true` → bascule auto en quality `fair` (400kbps).

### 6.4 Backgrounding policy

`Info.plist` `UIBackgroundModes` : `audio`, `voip`, `picture-in-picture`, `processing`, `remote-notification`.

| State transition | Action |
|---|---|
| App active | Audio + Video pleine puissance, UI rendered, filters applied |
| App background, AUDIO call | Audio continue (background mode `audio` + `voip`), CallKit Dynamic Island, RTCAudioSession reste active, heartbeat 10s continue |
| App background, VIDEO call | iOS pause AVCaptureSession auto. Solution SOTA : Picture-in-Picture (PiP) avec `AVPictureInPictureController` + `AVSampleBufferDisplayLayer`. PiP affiche remote video |
| Foreground reprise | Capture session restart auto, local video reprend |

```swift
NotificationCenter.default.addObserver(forName: .UIApplicationDidEnterBackground, ...) {
    // Notify peer
    MessageSocketManager.shared.emitCallSignal(callId: ..., type: "backgrounded", payload: ...)
    // Pause local video
    self.webRTCEngine.pauseLocalVideoForBackground()
    // Server gives 2x heartbeat tolerance via 'backgrounded' signal type
}
```

### 6.5 Multi-device : `call:answered-elsewhere`

```typescript
async handleCallJoin(socket, data, ack) {
  // ... existing join logic ...

  // Notify OTHER sockets of the same user
  const userSockets = userSocketMap.get(userId);
  for (const otherSocketId of userSockets ?? []) {
    if (otherSocketId === socket.id) continue;
    io.to(otherSocketId).emit(CALL_EVENTS.ANSWERED_ELSEWHERE, {
      callId: data.callId,
      answeredOn: { socketId: socket.id, deviceType: socket.handshake.headers['user-agent'] },
    });
  }
}
```

```swift
socket.on("call:answered-elsewhere") { [weak self] data, _ in
    guard let event = decode(CallAnsweredElsewhereData.self, from: data) else { return }
    Task { @MainActor [weak self] in
        guard self?.currentCallId == event.callId else { return }
        if let uuid = self?.activeCallUUID {
            self?.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
        }
        self?.endCallInternal(reason: .answeredElsewhere)
    }
}
```

### 6.6 Anonymous calls

| Capacité | Anonymous | Registered |
|---|:---:|:---:|
| Initier un call | ✓ | ✓ |
| Recevoir via socket actif | ✓ | ✓ |
| VoIP push (PushKit) | ✗ | ✓ |
| Background ringing | ✗ | ✓ |
| CallKit UI | ✓ (si app foreground/background) | ✓ |
| Live Activity / Dynamic Island | ✓ | ✓ |
| E2EE Insertable Streams | ✗ | ✓ |
| Recall history | ✗ | ✓ |
| Quality settings persisted | ✗ | ✓ |

Disconnect socket → leaveCall immédiat (pas de grace 30s).

### 6.7 Cross-platform iOS ↔ Web

| Aspect | iOS (libwebrtc 141) | Web (Chrome / Safari) |
|---|---|---|
| WebRTC API | `RTCPeerConnection` Obj-C bridged | `RTCPeerConnection` W3C |
| SDP semantics | unifiedPlan ✓ | unifiedPlan ✓ (Chrome 70+, Safari 13+) |
| DTLS-SRTP | ✓ | ✓ |
| Codecs vidéo HW | H.264 (VideoToolbox), VP8 SW, VP9 SW (HW iOS 18+) | H.264 (Chrome v80+), VP8/VP9 SW, AV1 partial |
| Codecs audio | Opus + DTX + RED | Opus + DTX + RED (default M96+) |
| Trickle ICE | ✓ | ✓ |
| `setCodecPreferences` | ✓ | ✓ |
| Insertable Streams (E2EE) | partial 141 | Chrome ✓, Safari ✗ (futur) |
| Datachannel | ✓ | ✓ |
| Renderer | `RTCMTLVideoView` | `<video srcObject>` |
| PiP | `AVPictureInPictureController` | Document PiP API (Chrome 116+) |

**Codec preferences cross-platform** :

```typescript
function audioCodecPreferences(capabilities: RTCRtpCapabilities): RTCRtpCodecCapability[] {
  return [
    ...capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'audio/opus'),
    ...capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'audio/red'),
  ];
}

function videoCodecPreferences(capabilities: RTCRtpCapabilities): RTCRtpCodecCapability[] {
  const order = ['video/H264', 'video/VP8', 'video/VP9'];
  return order.flatMap(name =>
    capabilities.codecs.filter(c => c.mimeType.toLowerCase() === name.toLowerCase())
  );
}
```

Appliqué sur les deux côtés → l'intersection est négociée naturellement.

### 6.8 Edge cases

| Case | Détection | Comportement |
|---|---|---|
| Airplane mode pendant call | NWPathMonitor `.unsatisfied` + `unsatisfiedReason == .cellularDenied` | UI bannière, 60s grace puis end |
| Low Power Mode | `ProcessInfo.isLowPowerModeEnabled` | Cap video 360p@15 + désactive filters avancés |
| Silent mode | Heuristic `AudioServicesPlaySystemSound` | CallKit sonne quand-même via haptic + lockscreen |
| Other VoIP (FaceTime) | CallKit `maximumCallGroups=2` | Notre call passe en hold ; resume sur fin autre |
| Mic permission denied | `AVAudioApplication.shared.recordPermission == .denied` | Sheet permission, bloque call si denied |
| Camera permission denied | `AVCaptureDevice.authorizationStatus(for: .video) == .denied` | Démarre audio-only avec banner |
| Disk full | `URLResourceValues.volumeAvailableCapacity < 50MB` | Désactive recording, warning toast |
| **App killed pendant call** | (E15 fix) | iOS process killed → CallKit garde le call orphan. App relaunch : `call:state-confirm` immédiat ; si fail → end call ; si OK → reconstruit FSM |
| iOS update pendant call | OS-level | Call ends, Live Activity frozen |

### 6.9 Permissions handling

```swift
final class CallPermissionGate {
    enum Permission { case microphone, camera }

    static func ensure(_ permissions: [Permission]) async -> Result<Void, PermissionError> {
        for permission in permissions {
            switch permission {
            case .microphone:
                let status = AVAudioApplication.shared.recordPermission
                if status == .undetermined {
                    let granted = await AVAudioApplication.requestRecordPermission()
                    guard granted else { return .failure(.microphoneDenied) }
                } else if status == .denied {
                    return .failure(.microphoneDenied)
                }
            case .camera:
                let status = AVCaptureDevice.authorizationStatus(for: .video)
                if status == .notDetermined {
                    let granted = await AVCaptureDevice.requestAccess(for: .video)
                    guard granted else { return .failure(.cameraDenied) }
                } else if status == .denied {
                    return .failure(.cameraDenied)
                }
            }
        }
        return .success(())
    }
}
```

---

<a id="s7"></a>
## §7 — Amendements (corrections post-review)

Corrections identifiées lors du review de §3-6, à appliquer pendant l'implémentation. Numérotées en suite des corrections initiales E1-E7 / P1-P5 / S1-S3 (§1-2).

### Functional

**E8 — Retirer `ioBufferDuration = 0.02` (§3.3)**
Sur AirPods Pro 2 / casques BT en codec LC3, l'I/O buffer minimum est 5 ou 10ms. Forcer 20ms peut générer une re-négociation interne d'AVAudioSession au plug-in BT → glitch audio bref. Action : ne pas set `ioBufferDuration`, libwebrtc choisit l'optimal.

**E9 / E12 — Utiliser `addTransceiver(of:)` au lieu de `addTrack` (§3.8, §5.5)**
`pc.transceivers` peut être vide tant que `setLocalDescription` n'a pas été appelé si on utilise `add(track:streamIds:)`. Pour garantir un transceiver explicite avant `setCodecPreferences`, utiliser `addTransceiver(of: .audio, init: trackInit)`. Standardiser partout.

```swift
let audioInit = RTCRtpTransceiverInit()
audioInit.direction = .sendRecv
audioInit.streamIds = ["meeshy-stream-0"]
let audioTransceiver = peerConnection.addTransceiver(of: .audio, init: audioInit)
audioTransceiver.sender.track = audioTrack
applyAudioCodecPreferences(audioTransceiver: audioTransceiver)
```

**E10 — Sémantique correcte de `CIBlendWithMask` (§4.6 skin smoothing)**
Pour smoothing, l'image SMOOTHED doit être `inputBackgroundImage` et l'ORIGINAL `inputImage` (foreground), avec `inputMaskImage` = mask peau. Le mask sélectionne où mettre le smoothed.

```swift
private func applySkinSmoothing(to image: CIImage, pixelBuffer: CVPixelBuffer) -> CIImage {
    guard let face = lastFaceObservation else { return image }
    let smoothed = image.applyingGaussianBlur(sigma: 8 * config.skinSmoothingIntensity)
                        .cropped(to: image.extent)
    let mask = skinMask(for: face, extent: image.extent)
    return image.applyingFilter("CIBlendWithMask", parameters: [
        "inputBackgroundImage": smoothed,   // smoothed BEHIND (revealed where mask is opaque)
        "inputMaskImage": mask              // skin mask
    ])
}
```

**E11 — Continuity Camera = `.external` (§4.9)**
La signature correcte iOS 17+ est `AVCaptureDevice.DeviceType.external`. `.continuityCamera` n'existe pas comme deviceType direct.

**E13 — Datachannels créés AVANT `createOffer` (§5.13)**
Pour que les datachannels soient inclus dans le SDP offer initial (donc négociés au handshake), ils DOIVENT être créés via `peerConnection.dataChannel(forLabel:)` avant `createOffer`. Sinon il faut renégocier.

Action : appeler `setupSideChannels()` dans `WebRTCEngine.configure()`, AVANT `startLocalMedia()` et AVANT `createOffer()`.

**E14 — NWPathMonitor : détecter aussi delta interfaces (§6.3)**
`path.usesInterfaceType(.cellular)` ne capture pas les transitions wifi→cellular transparentes (le path peut rester `.satisfied` tout du long avec juste l'interface qui change).

```swift
func gatewaysChanged(from previous: NWPath, to current: NWPath) -> Bool {
    return previous.gateways.count != current.gateways.count
        || Set(previous.availableInterfaces.map(\.name))
            .symmetricDifference(Set(current.availableInterfaces.map(\.name)))
            .isEmpty == false
}
```

**E15 — App killed pendant call : state-confirm ou end (§6.8)**
Si l'app crash pendant un call, CallKit garde le call orphan dans la system UI. Quand l'app re-launch :

```swift
@MainActor
func handleAppLaunch() async {
    // Detect orphan CallKit call
    let provider = CXProvider(configuration: config)
    let activeCalls = provider.calls  // CXCall instances
    guard let activeCall = activeCalls.first(where: { !$0.hasEnded }) else { return }

    // We're in an orphan call. Try to resync from server.
    let callIdFromCallKit = activeCall.uuid  // we need our callId, not CallKit's UUID
    // Implementation: persist last active callId in UserDefaults at every call:state-changed.
    guard let lastCallId = UserDefaults.standard.string(forKey: "lastActiveCallId") else {
        // No persisted state — end the orphan call
        provider.reportCall(with: activeCall.uuid, endedAt: Date(), reason: .failed)
        return
    }

    do {
        let ack = try await MessageSocketManager.shared.emitCallStateConfirm(
            callId: lastCallId, version: 0, clientState: .reconnecting(attempt: 0)
        )
        if TERMINAL_STATUSES.contains(ack.authoritativeStatus) {
            provider.reportCall(with: activeCall.uuid, endedAt: Date(), reason: .failed)
        } else {
            await CallManager.shared.reconstructFromServer(ack)
        }
    } catch {
        provider.reportCall(with: activeCall.uuid, endedAt: Date(), reason: .failed)
    }
}
```

### Performance

**P6 — `addStatsObserver` au lieu de polling stats (§2.3 gate connecting→connected)**
`RTCPeerConnection.statistics()` est coûteux (~10-15ms older iPhones). Polling 1s × 10 = 100-150ms cumulés.

Action : utiliser `peerConnection.addStatsObserver(observer)` (libwebrtc 141 callback continu) ou polling 2s avec early-exit dès `packetsReceived >= 5`.

**P7 — Confirmer iOS 17 floor pour Vision shared handler (§4.5)**
`VNGeneratePersonSegmentationRequest` + `VNDetectFaceLandmarksRequest` partagent `VNSequenceRequestHandler`. Race documenté Apple Forum 2024 sur iOS 16.4. iOS 17+ OK. Le projet floor est 17.0 (apps/ios CLAUDE.md confirmé). Ajouter assertion runtime :

```swift
@available(iOS 17.0, *)
private static func validateVisionRuntime() {
    // Pre-warm shared handler to surface any platform issues at app launch
}
```

**P8 — `scaleResolutionDownBy` hysteresis 5s (§4.11)**
Changement de `scaleResolutionDownBy` re-init la chaine d'encode (~200ms freeze). Hysteresis : appliquer le nouveau tier seulement après 5s consécutifs de mesures dans ce tier.

```swift
private var pendingTier: QualityTier?
private var pendingTierSince: Date?

func adaptVideoBitrate(stats: MediaMetrics) {
    let observedTier = QualityTier.from(rtt: stats.roundTripTimeMs, loss: stats.packetsLossRatio)
    if observedTier == currentTier {
        pendingTier = nil
        pendingTierSince = nil
        return
    }
    if pendingTier == observedTier {
        guard let since = pendingTierSince, Date().timeIntervalSince(since) >= 5.0 else { return }
        // 5s consecutive in new tier — apply
        applyTier(observedTier)
        currentTier = observedTier
        pendingTier = nil
        pendingTierSince = nil
    } else {
        pendingTier = observedTier
        pendingTierSince = Date()
    }
}
```

**P9 — Backoff recovery 5s/15s/30s (§6.2)**
Original 2s/4s/8s = 14s total = trop court pour métro (perte 30-60s). Nouveau : 5s/15s/30s = 50s total, plus proche WhatsApp.

**P10 — Heartbeat ACK timeout 5s (§5.4, §5.12)**
Cellular RTT pire ~3-4s. 3s timeout = trop tendu. Nouveau : 5s.

### Spec

**S4 — Ajouter `call:answered-elsewhere` au catalog (§5.1)**
Event introduit dans §6.5, ajouté à la table server→client de §5.1.

**S5 — Spec complete `CallStateConfirmAck` shape (§5.11)**
Voir §5.11 ci-dessus pour le shape complet : `{ success, callId, version, authoritativeStatus, participants, mediaStates, endReason }`.

---

<a id="s8"></a>
## §8 — Plan de migration phasé

Chaque phase = un PR autonome, testable, avec rollback safe (feature flag pour Phases 2/7/8/9).

### Phase 0 — Migration prep (no behaviour change)

- Prisma migration : `version Int @default(1)` sur `CallSession`
- Create `CallEventQueue` actor scaffold (empty, not wired)
- Add `MediaPipelineHook` protocol (no hooks registered)
- Rename Logger labels for grep'ability

### Phase 1 — Bug fixes (corrections §1-2)

- B3 fix: remove `audioSession.setActive(true)` in `provider:didActivate:`
- E7 fix: `#if targetEnvironment(simulator)` guard in `startLocalMedia`
- E5 fix: add `outgoing.offering` state in CallFSM
- E6 + P6 fix: gate `connecting → connected` on inbound RTP > 0 via `addStatsObserver`
- P1 fix: heartbeat 10s/30s/60s
- P2 fix: ringing timeout 60s

### Phase 2 — Codec preferences API (§3.8, E9/E12)

- Replace `add(track:)` with `addTransceiver(of:)`
- Apply `setCodecPreferences` + `RTCRtpEncodingParameters.dtx`
- Re-enable RED via `setCodecPreferences` (was disabled commit 9e663039)
- Remove SDP munging for Opus DTX/RED ; keep only `transport-cc` extension

### Phase 3 — Pre-warming + singleton effects (P4 + P5)

- `CallPrewarmingService.prewarm(for: conversationId)` at conversation open
- `CallAudioEffectsService` → singleton process-wide

### Phase 4 — Server FSM + version locking (§2.7, §5.5)

- `CallService.transitionCall` with optimistic locking
- `CallEventsHandler` emits `call:state-changed` consistently
- Heartbeat-driven server timeout monitoring (Redis ZADD)

### Phase 5 — Multi-device + answered-elsewhere (§6.5, S4)

- `call:answered-elsewhere` event in catalog + handler
- `CallManager` dismisses CallKit on receipt with reason `.answeredElsewhere`

### Phase 6 — Recovery layered (§6.1-6.3, P9)

- `RecoveryTrigger` enum
- `CallEventQueue.attemptRecovery` with 5s/15s/30s backoff
- `NWPathMonitor` handoff detection (E14 fix)

### Phase 7 — Datachannels + hooks scaffolding (§1.bis + §5.13, E13)

- DataChannel side-channels (presence, transcription, translation, metrics) created BEFORE `createOffer`
- `MediaPipelineHook` bus wired into `WebRTCEngine`
- `LiveTranscriptionHook` (WhisperKit) — enabled by feature flag

### Phase 8 — Live Activities + Dynamic Island

- `MeeshyCallActivity` ActivityKit
- Lock screen + Dynamic Island state-driven by CallFSM

### Phase 9 — Future tech enablement

- E2EE Insertable Streams (iOS 18+ infra ready)
- Continuity Camera enumeration (E11)
- SharePlay GroupActivities
- Apple Intelligence summary post-call (iOS 18.1+)
- SFU migration path (when needed)

---

<a id="s9"></a>
## §9 — Checklist de tests E2E

| # | Scénario | Critère de succès |
|---|---|---|
| T1 | Happy path 1:1 audio iOS↔iOS | offer/answer + ICE + ≥5 RTP packets received within 5s |
| T2 | Happy path 1:1 vidéo iOS↔Web | iOS initie, Web répond ; H.264 négocié ; vidéo bidirect ; pas de freeze |
| T3 | Network handoff wifi→cellular pendant call | ICE restart auto, call survit avec ≤2s glitch |
| T4 | App background pendant audio call | call continue, heartbeat OK, resume foreground sans glitch |
| T5 | App background pendant video call | PiP activé automatiquement, capture pause sans crash |
| T6 | Multi-device : answer sur iPad → iPhone CallKit dismiss | `call:answered-elsewhere` reçu, CallKit `.answeredElsewhere` |
| T7 | Caller raccroche pendant ringing | callee CallKit dismiss + `call:ended` immédiat |
| T8 | Callee raccroche pendant ringing | caller voit `call:ended` immédiat |
| T9 | Anonymous call init + accept | call établi, pas de PushKit, disconnect socket = end |
| T10 | Permission micro denied | sheet system, retry après grant, ou abort |
| T11 | Hold/Unhold cycle | audio retrieved correctly via `restartAudioADM` |
| T12 | Simulator audio-only fallback | video tap → `simulatorVideoUnsupported` → continue audio with banner |
| T13 | Server timeout `ringing` 60s | server force `missed`, broadcast, both clients align |
| T14 | ICE restart sur ICE disconnected 5s | auto-restart, RTP resumes within 8s |
| T15 | Version conflict on transition | retry once with fresh state, succeed |
| T16 | App killed pendant call → relaunch | state-confirm, reconstruct or end cleanly |
| T17 | Background blur enabled | filter applied, no frame drop on iPhone 14 Pro+ |
| T18 | Skin smoothing enabled | filter applied, face detection works at 5fps cadence |
| T19 | Bandwidth degradation excellent → poor | tier transition with 5s hysteresis, no flapping |
| T20 | Thermal critical | filters disabled auto, video disabled auto, audio survives |
| T21 | Continuity Camera enumeration (iOS 17+) | external device shown in picker, switch works |
| T22 | Live transcription hook (WhisperKit) | local ASR text arrives in datachannel, peer displays caption |
| T23 | Cross-platform codec negotiation | H.264 used iOS↔Web (or VP8 fallback) |
| T24 | TURN credentials expiration | call survives across credential refresh (1h) |
| T25 | DTX activated via setParameters | silence frames sent at lower rate, no audible gap |

---

<a id="s10"></a>
## §10 — Architectural Decision Records

### ADR-1 : libwebrtc as canonical media engine

**Context** : Need state-of-the-art real-time media engine for 1:1 + future SFU.

**Decision** : Stick with `WebRTC.xcframework 141.0` (Google libwebrtc). Reject LiveKit/Daily/100ms wrapping (vendor lock-in, less control, additional cost).

**Consequences** :
- + Industry standard (FaceTime-grade), wide community, deep tuning
- + Direct access to ADM, RTCAudioSession, codec preferences
- − Need to manually integrate CallKit, AVAudioSession, ICE
- − SDK upgrade risk (each minor version can break SDP munging)

### ADR-2 : `@MainActor CallManager` façade + `actor CallEventQueue` private

**Context** : Swift 6 strict concurrency, SwiftUI binding requires `@MainActor ObservableObject`, but call FSM has many concurrent inputs (socket, CallKit delegate, WebRTC delegate, network monitor) creating races.

**Decision** : `CallManager` stays `@MainActor` (UI binding contract), but delegates ALL state transitions to a private `actor CallEventQueue` whose serial executor guarantees no races.

**Consequences** :
- + No races between event sources
- + UI binding still simple
- − Bridging actor → @MainActor adds `await MainActor.run` boilerplate
- − Slightly more complex testing setup

### ADR-3 : Optimistic locking via Prisma `version` field

**Context** : Distributed FSM (server timer + client `call:leave` + peer `call:reject`) can produce concurrent state transitions on the same row, leading to lost updates or stale reads.

**Decision** : Add `version Int @default(1)` to `CallSession`, every transition uses `where: { id, version: expected }, data: { version: { increment: 1 } }`. Catch P2025 → re-fetch + retry once.

**Consequences** :
- + Strong serialization without DB-level locks (MongoDB friendly)
- + Detect anomalies (`VERSION_CONFLICT`) for diagnostics
- − Prisma migration required (one-time cost)
- − Caller must thread version through all operations

### ADR-4 : `setCodecPreferences` API over SDP munging

**Context** : Current code munges SDP for Opus DTX, RED, transport-cc, video bitrate hints. Fragile across libwebrtc upgrades. RED was disabled in commit 9e663039 to debug audio silence.

**Decision** : Use `RTCRtpTransceiver.setCodecPreferences` + `RTCRtpEncodingParameters.dtx` for codec-level config (libwebrtc 141 supported). Keep SDP munging only for `transport-cc` extension (no public API equivalent).

**Consequences** :
- + Forward-compatible with libwebrtc upgrades
- + Cleaner code (no regex on SDP)
- − Some advanced settings (e.g. specific Opus fmtp params) still require munging
- − Need `addTransceiver` (not `addTrack`) to guarantee transceiver presence

### ADR-5 : `voiceChat` mode for OS-level Voice Isolation

**Context** : Voice Isolation, Wide Spectrum, Auto Mic Mode (iOS 16.4 / 17 / 18) provide pro-grade voice processing. Apple does NOT expose programmatic API ; user controls via Control Center → Mic Mode.

**Decision** : Configure `RTCAudioSessionConfiguration.mode = .voiceChat`. App opt-in is automatic ; user controls per their preference.

**Consequences** :
- + Free state-of-the-art voice processing on iOS 16.4+
- + No additional code or dependencies
- − No programmatic toggle (cannot force Voice Isolation per call)
- − Requires user education ("Activate Voice Isolation in Control Center")

### ADR-6 : Anonymous calls without PushKit

**Context** : Anonymous users (session token-based) have no APNs identity, hence no VoIP push token. Should they receive calls in background?

**Decision** : Anonymous users only receive calls via active socket. No PushKit. Disconnect socket → leaveCall immediate (no 30s grace).

**Consequences** :
- + Simple model, no APNs token lifecycle for anonymous
- + Privacy-friendly (no persistent identity)
- − Anonymous users miss calls if app not open
- − Cannot offer "missed call" notification for anonymous

### ADR-7 : MediaPipelineHook bus for extensibility

**Context** : Future features (transcription, translation, AR, E2EE, SharePlay) need to plug into media pipeline without modifying core.

**Decision** : Single `MediaPipelineHook` protocol with seams `willConfigure`, `processLocalAudio`, `processRemoteAudio`, `processLocalVideoPreFilter`, `processLocalVideoPostFilter`, `callDidTransition`. Hooks registered via `CallManager.register(hook:)`.

**Consequences** :
- + Core ignorant of features, easy to add/remove
- + Multiple hooks compose (transcription + translation simultaneous)
- − Hooks run on hot path (audio thread, video thread) — must be fast
- − Composition order matters (e.g., transcription before translation)

---

## Appendix : Glossaire

| Terme | Définition |
|---|---|
| **ADM** | Audio Device Module (libwebrtc audio I/O abstraction) |
| **AGC** | Automatic Gain Control |
| **AEC** | Acoustic Echo Cancellation |
| **CN** | Comfort Noise (génération de bruit de fond pendant DTX) |
| **DTX** | Discontinuous Transmission (Opus silence suppression) |
| **DTLS-SRTP** | Datagram TLS + Secure RTP (encryption WebRTC media) |
| **FSM** | Finite State Machine |
| **HMAC-SHA1** | Hash-based Message Authentication Code (TURN credentials) |
| **NS** | Noise Suppression |
| **PiP** | Picture-in-Picture |
| **PLC** | Packet Loss Concealment |
| **PSTN** | Public Switched Telephone Network (cellular) |
| **RED** | Redundant Audio Data (RFC 2198) |
| **RTP** | Real-time Transport Protocol |
| **SDP** | Session Description Protocol |
| **SFU** | Selective Forwarding Unit (server-side group call routing) |
| **STUN** | Session Traversal Utilities for NAT |
| **TURN** | Traversal Using Relays around NAT |
| **VPIO** | Voice Processing IO Audio Unit (Apple AudioToolbox) |
| **WebRTC** | Web Real-Time Communications |
