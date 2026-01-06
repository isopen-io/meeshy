//
//  WhisperKitTranscriptionService.swift
//  Meeshy
//
//  On-device speech recognition using WhisperKit (OpenAI Whisper)
//  Provides offline transcription without requiring Apple's Speech Recognition API
//
//  Benefits over SFSpeechRecognizer:
//  - Works in simulator
//  - No API rate limits
//  - Better multilingual support
//  - No network required
//
//  iOS 16+
//

import Foundation
import AVFoundation

#if canImport(WhisperKit)
import WhisperKit
#endif

// MARK: - WhisperKit Transcription Service

/// On-device speech recognition service using WhisperKit
/// Provides offline transcription with OpenAI's Whisper model
@MainActor
final class WhisperKitTranscriptionService: ObservableObject {

    // MARK: - Published State

    @Published private(set) var isModelLoaded = false
    @Published private(set) var isTranscribing = false
    @Published private(set) var loadingProgress: Double = 0
    @Published private(set) var transcriptionProgress: Double = 0
    @Published private(set) var error: WhisperError?

    // MARK: - Configuration

    /// Available Whisper model variants
    enum ModelVariant: String, CaseIterable {
        case tiny = "openai_whisper-tiny"           // ~39MB, fastest, lower accuracy
        case base = "openai_whisper-base"           // ~74MB, good balance
        case small = "openai_whisper-small"         // ~244MB, better accuracy
        case medium = "openai_whisper-medium"       // ~769MB, high accuracy (not recommended for mobile)

        var displayName: String {
            switch self {
            case .tiny: return "Tiny (Fastest)"
            case .base: return "Base (Balanced)"
            case .small: return "Small (Accurate)"
            case .medium: return "Medium (Best)"
            }
        }

        var estimatedSize: String {
            switch self {
            case .tiny: return "~39 MB"
            case .base: return "~74 MB"
            case .small: return "~244 MB"
            case .medium: return "~769 MB"
            }
        }
    }

    struct Configuration {
        var modelVariant: ModelVariant = .base
        var language: String? = nil  // nil = auto-detect
        var task: TranscriptionTask = .transcribe
        var addTimestamps: Bool = true
        var suppressBlank: Bool = true

        enum TranscriptionTask: String {
            case transcribe = "transcribe"
            case translate = "translate"  // Translate to English
        }
    }

    // MARK: - Private Properties

    #if canImport(WhisperKit)
    private var whisperKit: WhisperKit?
    #endif

    private var configuration: Configuration
    private let modelStorageURL: URL

    // Callbacks
    var onTranscriptionResult: ((TranscriptionSegment) -> Void)?
    var onError: ((WhisperError) -> Void)?

    // MARK: - Initialization

    init(configuration: Configuration = Configuration()) {
        self.configuration = configuration

        // Store models in app's documents directory
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        self.modelStorageURL = documentsURL.appendingPathComponent("WhisperModels", isDirectory: true)

        // Create models directory if needed
        try? FileManager.default.createDirectory(at: modelStorageURL, withIntermediateDirectories: true)
    }

    // MARK: - Model Management

    /// Check if the configured model is already downloaded
    func isModelDownloaded() -> Bool {
        let modelPath = modelStorageURL.appendingPathComponent(configuration.modelVariant.rawValue)
        return FileManager.default.fileExists(atPath: modelPath.path)
    }

