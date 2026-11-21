import Foundation
import Speech
import AVFoundation
import MeeshySDK
import os

private nonisolated let callsLogger = MeeshyLog.logger(.calls)

extension CallTranscriptionService {
    // MARK: - Local audio capture (jamais l'audio distant)

    /// Tap indépendant du pipeline audio WebRTC, installé APRÈS l'activation
    /// CallKit (voir CallManager.toggleTranscription — jamais avant, même
    /// contrainte documentée dans P2PWebRTCClient.swift pour WebRTC
    /// lui-même). Validé par le spike Phase 0 — voir Task 1 de
    /// docs/superpowers/plans/2026-07-10-live-call-transcription.md.
    ///
    /// The tap block MUST be an explicit `@Sendable`-typed local, not a bare
    /// trailing closure — under this project's
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor`, a closure literal written
    /// inline inside this `@MainActor` method is implicitly inferred as
    /// MainActor-isolated regardless of what it captures. AVAudioEngine
    /// invokes tap blocks off-MainActor (its own real-time queue); an
    /// inferred-MainActor closure traps at runtime (SIGTRAP,
    /// `swift_task_isCurrentExecutorImpl`) the first time it's called.
    /// Discovered via the Task 1 spike (2026-07-10, crash report
    /// `Meeshy-2026-07-10-173828.ips`) — do not revert this pattern.
    func startLocalCapture() throws {
        awaitEngineTeardown()
        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // Poser un tap sur un format à 0 Hz / 0 canal lève une exception ObjC
        // irrattrapable — voir `AudioTapFormatReadiness` (#7002). Ici on peut
        // encore REFUSER de démarrer : `startTranscribing` attrape et pose
        // `lastError` sans jamais allumer `isTranscribing`.
        guard AudioTapFormatReadiness.mayInstall(sampleRate: format.sampleRate,
                                                 channelCount: format.channelCount) else {
            throw TranscriptionError.tapFormatUnavailable(sampleRate: format.sampleRate,
                                                          channelCount: format.channelCount)
        }
        // nonisolated(unsafe): SFSpeechAudioBufferRecognitionRequest isn't
        // audited Sendable by Apple, but `append(_:)` is Apple's documented
        // call pattern for exactly this real-time tap callback — the type
        // is safe here, the compiler just can't see it.
        nonisolated(unsafe) let capturedRequest = newRequest
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            capturedRequest.append(buffer)
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            // Le moteur a refusé de partir (session interrompue, appel en attente) : `isCaptureActive` reste
            // faux, donc `stopLocalCapture` ne retirerait jamais ce tap — et la tentative suivante en poserait
            // un second sur le même bus, une exception que rien ne rattrape.
            input.removeTap(onBus: 0)
            throw error
        }
        isCaptureActive = true
        observeConfigurationChanges()
        observeAudioInterruptions()
    }

    func stopLocalCapture() {
        // Never touch `audioEngine` when capture was never started (crash CallTranscriptionServiceTests via
        // `resetForCallEnd`/`applyRecognitionError`) — see `isCaptureActive`'s
        // doc comment.
        guard isCaptureActive else { return }

        // removeTap(onBus:) must run unconditionally, NOT only while the
        // engine is running. An AVAudioSession interruption (Siri, an
        // incoming GSM call, an alarm — all common mid-call) auto-stops the
        // engine on its own, so `isRunning` is already false by the time a
        // call ends normally. Gating removeTap behind `isRunning` used to
        // skip it in that case, leaving the tap installed on bus 0; the next
        // startLocalCapture()'s installTap(onBus: 0, …) on an already-tapped
        // bus raises an uncatchable NSInternalInconsistencyException. Apple
        // documents removeTap as safe to call even with no tap installed.
        //
        // #8989 — the teardown runs on `engineTeardownQueue`, off the main
        // thread: `removeTap` and `stop()` can block, and muting the mic with
        // captions on used to pay for them in the gesture itself.
        isCaptureActive = false
        #if compiler(>=6.4)
        let engine = audioEngine
        #else
        nonisolated(unsafe) let engine = audioEngine
        #endif
        let teardown: @Sendable () -> Void = {
            engine.inputNode.removeTap(onBus: 0)
            if engine.isRunning {
                engine.stop()
            }
        }
        Self.engineTeardownQueue.async(execute: teardown)
    }

    /// #8989 — tout ce qui touche de nouveau le moteur attend d'abord la fin
    /// d'un démontage en vol : un `installTap` sur un bus encore équipé lève
    /// une exception irrattrapable. Le fil principal n'attend que si un
    /// démontage est réellement en cours (rallumage immédiat du micro).
    private func awaitEngineTeardown() {
        let barrier: @Sendable () -> Void = {}
        Self.engineTeardownQueue.sync(execute: barrier)
    }

    /// A route change mid-capture (Bluetooth connect/disconnect, headphones,
    /// hardware reconfiguration) posts this notification with a new
    /// `inputNode` format — Apple's documented pattern for any long-lived tap
    /// is to reinstall it with the fresh format, otherwise the tap's stale
    /// format mismatches CoreAudio's new hardware format (crash) or the
    /// recognizer silently stops receiving audio. This engine is independent
    /// of the WebRTC/`RTCAudioSession` route-change handling in CallManager
    /// (see its `AVAudioSession.routeChangeNotification` observer), which
    /// only fixes up the call's own audio path, not this one.
    private func observeConfigurationChanges() {
        removeConfigurationObserver()
        configurationChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: audioEngine,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleAudioEngineConfigurationChange()
            }
        }
    }

    private func handleAudioEngineConfigurationChange() {
        guard isTranscribing, let request else { return }
        let ownerCallId = callId
        guard reinstallTap(for: request) else { return }
        if !audioEngine.isRunning {
            do {
                try audioEngine.start()
            } catch {
                // The tap is now installed on a STOPPED engine — no more audio
                // will ever reach the recognizer for the rest of the call.
                // Degrade explicitly (mirrors startTranscribing's own catch)
                // instead of leaving `isTranscribing` lit with dead captions:
                // see `applyRecognitionError`'s doc comment.
                callsLogger.error("Failed to restart AVAudioEngine after configuration change: \(error.localizedDescription)")
                applyRecognitionError(.audioEngineFailed(underlying: error), callId: ownerCallId)
                return
            }
        }
        callsLogger.info("Reinstalled transcription tap after AVAudioEngine configuration change")
    }

    func removeConfigurationObserver() {
        if let configurationChangeObserver {
            NotificationCenter.default.removeObserver(configurationChangeObserver)
        }
        configurationChangeObserver = nil
    }

    /// iOS auto-stops `AVAudioEngine` on ANY `AVAudioSession` interruption
    /// (Siri, an incoming GSM call, an alarm — all common mid-call), unlike
    /// `.AVAudioEngineConfigurationChange` (hardware/route reconfiguration
    /// only, handled above). Without this observer, captions silently stop
    /// producing segments for the rest of the call: no recognizer error
    /// fires (no audio buffers ≠ an error callback), so `isTranscribing`
    /// stays `true` and the captions UI keeps claiming they're live.
    private func observeAudioInterruptions() {
        removeInterruptionObserver()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
            Task { @MainActor [weak self] in
                self?.handleAudioInterruption(type: type)
            }
        }
    }

    private func handleAudioInterruption(type: AVAudioSession.InterruptionType) {
        let action = Self.evaluateInterruptionAction(
            type: type,
            isTranscribing: isTranscribing,
            engineIsRunning: audioEngine.isRunning
        )
        guard action == .restartEngine, let request else { return }
        let ownerCallId = callId
        guard reinstallTap(for: request) else { return }
        do {
            try audioEngine.start()
            callsLogger.info("Restarted transcription capture after audio interruption ended")
        } catch {
            // Same failure mode as handleAudioEngineConfigurationChange above:
            // a resume that throws (mic grabbed by another app, a second
            // interruption arriving back-to-back, hardware busy) leaves the
            // tap on a stopped engine with `isTranscribing` still `true` —
            // exactly the silently-dead-captions bug this observer exists to
            // prevent (see observeAudioInterruptions's doc comment above).
            callsLogger.error("Failed to restart transcription capture after interruption: \(error.localizedDescription)")
            applyRecognitionError(.audioEngineFailed(underlying: error), callId: ownerCallId)
        }
    }

    func removeInterruptionObserver() {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        interruptionObserver = nil
    }

    /// Pure decision extracted from `handleAudioInterruption` so it's unit
    /// testable without a real `AVAudioEngine`/`AVAudioSession` (unavailable
    /// in the unit test host — see `applyRecognitionResult`'s doc comment
    /// for the same constraint).
    enum InterruptionAction: Equatable {
        case none
        case restartEngine
    }

    static func evaluateInterruptionAction(
        type: AVAudioSession.InterruptionType,
        isTranscribing: Bool,
        engineIsRunning: Bool
    ) -> InterruptionAction {
        guard isTranscribing else { return .none }
        switch type {
        case .began:
            return .none
        case .ended:
            return engineIsRunning ? .none : .restartEngine
        @unknown default:
            return .none
        }
    }

    /// See `startLocalCapture`'s doc comment — same `@Sendable`-typed-local
    /// requirement applies here.
    ///
    /// **Rend `false` quand le micro n'a plus de format exploitable** (#7002) :
    /// ses trois appelants sont rejoués sur les instants où c'est le plus
    /// probable — changement de configuration, fin d'interruption, rotation de
    /// requête. Le refus RETIRE les sous-titres au lieu de laisser
    /// `isTranscribing` allumé au-dessus d'un moteur que plus rien n'alimente ;
    /// les appelants n'ont donc rien à dégrader eux-mêmes, seulement à
    /// s'arrêter. Pas de `@discardableResult` : ignorer ce verdict doit faire
    /// rougir le compilateur, pas passer inaperçu.
    func reinstallTap(for newRequest: SFSpeechAudioBufferRecognitionRequest) -> Bool {
        awaitEngineTeardown()
        audioEngine.inputNode.removeTap(onBus: 0)
        let format = audioEngine.inputNode.outputFormat(forBus: 0)
        guard AudioTapFormatReadiness.mayInstall(sampleRate: format.sampleRate,
                                                 channelCount: format.channelCount) else {
            let ownerCallId = callId
            callsLogger.error("Transcription tap refused: microphone format is \(format.sampleRate) Hz / \(format.channelCount) ch — captions stopped")
            applyRecognitionError(.tapFormatUnavailable(sampleRate: format.sampleRate,
                                                        channelCount: format.channelCount),
                                  callId: ownerCallId)
            return false
        }
        // nonisolated(unsafe): see startLocalCapture's identical comment.
        nonisolated(unsafe) let capturedRequest = newRequest
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            capturedRequest.append(buffer)
        }
        audioEngine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        return true
    }
}
