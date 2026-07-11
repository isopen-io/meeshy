import Foundation
import Speech
import AVFoundation
import Combine
import MeeshySDK
import os

// nonisolated: os.Logger is a thread-safe value type (Apple docs) with no
// reason to inherit this file's default MainActor isolation — needed so the
// AVAudioEngine tap closure (which runs off-MainActor, see
// startLocalCapture/reinstallTap below) can log without an isolation error.
// Discovered via the Task 1 spike (2026-07-10): a bare `private let` here
// made the tap closure's log call fail to compile once the closure was
// correctly typed `@Sendable` (see below) — same fix applied there.
private nonisolated let callsLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

// MARK: - Transcription Segment

struct TranscriptionSegment: Identifiable, Equatable {
    let id: UUID
    let text: String
    let speakerId: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let isFinal: Bool
    let confidence: Double
    let language: String
    let translatedText: String?
    let translatedLanguage: String?

    init(
        id: UUID,
        text: String,
        speakerId: String,
        startTime: TimeInterval,
        endTime: TimeInterval,
        isFinal: Bool,
        confidence: Double,
        language: String,
        translatedText: String? = nil,
        translatedLanguage: String? = nil
    ) {
        self.id = id
        self.text = text
        self.speakerId = speakerId
        self.startTime = startTime
        self.endTime = endTime
        self.isFinal = isFinal
        self.confidence = confidence
        self.language = language
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
    }
}

// MARK: - Transcription Permission

enum TranscriptionPermission: Equatable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

// MARK: - Transcription Error

enum TranscriptionError: LocalizedError, Equatable {
    case permissionDenied
    case recognizerUnavailable(language: String)
    case onDeviceNotSupported(language: String)
    case recognitionFailed(underlying: Error)
    case audioEngineFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Speech recognition permission denied"
        case .recognizerUnavailable(let language):
            return "Speech recognizer unavailable for language: \(language)"
        case .onDeviceNotSupported(let language):
            return "On-device recognition not supported for language: \(language)"
        case .recognitionFailed(let error):
            return "Recognition failed: \(error.localizedDescription)"
        case .audioEngineFailed(let error):
            return "Local audio capture failed: \(error.localizedDescription)"
        }
    }

    static func == (lhs: TranscriptionError, rhs: TranscriptionError) -> Bool {
        lhs.errorDescription == rhs.errorDescription
    }
}

// MARK: - Protocol

@MainActor
protocol CallTranscriptionServiceProviding {
    var segments: [TranscriptionSegment] { get }
    var isTranscribing: Bool { get }
    var permission: TranscriptionPermission { get }
    var lastError: TranscriptionError? { get }
    func startTranscribing(callId: String, localLanguage: String, localUserId: String)
    func stopTranscribing()
    func requestPermission() async -> TranscriptionPermission
    func receiveTranslatedSegment(_ segment: TranscriptionSegment)
}

// MARK: - Call Transcription Service

/// Live-call captions: transcribes ONLY the local device's own microphone
/// (never the remote/decoded WebRTC audio — see
/// docs/superpowers/specs/2026-07-10-live-call-transcription-design.md for
/// why that sidesteps the "no ADM in the public WebRTC SDK build" blocker
/// that made the previous leader/follower design unreachable). Final
/// segments are sent to the gateway over the existing call socket
/// (`call:transcription-segment`), which relays them translated per
/// listener (`call:translated-segment`) — this class never translates
/// anything itself.
@MainActor
final class CallTranscriptionService: ObservableObject, CallTranscriptionServiceProviding {

    private enum Constants {
        static let maxDisplayedSegments = 5
        static let segmentRetentionLimit = 50
    }

    @Published private(set) var segments: [TranscriptionSegment] = []
    @Published private(set) var isTranscribing = false
    @Published private(set) var permission: TranscriptionPermission = .notDetermined
    @Published private(set) var lastError: TranscriptionError?

    /// PERF-005: while the live-captions panel is hidden, non-final results
    /// are skipped (no per-frame UI churn); finals are always processed and
    /// emitted regardless, since they also feed the other participant's view.
    @Published var isShowingOverlay: Bool = false

    var displayedSegments: [TranscriptionSegment] {
        Array(segments.suffix(Constants.maxDisplayedSegments))
    }

    private let socket: any MessageSocketProviding
    private var callId: String?
    private var localUserId = ""
    private var allSegments: [TranscriptionSegment] = []

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var rotationCount = 0
    private var configurationChangeObserver: NSObjectProtocol?
    private var interruptionObserver: NSObjectProtocol?

    init(socket: any MessageSocketProviding = MessageSocketManager.shared) {
        self.socket = socket
    }

    #if DEBUG
    /// Test-only seam: `isTranscribing` is otherwise only flippable via
    /// `startTranscribing`, which requires a real `SFSpeechRecognizer` +
    /// `AVAudioEngine` unavailable in the unit test host (see
    /// `applyRecognitionResult`'s doc comment for the same constraint).
    func setTranscribingForTesting(_ value: Bool) {
        isTranscribing = value
    }
    #endif

    // MARK: - Permission

