//
//  VoiceTranslationViewModel.swift
//  Meeshy
//
//  ViewModel for real-time voice translation and audio message transcription
//

import Foundation
import SwiftUI
import Combine
import AVFoundation

// MARK: - Voice Translation ViewModel

@MainActor
final class VoiceTranslationViewModel: ObservableObject {

    // MARK: - Published Properties

    // Languages
    @Published var sourceLanguage: VoiceTranslationLanguage = .french
    @Published var targetLanguage: VoiceTranslationLanguage = .english

    // Recognition State
    @Published private(set) var recognitionState: RecognitionState = .idle
    @Published private(set) var isListening: Bool = false
    @Published private(set) var isProcessing: Bool = false

    // Transcription
    @Published private(set) var currentTranscription: String = ""
    @Published private(set) var finalTranscription: String = ""
    @Published private(set) var transcriptionSegments: [TranscriptionSegment] = []

    // Translation (Phase 2)
    @Published private(set) var currentTranslation: String = ""
    @Published private(set) var translationSegments: [TranslationSegment] = []

    // Audio
    @Published private(set) var audioLevel: Float = 0
    @Published private(set) var isSpeechDetected: Bool = false
    @Published var waveformBars: [Float] = Array(repeating: 0, count: 10)

    // Permissions
    @Published private(set) var hasSpeechPermission: Bool = false
    @Published private(set) var hasMicrophonePermission: Bool = false
    @Published private(set) var isOnDeviceAvailable: Bool = false

    // Errors
    @Published var errorMessage: String?
    @Published var showError: Bool = false

    // Session
    @Published private(set) var currentSession: VoiceTranslationSession?
    @Published private(set) var sessionHistory: [VoiceTranslationSession] = []

    // Performance
    @Published private(set) var currentMetrics: TranslationPerformanceMetrics?

    // Translation
    @Published private(set) var isTranslating: Bool = false
    @Published private(set) var translationResults: [VoiceTranslationPipeline.PipelineResult] = []
    @Published var enableAutoTranslation: Bool = true
    @Published var enableTTS: Bool = false {
        didSet {
            Task { await updateTTSConfiguration() }
        }
    }

    // TTS State
    @Published private(set) var isSpeaking: Bool = false
    @Published var usePersonalVoice: Bool = false {
        didSet {
            Task { await updateTTSConfiguration() }
        }
    }
    @Published var speechRate: Float = AVSpeechUtteranceDefaultSpeechRate
    @Published var speechPitch: Float = 1.0

    // Pipeline Statistics
    @Published private(set) var pipelineStatistics: PipelineStatistics?

    // MARK: - Private Properties

    private var speechRecognitionService: SpeechRecognitionService?
    private var audioStreamManager: AudioStreamManager?
    private var translationService: OnDeviceTranslationService?
    private var speechSynthesisService: SpeechSynthesisService?
    private var pipeline: VoiceTranslationPipeline?

    private var cancellables = Set<AnyCancellable>()
    private var waveformTimer: Timer?
    private var translationDebounceTask: Task<Void, Never>?

    // MARK: - Initialization

    init() {
        Task {
            await checkPermissions()
            await setupLanguageObserver()
            await initializeTTSService()
        }
    }

    // MARK: - TTS Initialization

    private func initializeTTSService() async {
        speechSynthesisService = SpeechSynthesisService()
        await speechSynthesisService?.loadAvailableVoices()

        // Setup TTS callbacks
        await speechSynthesisService?.setCallbacks(
            onStart: { [weak self] in
                Task { @MainActor in
                    self?.isSpeaking = true
                }
            },
            onFinish: { [weak self] in
                Task { @MainActor in
                    self?.isSpeaking = false
                }
            },
            onError: { [weak self] error in
                Task { @MainActor in
                    self?.handleError(error)
                }
            }
        )
    }

    /// Update TTS configuration based on user preferences
    private func updateTTSConfiguration() async {
        guard let service = speechSynthesisService else { return }

        if usePersonalVoice {
            _ = await service.requestPersonalVoiceAccess()
        }
    }

    // MARK: - Permissions

    func checkPermissions() async {
        hasSpeechPermission = await SpeechRecognitionService.requestAuthorization()
        hasMicrophonePermission = await AudioStreamManager.requestMicrophonePermission()

        // Check on-device availability for current language
        await updateOnDeviceAvailability()
    }

    func requestPermissions() async {
        hasSpeechPermission = await SpeechRecognitionService.requestAuthorization()
        hasMicrophonePermission = await AudioStreamManager.requestMicrophonePermission()
    }

