//
//  RealTimeVoiceCloningPipeline.swift
//  Meeshy
//
//  Real-time voice translation pipeline with voice cloning
//  Orchestrates: Audio Input → STT → Translation → Voice Cloning TTS
//
//  Features:
//  - Real-time voice cloning from first 6 seconds of audio
//  - Streaming STT with WhisperKit
//  - On-device translation
//  - Voice synthesis with cloned voice using OpenVoice
//  - Target latency: ~350-500ms end-to-end
//
//  iOS 17+
//

import Foundation
import AVFoundation
import Combine

// MARK: - Real-Time Voice Cloning Pipeline

/// Complete pipeline for real-time voice translation with voice cloning
/// Captures speaker's voice and translates speech while preserving voice identity
@MainActor
final class RealTimeVoiceCloningPipeline: ObservableObject {

    // MARK: - Types

    /// Pipeline state
    enum PipelineState: Equatable {
        case idle
        case calibrating          // Extracting speaker embedding
        case calibrated           // Ready to translate
        case listening            // STT active
        case translating          // Processing translation
        case speaking             // TTS playing
        case paused
        case error(String)

        static func == (lhs: PipelineState, rhs: PipelineState) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle),
                 (.calibrating, .calibrating),
                 (.calibrated, .calibrated),
                 (.listening, .listening),
                 (.translating, .translating),
                 (.speaking, .speaking),
                 (.paused, .paused):
                return true
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }

        var displayName: String {
            switch self {
            case .idle: return "Prêt"
            case .calibrating: return "Calibration voix..."
            case .calibrated: return "Voix capturée"
            case .listening: return "Écoute..."
            case .translating: return "Traduction..."
            case .speaking: return "Lecture..."
            case .paused: return "En pause"
            case .error(let msg): return "Erreur: \(msg)"
            }
        }
    }

    /// Translation result with voice cloning
    struct TranslationResult: Identifiable {
        let id = UUID()
        let originalText: String
        let translatedText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let audioURL: URL?
        let timestamp: Date
        let latencies: Latencies

        struct Latencies {
            let sttMs: Double
            let translationMs: Double
            let ttsMs: Double
            var totalMs: Double { sttMs + translationMs + ttsMs }
        }
    }

    /// Pipeline configuration
    struct Configuration {
        var sourceLanguage: VoiceTranslationLanguage
        var targetLanguage: VoiceTranslationLanguage
        var calibrationDuration: TimeInterval = 6.0  // 6 seconds for voice capture
        var autoPlayTranslation: Bool = true
        var preserveVoiceCharacteristics: Bool = true // Use voice cloning
        var enableStreaming: Bool = true
        var targetLatencyMs: Double = 500 // Target end-to-end latency

        static func `default`(from source: VoiceTranslationLanguage, to target: VoiceTranslationLanguage) -> Configuration {
            Configuration(sourceLanguage: source, targetLanguage: target)
        }
    }

    // MARK: - Published State

    @Published private(set) var state: PipelineState = .idle
    @Published private(set) var calibrationProgress: Double = 0
    @Published private(set) var currentTranscription: String = ""
    @Published private(set) var currentTranslation: String = ""
    @Published private(set) var results: [TranslationResult] = []
    @Published private(set) var averageLatencyMs: Double = 0
    @Published private(set) var isVoiceCloned: Bool = false

    // MARK: - Services

    private var openVoiceService: OpenVoiceService
    private var speechRecognitionService: SpeechRecognitionService?
    private var translationService: OnDeviceTranslationService
    private var audioPlayer: AVAudioPlayer?

    // MARK: - Configuration

    private var configuration: Configuration

    // MARK: - Audio Capture

    private let audioEngine = AVAudioEngine()
    private var calibrationBuffer: AVAudioPCMBuffer?
    private var calibrationStartTime: Date?
    private var isCapturingCalibration = false

    // MARK: - Callbacks

    var onStateChange: ((PipelineState) -> Void)?
    var onTranscription: ((String, Bool) -> Void)?  // (text, isFinal)
    var onTranslation: ((TranslationResult) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Private State

    private var cancellables = Set<AnyCancellable>()
    private var sttStartTime: Date?
    private var translationStartTime: Date?

    // MARK: - Initialization

    init(configuration: Configuration) {
        self.configuration = configuration
        self.openVoiceService = OpenVoiceService()
        self.translationService = OnDeviceTranslationService()

        setupBindings()
    }

    convenience init(
        sourceLanguage: VoiceTranslationLanguage,
        targetLanguage: VoiceTranslationLanguage
    ) {
        self.init(configuration: .default(from: sourceLanguage, to: targetLanguage))
    }

    private func setupBindings() {
        // Observe OpenVoice state changes
        openVoiceService.$modelState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                if case .error(let msg) = state {
                    self?.updateState(.error(msg))
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Pipeline Control

    /// Start the voice cloning translation pipeline
    /// First calibrates voice, then starts listening for speech
    func start() async throws {
        guard state == .idle || state == .paused else {
            throw PipelineError.invalidState
        }

        // Load OpenVoice models if needed
        if openVoiceService.modelState != .loaded {
            updateState(.calibrating)
            try await openVoiceService.loadModels { progress in
                self.calibrationProgress = progress * 0.3  // 30% for model loading
            }
        }

        // Setup audio session
        try await setupAudioSession()

        // Start voice calibration if not already cloned
        if !isVoiceCloned {
            try await startCalibration()
        } else {
            // Already have voice, start listening
            try await startListening()
        }
    }

    /// Stop the pipeline
    func stop() async {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        await speechRecognitionService?.stopListening()
        audioPlayer?.stop()

        updateState(.idle)
    }

    /// Pause the pipeline
    func pause() {
        if state == .listening || state == .speaking {
            audioPlayer?.pause()
            updateState(.paused)
        }
    }

    /// Resume the pipeline
    func resume() async throws {
        if state == .paused {
            try await startListening()
        }
    }

    /// Reset voice calibration
    func resetVoice() async {
        openVoiceService.clearCache()
        isVoiceCloned = false
        calibrationProgress = 0
        calibrationBuffer = nil

        if state != .idle {
            await stop()
        }
    }

    // MARK: - Voice Calibration

    /// Start capturing audio for voice calibration
    private func startCalibration() async throws {
        updateState(.calibrating)
        calibrationProgress = 0.3  // Models already loaded

        // Prepare calibration buffer
        let format = audioEngine.inputNode.inputFormat(forBus: 0)
        let bufferSize = UInt32(configuration.calibrationDuration * format.sampleRate)
        calibrationBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: bufferSize)
        calibrationBuffer?.frameLength = 0

        calibrationStartTime = Date()
        isCapturingCalibration = true

        // Start audio capture
        let inputNode = audioEngine.inputNode
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
            self?.handleCalibrationAudio(buffer: buffer)
        }

        try audioEngine.start()

        // Wait for calibration duration
        try await Task.sleep(nanoseconds: UInt64(configuration.calibrationDuration * 1_000_000_000))

        // Finish calibration
        try await finishCalibration()
    }

    /// Handle incoming audio during calibration
    private func handleCalibrationAudio(buffer: AVAudioPCMBuffer) {
        guard isCapturingCalibration,
              let calibrationBuffer = calibrationBuffer,
              let sourceData = buffer.floatChannelData?[0],
              let destData = calibrationBuffer.floatChannelData?[0] else { return }

        let sourceFrames = buffer.frameLength
        let currentFrames = calibrationBuffer.frameLength
        let remainingCapacity = calibrationBuffer.frameCapacity - currentFrames

        let framesToCopy = min(sourceFrames, remainingCapacity)

        // Copy audio data
        memcpy(
            destData.advanced(by: Int(currentFrames)),
            sourceData,
            Int(framesToCopy) * MemoryLayout<Float>.size
        )

        calibrationBuffer.frameLength = currentFrames + framesToCopy

        // Update progress
        let elapsed = Date().timeIntervalSince(calibrationStartTime ?? Date())
        let progress = min(1.0, elapsed / configuration.calibrationDuration)
        calibrationProgress = 0.3 + (progress * 0.5)  // 30-80% for capture
    }

    /// Finish calibration and extract speaker embedding
    private func finishCalibration() async throws {
        isCapturingCalibration = false
        audioEngine.inputNode.removeTap(onBus: 0)

        guard let buffer = calibrationBuffer else {
            throw PipelineError.calibrationFailed
        }

        calibrationProgress = 0.85

        // Extract speaker embedding
        let embedding = try await openVoiceService.extractSpeakerEmbedding(
            from: buffer,
            language: configuration.sourceLanguage
        )

        calibrationProgress = 1.0
        isVoiceCloned = true

        mediaLogger.info("[VoiceCloning] Voice calibrated, embedding extracted in \(openVoiceService.lastLatencyMs)ms")

        // Now start listening for speech
        try await startListening()
    }

    /// Calibrate voice from an existing audio file
    func calibrateFromAudio(url: URL) async throws {
        updateState(.calibrating)
        calibrationProgress = 0.3

        let embedding = try await openVoiceService.extractSpeakerEmbedding(
            from: url,
            language: configuration.sourceLanguage
        )

        calibrationProgress = 1.0
        isVoiceCloned = true
        updateState(.calibrated)

        mediaLogger.info("[VoiceCloning] Voice calibrated from file: \(url.lastPathComponent)")
    }

    // MARK: - Speech Recognition

    /// Start listening for speech to translate
    private func startListening() async throws {
        updateState(.listening)

        // Setup speech recognition service
        speechRecognitionService = SpeechRecognitionService(
            language: configuration.sourceLanguage,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        // Configure callbacks
        await speechRecognitionService?.setCallbacks(
            onPartialResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handlePartialTranscription(segment)
                }
            },
            onFinalResult: { [weak self] segment in
                Task { @MainActor in
                    await self?.handleFinalTranscription(segment)
                }
            },
            onStateChange: nil,
            onError: { [weak self] error in
                Task { @MainActor in
                    self?.handleError(error)
                }
            }
        )

        sttStartTime = Date()
        try await speechRecognitionService?.startListening()
    }

    // MARK: - Transcription Handlers

    private func handlePartialTranscription(_ segment: TranscriptionSegment) {
        currentTranscription = segment.text
        onTranscription?(segment.text, false)
    }

    private func handleFinalTranscription(_ segment: TranscriptionSegment) async {
        let sttEndTime = Date()
        let sttLatency = sttEndTime.timeIntervalSince(sttStartTime ?? sttEndTime) * 1000

        currentTranscription = segment.text
        onTranscription?(segment.text, true)

        // Translate and speak
        await translateAndSpeak(
            text: segment.text,
            sttLatencyMs: sttLatency
        )

        // Reset STT timer for next utterance
        sttStartTime = Date()
    }

    // MARK: - Translation & TTS

    private func translateAndSpeak(text: String, sttLatencyMs: Double) async {
        guard !text.isEmpty else { return }

        updateState(.translating)
        translationStartTime = Date()

        do {
            // Translate text
            let translationResult = try await translationService.translate(
                text,
                from: configuration.sourceLanguage,
                to: configuration.targetLanguage
            )

            let translationEndTime = Date()
            let translationLatency = translationEndTime.timeIntervalSince(translationStartTime ?? translationEndTime) * 1000

            currentTranslation = translationResult.translatedText

            // Generate speech with cloned voice
            var ttsLatency: Double = 0
            var audioURL: URL? = nil

            if configuration.preserveVoiceCharacteristics && isVoiceCloned {
                updateState(.speaking)

                let voiceResult = try await openVoiceService.generateSpeech(
                    text: translationResult.translatedText,
                    language: configuration.targetLanguage
                )

                ttsLatency = voiceResult.latencyMs
                audioURL = voiceResult.audioURL

                if configuration.autoPlayTranslation {
                    try await playAudio(url: voiceResult.audioURL)
                }
            }

            // Create result
            let result = TranslationResult(
                originalText: text,
                translatedText: translationResult.translatedText,
                sourceLanguage: configuration.sourceLanguage,
                targetLanguage: configuration.targetLanguage,
                audioURL: audioURL,
                timestamp: Date(),
                latencies: TranslationResult.Latencies(
                    sttMs: sttLatencyMs,
                    translationMs: translationLatency,
                    ttsMs: ttsLatency
                )
            )

            results.append(result)
            updateAverageLatency()

            onTranslation?(result)

            mediaLogger.info("[VoiceCloning] Total latency: \(String(format: "%.0f", result.latencies.totalMs))ms (STT: \(String(format: "%.0f", sttLatencyMs))ms, Trans: \(String(format: "%.0f", translationLatency))ms, TTS: \(String(format: "%.0f", ttsLatency))ms)")

            updateState(.listening)

        } catch {
            handleError(error)
        }
    }

    // MARK: - Audio Playback

    private func playAudio(url: URL) async throws {
        audioPlayer = try AVAudioPlayer(contentsOf: url)
        audioPlayer?.prepareToPlay()
        audioPlayer?.play()

        // Wait for playback to complete
        while audioPlayer?.isPlaying == true {
            try await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
    }

    /// Stop current audio playback
    func stopPlayback() {
        audioPlayer?.stop()
        audioPlayer = nil

        if state == .speaking {
            updateState(.listening)
        }
    }

    // MARK: - Audio Session

    private func setupAudioSession() async throws {
        let session = AVAudioSession.sharedInstance()

        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
        )

        try session.setActive(true)
    }

    // MARK: - State Management

    private func updateState(_ newState: PipelineState) {
        state = newState
        onStateChange?(newState)
    }

    private func handleError(_ error: Error) {
        let message = error.localizedDescription
        updateState(.error(message))
        onError?(error)
        mediaLogger.error("[VoiceCloning] Error: \(error)")
    }

    private func updateAverageLatency() {
        guard !results.isEmpty else { return }
        let totalLatency = results.map { $0.latencies.totalMs }.reduce(0, +)
        averageLatencyMs = totalLatency / Double(results.count)
    }

    // MARK: - Statistics

    /// Get pipeline statistics
    func getStatistics() -> PipelineStatistics {
        guard !results.isEmpty else {
            return PipelineStatistics.empty
        }

        let avgSTT = results.map { $0.latencies.sttMs }.reduce(0, +) / Double(results.count)
        let avgTrans = results.map { $0.latencies.translationMs }.reduce(0, +) / Double(results.count)
        let avgTTS = results.map { $0.latencies.ttsMs }.reduce(0, +) / Double(results.count)

        return PipelineStatistics(
            totalResults: results.count,
            averageLatency: averageLatencyMs,
            onDeviceRate: 1.0, // Always on-device
            averageSTTLatency: avgSTT,
            averageTranslationLatency: avgTrans,
            averageTTSLatency: avgTTS
        )
    }

    // MARK: - Cleanup

    func cleanup() async {
        await stop()
        openVoiceService.unloadModels()
        results.removeAll()
        currentTranscription = ""
        currentTranslation = ""
    }
}

