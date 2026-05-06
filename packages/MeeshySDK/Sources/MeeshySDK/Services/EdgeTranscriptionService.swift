import Foundation
import Speech
import AVFoundation
import Combine

/// Wraps `SFSpeechRecognizer` to provide on-device speech-to-text for short
/// audio recordings.
///
/// All work is pinned to `@MainActor` because:
///   - `SFSpeechRecognizer.init(locale:)` must run on the main thread per
///     Apple's documentation.
///   - Tracking the in-flight `SFSpeechRecognitionTask` requires a stable
///     isolation domain so callers can `cancel()` reliably.
///   - `@Published` state mutations (`isTranscribing`, `authorizationStatus`)
///     stay free of cross-actor warnings.
@MainActor
public final class EdgeTranscriptionService: ObservableObject {
    public static let shared = EdgeTranscriptionService()

    @Published public private(set) var authorizationStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    @Published public private(set) var isTranscribing = false

    /// The recognition task currently in flight. Retained so ARC does not
    /// release `SFSpeechRecognitionTask` mid-recognition (which crashes
    /// inside the Speech framework).
    private var currentTask: SFSpeechRecognitionTask?

    private init() {
        authorizationStatus = SFSpeechRecognizer.authorizationStatus()
    }

    // MARK: - Authorization

    public func requestAuthorization() async -> Bool {
        let status: SFSpeechRecognizerAuthorizationStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        authorizationStatus = status
        return status == .authorized
    }

    public var isAuthorized: Bool {
        authorizationStatus == .authorized
    }

    // MARK: - Transcribe Audio File

    public func transcribe(audioURL: URL,
                           locale: Locale = Locale(identifier: "fr-FR")) async throws -> OnDeviceTranscription {
        if !isAuthorized {
            let granted = await requestAuthorization()
            if !granted { throw EdgeTranscriptionError.notAuthorized }
        }

        let resolvedLocale = Self.normalizedLocale(for: locale)

        guard let recognizer = SFSpeechRecognizer(locale: resolvedLocale) else {
            throw EdgeTranscriptionError.unsupportedLocale(locale.identifier)
        }
        guard recognizer.isAvailable else {
            throw EdgeTranscriptionError.recognizerUnavailable
        }
        guard FileManager.default.fileExists(atPath: audioURL.path) else {
            throw EdgeTranscriptionError.fileMissing
        }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        isTranscribing = true
        defer {
            currentTask = nil
            isTranscribing = false
        }

        let resolvedIdentifier = resolvedLocale.identifier
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<OnDeviceTranscription, Error>) in
            var didResume = false
            let task = recognizer.recognitionTask(with: request) { result, error in
                if didResume { return }
                if let error {
                    didResume = true
                    continuation.resume(throwing: EdgeTranscriptionError.transcriptionFailed(error.localizedDescription))
                    return
                }
                guard let result, result.isFinal else { return }
                didResume = true
                let segments: [OnDeviceTranscriptionSegment] = result.bestTranscription.segments.map { segment in
                    OnDeviceTranscriptionSegment(
                        text: segment.substring,
                        timestamp: segment.timestamp,
                        duration: segment.duration,
                        confidence: Double(segment.confidence)
                    )
                }
                let overallConfidence = segments.isEmpty
                    ? 0.0
                    : segments.reduce(0.0) { $0 + $1.confidence } / Double(segments.count)
                continuation.resume(returning: OnDeviceTranscription(
                    text: result.bestTranscription.formattedString,
                    language: resolvedIdentifier,
                    confidence: overallConfidence,
                    segments: segments,
                    speakingRate: result.bestTranscription.speakingRate
                ))
            }
            self.currentTask = task
        }
    }

    // MARK: - Cancellation

    public func cancel() {
        currentTask?.cancel()
        currentTask = nil
        isTranscribing = false
    }

    // MARK: - Transcribe Data

    public func transcribe(audioData: Data,
                           locale: Locale = Locale(identifier: "fr-FR")) async throws -> OnDeviceTranscription {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_transcription_\(UUID().uuidString).m4a")
        try audioData.write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }
        return try await transcribe(audioURL: tempURL, locale: locale)
    }

    // MARK: - Locale Normalization

    /// Promotes a language-code-only locale (e.g. `"fr"`) into a fully-qualified
    /// locale (e.g. `"fr-FR"`) that `SFSpeechRecognizer` actually supports.
    ///
    /// Strategy:
    ///   1. If `locale.region` is already set, keep it.
    ///   2. Look for a supported locale matching the requested language and
    ///      the device's current region (e.g. user typing "fr" on a French
    ///      iPhone -> "fr-FR").
    ///   3. Fall back to the first supported locale matching the language.
    ///   4. As a last resort, return the input untouched (caller will hit
    ///      `SFSpeechRecognizer(locale:) == nil` and surface the error).
    public static func normalizedLocale(for locale: Locale) -> Locale {
        if locale.region != nil { return locale }
        let supported = SFSpeechRecognizer.supportedLocales()
        let langCode = locale.language.languageCode?.identifier ?? locale.identifier

        let currentRegion = Locale.current.region?.identifier
        if let region = currentRegion,
           let preferred = supported.first(where: {
               $0.language.languageCode?.identifier == langCode &&
               $0.region?.identifier == region
           }) {
            return preferred
        }
        if let fallback = supported.first(where: { $0.language.languageCode?.identifier == langCode }) {
            return fallback
        }
        return locale
    }

    // MARK: - Supported / Available Locales

    public var supportedLocales: [Locale] {
        SFSpeechRecognizer.supportedLocales().sorted { $0.identifier < $1.identifier }
    }

    /// Locales whose recognizer is currently available — model present and
    /// reachable. Filtered subset of `supportedLocales`.
    public var availableLocales: [Locale] {
        supportedLocales.filter { locale in
            SFSpeechRecognizer(locale: locale)?.isAvailable == true
        }
    }

    public func isLocaleSupported(_ locale: Locale) -> Bool {
        SFSpeechRecognizer.supportedLocales().contains(locale)
    }
}

// MARK: - On-Device Transcription Types

public struct OnDeviceTranscription: Sendable {
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

public struct OnDeviceTranscriptionSegment: Identifiable, Sendable {
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

public enum EdgeTranscriptionError: LocalizedError, Equatable {
    case notAuthorized
    case unsupportedLocale(String)
    case recognizerUnavailable
    case noResult
    case fileMissing
    case transcriptionFailed(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Speech recognition not authorized"
        case .unsupportedLocale(let id):
            return "Locale '\(id)' is not supported for on-device transcription"
        case .recognizerUnavailable:
            return "Speech recognizer unavailable for this language"
        case .noResult:
            return "No transcription result"
        case .fileMissing:
            return "Audio file not found"
        case .transcriptionFailed(let msg):
            return "Transcription failed: \(msg)"
        case .cancelled:
            return "Transcription cancelled"
        }
    }
}
