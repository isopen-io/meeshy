//
//  VoiceTranslationPipeline.swift
//  Meeshy
//
//  Complete pipeline for real-time voice translation
//  Orchestrates: Audio Input → STT → Translation → TTS Output
//

import Foundation
import AVFoundation
import Combine

// MARK: - Voice Translation Pipeline

/// Orchestrates the complete voice translation flow
/// Audio → Speech-to-Text → Translation → Text-to-Speech
actor VoiceTranslationPipeline {

    // MARK: - Types

    struct PipelineResult {
        let originalText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let sttLatency: TimeInterval
        let translationLatency: TimeInterval
        let ttsLatency: TimeInterval
        let totalLatency: TimeInterval
        let isOnDevice: Bool
        let timestamp: Date

        init(
            originalText: String,
            translatedText: String,
            sourceLanguage: VoiceTranslationLanguage,
            targetLanguage: VoiceTranslationLanguage,
            sttLatency: TimeInterval,
            translationLatency: TimeInterval,
            ttsLatency: TimeInterval = 0,
            isOnDevice: Bool
        ) {
            self.originalText = originalText
            self.translatedText = translatedText
            self.sourceLanguage = sourceLanguage
            self.targetLanguage = targetLanguage
            self.sttLatency = sttLatency
            self.translationLatency = translationLatency
            self.ttsLatency = ttsLatency
            self.totalLatency = sttLatency + translationLatency + ttsLatency
            self.isOnDevice = isOnDevice
            self.timestamp = Date()
        }
    }

    enum PipelineState {
        case idle
        case starting
        case listening
        case processing
        case translating
        case speaking
        case paused
        case error(Error)
        case stopped
    }

    /// TTS Configuration for the pipeline
    struct TTSConfiguration {
        var enabled: Bool = false
        var usePersonalVoice: Bool = false
        var speechRate: Float = AVSpeechUtteranceDefaultSpeechRate
        var speechPitch: Float = 1.0
        var autoPlayTranslation: Bool = true

        static let disabled = TTSConfiguration(enabled: false)
        static let enabled = TTSConfiguration(enabled: true)
        static let realTime = TTSConfiguration(
            enabled: true,
            speechRate: AVSpeechUtteranceDefaultSpeechRate * 1.1,
            autoPlayTranslation: true
        )
    }

    // MARK: - Properties

    private let sourceLanguage: VoiceTranslationLanguage
    private let targetLanguage: VoiceTranslationLanguage

    private var speechRecognitionService: SpeechRecognitionService?
    private var translationService: OnDeviceTranslationService?
    private var speechSynthesisService: SpeechSynthesisService?

    private(set) var state: PipelineState = .idle
    private(set) var currentTranscription: String = ""
    private(set) var currentTranslation: String = ""
    private(set) var results: [PipelineResult] = []

    // Performance tracking
    private var sttStartTime: Date?
    private var translationStartTime: Date?
    private var ttsStartTime: Date?

    // Callbacks
    private var onStateChange: ((PipelineState) -> Void)?
    private var onPartialTranscription: ((String) -> Void)?
    private var onTranslationResult: ((PipelineResult) -> Void)?
    private var onSpeechStart: (() -> Void)?
    private var onSpeechFinish: (() -> Void)?
    private var onError: ((Error) -> Void)?

    // Configuration
    private var ttsConfig: TTSConfiguration
    private let debounceInterval: TimeInterval = 0.5 // Debounce final results

    // Debounce
    private var debounceTask: Task<Void, Never>?
    private var pendingText: String = ""

    // MARK: - Initialization

    init(
        sourceLanguage: VoiceTranslationLanguage,
        targetLanguage: VoiceTranslationLanguage,
        ttsConfiguration: TTSConfiguration = .disabled
    ) {
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.ttsConfig = ttsConfiguration

        self.speechRecognitionService = SpeechRecognitionService(
            language: sourceLanguage,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        self.translationService = OnDeviceTranslationService()

        if ttsConfiguration.enabled {
            self.speechSynthesisService = SpeechSynthesisService()
        }
    }

    /// Legacy initializer for backward compatibility
    convenience init(
        sourceLanguage: VoiceTranslationLanguage,
        targetLanguage: VoiceTranslationLanguage,
        enableTTS: Bool = false
    ) {
        self.init(
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            ttsConfiguration: enableTTS ? .enabled : .disabled
        )
    }

    // MARK: - Callbacks Setup

    func setCallbacks(
        onStateChange: @escaping (PipelineState) -> Void,
        onPartialTranscription: @escaping (String) -> Void,
        onTranslationResult: @escaping (PipelineResult) -> Void,
        onSpeechStart: (() -> Void)? = nil,
        onSpeechFinish: (() -> Void)? = nil,
        onError: ((Error) -> Void)? = nil
    ) {
        self.onStateChange = onStateChange
        self.onPartialTranscription = onPartialTranscription
        self.onTranslationResult = onTranslationResult
        self.onSpeechStart = onSpeechStart
        self.onSpeechFinish = onSpeechFinish
        self.onError = onError
    }

    // MARK: - TTS Configuration

    /// Update TTS configuration at runtime
    func updateTTSConfiguration(_ config: TTSConfiguration) async {
        ttsConfig = config

        if config.enabled && speechSynthesisService == nil {
            speechSynthesisService = SpeechSynthesisService()
            await speechSynthesisService?.loadAvailableVoices()
        }
    }

    /// Enable or disable TTS
    func setTTSEnabled(_ enabled: Bool) async {
        ttsConfig.enabled = enabled

        if enabled && speechSynthesisService == nil {
            speechSynthesisService = SpeechSynthesisService()
            await speechSynthesisService?.loadAvailableVoices()
        }
    }

    /// Set Personal Voice usage
    func setUsePersonalVoice(_ usePersonal: Bool) async {
        ttsConfig.usePersonalVoice = usePersonal

        if usePersonal {
            _ = await speechSynthesisService?.requestPersonalVoiceAccess()
        }
    }

    // MARK: - Pipeline Control

    /// Start the voice translation pipeline
    func start() async throws {
        guard case .idle = state else {
            throw PipelineError.alreadyRunning
        }

        updateState(.starting)

        // Setup speech recognition callbacks
        await speechRecognitionService?.setCallbacks(
            onPartialResult: { [weak self] segment in
                Task {
                    await self?.handlePartialTranscription(segment)
                }
            },
            onFinalResult: { [weak self] segment in
                Task {
                    await self?.handleFinalTranscription(segment)
                }
            },
            onStateChange: nil,
            onError: { [weak self] error in
                Task {
                    await self?.handleError(error)
                }
            }
        )

        // Start listening
        do {
            try await speechRecognitionService?.startListening()
            updateState(.listening)
        } catch {
            updateState(.error(error))
            throw error
        }
    }

    /// Stop the pipeline
    func stop() async {
        debounceTask?.cancel()
        await speechRecognitionService?.stopListening()
        await speechSynthesisService?.stop()
        updateState(.stopped)
    }

    /// Pause the pipeline
    func pause() async {
        guard case .listening = state else { return }
        await speechRecognitionService?.stopListening()
        updateState(.paused)
    }

    /// Resume the pipeline
    func resume() async throws {
        guard case .paused = state else { return }
        try await speechRecognitionService?.startListening()
        updateState(.listening)
    }

    // MARK: - Transcription Handlers

    private func handlePartialTranscription(_ segment: TranscriptionSegment) {
        currentTranscription = segment.text
        onPartialTranscription?(segment.text)
    }

    private func handleFinalTranscription(_ segment: TranscriptionSegment) {
        let text = segment.text

        // Debounce to avoid translating incomplete sentences
        debounceTask?.cancel()
        pendingText = text

        debounceTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(debounceInterval * 1_000_000_000))

            if !Task.isCancelled {
                await translateText(pendingText, sttConfidence: segment.confidence)
            }
        }
    }

    // MARK: - Translation

    private func translateText(_ text: String, sttConfidence: Float) async {
        guard !text.isEmpty else { return }

        updateState(.translating)
        translationStartTime = Date()

        do {
            guard let translationService = translationService else {
                throw PipelineError.serviceNotAvailable
            }

            let translationResult = try await translationService.translate(
                text,
                from: sourceLanguage,
                to: targetLanguage
            )

            let translationLatency = Date().timeIntervalSince(translationStartTime ?? Date())

            currentTranslation = translationResult.translatedText

            // Speak translation if TTS enabled
            var ttsLatency: TimeInterval = 0
            if ttsConfig.enabled && ttsConfig.autoPlayTranslation {
                ttsLatency = await speakTranslation(translationResult.translatedText)
            }

            // Create result with all latencies
            let result = PipelineResult(
                originalText: text,
                translatedText: translationResult.translatedText,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                sttLatency: 0, // Already captured in segment
                translationLatency: translationLatency,
                ttsLatency: ttsLatency,
                isOnDevice: translationResult.isOnDevice
            )

            results.append(result)
            onTranslationResult?(result)

            updateState(.listening)

        } catch {
            handleError(error)
        }
    }

    // MARK: - Text-to-Speech

    /// Speak translated text using the advanced SpeechSynthesisService
    /// Returns the TTS latency
    @discardableResult
    private func speakTranslation(_ text: String) async -> TimeInterval {
        guard let service = speechSynthesisService else { return 0 }

        updateState(.speaking)
        onSpeechStart?()
        ttsStartTime = Date()

        // Create speech configuration
        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: ttsConfig.speechRate,
            pitch: ttsConfig.speechPitch,
            volume: 1.0,
            preDelay: 0,
            postDelay: 0.1
        )

        // Try Personal Voice first if enabled
        if ttsConfig.usePersonalVoice {
            do {
                try await service.speakWithPersonalVoice(text, configuration: config)
                await waitForSpeechCompletion(service: service)
                let latency = Date().timeIntervalSince(ttsStartTime ?? Date())
                onSpeechFinish?()
                updateState(.listening)
                return latency
            } catch {
                // Fall back to regular voice
                print("Personal Voice failed, falling back: \(error.localizedDescription)")
            }
        }

        // Use regular voice for target language
        await service.speak(text, language: targetLanguage, configuration: config)
        await waitForSpeechCompletion(service: service)

        let latency = Date().timeIntervalSince(ttsStartTime ?? Date())
        onSpeechFinish?()
        updateState(.listening)

        return latency
    }

    /// Wait for speech synthesis to complete
    private func waitForSpeechCompletion(service: SpeechSynthesisService) async {
        // Poll for completion
        while await service.isSpeaking {
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
    }

    /// Speak text on demand (public API)
    func speakText(_ text: String) async {
        guard let service = speechSynthesisService else { return }

        updateState(.speaking)
        onSpeechStart?()

        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: ttsConfig.speechRate,
            pitch: ttsConfig.speechPitch
        )

        await service.speak(text, language: targetLanguage, configuration: config)
        await waitForSpeechCompletion(service: service)

        onSpeechFinish?()
        updateState(.listening)
    }

    /// Stop any ongoing speech
    func stopSpeaking() async {
        await speechSynthesisService?.stop()
    }

    /// Check if currently speaking
    var isSpeaking: Bool {
        get async {
            await speechSynthesisService?.isSpeaking ?? false
        }
    }

    // MARK: - Error Handling

    private func handleError(_ error: Error) {
        updateState(.error(error))
        onError?(error)
    }

    // MARK: - State Management

    private func updateState(_ newState: PipelineState) {
        state = newState
        onStateChange?(newState)
    }

    // MARK: - Statistics

    func getStatistics() -> PipelineStatistics {
        guard !results.isEmpty else {
            return PipelineStatistics(
                totalResults: 0,
                averageLatency: 0,
                onDeviceRate: 0,
                averageSTTLatency: 0,
                averageTranslationLatency: 0,
                averageTTSLatency: 0
            )
        }

        let avgLatency = results.map { $0.totalLatency }.reduce(0, +) / Double(results.count)
        let avgSTTLatency = results.map { $0.sttLatency }.reduce(0, +) / Double(results.count)
        let avgTranslationLatency = results.map { $0.translationLatency }.reduce(0, +) / Double(results.count)
        let avgTTSLatency = results.map { $0.ttsLatency }.reduce(0, +) / Double(results.count)
        let onDeviceCount = results.filter { $0.isOnDevice }.count

        return PipelineStatistics(
            totalResults: results.count,
            averageLatency: avgLatency,
            onDeviceRate: Double(onDeviceCount) / Double(results.count),
            averageSTTLatency: avgSTTLatency,
            averageTranslationLatency: avgTranslationLatency,
            averageTTSLatency: avgTTSLatency
        )
    }

    // MARK: - Cleanup

    func cleanup() async {
        await stop()
        await speechRecognitionService?.cleanup()
        translationService = nil
        speechSynthesisService = nil
        results.removeAll()
    }
}