    func requestPermission() async -> TranscriptionPermission {
        let status = await withCheckedContinuation { continuation in
            // Confirmed on device (crash Meeshy-2026-07-11-020237.ips,
            // faulting thread invoked by tccd via XPC): the `Task { @MainActor
            // in }`-wrapping tried first was NOT sufficient — the OUTER
            // closure passed to requestAuthorization is itself implicitly
            // MainActor-isolated (same SWIFT_DEFAULT_ACTOR_ISOLATION
            // inference as the AVAudioEngine tap block, see
            // startLocalCapture), and the dynamic isolation assertion traps
            // at the CALL SITE — before the closure's body (the Task{}) ever
            // runs — when tccd invokes it off-MainActor. The only fix that
            // actually breaks the inference is the same one used for the tap
            // block: an explicit @Sendable-typed local.
            let completion: @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void = { status in
                continuation.resume(returning: status)
            }
            SFSpeechRecognizer.requestAuthorization(completion)
        }
        let result = mapAuthorizationStatus(status)
        permission = result
        return result
    }

    // MARK: - Lifecycle

    func startTranscribing(callId: String, localLanguage: String, localUserId: String) {
        guard !isTranscribing else {
            callsLogger.warning("startTranscribing called while already transcribing")
            return
        }
        guard permission == .authorized else {
            lastError = .permissionDenied
            callsLogger.warning("startTranscribing: not authorized — permission=\(String(describing: self.permission))")
            return
        }

        let locale = Locale(identifier: localLanguage)
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            lastError = .recognizerUnavailable(language: localLanguage)
            callsLogger.warning("startTranscribing: no recognizer available for \(localLanguage)")
            return
        }
        // Confidentialité — jamais de repli sur la reconnaissance vocale
        // serveur d'Apple pendant un appel privé (décision produit du spec).
        guard recognizer.supportsOnDeviceRecognition else {
            lastError = .onDeviceNotSupported(language: localLanguage)
            callsLogger.warning("startTranscribing: on-device unsupported for \(localLanguage)")
            return
        }

        self.callId = callId
        self.localUserId = localUserId
        self.recognizer = recognizer
        lastError = nil

        do {
            try startLocalCapture()
        } catch {
            lastError = .audioEngineFailed(underlying: error)
            callsLogger.error("startTranscribing: AVAudioEngine failed: \(error.localizedDescription)")
            self.recognizer = nil
            return
        }