// MARK: - Pipeline Errors

extension RealTimeVoiceCloningPipeline {
    enum PipelineError: Error, LocalizedError {
        case invalidState
        case calibrationFailed
        case translationFailed
        case audioPlaybackFailed
        case notCalibrated

        var errorDescription: String? {
            switch self {
            case .invalidState:
                return "Invalid pipeline state for this operation"
            case .calibrationFailed:
                return "Voice calibration failed"
            case .translationFailed:
                return "Translation failed"
            case .audioPlaybackFailed:
                return "Audio playback failed"
            case .notCalibrated:
                return "Voice not calibrated. Please speak for 6 seconds first."
            }
        }
    }
}

// MARK: - Conversation Mode

extension RealTimeVoiceCloningPipeline {

    /// Start a bidirectional conversation with two speakers
    /// Each speaker's voice is cloned independently
    static func startConversation(
        speaker1Language: VoiceTranslationLanguage,
        speaker2Language: VoiceTranslationLanguage
    ) -> (RealTimeVoiceCloningPipeline, RealTimeVoiceCloningPipeline) {

        let pipeline1 = RealTimeVoiceCloningPipeline(
            sourceLanguage: speaker1Language,
            targetLanguage: speaker2Language
        )

        let pipeline2 = RealTimeVoiceCloningPipeline(
            sourceLanguage: speaker2Language,
            targetLanguage: speaker1Language
        )

        return (pipeline1, pipeline2)
    }
}

