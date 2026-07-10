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

    init(socket: any MessageSocketProviding = MessageSocketManager.shared) {
        self.socket = socket
    }

    // MARK: - Permission

    func requestPermission() async -> TranscriptionPermission {
        let status = await withCheckedContinuation { continuation in
            // Same isolation trap as the AVAudioEngine tap block (see
            // startLocalCapture): requestAuthorization's completion runs on
            // an Apple-arbitrary background queue, but a closure literal
            // written inline here is implicitly MainActor-isolated under
            // this project's SWIFT_DEFAULT_ACTOR_ISOLATION — invoking it
            // off-MainActor traps (SIGTRAP). Established fix elsewhere in
            // this codebase for the same ObjC-permission-callback shape
            // (PHPhotoLibrary.requestAuthorization in RecentMediaStrip.swift,
            // AVCaptureDevice.requestAccess in CameraView.swift): re-enter
            // via Task { @MainActor in } rather than resuming inline.
            SFSpeechRecognizer.requestAuthorization { status in
                Task { @MainActor in
                    continuation.resume(returning: status)
                }
            }
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
    }

    private func stopLocalCapture() {
        guard audioEngine.isRunning else { return }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
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
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language)
        }
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
                    guard let self, self.isTranscribing else { return }
                    self.lastError = .recognitionFailed(underlying: NSError(
                        domain: "CallTranscriptionService",
                        code: -2,
                        userInfo: [NSLocalizedDescriptionKey: errorDescription]
                    ))
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
        rotationCount += 1
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
