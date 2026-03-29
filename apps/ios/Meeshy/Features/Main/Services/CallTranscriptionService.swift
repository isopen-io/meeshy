import Speech
import Combine
import os

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
}

// MARK: - Transcription Permission

enum TranscriptionPermission: Equatable {
    case notDetermined
    case authorized
    case denied
    case restricted
}

// MARK: - Transcription Error

enum TranscriptionError: LocalizedError {
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
    }

    // MARK: - Published State

    @Published private(set) var segments: [TranscriptionSegment] = []
    @Published private(set) var isTranscribing = false
    @Published private(set) var permission: TranscriptionPermission = .notDetermined
    @Published private(set) var lastError: TranscriptionError?
    @Published private(set) var role: TranscriptionRole = .undecided
    @Published private(set) var localCapability: TranscriptionCapabilityLevel = .none

    var displayedSegments: [TranscriptionSegment] {
        Array(segments.suffix(Constants.maxDisplayedSegments))
    }

    // MARK: - Private State

    private var localStream: StreamRecognizer?
    private var remoteStream: StreamRecognizer?
    private var localUserId = ""
    private var remoteUserId = ""
    private var allSegments: [TranscriptionSegment] = []

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
            Logger.calls.warning("startTranscribing called while already transcribing")
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

            Logger.calls.info("Call transcription started — local: \(localLanguage), remote: \(remoteLanguage)")
        } catch let error as TranscriptionError {
            lastError = error
            Logger.calls.error("Failed to start transcription: \(error.localizedDescription)")
        } catch {
            lastError = .recognitionFailed(underlying: error)
            Logger.calls.error("Unexpected transcription error: \(error.localizedDescription)")
        }
    }

    func stopTranscribing() {
        localStream?.tearDown()
        remoteStream?.tearDown()
        localStream = nil
        remoteStream = nil

        allSegments.removeAll()
        segments.removeAll()
        isTranscribing = false
        lastError = nil

        Logger.calls.info("Call transcription stopped")
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
        guard recognizer.supportsOnDeviceRecognition else {
            throw TranscriptionError.onDeviceNotSupported(language: languageCode)
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.addsPunctuation = true

        let stream = StreamRecognizer(recognizer: recognizer, speakerId: speakerId, language: languageCode)
        stream.request = request
        return stream
    }

    private func startRecognitionTask(for stream: StreamRecognizer) {
        guard let request = stream.request else { return }

        let speakerId = stream.speakerId
        let language = stream.language

        stream.task = stream.recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.handleRecognitionResult(result, error: error, speakerId: speakerId, language: language)
            }
        }
    }

    // MARK: - Private — Result Handling

    private func handleRecognitionResult(_ result: SFSpeechRecognitionResult?, error: Error?, speakerId: String, language: String) {
        if let error {
            guard isTranscribing else { return }
            lastError = .recognitionFailed(underlying: error)
            Logger.calls.error("Recognition error for speaker \(speakerId): \(error.localizedDescription)")
            return
        }

        guard let result else { return }

        let newSegments = result.bestTranscription.segments.map { segment in
            TranscriptionSegment(
                id: UUID(),
                text: segment.substring,
                speakerId: speakerId,
                startTime: segment.timestamp,
                endTime: segment.timestamp + segment.duration,
                isFinal: result.isFinal,
                confidence: Double(segment.confidence),
                language: language
            )
        }

        replaceSegments(for: speakerId, with: newSegments, isFinal: result.isFinal)
    }

    private func replaceSegments(for speakerId: String, with newSegments: [TranscriptionSegment], isFinal: Bool) {
        if isFinal {
            allSegments.removeAll { $0.speakerId == speakerId && !$0.isFinal }
            allSegments.append(contentsOf: newSegments)
        } else {
            allSegments.removeAll { $0.speakerId == speakerId && !$0.isFinal }
            allSegments.append(contentsOf: newSegments)
        }

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
            Logger.calls.info("Neither peer can transcribe")
            return
        }

        if remoteCapability == .none {
            role = .leader
            Logger.calls.info("Local is only capable peer → leader")
            return
        }

        if localCapability == .none {
            role = .follower
            Logger.calls.info("Remote is only capable peer → follower")
            return
        }

        if localCapability > remoteCapability {
            role = .leader
            Logger.calls.info("Local has higher capability → leader")
        } else if remoteCapability > localCapability {
            role = .follower
            Logger.calls.info("Remote has higher capability → follower")
        } else {
            role = isInitiator ? .leader : .follower
            Logger.calls.info("Tie broken by initiator role → \(isInitiator ? "leader" : "follower")")
        }
    }

    // MARK: - Follower Mode: Receive segments from leader

    func receiveRemoteSegment(_ segment: TranscriptionSegment) {
        guard role == .follower else { return }
        allSegments.append(segment)
        if allSegments.count > Constants.segmentRetentionLimit {
            allSegments = Array(allSegments.suffix(Constants.segmentRetentionLimit))
        }
        segments = allSegments.sorted { $0.startTime < $1.startTime }
    }
}
