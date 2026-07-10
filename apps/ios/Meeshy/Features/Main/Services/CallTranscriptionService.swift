import Speech
import Combine
import os

// nonisolated: os.Logger is a thread-safe value type (Apple docs) with no
// reason to inherit this file's default MainActor isolation — needed so the
// AVAudioEngine tap closure (which runs off-MainActor, see
// debugSpikeToggleLocalCapture below) can log without an isolation error.
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

    nonisolated init(
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
    func startTranscribing(localLanguage: String, remoteLanguage: String, localUserId: String, remoteUserId: String)
    func stopTranscribing()
    func requestPermission() async -> TranscriptionPermission
    func appendLocalAudioBuffer(_ buffer: AVAudioPCMBuffer)
    func appendRemoteAudioBuffer(_ buffer: AVAudioPCMBuffer)
}

// MARK: - Stream Recognizer

private final class StreamRecognizer {
    let recognizer: SFSpeechRecognizer
    var request: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    let speakerId: String
    let language: String
    var rotationCount: Int = 0

    init(recognizer: SFSpeechRecognizer, speakerId: String, language: String) {
        self.recognizer = recognizer
        self.speakerId = speakerId
        self.language = language
    }

    func tearDown() {
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
    }
}

// MARK: - Transcription Role

enum TranscriptionRole: Equatable {
    case undecided
    case leader    // This device transcribes both streams and shares to peer
    case follower  // This device receives segments from leader
}

enum TranscriptionCapabilityLevel: String, Comparable, Sendable {
    case none = "none"
    case basic = "basic"
    case standard = "standard"
    case advanced = "advanced"

    private var rank: Int {
        switch self {
        case .none: return 0
        case .basic: return 1
        case .standard: return 2
        case .advanced: return 3
        }
    }

    static func < (lhs: TranscriptionCapabilityLevel, rhs: TranscriptionCapabilityLevel) -> Bool {
        lhs.rank < rhs.rank
    }
}

// MARK: - Call Transcription Service

@MainActor
final class CallTranscriptionService: ObservableObject, CallTranscriptionServiceProviding {

    // MARK: - Constants

    private enum Constants {
        static let maxDisplayedSegments = 5
        static let segmentRetentionLimit = 50
        /// Segments received before role negotiation completes are buffered up to
        /// this cap and replayed if we resolve to `.follower`. Prevents silent data
        /// loss when the leader pushes segments via DataChannel before the
        /// capability exchange message arrives on the signalling channel.
        static let pendingSegmentsBufferCap = 10
    }

    // MARK: - Published State

    @Published private(set) var segments: [TranscriptionSegment] = []
    @Published private(set) var isTranscribing = false
    @Published private(set) var permission: TranscriptionPermission = .notDetermined
    @Published private(set) var lastError: TranscriptionError?
    @Published private(set) var role: TranscriptionRole = .undecided
    @Published private(set) var localCapability: TranscriptionCapabilityLevel = .none

    /// PERF-005: when the live transcription panel is hidden, we still consume
    /// audio for finals (so recordings remain accurate) but skip all partial
    /// result work. Toggled by CallView when the transcription overlay is
    /// shown/dismissed. Defaults to false → cold start = no partial render
    /// cost until the user opens the overlay.
    @Published var isShowingOverlay: Bool = false

    var displayedSegments: [TranscriptionSegment] {
        Array(segments.suffix(Constants.maxDisplayedSegments))
    }

    // MARK: - Private State

    private var localStream: StreamRecognizer?
    private var remoteStream: StreamRecognizer?
    private var localUserId = ""
    private var remoteUserId = ""
    private var allSegments: [TranscriptionSegment] = []
    /// Segments buffered while `role == .undecided`. Replayed when role resolves
    /// to `.follower`; discarded when role resolves to `.leader` or on call end.
    private var pendingRemoteSegments: [TranscriptionSegment] = []

    // MARK: - Permission

    func requestPermission() async -> TranscriptionPermission {
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        let result = mapAuthorizationStatus(status)
        permission = result
        return result
    }

    // MARK: - Lifecycle

