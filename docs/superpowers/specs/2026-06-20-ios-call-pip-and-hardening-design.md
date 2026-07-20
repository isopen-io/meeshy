# iOS — PiP vidéo système + durcissement du sous-système d'appel

- **Date** : 2026-06-20
- **Statut** : Design approuvé — prêt pour plan d'implémentation
- **Cible** : iOS 16 (floor) → iOS 26, `@MainActor` par défaut (Swift 6)
- **Périmètre** : durcissement ciblé du code d'appel + ajout du PiP vidéo **système** (fenêtre flottante par-dessus les autres apps)
- **Sources** : 7 sous-revues (audit feature, audit robustesse, faisabilité, fonctionnalité, intégration, compatibilité, performance/SOTA), toutes cross-checkées sur le code réel.

---

## 1. Contexte & objectif

Sur iPhone, les appels Meeshy sont déjà natifs sur presque tous les axes : signalement écran verrouillé (VoIP push + CallKit), décrocher/raccrocher via CallKit, continuation en arrière-plan (audio + socket de signalisation maintenue), indicateur d'appel en cours iOS (CallKit). **Le seul manque réel : en appel vidéo, quitter l'app coupe la vidéo distante** — il n'y a pas de PiP système. Seul l'audio continue.

Objectif : ajouter le **PiP vidéo système** (l'interlocuteur distant flotte par-dessus les autres apps, façon FaceTime/WhatsApp) **sans introduire de nouveau plantage**, et au passage traiter les 3 fragilités résiduelles relevées par l'audit de robustesse.

### Principe directeur
On ne touche **pas** au cœur de la machine à états d'appel (déjà robuste — tous les crashers historiques connus sont corrigés). Le PiP est une **greffe non-invasive** : un 2ᵉ renderer sur le `RTCVideoTrack` distant, isolé derrière des protocoles, désactivable, testable.

## 2. Non-objectifs
- Pas de refonte de `CallManager` ni de la machine à états WebRTC.
- Pas de PiP de la self-view (on montre **toujours le distant**, comme FaceTime).
- L'« indicateur d'appel audio en cours iOS » est **CallKit** (déjà livré) — hors scope, à ne pas confondre avec le PiP vidéo.
- La gestion d'un 2ᵉ appel entrant pendant un PiP reste l'existant (busy/CallKit) — documentée comme limite, non redessinée ici.
- Le downscale receiver-side via signaling (gain batterie d'un PiP long) est un **Lot 4 séparé**, livré après le PiP fonctionnel.

## 3. État actuel (ancrages code)

| Élément | Fichier:ligne |
|---|---|
| `CallDisplayMode { .fullScreen, .pip }` | `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift:352-355` |
| Pilule in-app sur `displayMode == .pip` | `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift:59` |
| Montage cover + pilule + waiting banner | `apps/ios/Meeshy/Features/Main/Views/RootView.swift:543-573` |
| Rendu vidéo inline `RTCMTLVideoView` | `apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift:14-48` |
| Track distant exposé `remoteVideoTrack: Any?` | `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift:47` ; `.../WebRTC/P2PWebRTCClient.swift:80` |
| H.264 épinglé (→ passthrough `RTCCVPixelBuffer`) | `.../WebRTC/P2PWebRTCClient.swift:21-25, 371` |
| `applyVideoEncoding(scaleResolutionDownBy:)` | `.../WebRTC/P2PWebRTCClient.swift:399-420` |
| Pattern delegate `nonisolated` (anti-SIGTRAP) | `.../WebRTC/P2PWebRTCClient.swift:1280-1348` |
| `isiOSAppOnMac` gating CallKit | `.../Services/CallManager.swift:486, 887` |
| `UIBackgroundModes = [audio, voip, …]` | `apps/ios/Meeshy/Info.plist:103-111` |
| scenePhase → background | `apps/ios/Meeshy/MeeshyApp.swift:434-458` |
| Guard socket maintenue si appel actif | `.../Services/BackgroundTransitionCoordinator.swift:67-82` |
| Floor iOS 16, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` | `apps/ios/Meeshy.xcodeproj/project.pbxproj` |

---

## 4. Architecture — composants à créer (tous app-side)

Placement : `apps/ios/Meeshy/Features/Main/Services/WebRTC/` (+ vue). Aucun code ne touche `packages/MeeshySDK/` (`AVPictureInPictureController`, `AVPictureInPictureVideoCallViewController`, `AVSampleBufferDisplayLayer` sont des décisions UX produit → app-side).

| Composant | Protocole | Rôle | Isolation |
|---|---|---|---|
| `VideoFrameConverter` | `VideoFrameConverting` | `RTCVideoFrame → CMSampleBuffer`. Passthrough direct si `RTCCVPixelBuffer` (H.264 HW, coût ~0, zéro copie). Fallback `RTCI420Buffer → NV12` via **vImage/Accelerate**. Cache `CMVideoFormatDescription` keyé **dimensions + rotation + pixelFormat** (≤ 8 entrées, purge défensive). | `nonisolated` (serial queue) |
| `PiPVideoSampleBufferView` | — | `UIView` dont `layerClass = AVSampleBufferDisplayLayer`. Applique la rotation `RTCVideoFrame.rotation` (transform de layer). | UIKit / `@MainActor` |
| `PiPVideoRenderer` | `RTCVideoRenderer` | Reçoit `renderFrame(_:)` **sur le thread WebRTC** → convertit → enqueue sur une **serial queue dédiée** (`qos: .userInteractive`). `nonisolated` + `@unchecked Sendable`. Jamais d'accès `@MainActor` depuis le hot path. | `nonisolated` |
| `PiPCallController` | `PiPCallProviding` | Orchestre `AVPictureInPictureController` + `AVPictureInPictureVideoCallViewController`. Porte les **gates de compatibilité**, le **swap mono-renderer**, et observe l'état d'appel. Injecté dans `CallManager` (défaut `.shared`). `@available(iOS 15)`. | `@MainActor` |

### Threading & isolation Swift 6 (impératif — historique SIGTRAP du projet)
- `PiPVideoRenderer.renderFrame(_:)` → **`nonisolated`** ; la classe n'est **pas** `@MainActor` (`@unchecked Sendable`). Copier le pattern de `P2PWebRTCClient.swift:1280-1348`.
- Conversion + cache format description → sur la serial queue (`nonisolated`), jamais sur main.
- Callbacks `AVPictureInPictureControllerDelegate` → `@MainActor` (livraison main par AVKit) ; en cas de besoin runtime, `MainActor.assumeIsolated`, **jamais** `DispatchQueue.main.async` pour « prouver » l'acteur.
- Enqueue depuis la serial queue : `if #available(iOS 17, *) { layer.sampleBufferRenderer.enqueue(_) } else { layer.enqueue(_) }`.

---

## 5. Modèle d'état & cycle de vie (corrections de revue)

### 5.1 Flag d'état dédié (corrige la collision `displayMode`)
Ajout sur `CallManager` : `@Published private(set) var isSystemPiPActive: Bool = false`, **orthogonal** à `displayMode` et piloté par `PiPCallController` via les callbacks delegate.

- `FloatingCallPillView` gatée : `displayMode == .pip && callState.isActive && !isSystemPiPActive`.
- (Alternative considérée : 3ᵉ cas `.systemPiP` dans l'enum — écartée car plus invasive sur tous les sites `displayMode == .fullScreen/.pip`.)

### 5.2 Conditions d'activation (corrige l'audio-only / track absente)
`canActivate = isVideoEnabled && hasRemoteVideoTrack && isRemoteVideoEnabled`, réévalué en continu.
- `canStartPictureInPictureAutomaticallyFromInline` togglé **dynamiquement** = `canActivate` (jamais posé une fois).
- Bouton PiP manuel visible **uniquement si** `canActivate`. Le bouton « minimize » audio-only existant (`CallView`) garde sa sémantique (`displayMode = .pip` → pilule), il **ne déclenche pas** le PiP système.

### 5.3 Observateurs du `PiPCallController`
Observe `$callState`, `$remoteVideoTrack`, `$isRemoteVideoEnabled`, `$isVideoEnabled`, `scenePhase`.

| Événement observé | Action |
|---|---|
| Track distant recréé (ICE restart / upgrade vidéo / renégo) | `oldTrack.remove(renderer)` + `newTrack.add(renderer)` (ré-attache) |
| `isRemoteVideoEnabled → false` (pair coupe sa caméra) | enqueue un buffer **placeholder** (avatar rendu), pas le dernier frame figé |
| `callState → .ended/.idle` | `stopPictureInPicture()` impératif + libération du renderer |
| `scenePhase → .background` avec `canActivate` | l'auto-PiP démarre (système) |

### 5.4 Swap mono-renderer (perf P0-1)
Un seul renderer attaché au track à tout instant, piloté par les callbacks PiP :
- `pictureInPictureControllerWillStart` → `remoteTrack.remove(rtcMtlView)` ; `remoteTrack.add(pipRenderer)`.
- `pictureInPictureControllerDidStop` → `remoteTrack.remove(pipRenderer)` ; `remoteTrack.add(rtcMtlView)`.
Réutiliser le coordinator `WebRTCVideoView.updateUIView` (`WebRTCVideoView.swift:29-48`) plutôt qu'attacher en double.

### 5.5 Sémantique de fermeture (corrige le bouton X)
- **Tap restore** (flèche) → `restoreUserInterfaceForPictureInPictureStop` → `displayMode = .fullScreen`.
- **Bouton X système** → `pictureInPictureControllerDidStop` → **cacher la vidéo sans raccrocher** + `displayMode = .pip` (la pilule reprend au retour foreground, elle porte mute/speaker/raccrocher).

### 5.6 Contrôles dans le PiP
`AVPictureInPictureVideoCallViewController` héberge des contrôles custom : **au minimum raccrocher** (→ `CallManager.endCall()`), idéalement **mute** (→ `toggleMute()`). Sinon l'utilisateur en background ne peut pas raccrocher sans rouvrir l'app.

### 5.7 Limites documentées
- 2ᵉ appel entrant pendant PiP : la bannière in-app est invisible (app backgroundée) ; le cas verrouillé/background est couvert par la **UI CallKit système** (VoIP push), qui s'affiche par-dessus tout. Comportement busy inchangé.

---

## 6. Compatibilité (gates obligatoires)

```swift
// Gate maître (init de la feature)
let canUsePiP = AVPictureInPictureController.isPictureInPictureSupported()
            && !ProcessInfo.processInfo.isiOSAppOnMac    // ContentSource+SBDL cassé sur Mac

// Enqueue SOTA + fallback iOS 16
if #available(iOS 17.0, *) { layer.sampleBufferRenderer.enqueue(sb) }
else { layer.enqueue(sb) }

// Caméra multitâche (iOS 16+, PAS l'entitlement legacy)
if session.isMultitaskingCameraAccessSupported { session.isMultitaskingCameraAccessEnabled = true }

// renderFrame off-main
nonisolated func renderFrame(_ frame: RTCVideoFrame?) { /* serial queue */ }
```

- `AVPictureInPictureVideoCallViewController` = iOS 15+ → floor 16 OK (pas de `@available` requis sur le symbole, mais `@available(iOS 15)` sur le controller par robustesse).
- Background mode `audio` déjà présent (App Review **vérifie** que l'audio tourne réellement en background — OK, CallKit possède la session).
- CallKit ⇄ PiP coexistent : ne **jamais** toucher l'`AVAudioSession` depuis le code PiP (CallKit l'owne, `CallManager.swift:2735`).

---

## 7. Performance (exigences)

| # | Exigence | Détail |
|---|---|---|
| P0-1 | **Un seul renderer actif** | détacher `RTCMTLVideoView` au start PiP, ré-attacher au stop (§5.4) |
| P0-2 | **Backpressure** | `guard renderer.isReadyForMoreMediaData` → **drop** (pas de queue) ; `flush()` si `status == .failed`. Évite la fuite mémoire background (~1,4 Mo/frame) |
| P0-3 | **Throttle framerate** | 15 fps nominal, 10 en `.serious`, 8 en `.critical` — câblé sur `MediaThermalPolicy` existante |
| P1-2 | **Cache format description** | clé dimensions+rotation+pixelFormat ; ≤ 8 entrées ; recréé seulement au changement de palier réseau |
| P1-3 | **I420 via vImage** | uniquement si VP8/VP9 négocié (rare, H.264 épinglé) ; combiné au throttle |
| P2-1 | **Serial queue dédiée** | `qos: .userInteractive`, jamais le main thread |

---

## 8. Durcissements du code d'appel (3 items, indépendants)

| # | Fragilité | Fichier:ligne | Fix |
|---|---|---|---|
| H1 | Double-fin CallKit non atomique (micro-race `endCall()` local vs fire CallKit) | `CallManager.swift:1128-1175` vs `2690-2715` | Poser le flag d'état (`isEnding`/`callState=.ended`) **avant** `CXEndCallAction` |
| H2 | Timeout SDP 30s muet (UX) | `CallManager.swift:1048-1057, 1087-1097` | Indicateur « En attente du correspondant… » après ~6s |
| H3 | Retour ACK de la réponse ignoré (`@discardableResult`) | `CallManager.swift:2384-2402` | Exploiter le `Bool` : 1 retry + log structuré au lieu de `fulfill()` aveugle |

---

## 9. Découpage en lots

1. **Lot 1 — Durcissements** (H1, H2, H3). Indépendant, mergeable seul. Tests sur la double-fin et le retry ACK.
2. **Lot 2 — Socle PiP** : `VideoFrameConverter`, `PiPVideoRenderer`, `PiPVideoSampleBufferView`, `PiPCallController` (gates compat, threading Swift 6, backpressure P0-2, throttle P0-3, swap P0-1). TDD protocoles d'abord.
3. **Lot 3 — Blindage UX/cycle de vie** : flag `isSystemPiPActive`, gating audio-only (§5.2), sémantique X (§5.5), stop sur fin d'appel (§5.3), ré-attache track, placeholder caméra-off, bouton raccrocher (§5.6). Câblage `CallView`/`RootView`.
4. **Lot 4 — Perf avancée (après le PiP fonctionnel)** : downscale receiver-side via signaling (le pair applique `scaleResolutionDownBy` quand on est en PiP). Touche **gateway + les deux pairs**.

---

## 10. Stratégie de test (TDD, conforme CLAUDE.md)

Protocoles avant implémentation ; mocks `Mock…` conformes ; `test_{method}_{condition}_{result}` ; `./apps/ios/meeshy.sh build` + tests verts avant commit.

- `VideoFrameConverting` : I420→pixelbuffer (dimensions/rotation), réutilisation du cache, pixelFormat dans la clé.
- `PiPVideoRenderer` : frame→enqueue, **sécurité off-main**, drop quand `!isReadyForMoreMediaData`, `flush()` sur `.failed`, throttle.
- `PiPCallProviding` (`MockPiPCall`) : idempotence start/stop, stop sur `.ended`, ré-attache sur changement de track, gate `canActivate`, sémantique X.
- Durcissements : un seul teardown sur double-fin (H1), retry ACK (H3).
- **Caveat device** : le PiP est peu fiable au simulateur → validation finale sur **device réel** (à la charge de l'utilisateur, protocole de test fourni). Le flux projet reste « push main → CI, pas d'e2e local ».

---

## 11. Carte des fichiers

**Créés** (app-side) :
- `Features/Main/Services/WebRTC/VideoFrameConverter.swift`
- `Features/Main/Services/WebRTC/PiPVideoRenderer.swift`
- `Features/Main/Services/WebRTC/PiPCallController.swift`
- `Features/Main/Views/PiPVideoSampleBufferView.swift`
- Tests : `MeeshyTests/.../VideoFrameConverterTests.swift`, `PiPVideoRendererTests.swift`, `PiPCallControllerTests.swift`

**Modifiés** :
- `CallManager.swift` (flag `isSystemPiPActive`, injection `PiPCallProviding`, observers, H1/H2/H3).
- `WebRTCTypes.swift` (rien si flag ; sinon `.systemPiP`).
- `FloatingCallPillView.swift` (gate `!isSystemPiPActive`).
- `CallView.swift` / `RootView.swift` (bouton PiP conditionnel, câblage restore).
- `Info.plist` si besoin de config caméra multitâche (background `audio` déjà présent).

**pbxproj** : xcodeproj classique (objectVersion 63, pas de synchronized groups) → **4 entrées + 2 UUIDs par nouveau `.swift`** (≈ 4 fichiers source + 3 tests). Géré en dernier (convention worktree).

---

## 12. Risques & points à vérifier en implémentation
- Confirmer que `VideoSurvivalController.suspendOutboundVideo()` est **outbound-only** (la réception/les frames PiP doivent continuer) — `VideoSurvivalController.swift`.
- Confirmer que `MediaLifecycleBridge.prepareForBackground()` ne coupe pas le rendu PiP (guard `isCallActiveForAudioGuard` déjà présent — à valider).
- Vérifier l'instance du track exposée par `CallManager.remoteVideoTrack` (rendre observable si nécessaire).
- Orientation : valider que la rotation `RTCVideoFrame.rotation` est correctement appliquée (paysage).