    private func updateOnDeviceAvailability() async {
        let service = SpeechRecognitionService(language: sourceLanguage)
        isOnDeviceAvailable = await service.isOnDeviceAvailable()
    }

    // MARK: - Language Setup

    private func setupLanguageObserver() async {
        // When source language changes, reinitialize the service
        $sourceLanguage
            .dropFirst()
            .sink { [weak self] newLanguage in
                Task {
                    await self?.reinitializeService(for: newLanguage)
                }
            }
            .store(in: &cancellables)
    }

    private func reinitializeService(for language: VoiceTranslationLanguage) async {
        // Stop current listening if active
        if isListening {
            await stopListening()
        }

        // Create new service for new language
        speechRecognitionService = SpeechRecognitionService(
            language: language,
            requiresOnDevice: true,
            addsPunctuation: true
        )

        await updateOnDeviceAvailability()
    }

    // MARK: - Real-Time Recognition

    /// Start listening for real-time voice translation
    func startListening() async {
        if !hasSpeechPermission || !hasMicrophonePermission {
            await requestPermissions()
            if !hasSpeechPermission || !hasMicrophonePermission {
                showError(message: "Permissions required for voice translation")
                return
            }
        }

        // Initialize service if needed
        if speechRecognitionService == nil {
            speechRecognitionService = SpeechRecognitionService(
                language: sourceLanguage,
                requiresOnDevice: true,
                addsPunctuation: true
            )
        }

        guard let service = speechRecognitionService else { return }

        // Setup callbacks
        await service.setCallbacks(
            onPartialResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handlePartialResult(segment)
                }
            },
            onFinalResult: { [weak self] segment in
                Task { @MainActor in
                    self?.handleFinalResult(segment)
                }
            },
            onStateChange: { [weak self] state in
                Task { @MainActor in
                    self?.recognitionState = state
                }
            },
            onError: { [weak self] error in
                Task { @MainActor in
                    self?.handleError(error)
                }
            }
        )

        // Start session
        currentSession = VoiceTranslationSession(
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage
        )

        // Clear previous transcription
        currentTranscription = ""
        finalTranscription = ""
        transcriptionSegments.removeAll()

        do {
            try await service.startListening()
            isListening = true
            startWaveformAnimation()
        } catch {
            handleError(error)
        }
    }

    /// Stop listening
    func stopListening() async {
        await speechRecognitionService?.stopListening()
        isListening = false
        stopWaveformAnimation()

        // End session
        currentSession?.end()
        if let session = currentSession {
            sessionHistory.insert(session, at: 0)
        }
        currentSession = nil
    }

    /// Toggle listening state
    func toggleListening() async {
        if isListening {
            await stopListening()
        } else {
            await startListening()
        }
    }

    // MARK: - Audio File Transcription

    /// Transcribe an audio file (voice message)
    func transcribeAudioFile(at url: URL) async -> String? {
        isProcessing = true
        defer { isProcessing = false }

        // Initialize service if needed
        if speechRecognitionService == nil {
            speechRecognitionService = SpeechRecognitionService(
                language: sourceLanguage,
                requiresOnDevice: true,
                addsPunctuation: true
            )
        }

        guard let service = speechRecognitionService else { return nil }

        do {
            let result = try await service.transcribeVoiceMessage(at: url)
            return result.text
        } catch {
            handleError(error)
            return nil
        }
    }

    /// Transcribe audio data directly
    func transcribeAudioData(_ data: Data, format: AVAudioFormat) async -> String? {
        isProcessing = true
        defer { isProcessing = false }

        if speechRecognitionService == nil {
            speechRecognitionService = SpeechRecognitionService(
                language: sourceLanguage,
                requiresOnDevice: true,
                addsPunctuation: true
            )
        }

        guard let service = speechRecognitionService else { return nil }

        do {
            let segment = try await service.transcribeAudioData(data, format: format)
            return segment.text
        } catch {
            handleError(error)
            return nil
        }
    }

    /// Transcribe with automatic language detection
    func transcribeWithLanguageDetection(at url: URL) async -> (text: String, detectedLanguage: VoiceTranslationLanguage)? {
        isProcessing = true
        defer { isProcessing = false }

        // First, try to detect language
        if let detectedLanguage = await SpeechRecognitionService.detectLanguage(in: url) {
            // Reinitialize for detected language
            let service = SpeechRecognitionService(
                language: detectedLanguage,
                requiresOnDevice: true,
                addsPunctuation: true
            )

            do {
                let result = try await service.transcribeVoiceMessage(at: url)
                return (result.text, detectedLanguage)
            } catch {
                handleError(error)
                return nil
            }
        }

        // Fallback to source language
        if let text = await transcribeAudioFile(at: url) {
            return (text, sourceLanguage)
        }

        return nil
    }

    // MARK: - Result Handlers

    private func handlePartialResult(_ segment: TranscriptionSegment) {
        currentTranscription = segment.text
        updateWaveform()
    }

    private func handleFinalResult(_ segment: TranscriptionSegment) {
        transcriptionSegments.append(segment)
        finalTranscription = segment.text
        currentTranscription = ""

        // Add to session
        currentSession?.transcriptions.append(segment)

        // Trigger translation if enabled
        if enableAutoTranslation && !segment.text.isEmpty {
            translateTextDebounced(segment.text)
        }
    }

    // MARK: - Translation

    /// Translate text with debouncing to avoid rapid translations
    private func translateTextDebounced(_ text: String) {
        translationDebounceTask?.cancel()

        translationDebounceTask = Task {
            // Small delay to batch rapid speech
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms

            if !Task.isCancelled {
                await translateText(text)
            }
        }
    }

    /// Translate text from source to target language
    func translateText(_ text: String) async {
        guard !text.isEmpty else { return }

        isTranslating = true
        defer { isTranslating = false }

        // Initialize translation service if needed
        if translationService == nil {
            translationService = OnDeviceTranslationService()
        }

        guard let service = translationService else { return }

        do {
            let startTime = Date()

            let result = try await service.translate(
                text,
                from: sourceLanguage,
                to: targetLanguage
            )

            let processingTime = Date().timeIntervalSince(startTime)

            // Update current translation
            currentTranslation = result.translatedText

            // Create pipeline result for tracking
            let pipelineResult = VoiceTranslationPipeline.PipelineResult(
                originalText: text,
                translatedText: result.translatedText,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                sttLatency: 0,
                translationLatency: processingTime,
                isOnDevice: result.isOnDevice
            )

            translationResults.append(pipelineResult)

            // Add to session
            let translationSegment = TranslationSegment(
                originalText: text,
                translatedText: result.translatedText,
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                confidence: result.confidence,
                processingTime: processingTime
            )
            currentSession?.translations.append(translationSegment)
            translationSegments.append(translationSegment)

            // Speak translation if TTS enabled
            if enableTTS {
                await speakTranslation(result.translatedText)
            }

        } catch {
            handleError(error)
        }
    }

    /// Translate an audio file directly (voice message)
    func translateAudioMessage(at url: URL) async -> VoiceTranslationPipeline.PipelineResult? {
        isProcessing = true
        isTranslating = true
        defer {
            isProcessing = false
            isTranslating = false
        }

        do {
            let result = try await VoiceTranslationPipeline.translateAudioMessage(
                at: url,
                from: sourceLanguage,
                to: targetLanguage
            )

            translationResults.append(result)
            currentTranslation = result.translatedText

            return result
        } catch {
            handleError(error)
            return nil
        }
    }

    /// Speak text using advanced TTS service
    private func speakTranslation(_ text: String) async {
        guard let service = speechSynthesisService else { return }

        // Create speech configuration from user preferences
        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: speechRate,
            pitch: speechPitch,
            volume: 1.0
        )

        // Try Personal Voice first if enabled
        if usePersonalVoice {
            do {
                try await service.speakWithPersonalVoice(text, configuration: config)
                return
            } catch {
                // Fall back to regular voice
                print("Personal Voice failed, falling back: \(error.localizedDescription)")
            }
        }

        // Use regular voice for target language
        await service.speak(text, language: targetLanguage, configuration: config)
    }

    // MARK: - Public TTS Methods

    /// Manually speak a specific text
    func speakText(_ text: String, language: VoiceTranslationLanguage? = nil) async {
        guard let service = speechSynthesisService else { return }

        let config = SpeechSynthesisService.SpeechConfiguration(
            rate: speechRate,
            pitch: speechPitch
        )

        await service.speak(text, language: language ?? targetLanguage, configuration: config)
    }

    /// Replay the last translation
    func replayLastTranslation() async {
        guard !currentTranslation.isEmpty else { return }
        await speakTranslation(currentTranslation)
    }

    /// Stop any ongoing speech
    func stopSpeaking() async {
        await speechSynthesisService?.stop()
        isSpeaking = false
    }

    /// Pause current speech
    func pauseSpeaking() {
        Task {
            await speechSynthesisService?.pause()
        }
    }

    /// Resume paused speech
    func resumeSpeaking() {
        Task {
            await speechSynthesisService?.resume()
        }
    }

    /// Get available voices for a language
    func getAvailableVoices(for language: VoiceTranslationLanguage) async -> [SpeechSynthesisService.VoiceInfo] {
        guard let service = speechSynthesisService else { return [] }
        return await service.getVoices(for: language)
    }

    /// Select a specific voice for TTS
    func selectVoice(_ voice: SpeechSynthesisService.VoiceInfo, for language: VoiceTranslationLanguage) async {
        await speechSynthesisService?.selectVoice(voice, for: language)
    }

    /// Check if Personal Voice is available
    var hasPersonalVoiceAccess: Bool {
        get async {
            await speechSynthesisService?.hasPersonalVoiceAccess ?? false
        }
    }

    /// Request Personal Voice authorization
    func requestPersonalVoiceAccess() async -> Bool {
        guard let service = speechSynthesisService else { return false }
        return await service.requestPersonalVoiceAccess()
    }

    private func handleError(_ error: Error) {
        if let recognitionError = error as? RecognitionError {
            errorMessage = recognitionError.errorDescription
        } else {
            errorMessage = error.localizedDescription
        }
        showError = true
        isListening = false
        stopWaveformAnimation()
    }

    private func showError(message: String) {
        errorMessage = message
        showError = true
    }

    // MARK: - Waveform Animation

    private func startWaveformAnimation() {
        waveformTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateWaveform()
            }
        }
    }

    private func stopWaveformAnimation() {
        waveformTimer?.invalidate()
        waveformTimer = nil
        waveformBars = Array(repeating: 0, count: 10)
    }

    private func updateWaveform() {
        guard isListening else {
            waveformBars = Array(repeating: 0, count: 10)
            return
        }

        // Generate animated waveform based on audio level
        let baseLevel = AudioStreamManager.normalizeAudioLevel(audioLevel)

        waveformBars = (0..<10).map { i in
            let variation = Float.random(in: 0.6...1.0)
            let position = Float(i) / 10.0
            let wave = sin(Float(Date().timeIntervalSince1970 * 8) + position * .pi * 2) * 0.3 + 0.7
            return max(0.1, baseLevel * variation * wave)
        }
    }

    // MARK: - Language Helpers

    /// Swap source and target languages
    func swapLanguages() {
        let temp = sourceLanguage
        sourceLanguage = targetLanguage
        targetLanguage = temp
    }

    /// Get available language pairs
    var availableLanguagePairs: [(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage)] {
        var pairs: [(VoiceTranslationLanguage, VoiceTranslationLanguage)] = []

        for source in VoiceTranslationLanguage.allCases {
            for target in VoiceTranslationLanguage.allCases where source != target {
                if source.supportsOnDeviceRecognition {
                    pairs.append((source, target))
                }
            }
        }

        return pairs
    }

    // MARK: - Session Management

    /// Clear current transcription
    func clearTranscription() {
        currentTranscription = ""
        finalTranscription = ""
        transcriptionSegments.removeAll()
    }

    /// Get full transcription text
    var fullTranscriptionText: String {
        transcriptionSegments.map { $0.text }.joined(separator: " ")
    }

    /// Export session as text
    func exportSessionAsText() -> String {
        guard let session = currentSession ?? sessionHistory.first else {
            return ""
        }

        var text = "Voice Translation Session\n"
        text += "========================\n"
        text += "Date: \(session.startedAt.formatted())\n"
        text += "Languages: \(session.sourceLanguage.nativeName) → \(session.targetLanguage.nativeName)\n"
        text += "Duration: \(Int(session.duration))s\n\n"

        text += "Transcription:\n"
        for segment in session.transcriptions {
            text += "[\(segment.timestamp.formatted(date: .omitted, time: .shortened))] \(segment.text)\n"
        }

        if !session.translations.isEmpty {
            text += "\nTranslations:\n"
            for segment in session.translations {
                text += "[\(segment.timestamp.formatted(date: .omitted, time: .shortened))] \(segment.translatedText)\n"
            }
        }

        return text
    }

    // MARK: - Cleanup

    func cleanup() async {
        await stopListening()
        await stopSpeaking()
        await speechRecognitionService?.cleanup()
        await audioStreamManager?.cleanup()
        speechSynthesisService = nil
        cancellables.removeAll()
    }

    deinit {
        waveformTimer?.invalidate()
    }
}

// MARK: - Preview Helper

extension VoiceTranslationViewModel {
    static var preview: VoiceTranslationViewModel {
        let vm = VoiceTranslationViewModel()
        vm.currentTranscription = "Hello, how are you doing today?"
        vm.hasSpeechPermission = true
        vm.hasMicrophonePermission = true
        vm.isOnDeviceAvailable = true
        return vm
    }
}