    func startTranscribing(localLanguage: String, remoteLanguage: String, localUserId: String, remoteUserId: String) {
        guard !isTranscribing else {
            callsLogger.warning("startTranscribing called while already transcribing")
            return
        }

        guard permission == .authorized else {
            lastError = .permissionDenied
            callsLogger.warning("startTranscribing: speech recognition not authorized — permission=\(String(describing: self.permission))")
            return
        }

        self.localUserId = localUserId
        self.remoteUserId = remoteUserId
        lastError = nil

        do {
            let local = try makeStreamRecognizer(languageCode: localLanguage, speakerId: localUserId)
            let remote = try makeStreamRecognizer(languageCode: remoteLanguage, speakerId: remoteUserId)

            startRecognitionTask(for: local)
            startRecognitionTask(for: remote)

            localStream = local
            remoteStream = remote
            isTranscribing = true

            callsLogger.info("Call transcription started — local: \(localLanguage), remote: \(remoteLanguage)")
        } catch let error as TranscriptionError {
            lastError = error
            callsLogger.error("Failed to start transcription: \(error.localizedDescription)")
        } catch {
            lastError = .recognitionFailed(underlying: error)
            callsLogger.error("Unexpected transcription error: \(error.localizedDescription)")
        }
    }

    func stopTranscribing() {
        localStream?.tearDown()
        remoteStream?.tearDown()
        localStream = nil
        remoteStream = nil

        allSegments.removeAll()
        segments.removeAll()
        pendingRemoteSegments.removeAll()
        isTranscribing = false
        lastError = nil

        callsLogger.info("Call transcription stopped")
    }

    /// Teardown de fin d'appel — purge INCONDITIONNELLE. Un device FOLLOWER
    /// accumule des segments via `receiveRemoteSegment` avec
    /// `isTranscribing == false` : le guard `if isTranscribing` de
    /// l'appelant laissait sinon le transcript (et le rôle négocié) de
    /// l'appel précédent visibles dans l'appel suivant.
    func resetForCallEnd() {
        stopTranscribing()
        role = .undecided
        isShowingOverlay = false
    }

    // MARK: - Audio Buffer Input

