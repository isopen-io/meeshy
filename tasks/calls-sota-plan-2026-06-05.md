# Plan SOTA — Appels natifs iOS / iPadOS / macOS (2026-06-05)

> Scope: iOS↔iOS, iOS↔macOS, macOS↔macOS. Web hors scope.
> Mac = "Designed for iPad" (isiOSAppOnMac), PAS Catalyst.
> Bâti sur les 3 fixes déjà posés : phantom-cleanup gateway, isCallActiveGuard, BackgroundTransitionCoordinator call-guard.

## Chemin le plus court vers « fiable » (ordre strict)

### Étape 1 — P0-2 Transport fiable
- Retirer `forcePolling(true)` ×3 : `MessageSocketManager.swift:1140,1166`, `SocialSocketManager.swift:408` → transports `["websocket","polling"]`
- Gateway `MeeshySocketIOManager.ts` : `pingTimeout 10000→20000`, `pingInterval 25000→~20000`
- iOS rebuild + gateway redeploy

### Étape 2 — P0-3 + P0-7 Ne plus perdre les signaux
- iOS : `emitCallSignal` (offer + ICE) → `emitWithAck` ; file un-ACK seq-numérotée ; resend timeout + replay sur `didReconnect` (après emitCallJoin) ; buffer ICE émis socket-down
- Gateway : fenêtre de grâce reconnexion 10-15s avant `leaveCall` + dédupliquer cleanup disconnect (1 owner = CallEventsHandler, retirer la boucle leave de AuthHandler)
- iOS rebuild + gateway redeploy

### Étape 3 — P0-1 + P0-8(Mac) Débloquer macOS [LE plus impactant pour le focus actuel]
- Gate `ProcessInfo.processInfo.isiOSAppOnMac` autour de CallKit/PushKit (`CallManager.swift`, `VoIPPushManager.swift`)
- Sur Mac : UI d'appel in-app (entrant/sortant), activation audio manuelle PRIMAIRE (le `[AUDIO_FALLBACK]` devient le chemin Mac), forcer `.speaker` (étendre le gate `#if simulator` à `|| isiOSAppOnMac`)
- iOS rebuild seul

### Étape 4 — P0-4 ICE-restart réel
- `pc.restartIce()` (ou constraint `{IceRestart:true}`) dans `performICERestart`
- `handleSignalOffer` accepte les offers en `.connected`/`.reconnecting`
- `setRemoteDescription` type-aware (.offer → setRemoteOffer + createAnswer)
- iOS rebuild seul

### Étape 5 — P0-8 complet Audio robuste
- `AVAudioSession.routeChangeNotification` observer → ré-applique `applySpeakerRoute()` + réconcilie `isSpeaker`
- Helper idempotent `activateRTCAudioSessionIfNeeded()` partagé par `didActivate` ET fallback
- iOS rebuild seul

### Étape 6 — P0-6 + P0-5 Anti-zombie serveur
- 1 `CallService` partagé injecté (MeeshySocketIOManager, CallEventsHandler, routes/calls.ts, CallCleanupService) → ranime le tier heartbeat-GC
- `endCall()` pré-ACK : émettre `call:force-leave(conversationId)` si `currentCallId==nil` mais setup actif (capturer conversationId dans startCall)
- gateway redeploy + iOS rebuild

### Étape 7 — P0-9 Nettoyage
- Revert `[CALL-DIAG]` (6 fichiers — garder le comportement phantom-cleanup, retag info)
- Supprimer dead code : CallEventQueue, MediaPipelineHook, CallMediaConfig, MeeshyAudioProcessingModule, markCallAsRejected, addAudioRedundancy, enableSimulcast (+ pbxproj : 4 entrées + 2 UUIDs par fichier)
- iOS rebuild + gateway redeploy

## P1 — Polish SOTA (post-fiabilité)
Perfect-negotiation (polite/impolite), backoff+jitter+deadline reconnexion, replay serveur Redis par-call, deadlines durables DB (ringingExpiresAt), providerDidReset teardown, bitrate adaptatif réel, unifier answer path, validateur FSM, résoudre `rejected`.

## Dead code / CALL-DIAG à revert (file:line)
- gateway: CallEventsHandler.ts (~328, ~1033, ~1638), MeeshySocketIOManager.ts (~672), AuthHandler.ts (~340), CallService.ts (~337 garder comportement)
- iOS: CallManager.swift (~1209 RTP log), P2PWebRTCClient.swift (~1009 ICE_OUT)
- Dead files: CallEventQueue.swift, MediaPipelineHook.swift, CallMediaConfig.swift, MeeshyAudioProcessingModule.swift
