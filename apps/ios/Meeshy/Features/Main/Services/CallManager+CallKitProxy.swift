import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// Le délégué CallKit de `CallManager` : CallKit tient l'interface système de
/// l'appel (répondre, raccrocher, couper le micro, mettre en attente, DTMF) et
/// l'activation de la session audio ; ce mandataire relaie chaque action vers
/// le gestionnaire sur le MainActor.

// MARK: - CallKit Delegate Proxy

class CallKitDelegateProxy: NSObject, CXProviderDelegate, @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    weak var manager: CallManager?

    func providerDidReset(_ provider: CXProvider) {
        Logger.calls.info("CallKit provider did reset")
        // Apple's CallKit guidance: treat this as if no calls had ever
        // occurred. `endCall()` no-ops when `callState` isn't active, which
        // would otherwise skip `deactivateAudioSession()` and leave
        // `RTCAudioSession` stale if this fires without a matching
        // `didDeactivate` (e.g. after a system-level call reset). Disabling
        // it here is idempotent and independent of local call state.
        // Routed through audioSessionQueue.sync — like didActivate/didDeactivate
        // below — so this reset can never interleave with a concurrent
        // RTCAudioSession reconfiguration dispatched from the MainActor.
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.isAudioEnabled = false
            rtc.unlockForConfiguration()
        }
        Task { @MainActor [weak self] in
            self?.manager?.abandonAfterSystemReset()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // [Fix 2026-07-02] CallKit starts the callee's elapsed timer at
        // fulfill() — fulfilling here (at tap) made the counter run before the
        // WebRTC connection existed. The manager HOLDS the action and settles
        // it in `transitionToConnected` (fulfill), on pre-connect teardown
        // (fail), or via a 10 s safety net (fulfill) so CallKit can never time
        // it out.
        //
        // [Fix 2026-07-03] `CXProvider.setDelegate(_:queue: nil)` makes
        // CallKit create its OWN private serial queue for delegate callbacks
        // — it does NOT dispatch on main (Apple's documented behaviour for a
        // `nil` queue). The previous "are we on the main queue?" check was
        // therefore always false in production, so the hold above never
        // engaged: every answered call still fulfilled at tap time and
        // reintroduced the exact "timer starts before connection" bug this
        // fix was written for. Always hop to the MainActor and hold — the
        // 10 s safety net (`holdPendingAnswerAction`) bounds the worst case,
        // and `@preconcurrency import CallKit` above permits capturing the
        // non-Sendable `CXAnswerCallAction` across the actor hop.
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else {
                action.fulfill()
                return
            }
            // Identity guard: mirrors CXEndCallAction/CXSetMutedCallAction/
            // CXSetHeldCallAction/CXPlayDTMFCallAction below — reportIncomingVoIPCall's
            // busy path reports a SECOND, distinct CXCallUpdate/UUID via
            // reportNewIncomingCall while a primary call is already active, then
            // immediately retires it with reportCall(endedAt:). activeCallUUID only
            // ever tracks the primary call, so a mismatch here is that phantom/stale
            // UUID, not ours to answer. Without this guard, `holdPendingAnswerAction`
            // would hold THIS action as THE pending answer for the call — its
            // supersede-and-fail path (or the 10s safety net) could then fail/fulfill
            // the wrong action, tearing down the real, active call's genuinely
            // pending answer instead of the phantom one. `.fail()`, not `.fulfill()`:
            // CallKit already knows this call ended (reportCall(endedAt:) above), so
            // completing it as "answered" would be a lie.
            guard action.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit -> CXAnswerCallAction for non-active callUUID=\(action.callUUID), failing"
                )
                action.fail()
                return
            }
            manager.holdPendingAnswerAction(action)
            await manager.answerCallReady()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Diagnostic — `CXEndCallAction` is the only path through which the
        // system asks us to hang up. It fires from:
        //   1. Lock-screen / in-call "End" button taps (user action),
        //   2. our own `callController.request(CXEndCallAction)` call from
        //      `endCall()` (loop-back: we asked CallKit to end the call,
        //      not the other way around),
        //   3. CallKit autonomously deciding an outgoing call is stuck
        //      (e.g. no `reportOutgoingCall(_:startedConnectingAt:)` within
        //      its internal grace window) — this is the case we suspect for
        //      the "calls drop after 2-4 seconds" symptom.
        // Logging the call's UUID and current state here distinguishes (1)/(3)
        // from the in-app loop-back: in (2), `callState` is already `.ended`
        // by the time this delegate fires because `endCall()` calls
        // `endCallInternal` BEFORE requesting the transaction, so the log
        // will show `state=ended(.local)`. In (1)/(3), state is still
        // `.ringing` / `.offering` / `.connecting` / `.connected`.
        // CallKit requires fulfill() to be called synchronously before the
        // delegate method returns. Settling the action from inside a Task
        // means CallKit may time out the action if the manager hop is delayed.
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            let stateAtEntry = manager.callState
            Logger.calls.info(
                "CallKit -> CXEndCallAction received (callUUID=\(action.callUUID), state=\(String(describing: stateAtEntry)))"
            )
            // Identity guard: `reportIncomingVoIPCall`'s busy path reports a SECOND,
            // distinct CXCallUpdate/UUID via `reportNewIncomingCall` while a primary
            // call is already active, then retires it with `reportCall(endedAt:)` —
            // `maximumCallGroups = 2` exists to let CallKit accept that report. If a
            // system-originated action ever arrived tagged with that phantom UUID
            // instead of the primary call's, `endCall()` must not tear down the real,
            // active call. `activeCallUUID` only ever tracks the primary call, so any
            // mismatch here is a stale/unrelated action, not ours to act on.
            guard action.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit -> CXEndCallAction for non-active callUUID=\(action.callUUID), ignoring"
                )
                return
            }
            manager.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let isMuted = action.isMuted
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            if manager.isMuted != isMuted {
                // reportToCallKit: false — CallKit is the SOURCE of this
                // change (Watch/lock-screen/CarPlay); its own state already
                // matches `isMuted`, so resubmitting a CXSetMutedCallAction
                // here would just be an avoidable no-op transaction back to
                // the system that just told us about it.
                manager.toggleMute(reportToCallKit: false)
            }
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        // Fires when a cellular call pre-empts or releases our call. Audio is
        // already managed by didDeactivate/didActivate; we only handle video here
        // so the peer receives a proper "camera off" signal instead of a frozen
        // last frame during the hold.
        // CallKit contract: fulfill() synchronously before the delegate method
        // returns, matching the pattern used for CXAnswerCallAction and
        // CXEndCallAction. Fulfilling inside a Task delays settlement to the next
        // main-runloop tick, which violates the contract and can cause CallKit to
        // time out the action.
        let isOnHold = action.isOnHold
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            manager.handleHold(isOnHold)
        }
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        // The outgoing call path is initiated by the user's UI tap; CallManager
        // builds the WebRTC stack asynchronously. Fulfilling immediately here is
        // safe because we don't await any media setup from this delegate.
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        // RFC 4733: forward CallKit keypad input to the WebRTC DTMF sender.
        // Enables conference PINs and IVR navigation during active calls.
        // sendDTMF is a no-op when unavailable; fulfill so CallKit doesn't timeout.
        //
        // `sendDTMF` is @MainActor-isolated (like the rest of CallManager), but
        // `CXProvider.setDelegate(_:queue: nil)` dispatches this callback on
        // CallKit's own private serial queue, NOT main (see the CXAnswerCallAction
        // fix note above). Calling straight into `manager?.sendDTMF` from that
        // queue raced with any other MainActor call-state work (renegotiation,
        // ICE restart, mute toggles) in flight at the same moment. Hop to the
        // MainActor first, matching every other delegate method in this proxy.
        let digits = action.digits
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            manager.sendDTMF(digits: digits)
        }
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Stuck-muted fallback observation — the fallback no-ops once this is
        // set (see CallManager.scheduleStuckMutedFallback).
        CallManager.callKitDidActivateFired = true
        // CallKit owns AVAudioSession lifecycle; we ONLY bridge it to libwebrtc.
        // DO NOT call audioSession.setActive(true) here — CallKit already did.
        // Forcing it again creates desync between AVAudioSession and RTCAudioSession,
        // visible as alternating routes (Receiver/Speaker) in logs and silent calls.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = true
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidActivate(audioSession)
            rtc.isAudioEnabled = true
            // Re-apply Opus-aligned I/O preferences now that CallKit owns
            // the session — setConfiguration earlier set them, but CallKit's
            // own activation may reset hardware-level parameters. Best-effort.
            applyBestEffortAudioSetting("preferredSampleRate") {
                try audioSession.setPreferredSampleRate(48_000)
            }
            applyBestEffortAudioSetting("preferredIOBufferDuration") {
                try audioSession.setPreferredIOBufferDuration(0.02)
            }
            rtc.unlockForConfiguration()
        }

        // ML-based Voice Isolation (ambient-noise suppression at the capture stage,
        // complementing WebRTC's software AEC/NS) is a USER-controlled Mic Mode toggled
        // in Control Center — iOS exposes NO programmatic setter. The branch originally
        // called `setPreferredMicrophoneMode(.voiceIsolation)`, which exists on neither
        // AVAudioApplication nor AVCaptureDevice (compile error). `preferredMicrophoneMode`
        // / `activeMicrophoneMode` are read-only. Our call path already adopts the Core
        // Audio AUVoiceIO unit through RTCAudioSession (.voiceChat), so the system surfaces
        // the Voice Isolation toggle to the user on top of WebRTC's noise suppression — we
        // can observe their choice but cannot force it.
        // Ref: developer.apple.com/documentation/avfoundation/system-video-effects-and-microphone-modes

        // Audit P2-iOS-2 — `overrideOutputAudioPort` is only honored once
        // RTCAudioSession's audio engine has actually started. Calling it
        // synchronously from `didActivate` races the engine start; the
        // speaker toggle would silently fall back to earpiece. Defer by
        // ~200ms so the engine is up by the time we override.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            self?.manager?.applySpeakerRoute()
        }
        let outputs = audioSession.currentRoute.outputs
            .map { $0.portType.rawValue }
            .joined(separator: ",")
        Logger.calls.info("CallKit audio session activated; RTCAudioSession enabled (route=\(outputs), category=\(audioSession.category.rawValue), mode=\(audioSession.mode.rawValue))")

        // Phase 1.5 — démarrer le ringback tone APRÈS que CallKit ait
        // activé la session audio. Démarrer AVAudioPlayer avant ce point
        // (comme le faisait `startCall` originel) activait implicitement
        // la session en `.soloAmbient` (default iOS), ce qui pré-emptait
        // la catégorie `.playAndRecord` de CallKit et empêchait CallKit
        // de fire `didActivate` — déclenchant son timeout autonome ~3-5s
        // (le « calls drop after 2-4 seconds » + « wont be a UI to host
        // the call » sur simulateur).
        // ⚠️ Sortie .ringing(isOutgoing:true) UNIQUEMENT : sur incoming le
        // ringback caller-side n'a pas lieu (CallKit gère son propre
        // ringtone via `ringtoneSound`).
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if case .ringing(isOutgoing: true) = manager.callState {
                manager.startRingbackIfNeeded()
            }
        }
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.isAudioEnabled = false
            rtc.audioSessionDidDeactivate(audioSession)
            rtc.unlockForConfiguration()
        }
        Logger.calls.info("CallKit audio session deactivated; RTCAudioSession disabled")
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        // CallKit's own internal per-action deadline (undocumented, historically well
        // under our app-side safety nets) is independent of any hold we place on an
        // action — e.g. `holdPendingAnswerAction`'s pendingAnswerActionSafetyNetSeconds.
        // If CallKit's deadline elapses first, it has ALREADY torn down its side of the
        // transaction: calling `.fulfill()`/`.fail()` on `action` now is undefined
        // behavior, so this only reconciles our local state, never re-settles the action.
        Logger.calls.error("CallKit timed out performing \(type(of: action)) — reconciling local call state")
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if let answerAction = action as? CXAnswerCallAction {
                manager.discardTimedOutAnswerAction(answerAction)
            }
            // Identity guard: mirrors CXAnswerCallAction/CXEndCallAction/
            // CXSetMutedCallAction/CXSetHeldCallAction/CXPlayDTMFCallAction above —
            // this is the only CXProviderDelegate method that was missing it.
            // reportIncomingVoIPCall's busy path reports a SECOND, distinct
            // CXCallUpdate/UUID via reportNewIncomingCall while a primary call is
            // already active, then immediately retires it — activeCallUUID only
            // ever tracks the primary call, so a timeout carrying that phantom/stale
            // UUID (or any action type this proxy doesn't otherwise implement) is not
            // ours to react to. Without this guard, a timed-out action belonging to
            // an already-settled or foreign call unconditionally hangs up whatever
            // call IS active. discardTimedOutAnswerAction above stays unguarded so a
            // genuinely pending answer action is still released either way.
            guard (action as? CXCallAction)?.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit timed out performing \(type(of: action)) for non-active callUUID — not ending active call"
                )
                return
            }
            manager.endCall()
        }
    }
}


private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