    func appendLocalAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        localStream?.request?.append(buffer)
    }

    func appendRemoteAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        remoteStream?.request?.append(buffer)
    }

    // MARK: - Private — Recognizer Setup

    private func makeStreamRecognizer(languageCode: String, speakerId: String) throws -> StreamRecognizer {
        let locale = Locale(identifier: languageCode)
        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            throw TranscriptionError.recognizerUnavailable(language: languageCode)
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true

        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        } else {
            callsLogger.info("On-device model unavailable for \(languageCode), using server-assisted recognition")
            request.requiresOnDeviceRecognition = false
        }

        let stream = StreamRecognizer(recognizer: recognizer, speakerId: speakerId, language: languageCode)
        stream.request = request
        return stream
    }

    private func startRecognitionTask(for stream: StreamRecognizer) {
        guard let request = stream.request else { return }

        let speakerId = stream.speakerId
        let language = stream.language

        // PERF-005: SFSpeechRecognizer with on-device recognition runs CPU-
        // intensive work in its callback (audio decoding + acoustic model
        // forward pass for partials). The callback already runs off the
        // MainActor on the recognizer's private queue, so we extract the
        // Sendable scalars (segment strings, timestamps, isFinal,
        // confidence) right in the closure and only hop to MainActor with
        // the small Sendable payload. This keeps SFSpeechRecognitionResult
        // (non-Sendable) inside the recognizer's domain.
        stream.task = stream.recognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language)
        }
    }

    /// PERF-005: runs synchronously on the recognizer's queue (off-Main).
    /// Pulls sendable data out of the result, then hands it to MainActor for
    /// state mutation. Partials are gated on isShowingOverlay so we skip the
    /// per-frame UI churn while the panel is hidden.
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
                    callsLogger.error("Recognition error for speaker \(speakerId, privacy: .public): \(errorDescription, privacy: .public)")
                }
            }
            return
        }

        guard let result else { return }
        let isFinal = result.isFinal

        // Extract sendable scalars from the non-Sendable result inside the
        // recognizer's queue — this is a pure read, no further callbacks.
        let newSegments: [TranscriptionSegment] = result.bestTranscription.segments.map { segment in
            TranscriptionSegment(
                id: UUID(),
                text: segment.substring,
                speakerId: speakerId,
                startTime: segment.timestamp,
                endTime: segment.timestamp + segment.duration,
                isFinal: isFinal,
                confidence: Double(segment.confidence),
                language: language
            )
        }
        let boundaryText: String? = isFinal ? result.bestTranscription.formattedString : nil

        Task.detached(priority: .utility) { [weak self] in
            await self?.applyRecognitionResult(
                segments: newSegments,
                speakerId: speakerId,
                isFinal: isFinal,
                boundaryText: boundaryText
            )
        }
    }

    /// PERF-005: MainActor-isolated apply step. Skips partial work while the
    /// overlay is hidden so the cost of partial recognition becomes nearly
    /// zero when the user has dismissed the transcription panel.
    /// Internal (not `private`) so `CallTranscriptionServiceTests` can drive the
    /// stale-callback-after-teardown guard directly.
    func applyRecognitionResult(
        segments newSegments: [TranscriptionSegment],
        speakerId: String,
        isFinal: Bool,
        boundaryText: String?
    ) {
        // Guards against the same hazard `resetForCallEnd` documents: the
        // recognizer callback runs on its own queue and hops to MainActor via
        // `Task.detached`, so a result can still be in flight when
        // `stopTranscribing()`/`resetForCallEnd()` clears `allSegments`/`segments`
        // for a call that just ended. Without this check, a stale callback would
        // repopulate the transcript with the *previous* call's data right after
        // the reset — the error-handling branch above already guards on
        // `isTranscribing` for this exact reason.
        guard isTranscribing else { return }
        guard isFinal || isShowingOverlay else { return }
        replaceSegments(for: speakerId, with: newSegments, isFinal: isFinal)
        if isFinal, let boundaryText {
            rotateRecognitionRequest(for: speakerId, boundaryText: boundaryText)
        }
    }

    // MARK: - Private — Result Handling

    private func rotateRecognitionRequest(for speakerId: String, boundaryText: String) {
        let stream: StreamRecognizer?
        if speakerId == localUserId {
            stream = localStream
        } else {
            stream = remoteStream
        }

        guard let stream else { return }

        stream.request?.endAudio()
        stream.task?.cancel()
        stream.rotationCount += 1

        let newRequest = SFSpeechAudioBufferRecognitionRequest()
        newRequest.requiresOnDeviceRecognition = stream.recognizer.supportsOnDeviceRecognition
        newRequest.shouldReportPartialResults = true
        newRequest.addsPunctuation = true
        stream.request = newRequest

        let language = stream.language

        // PERF-005: same nonisolated-callback hop as startRecognitionTask.
        // `recognitionTask(with:)` returns a non-optional SFSpeechRecognitionTask —
        // it never fails synchronously, failures surface later via the `error`
        // param of the completion handler, which handleRecognizerCallback already
        // routes into `lastError` on every occurrence (not just after N rotations).
        stream.task = stream.recognizer.recognitionTask(with: newRequest) { [weak self] result, error in
            self?.handleRecognizerCallback(result: result, error: error, speakerId: speakerId, language: language)
        }

        // Never log transcript content: it's the verbatim spoken words of the call.
        callsLogger.info("Rotated recognition request for speaker \(speakerId) (rotation #\(stream.rotationCount)), boundary: \(boundaryText.count) chars")
    }

    private func replaceSegments(for speakerId: String, with newSegments: [TranscriptionSegment], isFinal: Bool) {
        allSegments.removeAll { $0.speakerId == speakerId && !$0.isFinal }
        allSegments.append(contentsOf: newSegments)

        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }

        segments = allSegments.sorted { $0.startTime < $1.startTime }
    }

    // MARK: - Private — Helpers

    private func mapAuthorizationStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> TranscriptionPermission {
        switch status {
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    // MARK: - Capability Detection

    func detectLocalCapability(for language: String) -> TranscriptionCapabilityLevel {
        let locale = Locale(identifier: language)
        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            localCapability = .none
            return .none
        }

        guard recognizer.isAvailable else {
            localCapability = .none
            return .none
        }

        if recognizer.supportsOnDeviceRecognition {
            localCapability = .standard
            return .standard
        }

        localCapability = .basic
        return .basic
    }

    func supportedOnDeviceLanguages() -> [String] {
        let commonLanguages = ["en", "fr", "es", "de", "it", "pt", "ja", "ko", "zh", "ru", "ar", "hi"]
        return commonLanguages.filter { lang in
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) else { return false }
            return recognizer.supportsOnDeviceRecognition
        }
    }

    // MARK: - Role Negotiation

    func resolveRole(
        localCapability: TranscriptionCapabilityLevel,
        remoteCapability: TranscriptionCapabilityLevel,
        isInitiator: Bool
    ) {
        if localCapability == .none && remoteCapability == .none {
            role = .undecided
            pendingRemoteSegments.removeAll()
            callsLogger.info("Neither peer can transcribe")
            return
        }

        if remoteCapability == .none {
            role = .leader
            pendingRemoteSegments.removeAll()
            callsLogger.info("Local is only capable peer → leader")
            return
        }

        if localCapability == .none {
            role = .follower
            callsLogger.info("Remote is only capable peer → follower")
            flushPendingSegments()
            return
        }

        if localCapability > remoteCapability {
            role = .leader
            pendingRemoteSegments.removeAll()
            callsLogger.info("Local has higher capability → leader")
        } else if remoteCapability > localCapability {
            role = .follower
            callsLogger.info("Remote has higher capability → follower")
            flushPendingSegments()
        } else {
            let becomeLeader = isInitiator
            role = becomeLeader ? .leader : .follower
            callsLogger.info("Tie broken by initiator role → \(becomeLeader ? "leader" : "follower")")
            if becomeLeader {
                pendingRemoteSegments.removeAll()
            } else {
                flushPendingSegments()
            }
        }
    }

    private func flushPendingSegments() {
        guard !pendingRemoteSegments.isEmpty else { return }
        let buffered = pendingRemoteSegments
        pendingRemoteSegments.removeAll()
        callsLogger.info("Replaying \(buffered.count) buffered segment(s) after role resolved to follower")
        for segment in buffered {
            appendSegmentAsFollower(segment)
        }
    }

    private func appendSegmentAsFollower(_ segment: TranscriptionSegment) {
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        segments = allSegments.sorted { $0.startTime < $1.startTime }
    }

    // MARK: - Follower Mode: Receive segments from leader

    func receiveRemoteSegment(_ segment: TranscriptionSegment) {
        switch role {
        case .follower:
            appendSegmentAsFollower(segment)
        case .undecided:
            if pendingRemoteSegments.count < Constants.pendingSegmentsBufferCap {
                pendingRemoteSegments.append(segment)
            } else {
                callsLogger.warning("Transcription pending buffer full (\(Constants.pendingSegmentsBufferCap)) — dropping segment id=\(segment.id) speaker=\(segment.speakerId)")
            }
        case .leader:
            break
        }
    }
}