    /// Get size of downloaded model (in bytes)
    func downloadedModelSize() -> Int64? {
        let modelPath = modelStorageURL.appendingPathComponent(configuration.modelVariant.rawValue)
        guard FileManager.default.fileExists(atPath: modelPath.path) else { return nil }

        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: modelPath.path)
            return attributes[.size] as? Int64
        } catch {
            return nil
        }
    }

    /// Load or download the Whisper model
    /// - Parameter progressCallback: Called with download progress (0.0 to 1.0)
    func loadModel(progressCallback: ((Double) -> Void)? = nil) async throws {
        #if canImport(WhisperKit)
        guard !isModelLoaded else { return }

        loadingProgress = 0
        error = nil

        do {
            mediaLogger.info("[WhisperKit] Loading model: \(configuration.modelVariant.rawValue)")

            // Create WhisperKit with model variant
            let pipe = try await WhisperKit(
                model: configuration.modelVariant.rawValue,
                downloadBase: modelStorageURL,
                verbose: false,
                prewarm: true
            ) { progress in
                Task { @MainActor in
                    self.loadingProgress = progress.fractionCompleted
                    progressCallback?(progress.fractionCompleted)
                }
            }

            whisperKit = pipe
            isModelLoaded = true
            loadingProgress = 1.0

            mediaLogger.info("[WhisperKit] Model loaded successfully")

        } catch {
            mediaLogger.error("[WhisperKit] Failed to load model: \(error)")
            self.error = .modelLoadFailed(error.localizedDescription)
            throw WhisperError.modelLoadFailed(error.localizedDescription)
        }
        #else
        throw WhisperError.frameworkNotAvailable
        #endif
    }

    /// Unload the model to free memory
    func unloadModel() {
        #if canImport(WhisperKit)
        whisperKit = nil
        isModelLoaded = false
        loadingProgress = 0
        mediaLogger.info("[WhisperKit] Model unloaded")
        #endif
    }

    /// Delete downloaded model files
    func deleteModel() throws {
        let modelPath = modelStorageURL.appendingPathComponent(configuration.modelVariant.rawValue)
        if FileManager.default.fileExists(atPath: modelPath.path) {
            try FileManager.default.removeItem(at: modelPath)
            mediaLogger.info("[WhisperKit] Model deleted: \(configuration.modelVariant.rawValue)")
        }
        unloadModel()
    }

    // MARK: - Transcription

    /// Transcribe an audio file
    /// - Parameters:
    ///   - url: URL of the audio file (m4a, wav, mp3, etc.)
    ///   - language: Override language detection (nil = auto-detect)
    /// - Returns: Array of transcription segments with timestamps
    func transcribeFile(
        at url: URL,
        language: String? = nil
    ) async throws -> [TranscriptionSegment] {
        #if canImport(WhisperKit)
        guard let whisperKit = whisperKit, isModelLoaded else {
            throw WhisperError.modelNotLoaded
        }

        isTranscribing = true
        transcriptionProgress = 0
        error = nil

        defer {
            isTranscribing = false
            transcriptionProgress = 1.0
        }

        do {
            mediaLogger.info("[WhisperKit] Transcribing file: \(url.lastPathComponent)")

            // Configure decoding options
            let options = DecodingOptions(
                verbose: false,
                task: configuration.task == .translate ? .translate : .transcribe,
                language: language ?? configuration.language,
                temperature: 0.0,
                temperatureFallbackCount: 5,
                sampleLength: 224,
                topK: 5,
                usePrefillPrompt: true,
                usePrefillCache: true,
                detectLanguage: language == nil && configuration.language == nil,
                skipSpecialTokens: true,
                withoutTimestamps: !configuration.addTimestamps,
                suppressBlank: configuration.suppressBlank
            )

            // Transcribe the audio file
            let results = try await whisperKit.transcribe(
                audioPath: url.path,
                decodeOptions: options
            ) { progress in
                Task { @MainActor in
                    self.transcriptionProgress = Double(progress.fractionCompleted)
                }
            }

            // Convert to TranscriptionSegments
            var segments: [TranscriptionSegment] = []

            for result in results {
                // Get detected language
                let detectedLanguage = result.language ?? "en"
                let voiceLang = VoiceTranslationLanguage.from(isoCode: detectedLanguage)

                // Process each segment from Whisper
                for segment in result.segments {
                    let transcriptionSegment = TranscriptionSegment(
                        text: segment.text.trimmingCharacters(in: .whitespacesAndNewlines),
                        language: voiceLang,
                        confidence: Float(segment.avgLogprob > -1 ? 0.9 : 0.7), // Approximate confidence
                        isFinal: true,
                        offsetFromStart: segment.start,
                        startTime: segment.start,
                        endTime: segment.end
                    )
                    segments.append(transcriptionSegment)
                }
            }

            mediaLogger.info("[WhisperKit] Transcription complete: \(segments.count) segments")
            return segments

        } catch {
            mediaLogger.error("[WhisperKit] Transcription failed: \(error)")
            self.error = .transcriptionFailed(error.localizedDescription)
            throw WhisperError.transcriptionFailed(error.localizedDescription)
        }
        #else
        throw WhisperError.frameworkNotAvailable
        #endif
    }

    /// Transcribe audio data directly
    /// - Parameters:
    ///   - audioData: Audio data (will be converted to required format)
    ///   - language: Override language detection
    /// - Returns: Array of transcription segments
    func transcribeData(
        _ audioData: Data,
        language: String? = nil
    ) async throws -> [TranscriptionSegment] {
        // Write to temporary file
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("wav")

        try audioData.write(to: tempURL)

        defer {
            try? FileManager.default.removeItem(at: tempURL)
        }

        return try await transcribeFile(at: tempURL, language: language)
    }

    /// Get full transcription text from segments
    func fullText(from segments: [TranscriptionSegment]) -> String {
        segments.map { $0.text }.joined(separator: " ")
    }

    // MARK: - Voice Message Convenience

    /// Transcribe a voice message with auto language detection
    /// - Parameter messageURL: URL of the voice message
    /// - Returns: Full transcription result
    func transcribeVoiceMessage(
        at messageURL: URL
    ) async throws -> (text: String, language: VoiceTranslationLanguage, confidence: Float) {

        let segments = try await transcribeFile(at: messageURL)

        let fullText = self.fullText(from: segments)
        let language = segments.first?.language ?? .english
        let avgConfidence = segments.isEmpty ? 0 : segments.map { $0.confidence }.reduce(0, +) / Float(segments.count)

        return (fullText, language, avgConfidence)
    }

    // MARK: - Configuration

    /// Update the model variant (requires reloading)
    func setModelVariant(_ variant: ModelVariant) {
        configuration.modelVariant = variant
        unloadModel()
    }

    /// Set target language for transcription
    func setLanguage(_ language: String?) {
        configuration.language = language
    }

    /// Enable translation mode (translate to English)
    func setTranslateMode(_ enabled: Bool) {
        configuration.task = enabled ? .translate : .transcribe
    }
}