// MARK: - Pipeline Statistics

struct PipelineStatistics {
    let totalResults: Int
    let averageLatency: TimeInterval
    let onDeviceRate: Double
    let averageSTTLatency: TimeInterval
    let averageTranslationLatency: TimeInterval
    let averageTTSLatency: TimeInterval

    /// Empty statistics for when no results are available
    static var empty: PipelineStatistics {
        PipelineStatistics(
            totalResults: 0,
            averageLatency: 0,
            onDeviceRate: 0,
            averageSTTLatency: 0,
            averageTranslationLatency: 0,
            averageTTSLatency: 0
        )
    }

    var meetsTargetLatency: Bool {
        averageLatency < 0.500 // 500ms target
    }

    var formattedAverageLatency: String {
        String(format: "%.0fms", averageLatency * 1000)
    }

    var formattedBreakdown: String {
        """
        STT: \(String(format: "%.0fms", averageSTTLatency * 1000)) | \
        Translation: \(String(format: "%.0fms", averageTranslationLatency * 1000)) | \
        TTS: \(String(format: "%.0fms", averageTTSLatency * 1000))
        """
    }
}

// MARK: - Pipeline Errors

enum PipelineError: Error, LocalizedError {
    case alreadyRunning
    case notRunning
    case serviceNotAvailable
    case translationFailed
    case ttsFailed