#if DEBUG
extension CallTranscriptionService {
    /// Phase-0 spike only — NOT part of the shipped feature. Installs a raw
    /// AVAudioEngine tap on the mic input, independent of WebRTC's own audio
    /// pipeline, and logs buffer counts. Validates that a second audio
    /// consumer can coexist with RTCAudioSession.useManualAudio + CallKit's
    /// didActivate/didDeactivate lifecycle without degrading call audio.
    /// Deleted (or absorbed into startLocalCapture) once Task 3 lands.
    /// See docs/superpowers/plans/2026-07-10-live-call-transcription.md Task 1.
    func debugSpikeToggleLocalCapture() {
        if Self.spikeEngine != nil {
            Self.spikeEngine?.inputNode.removeTap(onBus: 0)
            Self.spikeEngine?.stop()
            Self.spikeEngine = nil
            callsLogger.info("[SPIKE] stopped — received \(Self.spikeBufferCount) buffers")
            Self.spikeBufferCount = 0
            return
        }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // Explicit @Sendable-typed local breaks the implicit MainActor
        // isolation this project's SWIFT_DEFAULT_ACTOR_ISOLATION infers onto
        // closure literals written inline inside a @MainActor method.
        // AVAudioEngine invokes tap blocks off-MainActor (its own real-time
        // queue) — an inferred-MainActor closure traps at runtime (SIGTRAP,
        // swift_task_isCurrentExecutorImpl) the first time AVAudioEngine
        // calls it. Discovered via this exact spike (2026-07-10, crash
        // Meeshy-2026-07-10-173828.ips) — same class of bug documented
        // elsewhere in this codebase (Combine .map needing nonisolated).
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            Self.spikeBufferCount += 1
            if Self.spikeBufferCount % 50 == 0 {
                callsLogger.info("[SPIKE] buffers=\(Self.spikeBufferCount) frameLength=\(buffer.frameLength) sampleRate=\(format.sampleRate)")
            }
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        do {
            engine.prepare()
            try engine.start()
            Self.spikeEngine = engine
            callsLogger.info("[SPIKE] AVAudioEngine tap started — format=\(format)")
        } catch {
            callsLogger.error("[SPIKE] AVAudioEngine.start() failed: \(error.localizedDescription)")
        }
    }

    // nonisolated(unsafe): mutated from the tap's real-time audio-thread
    // closure, which cannot hop to MainActor (CallTranscriptionService's
    // default isolation) without cost. Acceptable ONLY because this is
    // throwaway spike code reverted in Step 6 — a plain counter race is
    // harmless for a qualitative "are buffers arriving" check. The real
    // Task 3 implementation avoids this entirely by never touching
    // actor-isolated state from the tap closure (see startLocalCapture).
    private nonisolated(unsafe) static var spikeEngine: AVAudioEngine?
    private nonisolated(unsafe) static var spikeBufferCount = 0
}
#endif