// MARK: - Audio Message Translation

extension RealTimeVoiceCloningPipeline {

    /// Translate an audio message with voice cloning (non-realtime)
    /// - Parameters:
    ///   - audioURL: URL of the audio message
    ///   - sourceLanguage: Source language
    ///   - targetLanguage: Target language
    /// - Returns: Translated audio URL with cloned voice
    static func translateAudioMessage(
        at audioURL: URL,
        from sourceLanguage: VoiceTranslationLanguage,
        to targetLanguage: VoiceTranslationLanguage
    ) async throws -> (translatedText: String, audioURL: URL, latencyMs: Double) {

        let pipeline = RealTimeVoiceCloningPipeline(
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage
        )

        let startTime = Date()

        // Load models
        try await pipeline.openVoiceService.loadModels()

        // Extract voice from audio
        try await pipeline.calibrateFromAudio(url: audioURL)

        // Transcribe audio using WhisperKit or Apple STT
        let transcriptionService = TranscriptionServiceManager.shared
        let segments = try await transcriptionService.transcribeWithFallback(
            at: audioURL,
            language: sourceLanguage
        )

        let originalText = segments.map { $0.text }.joined(separator: " ")

        // Translate
        let translationResult = try await pipeline.translationService.translate(
            originalText,
            from: sourceLanguage,
            to: targetLanguage
        )

        // Generate speech with cloned voice
        let voiceResult = try await pipeline.openVoiceService.generateSpeech(
            text: translationResult.translatedText,
            language: targetLanguage
        )

        let totalLatency = Date().timeIntervalSince(startTime) * 1000

        return (
            translatedText: translationResult.translatedText,
            audioURL: voiceResult.audioURL,
            latencyMs: totalLatency
        )
    }
}
