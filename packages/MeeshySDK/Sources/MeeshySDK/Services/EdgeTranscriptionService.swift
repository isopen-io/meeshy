import Foundation
import Speech
import AVFoundation
import Combine

public final class EdgeTranscriptionService: ObservableObject {
    public static let shared = EdgeTranscriptionService()

    @Published public var authorizationStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    @Published public var isTranscribing = false

    private init() {
        authorizationStatus = SFSpeechRecognizer.authorizationStatus()
    }

    // MARK: - Authorization

    public func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    self.authorizationStatus = status
                    continuation.resume(returning: status == .authorized)
                }
            }
        }
    }

    public var isAuthorized: Bool {
        authorizationStatus == .authorized
    }

    // MARK: - Transcribe Audio File

    public func transcribe(audioURL: URL, locale: Locale = Locale(identifier: "fr-FR")) async throws -> OnDeviceTranscription {
        if !isAuthorized {
            let granted = await requestAuthorization()
            if !granted { throw EdgeTranscriptionError.notAuthorized }
        }

        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw EdgeTranscriptionError.recognizerUnavailable
        }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false
        request.addsPunctuation = true

        await MainActor.run { isTranscribing = true }
        defer { Task { @MainActor in isTranscribing = false } }

        let result = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SFSpeechRecognitionResult, Error>) in
            recognizer.recognitionTask(with: request) { result, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let result, result.isFinal else { return }
                continuation.resume(returning: result)
            }
        }

        let segments: [OnDeviceTranscriptionSegment] = result.bestTranscription.segments.map { segment in
            OnDeviceTranscriptionSegment(
                text: segment.substring,
                timestamp: segment.timestamp,
                duration: segment.duration,
                confidence: Double(segment.confidence)
            )
        }

        let overallConfidence = segments.isEmpty ? 0.0 : segments.reduce(0.0) { $0 + $1.confidence } / Double(segments.count)

        return OnDeviceTranscription(
            text: result.bestTranscription.formattedString,
            language: locale.identifier,
            confidence: overallConfidence,
            segments: segments,
            speakingRate: result.bestTranscription.speakingRate
        )
    }

    // MARK: - Transcribe Data

    public func transcribe(audioData: Data, locale: Locale = Locale(identifier: "fr-FR")) async throws -> OnDeviceTranscription {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("meeshy_transcription_\(UUID().uuidString).m4a")
        try audioData.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }
        return try await transcribe(audioURL: tempURL, locale: locale)
    }

    // MARK: - Supported Locales

    public var supportedLocales: [Locale] {
        SFSpeechRecognizer.supportedLocales().sorted { $0.identifier < $1.identifier }
    }

    public func isLocaleSupported(_ locale: Locale) -> Bool {
        SFSpeechRecognizer.supportedLocales().contains(locale)
    }
}

// MARK: - On-Device Transcription Types

public struct OnDeviceTranscription {
    public let text: String
    public let language: String
    public let confidence: Double
    public let segments: [OnDeviceTranscriptionSegment]
    public let speakingRate: Double?

    public init(text: String, language: String, confidence: Double,
                segments: [OnDeviceTranscriptionSegment] = [], speakingRate: Double? = nil) {
        self.text = text; self.language = language; self.confidence = confidence
        self.segments = segments; self.speakingRate = speakingRate
    }
}

public struct OnDeviceTranscriptionSegment: Identifiable {
    public let id = UUID()
    public let text: String
    public let timestamp: TimeInterval
    public let duration: TimeInterval
    public let confidence: Double

    public init(text: String, timestamp: TimeInterval, duration: TimeInterval, confidence: Double) {
        self.text = text; self.timestamp = timestamp; self.duration = duration; self.confidence = confidence
    }
}

// MARK: - Edge Transcription Errors

public enum EdgeTranscriptionError: LocalizedError {
    case notAuthorized
    case recognizerUnavailable
    case noResult
    case fileMissing

    public var errorDescription: String? {
        switch self {
        case .notAuthorized: return "Speech recognition not authorized"
        case .recognizerUnavailable: return "Speech recognizer unavailable for this language"
        case .noResult: return "No transcription result"
        case .fileMissing: return "Audio file not found"
        }
    }
}