    var errorDescription: String? {
        switch self {
        case .alreadyRunning:
            return "Pipeline is already running"
        case .notRunning:
            return "Pipeline is not running"
        case .serviceNotAvailable:
            return "Required service is not available"
        case .translationFailed:
            return "Translation failed"
        case .ttsFailed:
            return "Text-to-speech failed"
        }
    }
}

// MARK: - Audio Message Translation

extension VoiceTranslationPipeline {

    /// Translate a recorded audio message (non-realtime)
    static func translateAudioMessage(
        at url: URL,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> PipelineResult {
        let sttService = SpeechRecognitionService(
            language: sourceLanguage,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        let translationService = OnDeviceTranslationService()

        // Step 1: Transcribe audio
        let sttStart = Date()
        let transcriptionResult = try await sttService.transcribeVoiceMessage(at: url)
        let sttLatency = Date().timeIntervalSince(sttStart)

        // Step 2: Translate text
        let translationStart = Date()
        let translationResult = try await translationService.translate(
            transcriptionResult.text,
            from: sourceLanguage,
            to: targetLanguage
        )
        let translationLatency = Date().timeIntervalSince(translationStart)

        return PipelineResult(
            originalText: transcriptionResult.text,
            translatedText: translationResult.translatedText,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            sttLatency: sttLatency,
            translationLatency: translationLatency,
            isOnDevice: translationResult.isOnDevice
        )
    }
}