        startRecognitionTask(language: localLanguage)
        isTranscribing = true
        callsLogger.info("Call transcription started — local language: \(localLanguage)")
    }

    func stopTranscribing() {
        removeConfigurationObserver()
        removeInterruptionObserver()
        stopLocalCapture()
        recognitionTask?.cancel()
        recognitionTask = nil
        request?.endAudio()
        request = nil
        recognizer = nil

        allSegments.removeAll()
        segments.removeAll()
        isTranscribing = false
        lastError = nil
        callId = nil

        callsLogger.info("Call transcription stopped")
    }

    /// Teardown de fin d'appel — purge INCONDITIONNELLE, y compris si ce
    /// device n'a jamais transcrit lui-même (isTranscribing == false) mais a
    /// reçu des segments traduits de l'autre participant via
    /// `receiveTranslatedSegment`. Sans ce garde, le transcript de l'appel
    /// précédent resterait visible au suivant.
    func resetForCallEnd() {
        stopTranscribing()
        isShowingOverlay = false
    }

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
    private func startLocalCapture() throws {
        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
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
        try audioEngine.start()
        observeConfigurationChanges()
        observeAudioInterruptions()
    }

    private func stopLocalCapture() {
        // removeTap(onBus:) must run unconditionally, NOT only while the
        // engine is running. An AVAudioSession interruption (Siri, an
        // incoming GSM call, an alarm — all common mid-call) auto-stops the
        // engine on its own, so `isRunning` is already false by the time a
        // call ends normally. Gating removeTap behind `isRunning` used to
        // skip it in that case, leaving the tap installed on bus 0; the next
        // startLocalCapture()'s installTap(onBus: 0, …) on an already-tapped
        // bus raises an uncatchable NSInternalInconsistencyException. Apple
        // documents removeTap as safe to call even with no tap installed.
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
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
        reinstallTap(for: request)
        if !audioEngine.isRunning {
            do {
                try audioEngine.start()
            } catch {
                callsLogger.error("Failed to restart AVAudioEngine after configuration change: \(error.localizedDescription)")
            }
        }
        callsLogger.info("Reinstalled transcription tap after AVAudioEngine configuration change")
    }

    private func removeConfigurationObserver() {
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
        reinstallTap(for: request)
        do {
            try audioEngine.start()
            callsLogger.info("Restarted transcription capture after audio interruption ended")
        } catch {
            callsLogger.error("Failed to restart transcription capture after interruption: \(error.localizedDescription)")
        }
    }

    private func removeInterruptionObserver() {
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
    private func reinstallTap(for newRequest: SFSpeechAudioBufferRecognitionRequest) {
        audioEngine.inputNode.removeTap(onBus: 0)
        let format = audioEngine.inputNode.outputFormat(forBus: 0)
        // nonisolated(unsafe): see startLocalCapture's identical comment.
        nonisolated(unsafe) let capturedRequest = newRequest
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            capturedRequest.append(buffer)
        }
        audioEngine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
    }

    // MARK: - Recognition

    private func startRecognitionTask(language: String) {
        guard let recognizer, let request else { return }
        let speakerId = localUserId
        // @Sendable-typed local: recognitionTask(with:)'s resultHandler runs
        // on the recognizer's own queue, off-MainActor — same isolation trap
        // as startLocalCapture's tap block and requestPermission's
        // authorization completion. Not yet observed crashing here (no
        // report reached this far before the requestPermission fix), but
        // it's the identical Apple-completion-handler shape, so fixed
        // preemptively rather than waiting for a third device round-trip.
        let resultHandler: @Sendable (SFSpeechRecognitionResult?, Error?) -> Void = { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language)
        }
        recognitionTask = recognizer.recognitionTask(with: request, resultHandler: resultHandler)
    }

    /// PERF-005: runs on the recognizer's own queue (off-Main). Extracts
    /// Sendable scalars, then hands off to MainActor for state mutation.
    nonisolated private func handleRecognizerCallback(
        result: SFSpeechRecognitionResult?,
        error: Error?,
        speakerId: String,
        language: String
    ) {
        if let error {
            let errorDescription = error.localizedDescription
            Task.detached(priority: .utility) { [weak self] in
                await MainActor.run { [weak self] in
                    self?.applyRecognitionError(.recognitionFailed(underlying: NSError(
                        domain: "CallTranscriptionService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: errorDescription]
                    )))
                    callsLogger.error("Recognition error: \(errorDescription, privacy: .public)")
                }
            }
            return
        }

        guard let result else { return }
        let isFinal = result.isFinal
        let text = result.bestTranscription.formattedString
        let asrSegments = result.bestTranscription.segments
        let startMs = Int((asrSegments.first?.timestamp ?? 0) * 1000)
        let lastAsrSegment = asrSegments.last
        let endMs = Int(((lastAsrSegment?.timestamp ?? 0) + (lastAsrSegment?.duration ?? 0)) * 1000)
        let confidence = Double(lastAsrSegment?.confidence ?? 0)

        Task.detached(priority: .utility) { [weak self] in
            await self?.applyRecognitionResult(
                text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
                isFinal: isFinal, confidence: confidence, language: language
            )
        }
    }

    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive
    /// it directly, matching the stale-callback-after-teardown guard test.
    func applyRecognitionResult(
        text: String, speakerId: String, startMs: Int, endMs: Int,
        isFinal: Bool, confidence: Double, language: String
    ) {
        guard isTranscribing else { return }
        guard isFinal || isShowingOverlay else { return }

        let segment = TranscriptionSegment(
            id: UUID(), text: text, speakerId: speakerId,
            startTime: Double(startMs) / 1000, endTime: Double(endMs) / 1000,
            isFinal: isFinal, confidence: confidence, language: language
        )
        appendSegment(segment)

        guard isFinal else { return }
        emitFinalSegment(text: text, speakerId: speakerId, startMs: startMs, endMs: endMs, confidence: confidence, language: language)
        rotateRecognitionRequest(language: language)
    }

    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive
    /// it directly, matching `applyRecognitionResult`'s pattern. A recognizer
    /// error means captions have genuinely stopped producing results — stop
    /// transcribing so `isTranscribing` (which the captions toggle is driven
    /// off, see `CallView`) reflects reality instead of staying lit while
    /// nothing updates, then restore `lastError` since `stopTranscribing()`
    /// clears it.
    func applyRecognitionError(_ error: TranscriptionError) {
        guard isTranscribing else { return }
        stopTranscribing()
        lastError = error
    }

    private func emitFinalSegment(text: String, speakerId: String, startMs: Int, endMs: Int, confidence: Double, language: String) {
        guard let callId else { return }
        let payload = CallTranscriptionSegmentPayload(
            text: text, speakerId: speakerId, startMs: startMs, endMs: endMs,
            isFinal: true, confidence: confidence, language: language
        )
        socket.emitCallTranscriptionSegment(callId: callId, segment: payload)
    }

    private func rotateRecognitionRequest(language: String) {
        recognitionTask?.cancel()
        request?.endAudio()

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        newRequest.requiresOnDeviceRecognition = true
        request = newRequest
        reinstallTap(for: newRequest)

        startRecognitionTask(language: language)
    }

    // MARK: - Remote segments (déjà traduits côté gateway)

    func receiveTranslatedSegment(_ segment: TranscriptionSegment) {
        appendSegment(segment)
    }

    // MARK: - Private — Result Handling

    private func appendSegment(_ segment: TranscriptionSegment) {
        allSegments.removeAll { $0.speakerId == segment.speakerId && !$0.isFinal }
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        segments = allSegments.sorted { $0.startTime < $1.startTime }
    }

    private func mapAuthorizationStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> TranscriptionPermission {
        switch status {
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}