// MARK: - WhisperError

enum WhisperError: LocalizedError {
    case frameworkNotAvailable
    case modelNotLoaded
    case modelLoadFailed(String)
    case transcriptionFailed(String)
    case invalidAudioFormat
    case audioConversionFailed

    var errorDescription: String? {
        switch self {
        case .frameworkNotAvailable:
            return "WhisperKit is not available on this platform"
        case .modelNotLoaded:
            return "Whisper model is not loaded"
        case .modelLoadFailed(let message):
            return "Failed to load Whisper model: \(message)"
        case .transcriptionFailed(let message):
            return "Transcription failed: \(message)"
        case .invalidAudioFormat:
            return "Invalid audio format"
        case .audioConversionFailed:
            return "Failed to convert audio to required format"
        }
    }
}

// MARK: - VoiceTranslationLanguage Extension

extension VoiceTranslationLanguage {
    /// Create from ISO 639-1 language code
    static func from(isoCode: String) -> VoiceTranslationLanguage {
        switch isoCode.lowercased().prefix(2) {
        case "en": return .english
        case "fr": return .french
        case "es": return .spanish
        case "de": return .german
        case "it": return .italian
        case "pt": return .portuguese
        case "nl": return .dutch
        case "ru": return .russian
        case "ja": return .japanese
        case "ko": return .korean
        case "zh": return .chinese
        case "ar": return .arabic
        default: return .english
        }
    }

    /// ISO 639-1 language code for WhisperKit
    var whisperCode: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        case .german: return "de"
        case .italian: return "it"
        case .portuguese: return "pt"
        case .dutch: return "nl"
        case .russian: return "ru"
        case .japanese: return "ja"
        case .korean: return "ko"
        case .chinese: return "zh"
        case .arabic: return "ar"
        }
    }
}


// MARK: - Unified Transcription Service

/// Protocol for transcription services to allow switching between Apple and WhisperKit
protocol TranscriptionServiceProtocol {
    func transcribeFile(at url: URL) async throws -> [TranscriptionSegment]
    func transcribeVoiceMessage(at messageURL: URL) async throws -> (text: String, language: VoiceTranslationLanguage, confidence: Float)
}

/// Manager that provides the best available transcription service
@MainActor
final class TranscriptionServiceManager: ObservableObject {

    // MARK: - Singleton

    static let shared = TranscriptionServiceManager()

    // MARK: - Published State

    @Published private(set) var preferWhisperKit = false
    @Published private(set) var isWhisperKitAvailable = false

    // MARK: - Services

    private var whisperService: WhisperKitTranscriptionService?

    // MARK: - Initialization

    private init() {
        // Check if WhisperKit is available (it's available on iOS 16+)
        #if canImport(WhisperKit)
        isWhisperKitAvailable = true
        #endif
    }

    // MARK: - Service Access

    /// Get WhisperKit service (creates if needed)
    func getWhisperKitService() -> WhisperKitTranscriptionService {
        if whisperService == nil {
            whisperService = WhisperKitTranscriptionService()
        }
        return whisperService!
    }

    /// Get Apple Speech Recognition service for a language
    func getAppleService(language: VoiceTranslationLanguage) -> SpeechRecognitionService {
        SpeechRecognitionService(language: language)
    }

    /// Transcribe with automatic fallback
    /// Tries Apple's SFSpeechRecognizer first, falls back to WhisperKit on failure
    func transcribeWithFallback(
        at url: URL,
        language: VoiceTranslationLanguage
    ) async throws -> [TranscriptionSegment] {

        // Try Apple first if not preferring WhisperKit
        if !preferWhisperKit {
            do {
                let appleService = getAppleService(language: language)
                return try await appleService.transcribeAudioFile(at: url)
            } catch {
                mediaLogger.info("[Transcription] Apple Speech Recognition failed, trying WhisperKit: \(error)")
            }
        }

        // Use WhisperKit
        #if canImport(WhisperKit)
        let whisper = getWhisperKitService()

        // Load model if needed
        if !whisper.isModelLoaded {
            try await whisper.loadModel()
        }

        return try await whisper.transcribeFile(at: url, language: language.whisperCode)
        #else
        throw WhisperError.frameworkNotAvailable
        #endif
    }

    /// Set preference for WhisperKit over Apple
    func setPreferWhisperKit(_ prefer: Bool) {
        preferWhisperKit = prefer
    }
}
